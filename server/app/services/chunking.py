import pymupdf4llm
from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)


def chunk_page(
    path: str, page_num: int, chunk_size: int = 1000, overlap: int = 200
) -> list[str]:

    markdown_text = pymupdf4llm.to_markdown(
        path, pages=[page_num], header=False, footer=False
    )

    headers = [
        ("#", "h1"),
        ("##", "h2"),
        ("###", "h3"),
        ("####", "h4"),
    ]

    markdown_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=headers,
        strip_headers=False,
    )

    recursive_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=[
            "\n# ",
            "\n## ",
            "\n### ",
            "\n\n",
            "\n",
            ". ",
            " ",
            "",
        ],
        keep_separator=True,
    )

    docs = markdown_splitter.split_text(str(markdown_text))

    chunks: list[str] = []

    for doc in docs:
        content = doc.page_content.strip()
        if not content:
            continue

        if len(content) <= chunk_size:
            chunks.append(content)
            continue

        subchunks = recursive_splitter.split_text(content)
        chunks.extend(subchunks)

    return chunks
