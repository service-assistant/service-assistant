from openai import AsyncAzureOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

import fitz  # pymupdf

from ..config import Settings
from ..models import Chunk
from .extract_images import extract_page_images


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
    rows: list[tuple[str, list[float], int, list[str]]] = []

    for page_num, page in enumerate(doc.pages()):

        # extract text
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
        
        # extract images
        page_images = extract_page_images(
            doc, page, settings.attachments_dir / "images"
        )

        # create embeddings for text chunks
        for batch in batch_list(chunks, 32):
            response = await client.embeddings.create(
                model=settings.azure_openai_embeddings_deployment, input=batch
            )
            embeddings = [d.embedding for d in response.data]

            for chunk, emb in zip(batch, embeddings):
                rows.append((chunk, emb, page_num, page_images))

    await insert_chunks(session, rows, attachment_id)


async def insert_chunks(
    session: AsyncSession,
    rows: list[tuple[str, list[float], int, list[str]]],
    attachment_id: int,
):
    objects = [
        Chunk(
            content=chunk,
            embedding=embedding,
            attachment_id=attachment_id,
            extra_metadata={"page": page_num, "images": page_images},
        )
        for chunk, embedding, page_num, page_images in rows
    ]
    session.add_all(objects)
    await session.commit()
