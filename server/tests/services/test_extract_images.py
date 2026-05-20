from pathlib import Path
from unittest.mock import Mock, patch

import fitz

from app.services.extract_images import extract_page_images, save_drawing_region


@patch("app.services.extract_images.save_drawing_region")
@patch("app.services.extract_images.Pixmap")
def test_extract_page_images(
    mock_pixmap,
    mock_save_drawing_region,
    tmp_path: Path,
):
    mock_doc = Mock()
    page = Mock()

    page.get_images.return_value = [
        [123],
        [456],
    ]

    mock_pix_instance = Mock()
    mock_pix_instance.n = 3
    mock_pix_instance.alpha = 0

    mock_pixmap.return_value = mock_pix_instance

    mock_save_drawing_region.return_value = "vector.png"

    result = extract_page_images(
        doc=mock_doc,
        page=page,
        output_dir=tmp_path,
    )

    assert len(result) == 3
    assert "vector.png" in result
    assert mock_pix_instance.save.call_count == 2


def test_save_drawing_region_saves_png(tmp_path: Path):
    rects = [{"rect": fitz.Rect(0, 0, 100, 100)} for _ in range(60)]

    mock_pixmap = Mock()

    page = Mock()

    page.get_drawings.return_value = rects
    page.get_pixmap.return_value = mock_pixmap

    result = save_drawing_region(
        page=page,
        output_dir=tmp_path,
        min_drawings=50,
    )

    assert result is not None

    mock_pixmap.save.assert_called_once()

    saved_path = mock_pixmap.save.call_args[0][0]

    assert saved_path.endswith(".png")


def test_save_drawing_region_returns_none_for_small_amount(tmp_path: Path):
    page = Mock()

    page.get_drawings.return_value = [{"rect": fitz.Rect(0, 0, 10, 10)}]

    result = save_drawing_region(
        page=page,
        output_dir=tmp_path,
        min_drawings=50,
    )

    assert result is None
