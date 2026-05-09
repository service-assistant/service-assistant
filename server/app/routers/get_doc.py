from pathlib import Path

from fastapi.responses import FileResponse

# from typing_extensions import Annotated
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
# from app.config import Settings, get_settings

router = APIRouter(prefix="", tags=["GET_DOC"])


@router.get(
    "/attachments/get/{chunk_id}",
    summary="Download PDF from database",
    description="""Download PDF from database by providing the chunk ID""",
)
async def get_pdf(
    *,
    session: AsyncSession = Depends(get_session),
    chunk_id: int,
    # settings: Annotated[Settings, Depends(get_settings)],
):

    query = text("""
        SELECT document_name
        FROM attachment_chunks
        WHERE id = :chunk_id
        LIMIT 1
    """)

    result = await session.execute(query, {"chunk_id": chunk_id})

    row = result.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Chunk not found")

    document_path = Path(row[0])

    if not document_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found on disk")

    return FileResponse(
        path=document_path, filename=document_path.name, media_type="application/pdf"
    )
