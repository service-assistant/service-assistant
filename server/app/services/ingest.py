from datetime import datetime

import fitz  # pymupdf
from openai import AzureOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AttachmentChunk
from ..config import Settings


def batch_list(items, batch_size):
    for i in range(0, len(items), batch_size):
        yield items[i : i + batch_size]


async def ingest_pdf_to_base(
    session: AsyncSession, pdf_path: str, pdf_original_name: str, settings: Settings
):

    client = AzureOpenAI(
        api_version=settings.azure_openai_api_version,
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
    )

    doc = fitz.open(pdf_path)

    rows = []

    page_num = -1
    for page in doc:
        page_num += 1
        text = str(page.get_text())

        if not text or not text.strip():
            continue

        text = " ".join(text.split())

        chunk_size = 1000
        overlap = 200

        chunks = []
        start = 0

        while start < len(text):
            end = start + chunk_size
            chunks.append(text[start:end])
            start += chunk_size - overlap

        for batch in batch_list(chunks, 32):
            response = client.embeddings.create(
                model=settings.azure_openai_embeddings_deployment, input=batch
            )

            embeddings = [d.embedding for d in response.data]

            for chunk, embedding in zip(batch, embeddings):
                rows.append((chunk, embedding, pdf_path, pdf_original_name, page_num))

    await insert_chunks(session, rows)

    print("File ingested to base:", pdf_original_name)


async def insert_chunks(session: AsyncSession, rows):

    objects = [
        AttachmentChunk(
            content=chunk,
            embedding=embedding,
            document_name=document_name,
            document_original_name=document_original_name,
            page=page,
            created_at=datetime.utcnow(),
            extra_metadata=None,
        )
        for chunk, embedding, document_name, document_original_name, page in rows
    ]

    session.add_all(objects)
    await session.commit()
