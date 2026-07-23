import math
from io import BytesIO

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
from .chunking import chunk_page
from .extract_images import extract_page_images
from .process_ocr_text import process_ocr_text


OCR_MAX_IMAGE_BYTES = 3_500_000
OCR_MAX_IMAGE_DIMENSION = 4_000
OCR_JPEG_QUALITY = 85
OCR_MAX_RESIZE_ATTEMPTS = 6


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


async def ingest_pdf_to_attachment(
    session: AsyncSession,
    pdf_path: str,
    attachment_id: int,
    settings: Settings,
    batch_size: int = 32,
):
    client = AsyncAzureOpenAI(
        api_version=settings.azure_openai_api_version,
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
    )
    ocr_client = DocumentIntelligenceClient(
        endpoint=settings.azure_document_intelligence_endpoint,
        credential=AzureKeyCredential(settings.azure_document_intelligence_key),
    )

    doc = fitz.open(pdf_path)
    rows: list[tuple[str, list[float], int, list[str]]] = []
    pending: list[tuple[str, int, list[str]]] = []
    seen_chunks: set[str] = set()

    for page_num, page in enumerate(doc.pages()):
        markdown_text = ""

        if page.get_text().strip():
            # extract text
            markdown_text = str(
                pymupdf4llm.to_markdown(
                    pdf_path,
                    pages=[page_num],
                    header=False,
                    footer=False,
                    use_ocr=False,
                )
            )
        else:
            # perform OCR
            poller = ocr_client.begin_analyze_document(
                "prebuilt-layout",
                body=BytesIO(render_page_for_ocr(page)),
                output_content_format=DocumentContentFormat.MARKDOWN,
            )

            result = poller.result()
            markdown_text = process_ocr_text(result.content)

        # extract text
        chunks = chunk_page(markdown_text)

        # extract images
        page_images = extract_page_images(
            doc, page, settings.attachments_dir / "images"
        )

        for chunk in chunks:
            if chunk in seen_chunks:
                continue

            seen_chunks.add(chunk)
            pending.append((chunk, page_num, page_images))

            # if there are enough pending chunks, embed them and add to rows
            if len(pending) >= batch_size:
                batch = pending[:batch_size]
                pending = pending[batch_size:]

                response = await client.embeddings.create(
                    model=settings.azure_openai_embeddings_deployment,
                    input=[chunk for chunk, _, _ in batch],
                )
                embeddings = [d.embedding for d in response.data]

                for (chunk, page_num, page_images), emb in zip(batch, embeddings):
                    rows.append((chunk, emb, page_num, page_images))

    # embed any remaining pending chunks
    if pending:
        response = await client.embeddings.create(
            model=settings.azure_openai_embeddings_deployment,
            input=[chunk for chunk, _, _ in pending],
        )
        embeddings = [d.embedding for d in response.data]

        for (chunk, page_num, page_images), emb in zip(pending, embeddings):
            rows.append((chunk, emb, page_num, page_images))

    await insert_chunks(session, rows, attachment_id)


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
