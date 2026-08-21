from app.dependencies.auth import CurrentOrganizationDependency
from app.dependencies.database import DbSessionDependency
from app.dependencies.entities import ChunkDependency
from app.repositories import ChunkRepository
from app.schemas import ChunkRead
from fastapi import APIRouter, status

router = APIRouter()

_PAGE_SIZE = 20


@router.get(
    "",
    response_model=list[ChunkRead],
    summary="List chunks",
    description="Returns a paginated list of chunks, optionally filtered by attachment.",
)
async def list_chunks(
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
    attachment_id: int | None = None,
    page: int = 1,
):
    chunks, _ = await ChunkRepository(session, organization_id).list_page(
        page=page, page_size=_PAGE_SIZE, attachment_id=attachment_id
    )
    return chunks


@router.delete(
    "/{chunk_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a chunk",
    description="Permanently deletes a single chunk by its ID.",
    responses={404: {"description": "Chunk not found"}},
)
async def delete_chunk(
    chunk: ChunkDependency,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    await ChunkRepository(session, organization_id).delete(chunk)
