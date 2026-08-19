import asyncio
import logging
import math
import uuid
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import Callable

import fitz  # pymupdf
import pymupdf4llm
from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.ai.documentintelligence.models import DocumentContentFormat
from azure.core.credentials import AzureKeyCredential
from openai import AsyncAzureOpenAI
from sqlalchemy import delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Settings
from ..models import Chunk
from .async_utils import run_blocking
from .chunking import chunk_page
from .extract_images import extract_page_images
from .process_ocr_text import process_ocr_text


OCR_MAX_IMAGE_BYTES = 3_500_000
OCR_MAX_IMAGE_DIMENSION = 4_000
OCR_JPEG_QUALITY = 85
OCR_MAX_RESIZE_ATTEMPTS = 6
logger = logging.getLogger(__name__)
_ingest_lock = asyncio.Lock()


@dataclass
class IngestReport:
    total_pages: int = 0
    pages_processed: int = 0
    native_text_pages: int = 0
    ocr_pages_attempted: int = 0
    ocr_pages_succeeded: int = 0
    ocr_pages_skipped: int = 0
    chunks_indexed: int = 0
    events: list[str] = field(default_factory=list)


class ImageOnlyPdfError(ValueError):
    """Raised when OCR cannot recover any indexable text from an image-only PDF."""

    def __init__(self, report: IngestReport):
        self.report = report
        super().__init__(
            "PDF contains only image pages and OCR did not recover any indexable "
            "text. The uploaded file was deleted."
        )


class EmbeddingServiceError(RuntimeError):
    """Raised when chunks cannot be indexed because Azure embeddings failed."""


ProgressCallback = Callable[[IngestReport], None]


def _report(
    report: IngestReport,
    message: str,
    progress_callback: ProgressCallback | None,
) -> None:
    report.events.append(message)
    logger.info(message)
    if progress_callback is not None:
        progress_callback(report)


async def delete_attachment_chunks(session: AsyncSession, attachment_id: int) -> None:
    await session.execute(sql_delete(Chunk).where(Chunk.attachment_id == attachment_id))
    await session.commit()


def batch_list(items, batch_size):
    for i in range(0, len(items), batch_size):
        yield items[i : i + batch_size]


def render_page_for_ocr(
    page: fitz.Page,
    max_bytes: int = OCR_MAX_IMAGE_BYTES,
    max_dimension: int = OCR_MAX_IMAGE_DIMENSION,
) -> bytes:
    longest_side = max(page.rect.width, page.rect.height)
    scale = min(1.0, max_dimension / longest_side) if longest_side else 1.0

    for _ in range(OCR_MAX_RESIZE_ATTEMPTS):
        pix = page.get_pixmap(
            matrix=fitz.Matrix(scale, scale),
            colorspace=fitz.csRGB,
            alpha=False,
        )
        image = pix.tobytes("jpeg", jpg_quality=OCR_JPEG_QUALITY)
        if len(image) <= max_bytes:
            return image

        scale *= min(0.9, math.sqrt(max_bytes / len(image)) * 0.9)

    raise ValueError("Could not render the page within Azure OCR input limits")


def save_ocr_rendered_image(
    image_bytes: bytes,
    output_dir: Path,
) -> list[str]:
    """Save OCR-rendered image and return list of image paths."""
    filename = f"{uuid.uuid4()}.jpg"
    image_path = output_dir / filename

    output_dir.mkdir(parents=True, exist_ok=True)
    image_path.write_bytes(image_bytes)

    return [str(image_path)]


async def ingest_pdf_to_attachment(
    session: AsyncSession,
    pdf_path: str,
    attachment_id: int,
    settings: Settings,
    batch_size: int = 32,
    progress_callback: ProgressCallback | None = None,
) -> IngestReport:
    async with _ingest_lock:
        async with asyncio.timeout(settings.pdf_ingest_timeout_seconds):
            return await _ingest_pdf_to_attachment_unlocked(
                session=session,
                pdf_path=pdf_path,
                attachment_id=attachment_id,
                settings=settings,
                batch_size=batch_size,
                progress_callback=progress_callback,
            )


