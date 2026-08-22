import asyncio
import mimetypes
from pathlib import Path

import fitz
from app.dependencies.database import DbSessionDependency
from app.dependencies.settings import SettingsDependency
from app.models import Attachment, Chunk, Organization
from app.schemas import ChunkRead, DebugChunkFileDetailRead, DebugChunkFileRead
from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse
from sqlalchemy import func, select

router = APIRouter()


def _file_row(attachment: Attachment, organization: Organization, chunk_count: int):
    return {
        "id": attachment.id,
        "organization_id": organization.id,
        "organization_name": organization.name,
        "organization_slug": organization.slug,
        "original_filename": attachment.original_filename,
        "ingest_status": attachment.ingest_status,
        "ingest_pages_total": attachment.ingest_pages_total,
        "chunk_count": chunk_count,
        "created_at": attachment.created_at,
    }


async def _get_file(session: DbSessionDependency, attachment_id: int):
    row = (
        await session.execute(
            select(Attachment, Organization, func.count(Chunk.id))
            .join(Organization, Organization.id == Attachment.organization_id)
            .outerjoin(Chunk, Chunk.attachment_id == Attachment.id)
            .where(Attachment.id == attachment_id)
            .group_by(Attachment.id, Organization.id)
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return row


@router.get(
    "/files",
    response_model=list[DebugChunkFileRead],
    summary="List files available in the chunk debugger",
)
async def list_chunk_files(
    session: DbSessionDependency,
    search: str | None = Query(default=None, max_length=200),
):
    query = (
        select(Attachment, Organization, func.count(Chunk.id))
        .join(Organization, Organization.id == Attachment.organization_id)
        .outerjoin(Chunk, Chunk.attachment_id == Attachment.id)
        .group_by(Attachment.id, Organization.id)
        .order_by(Attachment.original_filename, Attachment.id)
    )
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(
            Attachment.original_filename.ilike(pattern)
            | Organization.name.ilike(pattern)
            | Organization.slug.ilike(pattern)
        )

    rows = (await session.execute(query)).all()
    return [
        _file_row(attachment, organization, count)
        for attachment, organization, count in rows
    ]


@router.get(
    "/files/{attachment_id}",
    response_model=DebugChunkFileDetailRead,
    summary="Get file details and chunk counts grouped by PDF page",
)
async def get_chunk_file(attachment_id: int, session: DbSessionDependency):
    attachment, organization, chunk_count = await _get_file(session, attachment_id)
    chunks = (
        await session.execute(
            select(Chunk.extra_metadata)
            .where(Chunk.attachment_id == attachment_id)
            .order_by(Chunk.id)
        )
    ).scalars()

    counts: dict[int, int] = {}
    for metadata in chunks:
        zero_based_page = metadata.get("page") if metadata else None
        if isinstance(zero_based_page, int) and zero_based_page >= 0:
            page_number = zero_based_page + 1
            counts[page_number] = counts.get(page_number, 0) + 1

    return {
        **_file_row(attachment, organization, chunk_count),
        "chunk_pages": [
            {"page_number": page_number, "chunk_count": count}
            for page_number, count in sorted(counts.items())
        ],
    }


@router.get(
    "/files/{attachment_id}/chunks",
    response_model=list[ChunkRead],
    summary="List chunks assigned to one PDF page",
)
async def list_file_page_chunks(
    attachment_id: int,
    session: DbSessionDependency,
    page_number: int = Query(ge=1),
):
    await _get_file(session, attachment_id)
    result = await session.execute(
        select(Chunk)
        .where(
            Chunk.attachment_id == attachment_id,
            Chunk.extra_metadata["page"].as_integer() == page_number - 1,
        )
        .order_by(Chunk.id)
    )
    return list(result.scalars().all())


def _render_page(file_path: Path, page_number: int, zoom: float):
    with fitz.open(file_path) as document:
        if page_number > document.page_count:
            return None, document.page_count
        page = document.load_page(page_number - 1)
        pixmap = page.get_pixmap(
            matrix=fitz.Matrix(1.2 * zoom, 1.2 * zoom), alpha=False
        )
        return pixmap.tobytes("png"), document.page_count


@router.get(
    "/files/{attachment_id}/preview/{page_number}",
    response_class=Response,
    summary="Render one PDF page for the chunk debugger",
    responses={200: {"content": {"image/png": {}}}},
)
async def preview_chunk_file_page(
    attachment_id: int,
    page_number: int,
    session: DbSessionDependency,
    zoom: float = Query(default=1.0, ge=0.75, le=2.0),
):
    if page_number < 1:
        raise HTTPException(status_code=422, detail="Page number must be at least 1")

    attachment, _, _ = await _get_file(session, attachment_id)
    file_path = Path(attachment.file_global_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    try:
        image, page_count = await asyncio.to_thread(
            _render_page, file_path, page_number, zoom
        )
    except (fitz.FileDataError, RuntimeError, ValueError) as error:
        raise HTTPException(
            status_code=422, detail="File is not a valid PDF"
        ) from error
    if image is None:
        raise HTTPException(status_code=404, detail="PDF page not found")

    return Response(
        content=image,
        media_type="image/png",
        headers={
            "Cache-Control": "private, max-age=300",
            "X-PDF-Page-Count": str(page_count),
        },
    )


@router.get(
    "/files/{attachment_id}/images/{filename}",
    response_class=FileResponse,
    summary="Get an extracted image for the chunk debugger",
)
async def get_chunk_file_image(
    attachment_id: int,
    filename: str,
    session: DbSessionDependency,
    settings: SettingsDependency,
):
    await _get_file(session, attachment_id)
    allowed_dir = (settings.attachments_dir / "images" / str(attachment_id)).resolve()
    file_path = (allowed_dir / filename).resolve()
    if not file_path.is_relative_to(allowed_dir) or not file_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    media_type, _ = mimetypes.guess_type(str(file_path))
    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type=media_type or "image/png",
    )
