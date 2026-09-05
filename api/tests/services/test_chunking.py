from app.services.ingest.chunking import chunk_page


def test_chunk_page_splits_oversized_table_rows():
    oversized_cell = "very-long-value " * 1_000
    markdown = f"| Name | Value |\n|---|---|\n| setting | {oversized_cell} |\n"

    chunks = chunk_page(markdown, chunk_size=1_000, overlap=200)

    assert len(chunks) > 1
    assert all(len(chunk) <= 1_000 for chunk in chunks)
    assert any("very-long-value" in chunk for chunk in chunks)
