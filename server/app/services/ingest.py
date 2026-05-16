from openai import AsyncAzureOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

import fitz  # pymupdf

from ..config import Settings
from ..models import Chunk


def batch_list(items, batch_size):
    for i in range(0, len(items), batch_size):
        yield items[i : i + batch_size]


async def ingest_pdf_to_attachment(
    session: AsyncSession,
    pdf_path: str,
    attachment_id: int,
    settings: Settings,
):
    client = AsyncAzureOpenAI(
        api_version=settings.azure_openai_api_version,
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
    )

    doc = fitz.open(pdf_path)
    rows: list[tuple[str, list[float], int]] = []

    for page_num, page in enumerate(doc.pages()):
        text = str(page.get_text())
        if not text or not text.strip():
            continue
        text = " ".join(text.split())

        chunks: list[str] = []
        start = 0
        chunk_size = 1000
        overlap = 200
        while start < len(text):
            chunks.append(text[start : start + chunk_size])
            start += chunk_size - overlap

        for batch in batch_list(chunks, 32):
            response = await client.embeddings.create(
                model=settings.azure_openai_embeddings_deployment, input=batch
            )
            embeddings = [d.embedding for d in response.data]
            for chunk, emb in zip(batch, embeddings):
                rows.append((chunk, emb, page_num))

    await insert_chunks(session, rows, attachment_id)
    print("File ingested to base, attachment_id:", attachment_id)


async def insert_chunks(
    session: AsyncSession,
    rows: list[tuple[str, list[float], int]],
    attachment_id: int,
):
    objects = [
        Chunk(
            content=chunk,
            embedding=embedding,
            attachment_id=attachment_id,
            extra_metadata={"page": page_num},
        )
        for chunk, embedding, page_num in rows
    ]
    session.add_all(objects)
    await session.commit()
