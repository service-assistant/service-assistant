import filecmp
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import Attachment, AttachmentDevice, Category, Chunk, Device
from app.routers.attachments import save_and_ingest_attachment
from app.services import benchmark_documents
from app.services.async_utils import run_blocking
from app.services.benchmark_cases import load_benchmark_dataset
from app.services.ingest import (
    IngestReport,
    delete_attachment_chunks,
    ingest_pdf_to_attachment,
)

BENCHMARK_CATEGORY_NAME = "BENCHMARK"
BENCHMARK_DEVICE_NAME = "BENCHMARK-TEST-01"
BENCHMARK_MODEL_SERIAL_CODE = "BENCHMARK-TEST-01"

ProgressCallback = Callable[[str, str, str, dict[str, Any] | None], None]


async def inspect_benchmark_setup(
    session: AsyncSession,
) -> dict[str, Any]:
    """Verify the persisted benchmark setup using database IDs and relations."""
    device = await session.scalar(
        select(Device)
        .where(Device.model_serial_code == BENCHMARK_MODEL_SERIAL_CODE)
        .order_by(Device.id)
    )
    if device is None:
        return {"ready": False, "missing": ["benchmark_device"]}

    category = await session.get(Category, device.category_id)
    missing: list[str] = []
    if category is None or category.name != BENCHMARK_CATEGORY_NAME:
        missing.append("benchmark_category")
    if device.name != BENCHMARK_DEVICE_NAME:
        missing.append("benchmark_device_configuration")

    attachment_rows = (
        await session.execute(
            select(
                Attachment.id,
                Attachment.original_filename,
                func.count(Chunk.id).label("chunk_count"),
            )
            .join(
                AttachmentDevice,
                AttachmentDevice.attachment_id == Attachment.id,
            )
            .outerjoin(Chunk, Chunk.attachment_id == Attachment.id)
            .where(AttachmentDevice.device_id == device.id)
            .group_by(Attachment.id, Attachment.original_filename)
            .order_by(Attachment.id)
        )
    ).all()
    documents = [
        {
            "filename": row.original_filename,
            "attachment_id": row.id,
            "chunks": int(row.chunk_count),
        }
        for row in attachment_rows
    ]
    if not documents:
        missing.append("benchmark_attachments")
    elif any(document["chunks"] <= 0 for document in documents):
        missing.append("benchmark_chunks")

    required_sources = {case.source.filename for case in load_benchmark_dataset().cases}
    linked_sources = {document["filename"] for document in documents}
    missing_sources = sorted(required_sources - linked_sources)
    if missing_sources:
        missing.append("benchmark_source_documents")

    total_chunks = sum(document["chunks"] for document in documents)
    return {
        "ready": not missing,
        "missing": missing,
        "missing_sources": missing_sources,
        "result": {
            "category_id": category.id if category is not None else None,
            "device_id": device.id,
            "stable_device_key": BENCHMARK_MODEL_SERIAL_CODE,
            "attachments": len(documents),
            "chunks": total_chunks,
        },
        "documents": documents,
    }


async def _get_or_create_category(
    session: AsyncSession,
) -> tuple[Category, bool]:
    category = await session.scalar(
        select(Category)
        .where(Category.name == BENCHMARK_CATEGORY_NAME)
        .order_by(Category.id)
    )
    if category is not None:
        return category, False
    category = Category(name=BENCHMARK_CATEGORY_NAME, image_url=None)
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return category, True


async def _get_or_create_device(
    session: AsyncSession,
    category: Category,
) -> tuple[Device, bool]:
    device = await session.scalar(
        select(Device)
        .where(Device.model_serial_code == BENCHMARK_MODEL_SERIAL_CODE)
        .order_by(Device.id)
    )
    if device is not None:
        changed = False
        expected = {
            "name": BENCHMARK_DEVICE_NAME,
            "category_id": category.id,
        }
        for field, value in expected.items():
            if getattr(device, field) != value:
                setattr(device, field, value)
                changed = True
        if changed:
            await session.commit()
            await session.refresh(device)
        return device, False

    device = Device(
        name=BENCHMARK_DEVICE_NAME,
        model_serial_code=BENCHMARK_MODEL_SERIAL_CODE,
        image_url=None,
        category_id=category.id,
    )
    session.add(device)
    await session.commit()
    await session.refresh(device)
    return device, True


async def _linked_attachment(
    session: AsyncSession,
    device_id: int,
    filename: str,
) -> Attachment | None:
    return await session.scalar(
        select(Attachment)
        .join(
            AttachmentDevice,
            AttachmentDevice.attachment_id == Attachment.id,
        )
        .where(
            AttachmentDevice.device_id == device_id,
            Attachment.original_filename == filename,
        )
        .order_by(Attachment.id)
    )


async def _chunk_count(session: AsyncSession, attachment_id: int) -> int:
    return int(
        await session.scalar(
            select(func.count(Chunk.id)).where(Chunk.attachment_id == attachment_id)
        )
        or 0
    )


