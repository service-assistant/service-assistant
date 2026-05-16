import pytest
from unittest.mock import AsyncMock, Mock, patch

from app.services.ingest import ingest_pdf_to_attachment


@pytest.mark.asyncio
async def test_ingest_pdf_to_attachment():
    session = AsyncMock()

    settings = Mock()
    settings.azure_openai_api_version = "test"
    settings.azure_openai_endpoint = "test"
    settings.azure_openai_api_key = "test"
    settings.azure_openai_embeddings_deployment = "test-model"

    mock_page = Mock()
    mock_page.get_text.return_value = "This is a test page content " * 50

    mock_doc = Mock()
    mock_doc.pages.return_value = [mock_page, mock_page]

    with patch("fitz.open", return_value=mock_doc):
        fake_embedding = [0.1] * 1536

        mock_client = AsyncMock()
        mock_client.embeddings.create.return_value = Mock(
            data=[Mock(embedding=fake_embedding) for _ in range(32)]
        )

        with patch("app.services.ingest.AsyncAzureOpenAI", return_value=mock_client):
            with patch(
                "app.services.ingest.insert_chunks", new_callable=AsyncMock
            ) as mock_insert:
                await ingest_pdf_to_attachment(
                    session, "test.pdf", attachment_id=1, settings=settings
                )

                assert mock_insert.called

                args, kwargs = mock_insert.call_args
                rows = args[1]

                assert len(rows) > 0

                chunk, embedding, page_num = rows[0]

                assert isinstance(chunk, str)
                assert isinstance(embedding, list)
                assert isinstance(page_num, int)
