import re
import pymupdf4llm
from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)


def split_text_from_tables(text: str) -> list[tuple[bool, str]]:
    """
    Splits sections containing text from sections containing markdown tables
    Returns a list of tuples (is_table, content) where is_table is a boolean indicating whether the content is a table or not
    """

    parts = list[tuple[bool, str]]()
    current_part = list[str]()
    in_table = False
    for line in text.splitlines():
        line = line.strip()
        if line in " \n\r":
            continue

        if in_table:
            if line.startswith("|") and line.endswith("|"):
                if len(current_part) > 1:
                    if "|---|" in line:
                        new_table_header = current_part[-1]
                        current_part = current_part[:-1]
                        parts.append((True, "\n".join(current_part)))
                        current_part = [new_table_header]

                current_part.append(line)
            else:
                parts.append((True, "\n".join(current_part)))
                current_part = [line]
                in_table = False
        else:
            if line.startswith("|") and line.endswith("|"):
                if current_part:
                    parts.append((False, "\n".join(current_part)))
                current_part = [line]
                in_table = True
            else:
                current_part.append(line)

    if current_part:
        parts.append((in_table, "\n".join(current_part)))

    return parts


def split_table_header_content(text: str) -> tuple[str, str]:
    """
    Splits the header of a markdown table from the rest of the table content
    Returns a tuple (header, content)
    """

    lines = text.splitlines()

    if len(lines) < 2:
        return "", ""

    if "|---|" in lines[1]:
        return "\n".join(lines[:2]), "\n".join(lines[2:])

    return "", ""


def remove_picture_text(text: str) -> str:
    """
    Removes text that indicates a picture is intentionally omitted,
    as well as text between markers indicating picture text
    Returns the cleaned text
    """

    pattern1 = r"\*\*==> picture .*? intentionally omitted <==\*\*"
    pattern2 = (
        r"\*\*----- Start of picture text -----\*\*<?br>?"
        r".*?"
        r"\*\*----- End of picture text -----\*\*<?br>?"
    )

    cleaned_text = re.sub(
        pattern1 + "|" + pattern2,
        "",
        text,
        flags=re.DOTALL | re.IGNORECASE,
    )

    # remove empty lines
    cleaned_text = re.sub(r"\n\s*\n", "\n", cleaned_text).strip()

    return cleaned_text


def chunk_page(
    path: str, page_num: int, chunk_size: int = 1000, overlap: int = 200
) -> list[str]:
    """
    Chunks a PDF page into smaller sections using markdown headers and table structure as delimiters
    Returns a list of text chunks
    """

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

    sections = markdown_splitter.split_text(str(markdown_text))

    chunks: list[str] = []

    for section in sections:
        content = section.page_content.strip()
        content = remove_picture_text(content)
        if not content:
            continue

        if len(content) <= chunk_size:
            chunks.append(content)
            continue

        # if chunk is too long, split it
        # (tables are split separately to avoid breaking their structure)

        subsections = split_text_from_tables(content)

        for is_table, subsection in subsections:
            if len(subsection) <= chunk_size:
                chunks.append(subsection)
                continue

            subchunks = list[str]()

            if is_table:
                table_header, table_content = split_table_header_content(subsection)

                chunk = table_header + "\n"
                lines = table_content.splitlines()

                for line in lines:
                    # omit lines that contain only '|' characters (empty table rows)
                    if set(line.strip()) == {"|"}:
                        continue

                    if len(chunk + line) > chunk_size:
                        if chunk.strip():
                            subchunks.append(chunk.strip())

                        chunk = table_header + "\n"

                    chunk += line + "\n"

                if chunk.strip():
                    subchunks.append(chunk.strip())

            else:
                subchunks = recursive_splitter.split_text(subsection)

            chunks.extend(subchunks)

    return chunks
