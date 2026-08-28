import asyncio
import threading
import time

import fitz
import pytest

from app.services.ingest import (
    EmbeddingServiceError,
    ImageOnlyPdfError,
    IngestReport,
    ingest_pdf_to_attachment,
    render_page_for_ocr,
)


@pytest.fixture(autouse=True)
def openai_client(mocker):
    return mocker.patch(
        "app.services.ingest.AsyncOpenAI", return_value=mocker.AsyncMock()
    )


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


async def test_ingest_pdf_to_attachment(mocker, settings, openai_client):
    session = mocker.AsyncMock()
    main_thread_id = threading.get_ident()
    pdf_worker_thread_ids: list[int] = []

    mock_page = mocker.Mock()

    mock_page.get_text.return_value = "This is a test page content " * 50

    mock_doc = mocker.MagicMock()

    mock_doc.pages.return_value = [
        mock_page,
        mock_page,
    ]
    mock_doc.__len__.return_value = 2

    fake_embedding = [0.1] * 1536

    fake_images = [
        "attachments/images/img1.png",
        "attachments/images/img2.png",
    ]

    def open_pdf(_path):
        pdf_worker_thread_ids.append(threading.get_ident())
        return mock_doc

    mocker.patch("fitz.open", side_effect=open_pdf)

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

    azure_client = mocker.patch(
        "app.services.ingest.AsyncAzureOpenAI", return_value=mock_client
    )
    mocker.patch("app.services.ingest.chunk_page", return_value=["chunk 1", "chunk 2"])
    mocker.patch("app.services.ingest.extract_page_images", return_value=fake_images)
    describe = mocker.patch(
        "app.services.ingest.describe_images",
        new_callable=mocker.AsyncMock,
        return_value=[],
    )
    mock_insert = mocker.patch(
        "app.services.ingest.insert_chunks",
        new_callable=mocker.AsyncMock,
    )

    report = await ingest_pdf_to_attachment(
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
    assert report.total_pages == 2
    assert report.native_text_pages == 2
    assert report.ocr_pages_attempted == 0
    assert report.chunks_indexed == len(rows)
    assert pdf_worker_thread_ids
    assert pdf_worker_thread_ids[0] != main_thread_id
    azure_client.assert_called_once_with(
        api_version=settings.azure_openai_api_version,
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        timeout=settings.azure_embeddings_timeout_seconds,
        max_retries=settings.azure_embeddings_max_retries,
    )
    openai_client.assert_called_once_with(api_key=settings.openai_api_key)
    assert describe.await_count == 1


async def test_sparse_native_text_gets_image_description_chunks(
    mocker, settings, openai_client
):
    session = mocker.AsyncMock()
    page = mocker.Mock()
    page.get_text.return_value = "Native text"
    document = mocker.MagicMock()
    document.__len__.return_value = 1
    document.pages.return_value = [page]
    mocker.patch("app.services.ingest.fitz.open", return_value=document)
    mocker.patch(
        "app.services.ingest.pymupdf4llm.to_markdown", return_value="Native markdown"
    )
    mocker.patch("app.services.ingest.chunk_page", return_value=["native chunk"])
    image_paths = ["image-1.png", "image-2.png"]
    mocker.patch("app.services.ingest.extract_page_images", return_value=image_paths)
    describe = mocker.patch(
        "app.services.ingest.describe_images",
        new_callable=mocker.AsyncMock,
        return_value=[
            ("image-1.png", "Description 1"),
            ("image-2.png", "Description 2"),
        ],
    )

    embedding_client = mocker.AsyncMock()
    embedding_client.embeddings.create.side_effect = [
        mocker.Mock(data=[mocker.Mock(embedding=[0.1] * 1536)]),
        mocker.Mock(data=[mocker.Mock(embedding=[0.1] * 1536) for _ in range(2)]),
    ]
    vision_client = mocker.AsyncMock()
    mocker.patch("app.services.ingest.AsyncAzureOpenAI", return_value=embedding_client)
    openai_client.return_value = vision_client
    insert = mocker.patch(
        "app.services.ingest.insert_chunks", new_callable=mocker.AsyncMock
    )

    report = await ingest_pdf_to_attachment(
        session, "text-with-images.pdf", 1, settings
    )

    rows = insert.call_args.args[1]
    assert [row[0] for row in rows] == [
        "native chunk",
        "Description 1",
        "Description 2",
    ]
    assert rows[0][3] == image_paths
    assert rows[1][3] == [image_paths[0]]
    assert rows[2][3] == [image_paths[1]]
    assert report.chunks_indexed == 3
    openai_client.assert_called_once_with(api_key=settings.openai_api_key)
    assert describe.await_count == 1
    describe_call = describe.await_args_list[0]
    assert describe_call.args[2] is vision_client
    assert describe_call.args[3] == "gpt-5.6-luna"


async def test_image_only_pdf_is_rejected_only_after_azure_ocr_fails(mocker, settings):
    session = mocker.AsyncMock()
    pages = [mocker.Mock(), mocker.Mock()]
    for page in pages:
        page.get_text.return_value = ""
    document = mocker.MagicMock()
    document.__len__.return_value = 2
    document.pages.return_value = pages
    mocker.patch("app.services.ingest.fitz.open", return_value=document)

    mocker.patch("app.services.ingest.render_page_for_ocr", return_value=b"jpeg")
    ocr_client = mocker.MagicMock()
    ocr_client.begin_analyze_document.side_effect = RuntimeError("Azure is down")
    ocr_client_factory = mocker.patch(
        "app.services.ingest.DocumentIntelligenceClient", return_value=ocr_client
    )
    mocker.patch(
        "app.services.ingest.AsyncAzureOpenAI", return_value=mocker.AsyncMock()
    )
    insert = mocker.patch(
        "app.services.ingest.insert_chunks", new_callable=mocker.AsyncMock
    )

    with pytest.raises(ImageOnlyPdfError) as error:
        await ingest_pdf_to_attachment(session, "images.pdf", 1, settings)

    assert error.value.report.total_pages == 2
    assert error.value.report.native_text_pages == 0
    assert error.value.report.ocr_pages_attempted == 2
    assert error.value.report.ocr_pages_skipped == 2
    assert "Skipped entire file" in error.value.report.events[-1]
    assert ocr_client_factory.call_count == 1
    insert.assert_not_awaited()


async def test_image_only_pdf_is_kept_when_azure_ocr_recovers_text(mocker, settings):
    session = mocker.AsyncMock()
    page = mocker.Mock()
    page.get_text.return_value = ""
    document = mocker.MagicMock()
    document.__len__.return_value = 1
    document.pages.return_value = [page]
    mocker.patch("app.services.ingest.fitz.open", return_value=document)
    mocker.patch("app.services.ingest.render_page_for_ocr", return_value=b"jpeg")
    mocker.patch("app.services.ingest.process_ocr_text", return_value="OCR text")
    mocker.patch("app.services.ingest.chunk_page", return_value=["OCR chunk"])
    mocker.patch("app.services.ingest.extract_page_images", return_value=[])
    mocker.patch(
        "app.services.ingest.describe_images",
        new_callable=mocker.AsyncMock,
        return_value=[],
    )

    poller = mocker.MagicMock()
    poller.result.return_value = mocker.Mock(content="raw OCR")
    ocr_client = mocker.MagicMock()
    ocr_client.begin_analyze_document.return_value = poller
    mocker.patch(
        "app.services.ingest.DocumentIntelligenceClient", return_value=ocr_client
    )
    embedding_client = mocker.AsyncMock()
    embedding_client.embeddings.create.return_value = mocker.Mock(
        data=[mocker.Mock(embedding=[0.1] * 1536)]
    )
    mocker.patch("app.services.ingest.AsyncAzureOpenAI", return_value=embedding_client)
    insert = mocker.patch(
        "app.services.ingest.insert_chunks", new_callable=mocker.AsyncMock
    )

    report = await ingest_pdf_to_attachment(session, "scans.pdf", 1, settings)

    assert report.native_text_pages == 0
    assert report.ocr_pages_attempted == 1
    assert report.ocr_pages_succeeded == 1
    assert report.ocr_pages_skipped == 0
    assert report.chunks_indexed == 1
    insert.assert_awaited_once()


async def test_image_only_page_gets_description_when_ocr_recovers_no_text(
    mocker, settings
):
    session = mocker.AsyncMock()
    page = mocker.Mock()
    page.get_text.return_value = ""
    document = mocker.MagicMock()
    document.__len__.return_value = 1
    document.pages.return_value = [page]
    mocker.patch("app.services.ingest.fitz.open", return_value=document)
    mocker.patch("app.services.ingest.render_page_for_ocr", return_value=b"jpeg")
    mocker.patch(
        "app.services.ingest.save_ocr_rendered_image", return_value=["page.jpg"]
    )
    mocker.patch("app.services.ingest.process_ocr_text", return_value="")
    mocker.patch("app.services.ingest.chunk_page", return_value=[])
    describe = mocker.patch(
        "app.services.ingest.describe_images",
        new_callable=mocker.AsyncMock,
        return_value=[("page.jpg", "A technical diagram")],
    )

    poller = mocker.MagicMock()
    poller.result.return_value = mocker.Mock(content="raw OCR")
    ocr_client = mocker.MagicMock()
    ocr_client.begin_analyze_document.return_value = poller
    mocker.patch(
        "app.services.ingest.DocumentIntelligenceClient", return_value=ocr_client
    )
    embedding_client = mocker.AsyncMock()
    embedding_client.embeddings.create.return_value = mocker.Mock(
        data=[mocker.Mock(embedding=[0.1] * 1536)]
    )
    mocker.patch("app.services.ingest.AsyncAzureOpenAI", return_value=embedding_client)
    insert = mocker.patch(
        "app.services.ingest.insert_chunks", new_callable=mocker.AsyncMock
    )

    report = await ingest_pdf_to_attachment(session, "image-only.pdf", 1, settings)

    describe.assert_awaited_once()
    assert report.chunks_indexed == 1
    insert.assert_awaited_once()


async def test_mixed_pdf_survives_azure_ocr_failure_and_skips_only_image_page(
    mocker, settings
):
    session = mocker.AsyncMock()
    text_page = mocker.Mock()
    text_page.get_text.return_value = "Native text"
    image_page = mocker.Mock()
    image_page.get_text.return_value = ""
    document = mocker.MagicMock()
    document.__len__.return_value = 2
    document.pages.return_value = [text_page, image_page]
    mocker.patch("app.services.ingest.fitz.open", return_value=document)
    mocker.patch(
        "app.services.ingest.pymupdf4llm.to_markdown", return_value="Native markdown"
    )
    mocker.patch("app.services.ingest.chunk_page", return_value=["native chunk"])
    mocker.patch("app.services.ingest.extract_page_images", return_value=[])
    mocker.patch("app.services.ingest.render_page_for_ocr", return_value=b"jpeg")

    ocr_client = mocker.MagicMock()
    ocr_client.begin_analyze_document.side_effect = RuntimeError("Azure is down")
    mocker.patch(
        "app.services.ingest.DocumentIntelligenceClient", return_value=ocr_client
    )
    embedding_client = mocker.AsyncMock()
    embedding_client.embeddings.create.return_value = mocker.Mock(
        data=[mocker.Mock(embedding=[0.1] * 1536)]
    )
    mocker.patch("app.services.ingest.AsyncAzureOpenAI", return_value=embedding_client)
    insert = mocker.patch(
        "app.services.ingest.insert_chunks", new_callable=mocker.AsyncMock
    )

    report = await ingest_pdf_to_attachment(session, "mixed.pdf", 1, settings)

    assert report.native_text_pages == 1
    assert report.ocr_pages_attempted == 1
    assert report.ocr_pages_succeeded == 0
    assert report.ocr_pages_skipped == 1
    assert report.chunks_indexed == 1
    assert any("Azure is down" in event for event in report.events)
    insert.assert_awaited_once()


async def test_embedding_failure_is_bounded_and_rejects_unindexed_file(
    mocker, settings
):
    session = mocker.AsyncMock()
    page = mocker.Mock()
    page.get_text.return_value = "Native text"
    document = mocker.MagicMock()
    document.__len__.return_value = 1
    document.pages.return_value = [page]
    mocker.patch("app.services.ingest.fitz.open", return_value=document)
    mocker.patch(
        "app.services.ingest.pymupdf4llm.to_markdown", return_value="Native markdown"
    )
    mocker.patch("app.services.ingest.chunk_page", return_value=["native chunk"])
    mocker.patch("app.services.ingest.extract_page_images", return_value=[])
    mocker.patch("app.services.ingest.DocumentIntelligenceClient")
    embedding_client = mocker.AsyncMock()
    embedding_client.embeddings.create.side_effect = RuntimeError("Azure is down")
    mocker.patch("app.services.ingest.AsyncAzureOpenAI", return_value=embedding_client)
    insert = mocker.patch(
        "app.services.ingest.insert_chunks", new_callable=mocker.AsyncMock
    )

    with pytest.raises(EmbeddingServiceError, match="Azure embeddings failed"):
        await ingest_pdf_to_attachment(session, "text.pdf", 1, settings)

    insert.assert_not_awaited()


async def test_ocr_call_has_a_hard_timeout_and_native_text_is_still_indexed(
    mocker, settings
):
    short_timeout_settings = settings.model_copy(
        update={"azure_ocr_timeout_seconds": 0.01}
    )
    session = mocker.AsyncMock()
    text_page = mocker.Mock()
    text_page.get_text.return_value = "Native text"
    image_page = mocker.Mock()
    image_page.get_text.return_value = ""
    document = mocker.MagicMock()
    document.__len__.return_value = 2
    document.pages.return_value = [text_page, image_page]
    mocker.patch("app.services.ingest.fitz.open", return_value=document)
    mocker.patch(
        "app.services.ingest.pymupdf4llm.to_markdown", return_value="Native markdown"
    )
    mocker.patch("app.services.ingest.chunk_page", return_value=["native chunk"])
    mocker.patch("app.services.ingest.extract_page_images", return_value=[])
    mocker.patch("app.services.ingest.render_page_for_ocr", return_value=b"jpeg")

    poller = mocker.MagicMock()
    poller.result.side_effect = lambda **_kwargs: time.sleep(0.05)
    ocr_client = mocker.MagicMock()
    ocr_client.begin_analyze_document.return_value = poller
    mocker.patch(
        "app.services.ingest.DocumentIntelligenceClient", return_value=ocr_client
    )
    embedding_client = mocker.AsyncMock()
    embedding_client.embeddings.create.return_value = mocker.Mock(
        data=[mocker.Mock(embedding=[0.1] * 1536)]
    )
    mocker.patch("app.services.ingest.AsyncAzureOpenAI", return_value=embedding_client)
    mocker.patch("app.services.ingest.insert_chunks", new_callable=mocker.AsyncMock)

    report = await ingest_pdf_to_attachment(
        session, "mixed.pdf", 1, short_timeout_settings
    )

    assert report.ocr_pages_skipped == 1
    assert report.chunks_indexed == 1
    assert any("TimeoutError" in event for event in report.events)


async def test_only_one_pdf_ingest_runs_at_a_time(mocker, settings):
    active = 0
    maximum_active = 0

    async def fake_ingest(**_kwargs):
        nonlocal active, maximum_active
        active += 1
        maximum_active = max(maximum_active, active)
        await asyncio.sleep(0.01)
        active -= 1
        return IngestReport()

    mocker.patch(
        "app.services.ingest._ingest_pdf_to_attachment_unlocked",
        side_effect=fake_ingest,
    )

    await asyncio.gather(
        ingest_pdf_to_attachment(mocker.AsyncMock(), "first.pdf", 1, settings),
        ingest_pdf_to_attachment(mocker.AsyncMock(), "second.pdf", 2, settings),
    )

    assert maximum_active == 1