async def _ingest_pdf_to_attachment_unlocked(
    session: AsyncSession,
    pdf_path: str,
    attachment_id: int,
    settings: Settings,
    batch_size: int,
    progress_callback: ProgressCallback | None,
) -> IngestReport:
    report = IngestReport()
    client = AsyncAzureOpenAI(
        api_version=settings.azure_openai_api_version,
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        timeout=settings.azure_embeddings_timeout_seconds,
        max_retries=settings.azure_embeddings_max_retries,
    )
    doc: fitz.Document | None = None
    try:
        doc = await run_blocking(fitz.open, pdf_path)
        report.total_pages = len(doc)
        _report(
            report,
            f"Opened PDF: {report.total_pages} page(s). Inspecting native text.",
            progress_callback,
        )

        pages = await run_blocking(lambda: list(doc.pages()))
        native_text_by_page = await run_blocking(
            lambda: [page.get_text().strip() for page in pages]
        )
        report.native_text_pages = sum(bool(text) for text in native_text_by_page)
        image_only_pages = report.total_pages - report.native_text_pages
        _report(
            report,
            (
                f"Native text found on {report.native_text_pages}/{report.total_pages} "
                f"page(s); {image_only_pages} page(s) require OCR."
            ),
            progress_callback,
        )

        rows: list[tuple[str, list[float], int, list[str]]] = []
        pending: list[tuple[str, int, list[str]]] = []
        seen_chunks: set[str] = set()

        async def embed_pending() -> None:
            nonlocal pending
            if not pending:
                return

            batch = pending[:batch_size]
            pending = pending[batch_size:]
            _report(
                report,
                f"Requesting Azure embeddings for {len(batch)} chunk(s).",
                progress_callback,
            )
            try:
                response = await client.embeddings.create(
                    model=settings.azure_openai_embeddings_deployment,
                    input=[chunk for chunk, _, _ in batch],
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                message = (
                    "Azure embeddings failed or timed out; the file cannot be indexed "
                    f"and will be deleted ({type(exc).__name__}: {exc})."
                )
                _report(report, message, progress_callback)
                raise EmbeddingServiceError(message) from exc

            embeddings = [data.embedding for data in response.data]
            if len(embeddings) != len(batch):
                message = (
                    "Azure embeddings returned an incomplete response; the file will "
                    "be deleted."
                )
                _report(report, message, progress_callback)
                raise EmbeddingServiceError(message)

            for (chunk, page_number, page_images), embedding in zip(
                batch, embeddings, strict=True
            ):
                rows.append((chunk, embedding, page_number, page_images))
            _report(
                report,
                f"Received embeddings for {len(batch)} chunk(s).",
                progress_callback,
            )

        for page_num, page in enumerate(pages):
            page_label = page_num + 1
            page_images = []

            if native_text_by_page[page_num]:
                _report(
                    report,
                    f"Page {page_label}: extracting native text.",
                    progress_callback,
                )
                markdown_text = str(
                    await run_blocking(
                        pymupdf4llm.to_markdown,
                        pdf_path,
                        pages=[page_num],
                        header=False,
                        footer=False,
                        use_ocr=False,
                    )
                )
                page_images = await run_blocking(
                    extract_page_images,
                    doc,
                    page,
                    settings.attachments_dir / "images",
                )
            else:
                report.ocr_pages_attempted += 1
                _report(
                    report,
                    f"Page {page_label}: no native text; starting Azure OCR.",
                    progress_callback,
                )
                try:
                    image = await run_blocking(render_page_for_ocr, page)

                    def run_ocr() -> str:
                        page_ocr_client = DocumentIntelligenceClient(
                            endpoint=settings.azure_document_intelligence_endpoint,
                            credential=AzureKeyCredential(
                                settings.azure_document_intelligence_key
                            ),
                            connection_timeout=settings.azure_ocr_timeout_seconds,
                            read_timeout=settings.azure_ocr_timeout_seconds,
                            retry_total=0,
                        )
                        try:
                            poller = page_ocr_client.begin_analyze_document(
                                "prebuilt-layout",
                                body=BytesIO(image),
                                output_content_format=DocumentContentFormat.MARKDOWN,
                            )
                            result = poller.result(
                                timeout=settings.azure_ocr_timeout_seconds
                            )
                            return process_ocr_text(result.content)
                        finally:
                            page_ocr_client.close()

                    markdown_text = await asyncio.wait_for(
                        asyncio.to_thread(run_ocr),
                        timeout=settings.azure_ocr_timeout_seconds,
                    )
                    report.ocr_pages_succeeded += 1
                    _report(
                        report,
                        f"Page {page_label}: Azure OCR completed.",
                        progress_callback,
                    )
                    page_images = await run_blocking(
                        save_ocr_rendered_image,
                        image,
                        settings.attachments_dir / "images",
                    )
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    report.ocr_pages_skipped += 1
                    report.pages_processed += 1
                    _report(
                        report,
                        (
                            f"Page {page_label}: skipped because Azure OCR failed or "
                            f"timed out ({type(exc).__name__}: {exc})."
                        ),
                        progress_callback,
                    )
                    continue

            chunks = await run_blocking(chunk_page, markdown_text)
            if not chunks:
                report.pages_processed += 1
                _report(
                    report,
                    f"Page {page_label}: no indexable text found; page skipped.",
                    progress_callback,
                )
                continue

            for chunk in chunks:
                if chunk in seen_chunks:
                    continue
                seen_chunks.add(chunk)
                pending.append((chunk, page_num, page_images))
                if len(pending) >= batch_size:
                    await embed_pending()

            report.pages_processed += 1

        while pending:
            await embed_pending()

        if report.native_text_pages == 0 and not rows:
            _report(
                report,
                (
                    "Skipped entire file: every page is image-only and OCR did not "
                    "recover any indexable text."
                ),
                progress_callback,
            )
            raise ImageOnlyPdfError(report)

        await insert_chunks(session, rows, attachment_id)
        report.chunks_indexed = len(rows)
        _report(
            report,
            (
                f"Ingestion completed: {report.chunks_indexed} chunk(s) indexed; "
                f"{report.ocr_pages_skipped} page(s) skipped because OCR was unavailable."
            ),
            progress_callback,
        )
        return report
    finally:
        if doc is not None:
            await run_blocking(doc.close)
        await client.close()


async def insert_chunks(
    session: AsyncSession,
    rows: list[tuple[str, list[float], int, list[str]]],
    attachment_id: int,
):
    objects = [
        Chunk(
            content=chunk,
            embedding=embedding,
            attachment_id=attachment_id,
            extra_metadata={"page": page_num, "images": page_images},
        )
        for chunk, embedding, page_num, page_images in rows
    ]
    session.add_all(objects)
    await session.commit()
