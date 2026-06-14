from sqlalchemy.ext.asyncio import AsyncSession

from app.services.retrieval import get_semantic_chunks


async def test_get_semantic_chunks_with_device_id(mocker):
    session = mocker.AsyncMock(spec=AsyncSession)

    chunk1 = mocker.MagicMock()
    chunk1.id = 1
    chunk1.content = "chunk 1"
    chunk1.attachment_id = 10
    chunk1.extra_metadata = None

    chunk2 = mocker.MagicMock()
    chunk2.id = 2
    chunk2.content = "chunk 2"
    chunk2.attachment_id = 10
    chunk2.extra_metadata = {"page": 1}

    mock_result = mocker.MagicMock()
    mock_result.all.return_value = [chunk1, chunk2]
    session.scalars.return_value = mock_result

    result = await get_semantic_chunks(session, [0.1, 0.2], device_id=5, limit=5)

    assert result == [
        {"id": 1, "content": "chunk 1", "attachment_id": 10, "extra_metadata": None},
        {
            "id": 2,
            "content": "chunk 2",
            "attachment_id": 10,
            "extra_metadata": {"page": 1},
        },
    ]
    session.scalars.assert_called_once()


async def test_get_semantic_chunks_skips_chunks_without_id(mocker):
    session = mocker.AsyncMock(spec=AsyncSession)

    chunk = mocker.MagicMock()
    chunk.id = None
    chunk.content = "skip me"

    mock_result = mocker.MagicMock()
    mock_result.all.return_value = [chunk]
    session.scalars.return_value = mock_result

    result = await get_semantic_chunks(session, [0.1], device_id=1, limit=5)

    assert result == []
