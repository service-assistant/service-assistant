from openai import AsyncAzureOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete as sql_delete

import fitz  # pymupdf

from ..config import Settings
from ..models import Chunk
from .extract_images import extract_page_images
from .chunking import chunk_page


async def delete_attachment_chunks(session: AsyncSession, attachment_id: int) -> None:
    await session.execute(sql_delete(Chunk).where(Chunk.attachment_id == attachment_id))
    await session.commit()


def batch_list(items, batch_size):
    for i in range(0, len(items), batch_size):
        yield items[i : i + batch_size]


async def ingest_pdf_to_attachment(
    session: AsyncSession,
    pdf_path: str,
    attachment_id: int,
    settings: Settings,
    batch_size: int = 32,
):
    client = AsyncAzureOpenAI(
        api_version=settings.azure_openai_api_version,
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
    )

    doc = fitz.open(pdf_path)
    rows: list[tuple[str, list[float], int, list[str]]] = []
    pending: list[tuple[str, int, list[str]]] = []
    seen_chunks: set[str] = set()

    for page_num, page in enumerate(doc.pages()):
        # extract text
        chunks = chunk_page(pdf_path, page_num)

        # extract images
        page_images = extract_page_images(
            doc, page, settings.attachments_dir / "images"
        )

        for chunk in chunks:
            if chunk in seen_chunks:
                continue

            seen_chunks.add(chunk)
            pending.append((chunk, page_num, page_images))

            # if there are enough pending chunks, embed them and add to rows
            if len(pending) >= batch_size:
                batch = pending[:batch_size]
                pending = pending[batch_size:]

                response = await client.embeddings.create(
                    model=settings.azure_openai_embeddings_deployment,
                    input=[chunk for chunk, _, _ in batch],
                )
                embeddings = [d.embedding for d in response.data]

                for (chunk, page_num, page_images), emb in zip(batch, embeddings):
                    rows.append((chunk, emb, page_num, page_images))

    # embed any remaining pending chunks
    if pending:
        response = await client.embeddings.create(
            model=settings.azure_openai_embeddings_deployment,
            input=[chunk for chunk, _, _ in pending],
        )
        embeddings = [d.embedding for d in response.data]

        for (chunk, page_num, page_images), emb in zip(pending, embeddings):
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
