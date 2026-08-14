from app.services.embedding import embed_question


async def test_embed_question_returns_first_embedding(mocker, settings):
    client = mocker.MagicMock()
    client.embeddings.create = mocker.AsyncMock(
        return_value=mocker.MagicMock(
            data=[mocker.MagicMock(embedding=[0.0, 1.0, 0.45])]
        )
    )

    mocker.patch("app.services.embedding.AsyncAzureOpenAI", return_value=client)
    assert await embed_question("hello", settings) == [0.0, 1.0, 0.45]
