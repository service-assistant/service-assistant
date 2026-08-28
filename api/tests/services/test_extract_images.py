from pathlib import Path

import fitz

from app.services.extract_images import (
    extract_page_images,
    normalize_for_png,
    save_drawing_region,
)


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
    mock_pix_instance.width = 100
    mock_pix_instance.height = 100
    mock_pix_instance.colorspace.name = "DeviceRGB"

    mock_pixmap.return_value = mock_pix_instance

    mock_save_drawing_region.return_value = ["vector.png"]

    result = extract_page_images(
        doc=mock_doc,
        page=page,
        output_dir=tmp_path,
    )

    assert len(result) == 3
    assert "vector.png" in result
    assert mock_pix_instance.save.call_count == 2


def test_normalize_for_png_converts_unsupported_colorspace(mocker):
    pix = mocker.Mock()
    pix.colorspace.name = "DeviceN"
    converted = mocker.Mock()
    mock_pixmap = mocker.patch(
        "app.services.extract_images.Pixmap", return_value=converted
    )

    result = normalize_for_png(pix)

    assert result is converted
    mock_pixmap.assert_called_once_with(fitz.csRGB, pix)


def test_normalize_for_png_keeps_rgb_pixmap(mocker):
    pix = mocker.Mock()
    pix.colorspace.name = "DeviceRGB"

    assert normalize_for_png(pix) is pix


def test_normalize_for_png_skips_standalone_mask(mocker):
    pix = mocker.Mock()
    pix.colorspace = None

    assert normalize_for_png(pix) is None


def test_save_drawing_region_saves_png(mocker, tmp_path: Path):
    rects = [
        {"rect": fitz.Rect(0, 0, 100, 100), "items": [{}, {}]},
        {"rect": fitz.Rect(10, 10, 90, 90), "items": [{}, {}]},
    ]

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
    )

    assert len(result) == 1

    mock_pixmap.save.assert_called_once()

    saved_path = mock_pixmap.save.call_args[0][0]

    assert saved_path.endswith(".png")


def test_save_drawing_region_returns_none_for_small_amount(mocker, tmp_path: Path):
    page = mocker.Mock()

    page.get_drawings.return_value = [{"rect": fitz.Rect(0, 0, 10, 10), "items": []}]

    result = save_drawing_region(
        page=page,
        output_dir=tmp_path,
    )

    assert result == []
