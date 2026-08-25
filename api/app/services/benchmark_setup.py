import asyncio
import filecmp
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.config import Settings
from app.models import (
    Attachment,
    AttachmentDevice,
    Category,
    Chunk,
    Device,
    IngestionStatus,
)
from app.services import benchmark_documents, ingestion_queue
from app.services.async_utils import run_blocking
from app.services.attachments import save_attachment
from app.services.benchmark_cases import load_benchmark_dataset
from app.services.organizations import get_system_organization_id
from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

BENCHMARK_BRAND_CATEGORY_NAME = "BENCHMARK MARKA"
BENCHMARK_TYPE_CATEGORY_NAME = "BENCHMARK TYP"
BENCHMARK_VARIANT_CATEGORY_NAME = "BENCHMARK WARIANT"
BENCHMARK_DEVICE_NAME = "BENCHMARK-TEST-01"
BENCHMARK_MODEL_SERIAL_CODE = "BENCHMARK-TEST-01"

ProgressCallback = Callable[[str, str, str, dict[str, Any] | None], None]


async def inspect_benchmark_setup(
    session: AsyncSession,
) -> dict[str, Any]:
    """Verify the persisted benchmark setup using database IDs and relations."""
    organization_id = await get_system_organization_id(session)
    missing: list[str] = []
    brand_category = await _find_category(
        session,
        BENCHMARK_BRAND_CATEGORY_NAME,
        parent_id=None,
        organization_id=organization_id,
    )
    if brand_category is None:
        missing.append("benchmark_brand_category")

    type_category = None
    if brand_category is not None:
        type_category = await _find_category(
            session,
            BENCHMARK_TYPE_CATEGORY_NAME,
            parent_id=brand_category.id,
            organization_id=organization_id,
        )
    if type_category is None:
        missing.append("benchmark_type_category")

    variant_category = None
    if type_category is not None:
        variant_category = await _find_category(
            session,
            BENCHMARK_VARIANT_CATEGORY_NAME,
            parent_id=type_category.id,
            organization_id=organization_id,
        )
    if variant_category is None:
        missing.append("benchmark_variant_category")

    device = await session.scalar(
        select(Device)
        .join(Category, Category.id == Device.category_id)
        .where(Device.model_serial_code == BENCHMARK_MODEL_SERIAL_CODE)
        .where(Category.organization_id == organization_id)
        .order_by(Device.id)
    )
    if device is None:
        missing.append("benchmark_device")
        return {"ready": False, "missing": missing}

    if variant_category is None or device.category_id != variant_category.id:
        missing.append("benchmark_device_category")
    if (
        device.name != BENCHMARK_DEVICE_NAME
        or device.model_serial_code != BENCHMARK_MODEL_SERIAL_CODE
    ):
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
            "category_id": (
                variant_category.id if variant_category is not None else None
            ),
            "brand_category_id": (
                brand_category.id if brand_category is not None else None
            ),
            "type_category_id": (
                type_category.id if type_category is not None else None
            ),
            "variant_category_id": (
                variant_category.id if variant_category is not None else None
            ),
            "device_id": device.id,
            "stable_device_key": BENCHMARK_MODEL_SERIAL_CODE,
            "attachments": len(documents),
            "chunks": total_chunks,
        },
        "documents": documents,
    }


async def _find_category(
    session: AsyncSession,
    name: str,
    parent_id: int | None,
    organization_id: int,
) -> Category | None:
    parent_filter = (
        Category.parent_id.is_(None)
        if parent_id is None
        else Category.parent_id == parent_id
    )
    return await session.scalar(
        select(Category)
        .where(
            Category.organization_id == organization_id,
            Category.name == name,
            parent_filter,
        )
        .order_by(Category.id)
    )


async def _get_or_create_category(
    session: AsyncSession,
    name: str,
    parent_id: int | None,
    organization_id: int,
) -> tuple[Category, bool]:
    category = await _find_category(session, name, parent_id, organization_id)
    if category is not None:
        return category, False
    category = Category(
        organization_id=organization_id, name=name, image_url=None, parent_id=parent_id
    )
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return category, True


