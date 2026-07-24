import fitz
import pytest

from app.services.ingest import ingest_pdf_to_attachment, render_page_for_ocr


def test_render_page_for_ocr_limits_dimensions(mocker):
    page = mocker.Mock()
    page.rect.width = 20_000
    page.rect.height = 10_000
    pix = mocker.Mock()
    pix.tobytes.return_value = b"small"
    page.get_pixmap.return_value = pix

    assert render_page_for_ocr(page) == b"small"

    matrix = page.get_pixmap.call_args.kwargs["matrix"]
    assert matrix.a == pytest.approx(0.2)
    assert matrix.d == pytest.approx(0.2)
    assert page.get_pixmap.call_args.kwargs["colorspace"] is fitz.csRGB
    assert page.get_pixmap.call_args.kwargs["alpha"] is False
    pix.tobytes.assert_called_once_with("jpeg", jpg_quality=85)


def test_render_page_for_ocr_downscales_large_image(mocker):
    page = mocker.Mock()
    page.rect.width = 1_000
    page.rect.height = 1_000
    oversized = b"x" * 101
    pix = mocker.Mock()
    pix.tobytes.side_effect = [oversized, b"small"]
    page.get_pixmap.return_value = pix

    assert render_page_for_ocr(page, max_bytes=100) == b"small"
    assert page.get_pixmap.call_count == 2
    first_matrix = page.get_pixmap.call_args_list[0].kwargs["matrix"]
    second_matrix = page.get_pixmap.call_args_list[1].kwargs["matrix"]
    assert second_matrix.a < first_matrix.a


async def test_ingest_pdf_to_attachment(mocker, settings):
    session = mocker.AsyncMock()

    mock_page = mocker.Mock()

    mock_page.get_text.return_value = "This is a test page content " * 50

    mock_doc = mocker.Mock()

    mock_doc.pages.return_value = [
        mock_page,
        mock_page,
    ]

    fake_embedding = [0.1] * 1536

    fake_images = [
        "attachments/images/img1.png",
        "attachments/images/img2.png",
    ]

    mocker.patch("fitz.open", return_value=mock_doc)

    mocker.patch(
        "app.services.ingest.pymupdf4llm.to_markdown",
        return_value="# Test\n\nSome markdown",
    )

    mock_client = mocker.AsyncMock()

    mock_client.embeddings.create.return_value = mocker.Mock(
        data=[
            mocker.Mock(embedding=fake_embedding),
            mocker.Mock(embedding=fake_embedding),
        ]
    )

    mocker.patch("app.services.ingest.AsyncAzureOpenAI", return_value=mock_client)
    mocker.patch("app.services.ingest.chunk_page", return_value=["chunk 1", "chunk 2"])
    mocker.patch("app.services.ingest.extract_page_images", return_value=fake_images)
    mock_insert = mocker.patch(
        "app.services.ingest.insert_chunks",
        new_callable=mocker.AsyncMock,
    )

    await ingest_pdf_to_attachment(
        session=session,
        pdf_path="test.pdf",
        attachment_id=1,
        settings=settings,
    )

    assert mock_insert.called

    args, kwargs = mock_insert.call_args

    rows = args[1]

    assert len(rows) > 0

    chunk, embedding, page_num, page_images = rows[0]

    assert isinstance(chunk, str)
    assert isinstance(embedding, list)
    assert isinstance(page_num, int)
    assert isinstance(page_images, list)
    assert page_images == fake_images
