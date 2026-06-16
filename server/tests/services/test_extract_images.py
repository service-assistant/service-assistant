from pathlib import Path

import fitz

from app.services.extract_images import extract_page_images, save_drawing_region


def test_extract_page_images(mocker, tmp_path: Path):
    mock_save_drawing_region = mocker.patch(
        "app.services.extract_images.save_drawing_region"
    )
    mock_pixmap = mocker.patch("app.services.extract_images.Pixmap")

    mock_doc = mocker.Mock()
    page = mocker.Mock()

    page.get_images.return_value = [
        [123],
        [456],
    ]

    mock_pix_instance = mocker.Mock()
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


def test_save_drawing_region_saves_png(mocker, tmp_path: Path):
    rects = [{"rect": fitz.Rect(0, 0, 100, 100)} for _ in range(60)]

    mock_pixmap = mocker.Mock()

    mock_pixmap.width = 100
    mock_pixmap.height = 100

    page = mocker.Mock()

    page.rect = fitz.Rect(0, 0, 500, 500)

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


def test_save_drawing_region_returns_none_for_small_amount(mocker, tmp_path: Path):
    page = mocker.Mock()

    page.get_drawings.return_value = [{"rect": fitz.Rect(0, 0, 10, 10)}]

    result = save_drawing_region(
        page=page,
        output_dir=tmp_path,
        min_drawings=50,
    )

    assert result is None
