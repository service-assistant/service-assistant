import re
from bs4 import BeautifulSoup
from bs4.element import NavigableString, Tag


def remove_picture_text(text: str) -> str:
    """
    Removes picture text (<figure>...</figure>) from the given text
    """

    pattern = (
        r"<figure>"
        r".*?"
        r"</figure>"
    )

    cleaned_text = re.sub(
        pattern,
        "",
        text,
        flags=re.DOTALL | re.IGNORECASE,
    )

    # remove empty lines
    cleaned_text = re.sub(r"\n\s*\n", "\n", cleaned_text).strip()

    return cleaned_text


def html_one_table_to_markdown(table: Tag) -> str:
    """
    Changes the format of one table from html to markdown
    used in html_tables_to_markdown
    """

    result = []

    # table caption
    caption = table.find("caption")
    if caption:
        result.append(caption.get_text(strip=True))
        result.append("")

    rowspan_map = {}
    rows = []

    tr_list = table.find_all("tr")

    for tr in tr_list:
        row = []
        col = 0

        # insert from previous rowspan
        while col in rowspan_map:
            text, remain = rowspan_map[col]
            row.append(text)
            if remain == 1:
                del rowspan_map[col]
            else:
                rowspan_map[col] = (text, remain - 1)
            col += 1

        cells = tr.find_all(["td", "th"], recursive=False)

        for cell in cells:
            while col in rowspan_map:
                text, remain = rowspan_map[col]
                row.append(text)
                if remain == 1:
                    del rowspan_map[col]
                else:
                    rowspan_map[col] = (text, remain - 1)
                col += 1

            text = " ".join(cell.stripped_strings)

            value = cell.get("rowspan")
            rowspan = int(value) if isinstance(value, (str, int)) else 1

            row.append(text)

            if rowspan > 1:
                rowspan_map[col] = (text, rowspan - 1)

            col += 1

        while col in rowspan_map:
            text, remain = rowspan_map[col]
            row.append(text)
            if remain == 1:
                del rowspan_map[col]
            else:
                rowspan_map[col] = (text, remain - 1)
            col += 1

        rows.append(row)

    if not rows:
        return "\n".join(result)

    # equalize the number of columns
    max_cols = max(len(r) for r in rows)
    for r in rows:
        r.extend([""] * (max_cols - len(r)))

    # remove empty columns and rows
    keep_cols = [i for i in range(max_cols) if any(row[i].strip() for row in rows)]
    rows = [[row[i] for i in keep_cols] for row in rows]

    rows = [row for row in rows if any(cell.strip() for cell in row)]

    if not rows:
        return "\n".join(result)

    # change to markdown
    header = rows[0]
    result.append("|" + "|".join(header) + "|")
    result.append("|" + "|".join(["---"] * len(header)) + "|")

    for row in rows[1:]:
        result.append("|" + "|".join(row) + "|")

    return "\n".join(result)


def html_tables_to_markdown(html):
    """
    Changes the format of tables from html to markdown in a given text
    """
    soup = BeautifulSoup(html, "html.parser")

    for table in soup.find_all("table"):
        md = html_one_table_to_markdown(table)
        table.replace_with(NavigableString("\n\n" + md + "\n\n"))

    return str(soup)


def process_ocr_text(text: str) -> str:
    """
    Remove page comments and picture text, convert html tables to markdown
    """

    formatted_content = re.sub(r"<!--\s*Page.*?-->", "", text)
    formatted_content = remove_picture_text(formatted_content)
    formatted_content = html_tables_to_markdown(formatted_content)

    return formatted_content
