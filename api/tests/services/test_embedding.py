from app.services.chat.retrieval.embedding import embed_question, embed_questions


async def test_embed_question_returns_first_embedding(mocker, settings):
    client = mocker.MagicMock()
    client.embeddings.create = mocker.AsyncMock(
        return_value=mocker.MagicMock(
            data=[mocker.MagicMock(embedding=[0.0, 1.0, 0.45])]
        )
    )

    mocker.patch(
        "app.services.chat.retrieval.embedding.AsyncAzureOpenAI", return_value=client
    )
    assert await embed_question("hello", settings) == [0.0, 1.0, 0.45]


async def test_embed_questions_uses_one_request_and_preserves_input_order(
    mocker, settings
):
    client = mocker.MagicMock()
    client.embeddings.create = mocker.AsyncMock(
        return_value=mocker.MagicMock(
            data=[
                mocker.MagicMock(index=1, embedding=[2.0]),
                mocker.MagicMock(index=0, embedding=[1.0]),
            ]
        )
    )
    mocker.patch(
        "app.services.chat.retrieval.embedding.AsyncAzureOpenAI", return_value=client
    )

    result = await embed_questions(["first", "second"], settings)

    assert result == [[1.0], [2.0]]
    client.embeddings.create.assert_awaited_once_with(
        input=["first", "second"],
        model=settings.azure_openai_embeddings_deployment,
    )
