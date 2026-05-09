import shutil
from pathlib import Path

from typing_extensions import Annotated
from fastapi import APIRouter, UploadFile, File, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.services.ingest import ingest_pdf_to_base
from app.config import Settings, get_settings

router = APIRouter(prefix="", tags=["ADD_DOC"])

description = """
Upload a PDF file and ingest it into the vector database.

Pipeline:
1. Upload PDF
2. Save in attachments directory
3. Extract text
4. Chunk
5. Generate embeddings (Azure OpenAI)
6. Store in pgvector database
"""


def get_unique_filepath(base_path: Path) -> Path:
    if not base_path.exists():
        return base_path

    stem = base_path.stem
    suffix = base_path.suffix
    parent = base_path.parent

    counter = 1

    while True:
        new_name = f"{stem}__{counter}{suffix}"
        new_path = parent / new_name

        if not new_path.exists():
            return new_path

        counter += 1


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
    original_file_path = Path(str(file.filename))
    saved_path = get_unique_filepath(settings.attachments_dir / original_file_path.name)
    with open(saved_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    pdf_path = str(saved_path)

    await ingest_pdf_to_base(
        session=session,
        pdf_path=pdf_path,
        pdf_original_name=original_file_path.name,
        settings=settings,
    )

    file.file.close()

    return {
        "status": "ok",
        "filename": pdf_path,
        "original name": original_file_path.name,
        "message": "PDF ingested into vector database",
    }
