import re
import pymupdf4llm
from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)

# if False the tables are saved as markdown
# if True the tables are saved as text, with each row on a new line and cells separated by '; ',
# and with the header of each cell included in the text (e.g. 'Header: Cell content')
TABLES_TO_TEXT = False


def split_text_from_tables(text: str) -> list[tuple[bool, str]]:
    """
    Splits sections containing text from sections containing markdown tables.\n
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


def split_table_header_content(text: str) -> tuple[str, list[str]]:
    """
    Splits the header of a markdown table from the rest of the table content.\n
    Omits empty table rows (rows that contain only '|' characters).\n
    Returns a tuple (headers, content)
    """

    lines = text.splitlines()

    if len(lines) < 2:
        return "", []

    if "|---|" in lines[1]:
        headers = lines[0]
        table_content = [line for line in lines[2:] if not set(line.strip()) == {"|"}]
        return headers, table_content

    return "", []


def split_table_cells(
    headers: str, content: list[str]
) -> tuple[list[str], list[list[str]]]:
    """
    Splits the header and content of a markdown table into individual cells.\n
    Returns a tuple (headers, content) where headers is a list of header cells
    and content is a list of rows, where each row is a list of cells
    """

    split_headers = headers[1:-1].split("|")
    split_content = [line[1:-1].split("|") for line in content]

    return split_headers, split_content


def change_table_row_format(table_headers: list[str], row: list[str]) -> str:
    line = ""
    for header, cell in zip(table_headers, row):
        if line:
            line += "; "
        line += header + ": " + cell.strip()

    return line


def remove_picture_text(text: str) -> str:
    """
    Removes text that indicates a picture is intentionally omitted,\n
    as well as text between markers indicating picture text.\n
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
    Chunks a PDF page into smaller sections using markdown headers and table structure as delimiters.\n
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

        subsections = split_text_from_tables(content)

        for is_table, subsection in subsections:
            subchunks = list[str]()

            if is_table:
                table_headers, table_content = split_table_header_content(subsection)
                chunk = ""

                if TABLES_TO_TEXT:
                    table_headers, table_content = split_table_cells(
                        table_headers, table_content
                    )

                    for i in range(len(table_content)):
                        if i > 0:
                            for j in range(len(table_content[i])):
                                if not table_content[i][j].strip():
                                    table_content[i][j] = table_content[i - 1][j]
                                else:
                                    break

                    for row in table_content:
                        line = change_table_row_format(table_headers, row)

                        if len(chunk + line) > chunk_size:
                            if chunk.strip():
                                subchunks.append(chunk.strip())
                            chunk = ""

                        chunk += line + "\n"

                else:  # markdown table
                    for line in table_content:
                        if len(chunk + line) > chunk_size:
                            if chunk.strip():
                                subchunks.append(chunk.strip())
                            chunk = ""

                        chunk += line + "\n"

                if chunk.strip():
                    subchunks.append(chunk.strip())

            else:
                subchunks = recursive_splitter.split_text(subsection)

            if len("\n".join(subchunks)) <= chunk_size:
                chunks.append("\n".join(subchunks))
            else:
                chunks.extend(subchunks)

    return chunks
