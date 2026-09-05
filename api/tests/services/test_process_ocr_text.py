import pytest

from app.services.ingest.ocr_text import process_ocr_text


@pytest.mark.parametrize(
    ("table", "expected_text"),
    [
        ("<table></table>", None),
        ("<table><tr></tr></table>", None),
        (
            "<table><caption>Specifications</caption><tr></tr></table>",
            "Specifications",
        ),
    ],
)
def test_should_ignore_ocr_tables_without_cells(table, expected_text):
    result = process_ocr_text(f"Before\n{table}\nAfter")

    assert "Before" in result
    assert "After" in result
    assert "<table" not in result
    if expected_text:
        assert expected_text in result
