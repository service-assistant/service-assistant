import pytest

from app.services.ingest import ingest_pdf_to_attachment


@pytest.mark.asyncio
async def test_ingest_pdf_to_attachment(mocker):
    session = mocker.AsyncMock()

    settings = mocker.Mock()

    settings.azure_openai_api_version = "test"
    settings.azure_openai_endpoint = "test"
    settings.azure_openai_api_key = "test"
    settings.azure_openai_embeddings_deployment = "test-model"

    settings.attachments_dir = mocker.Mock()
    settings.attachments_dir.__truediv__ = mocker.Mock(
        return_value="attachments/images"
    )

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

    mock_client = mocker.AsyncMock()

    mock_client.embeddings.create.return_value = mocker.Mock(
        data=[mocker.Mock(embedding=fake_embedding) for _ in range(32)]
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