async def _get_or_create_category_path(
    session: AsyncSession,
) -> tuple[tuple[Category, Category, Category], list[Category]]:
    organization_id = await get_system_organization_id(session)
    created: list[Category] = []
    brand, was_created = await _get_or_create_category(
        session,
        BENCHMARK_BRAND_CATEGORY_NAME,
        parent_id=None,
        organization_id=organization_id,
    )
    if was_created:
        created.append(brand)
    device_type, was_created = await _get_or_create_category(
        session,
        BENCHMARK_TYPE_CATEGORY_NAME,
        parent_id=brand.id,
        organization_id=organization_id,
    )
    if was_created:
        created.append(device_type)
    variant, was_created = await _get_or_create_category(
        session,
        BENCHMARK_VARIANT_CATEGORY_NAME,
        parent_id=device_type.id,
        organization_id=organization_id,
    )
    if was_created:
        created.append(variant)
    return (brand, device_type, variant), created


async def _get_or_create_device(
    session: AsyncSession,
    category: Category,
) -> tuple[Device, bool]:
    device = await session.scalar(
        select(Device)
        .join(Category, Category.id == Device.category_id)
        .where(Device.model_serial_code == BENCHMARK_MODEL_SERIAL_CODE)
        .where(Category.organization_id == category.organization_id)
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
    organization_id: int,
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
            Attachment.organization_id == organization_id,
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


async def _prepare_document(
    settings: Settings,
    session: AsyncSession,
    device: Device,
    organization_id: int,
    local_path: Path,
) -> tuple[Attachment, int, bool]:
    """Store and link one document without starting the ingestion pipeline."""
    filename = local_path.name
    attachment = await _linked_attachment(session, device.id, organization_id, filename)
    if attachment is not None:
        chunks = await _chunk_count(session, attachment.id)
        stored_path = Path(attachment.file_global_path)
        if stored_path.is_file():
            if ingestion_queue.is_active(attachment):
                return attachment, chunks, True
            matches_source = await run_blocking(
                filecmp.cmp, stored_path, local_path, shallow=False
            )
            if not matches_source:
                await run_blocking(shutil.copyfile, local_path, stored_path)
            return attachment, chunks, True

        await session.delete(attachment)
        await session.commit()

    with local_path.open("rb") as source:
        upload = UploadFile(file=source, filename=filename)
        attachment = await save_attachment(
            settings=settings,
            session=session,
            file=upload,
            device_ids=[device.id],
            organization_id=organization_id,
        )
    return attachment, 0, True


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

    progress(
        "category",
        "processing",
        "Creating or finding benchmark category hierarchy…",
        None,
    )
    (
        (brand_category, type_category, variant_category),
        created_categories,
    ) = await _get_or_create_category_path(session)
    category_details = [
        {
            "id": category.id,
            "name": category.name,
            "parent_id": category.parent_id,
            "created": category in created_categories,
        }
        for category in (brand_category, type_category, variant_category)
    ]
    progress(
        "category",
        "completed",
        f"Benchmark category hierarchy ready ({len(created_categories)} created).",
        {
            "brand_category_id": brand_category.id,
            "type_category_id": type_category.id,
            "variant_category_id": variant_category.id,
            "categories": category_details,
        },
    )

    progress("device", "processing", "Creating or finding benchmark machine…", None)
    device, device_created = await _get_or_create_device(session, variant_category)
    progress(
        "device",
        "completed",
        f"Machine {'created' if device_created else 'already exists'} (ID {device.id}).",
        {
            "id": device.id,
            "name": device.name,
            "stable_key": BENCHMARK_MODEL_SERIAL_CODE,
            "variant_category_id": variant_category.id,
            "created": device_created,
        },
    )

    local_directory = benchmark_documents.documents_dir(settings)
    attachment_results: list[dict[str, Any]] = []
    prepared_documents: list[tuple[Attachment, bool]] = []
    documents = document_status["documents"]
    progress(
        "attachments",
        "processing",
        f"Adding and linking {len(documents)} document(s)…",
        {"current": 0, "total": len(documents), "documents": []},
    )

    for index, document in enumerate(documents, start=1):
        local_path = local_directory / Path(*Path(document["filename"]).parts)
        attachment, chunks, requires_processing = await _prepare_document(
            settings,
            session,
            device,
            variant_category.organization_id,
            local_path,
        )
        prepared_documents.append((attachment, requires_processing))
        result = {
            "filename": local_path.name,
            "attachment_id": attachment.id,
            "chunks": chunks,
            "processed": not requires_processing,
            "state": "waiting" if requires_processing else "ready",
        }
        attachment_results.append(result)
        progress(
            "attachments",
            "processing",
            f"{index}/{len(documents)} document(s) added and linked.",
            {
                "current": index,
                "total": len(documents),
                "documents": attachment_results,
            },
        )

    progress(
        "attachments",
        "completed",
        f"All {len(attachment_results)} document(s) are stored and linked.",
        {"documents": attachment_results},
    )

    progress(
        "ingest",
        "processing",
        f"Queueing {len(documents)} document(s) for server-side processing…",
        {"current": 0, "total": len(documents), "documents": attachment_results},
    )

    attachments_to_queue = [
        attachment
        for attachment, requires_processing in prepared_documents
        if requires_processing and not ingestion_queue.is_active(attachment)
    ]
    queued_attachments = await ingestion_queue.enqueue_ingestions(
        session, attachments_to_queue
    )
    queued_by_id = {attachment.id: attachment for attachment in queued_attachments}

    pending_ids: set[int] = set()
    for index, (attachment, requires_processing) in enumerate(
        prepared_documents, start=1
    ):
        result = attachment_results[index - 1]
        if requires_processing:
            attachment = queued_by_id.get(attachment.id, attachment)
            pending_ids.add(attachment.id)
            result["state"] = attachment.ingest_status.value
            result["job_id"] = attachment.ingest_job_id
        progress(
            "ingest",
            "processing",
            f"{index}/{len(documents)} document(s) queued.",
            {
                "current": index,
                "total": len(documents),
                "documents": attachment_results,
            },
        )

    while pending_ids:
        completed = 0
        for index, (attachment, requires_processing) in enumerate(prepared_documents):
            if not requires_processing or attachment.id not in pending_ids:
                if not requires_processing:
                    completed += 1
                elif attachment.id not in pending_ids:
                    completed += 1
                continue

            current = await session.get(
                Attachment, attachment.id, populate_existing=True
            )
            if current is None:
                raise RuntimeError(
                    f"Queued benchmark attachment disappeared: {attachment.id}"
                )
            result = attachment_results[index]
            result.update(
                {
                    "state": current.ingest_status.value,
                    "job_id": current.ingest_job_id,
                    "pages_done": current.ingest_pages_done,
                    "pages_total": current.ingest_pages_total,
                    "chunks": current.ingest_chunks_indexed,
                    "last_event": current.ingest_last_event,
                }
            )
            if current.ingest_status == IngestionStatus.succeeded:
                result["processed"] = True
                pending_ids.remove(current.id)
                completed += 1
            elif current.ingest_status == IngestionStatus.failed:
                raise RuntimeError(
                    f"Processing {current.original_filename} failed: "
                    f"{current.ingest_error or 'unknown worker error'}"
                )
            elif current.ingest_status == IngestionStatus.ready:
                raise RuntimeError(
                    f"Processing {current.original_filename} was cancelled."
                )

        progress(
            "ingest",
            "processing",
            f"Server worker processed {completed}/{len(documents)} document(s).",
            {
                "current": completed,
                "total": len(documents),
                "documents": attachment_results,
            },
        )
        if pending_ids:
            await asyncio.sleep(1)

    total_chunks = sum(int(result["chunks"]) for result in attachment_results)
    progress(
        "ingest",
        "completed",
        f"Server worker processed all {len(attachment_results)} document(s).",
        {"documents": attachment_results, "total_chunks": total_chunks},
    )

    progress("verify", "processing", "Verifying database relationships…", None)
    inspection = await inspect_benchmark_setup(session)
    if not inspection["ready"]:
        raise RuntimeError(
            "Benchmark verification failed: " + ", ".join(inspection.get("missing", []))
        )
    summary = inspection["result"]
    progress(
        "verify",
        "completed",
        (
            f"Setup ready: {summary['attachments']} document(s), "
            f"{summary['chunks']} chunk(s)."
        ),
        summary,
    )
    return summary