async def _ingest_document(
    settings: Settings,
    session: AsyncSession,
    device: Device,
    local_path: Path,
    progress_callback: Callable[[IngestReport], None],
) -> tuple[Attachment, int, bool]:
    filename = local_path.name
    attachment = await _linked_attachment(session, device.id, filename)
    if attachment is not None:
        chunks = await _chunk_count(session, attachment.id)
        stored_path = Path(attachment.file_global_path)
        if stored_path.is_file():
            matches_source = await run_blocking(
                filecmp.cmp, stored_path, local_path, shallow=False
            )
            if chunks > 0 and matches_source:
                return attachment, chunks, False
            if not matches_source:
                await run_blocking(shutil.copyfile, local_path, stored_path)
            if chunks > 0:
                await delete_attachment_chunks(session, attachment.id)
            report = await ingest_pdf_to_attachment(
                session=session,
                pdf_path=str(stored_path),
                attachment_id=attachment.id,
                settings=settings,
                progress_callback=progress_callback,
            )
            return attachment, report.chunks_indexed, True

        await session.delete(attachment)
        await session.commit()

    with local_path.open("rb") as source:
        upload = UploadFile(file=source, filename=filename)
        attachment = await save_and_ingest_attachment(
            settings=settings,
            session=session,
            file=upload,
            device_ids=[device.id],
            progress_callback=progress_callback,
        )
    return attachment, await _chunk_count(session, attachment.id), True


async def run_benchmark_setup(
    settings: Settings,
    session: AsyncSession,
    progress: ProgressCallback,
) -> dict[str, Any]:
    progress("download", "processing", "Checking and downloading R2 files…", None)
    document_status = await run_blocking(
        benchmark_documents.download_missing_documents, settings
    )
    if not document_status["documents"]:
        raise RuntimeError("No PDF files were found in the benchmark bucket.")
    progress(
        "download",
        "completed",
        f"{document_status['ready']} file(s) available locally.",
        {"downloaded": document_status.get("downloaded", [])},
    )

    progress("category", "processing", "Creating or finding benchmark category…", None)
    category, category_created = await _get_or_create_category(session)
    progress(
        "category",
        "completed",
        f"Category {'created' if category_created else 'already exists'} (ID {category.id}).",
        {"id": category.id, "name": category.name, "created": category_created},
    )

    progress("device", "processing", "Creating or finding benchmark machine…", None)
    device, device_created = await _get_or_create_device(session, category)
    progress(
        "device",
        "completed",
        f"Machine {'created' if device_created else 'already exists'} (ID {device.id}).",
        {
            "id": device.id,
            "name": device.name,
            "stable_key": BENCHMARK_MODEL_SERIAL_CODE,
            "created": device_created,
        },
    )

    local_directory = benchmark_documents.documents_dir(settings)
    total_chunks = 0
    attachment_results: list[dict[str, Any]] = []
    documents = document_status["documents"]
    progress(
        "ingest",
        "processing",
        f"Preparing {len(documents)} document(s) for chunking…",
        {"current": 0, "total": len(documents), "documents": []},
    )

    for index, document in enumerate(documents, start=1):
        local_path = local_directory / Path(*Path(document["filename"]).parts)

        def update_ingest(report: IngestReport) -> None:
            progress(
                "ingest",
                "processing",
                f"Chunking {local_path.name}: {report.chunks_indexed} chunk(s)…",
                {
                    "current": index,
                    "total": len(documents),
                    "filename": local_path.name,
                    "total_pages": report.total_pages,
                    "chunks_indexed": report.chunks_indexed,
                    "events": report.events,
                    "documents": attachment_results,
                },
            )

        attachment, chunks, processed = await _ingest_document(
            settings, session, device, local_path, update_ingest
        )
        result = {
            "filename": local_path.name,
            "attachment_id": attachment.id,
            "chunks": chunks,
            "processed": processed,
        }
        attachment_results.append(result)
        total_chunks += chunks
        progress(
            "ingest",
            "processing",
            f"{index}/{len(documents)} document(s) ready.",
            {
                "current": index,
                "total": len(documents),
                "documents": attachment_results,
            },
        )

    progress(
        "ingest",
        "completed",
        f"{len(attachment_results)} document(s) linked and chunked.",
        {"documents": attachment_results, "total_chunks": total_chunks},
    )

    progress("verify", "processing", "Verifying database relationships…", None)
    linked_count = int(
        await session.scalar(
            select(func.count(AttachmentDevice.attachment_id)).where(
                AttachmentDevice.device_id == device.id
            )
        )
        or 0
    )
    if linked_count < len(documents) or total_chunks <= 0:
        raise RuntimeError(
            "Benchmark verification failed: documents or chunks are missing."
        )
    summary = {
        "category_id": category.id,
        "device_id": device.id,
        "stable_device_key": BENCHMARK_MODEL_SERIAL_CODE,
        "attachments": linked_count,
        "chunks": total_chunks,
    }
    progress(
        "verify",
        "completed",
        f"Setup ready: {linked_count} document(s), {total_chunks} chunk(s).",
        summary,
    )
    return summary
