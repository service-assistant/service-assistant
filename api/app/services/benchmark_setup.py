import filecmp
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.config import Settings
from app.models import Attachment, AttachmentDevice, Category, Chunk, Device
from app.services import benchmark_documents
from app.services.async_utils import run_blocking
from app.services.attachments import save_attachment
from app.services.benchmark_cases import load_benchmark_dataset
from app.services.ingest import (
    IngestReport,
    delete_attachment_chunks,
    ingest_pdf_to_attachment,
)
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
    missing: list[str] = []
    brand_category = await _find_category(
        session, BENCHMARK_BRAND_CATEGORY_NAME, parent_id=None
    )
    if brand_category is None:
        missing.append("benchmark_brand_category")

    type_category = None
    if brand_category is not None:
        type_category = await _find_category(
            session, BENCHMARK_TYPE_CATEGORY_NAME, parent_id=brand_category.id
        )
    if type_category is None:
        missing.append("benchmark_type_category")

    variant_category = None
    if type_category is not None:
        variant_category = await _find_category(
            session, BENCHMARK_VARIANT_CATEGORY_NAME, parent_id=type_category.id
        )
    if variant_category is None:
        missing.append("benchmark_variant_category")

    device = await session.scalar(
        select(Device)
        .where(Device.model_serial_code == BENCHMARK_MODEL_SERIAL_CODE)
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
) -> Category | None:
    parent_filter = (
        Category.parent_id.is_(None)
        if parent_id is None
        else Category.parent_id == parent_id
    )
    return await session.scalar(
        select(Category)
        .where(Category.name == name, parent_filter)
        .order_by(Category.id)
    )


async def _get_or_create_category(
    session: AsyncSession,
    name: str,
    parent_id: int | None,
) -> tuple[Category, bool]:
    category = await _find_category(session, name, parent_id)
    if category is not None:
        return category, False
    if parent_id is not None:
        parent = await session.get(Category, parent_id)
        assert parent is not None
        organization_id = parent.organization_id
    else:
        organization_id = await get_system_organization_id(session)
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
    created: list[Category] = []
    brand, was_created = await _get_or_create_category(
        session, BENCHMARK_BRAND_CATEGORY_NAME, parent_id=None
    )
    if was_created:
        created.append(brand)
    device_type, was_created = await _get_or_create_category(
        session, BENCHMARK_TYPE_CATEGORY_NAME, parent_id=brand.id
    )
    if was_created:
        created.append(device_type)
    variant, was_created = await _get_or_create_category(
        session, BENCHMARK_VARIANT_CATEGORY_NAME, parent_id=device_type.id
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
    organization_id: int,
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

    # The benchmark measures ingestion, so it runs the pipeline inline rather
    # than deferring it to the worker like the upload endpoint does.
    with local_path.open("rb") as source:
        upload = UploadFile(file=source, filename=filename)
        attachment = await save_attachment(
            settings=settings,
            session=session,
            file=upload,
            device_ids=[device.id],
            organization_id=organization_id,
        )
    await ingest_pdf_to_attachment(
        session=session,
        pdf_path=attachment.file_global_path,
        attachment_id=attachment.id,
        settings=settings,
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
            settings,
            session,
            device,
            variant_category.organization_id,
            local_path,
            update_ingest,
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
