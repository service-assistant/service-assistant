from typing_extensions import Annotated
from fastapi import APIRouter, UploadFile, File, Depends
from sqlalchemy.ext.asyncio import AsyncSession
import tempfile
import shutil

from app.database import get_session
from app.services.ingest import ingest_pdf_to_base
from app.config import Settings, get_settings

router = APIRouter(prefix="", tags=["ADD_DOC"])


description = """
Upload a PDF file and ingest it into the vector database.

Pipeline:
1. Upload PDF
2. Save temporarily
3. Extract text
4. Chunk
5. Generate embeddings (Azure OpenAI)
6. Store in pgvector database
"""


@router.post(
    "/upload-pdf",
    summary="Upload PDF to vector database",
    description=description,
    status_code=201,
)
async def upload_pdf(
    *,
    session: AsyncSession = Depends(get_session),
    file: UploadFile = File(...),
    settings: Annotated[Settings, Depends(get_settings)],
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    await ingest_pdf_to_base(
        session=session,
        pdf_path=tmp_path,
        settings=settings,
    )

    file.file.close()

    return {
        "status": "ok",
        "filename": file.filename,
        "message": "PDF ingested into vector database"
    }