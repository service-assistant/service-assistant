from app.schemas import PhotoObservation
from app.services.chat import photo_context


def _settings(mocker):
    settings = mocker.MagicMock()
    settings.openai_api_key = "openai-secret"
    settings.openai_chat_model = "gpt-5.6-luna"
    return settings


async def test_analyzes_multiple_photos_with_minimal_structured_output(mocker):
    settings = _settings(mocker)
    parsed = photo_context._ExtractedPhotoContext(
        observations=[
            PhotoObservation(
                component="silnik elektryczny",
                main_identifier="AF 124-L1",
                confidence=0.94,
            ),
            PhotoObservation(
                component="złącze sterownika",
                main_identifier="X14",
                confidence=0.88,
            ),
        ]
    )
    message = mocker.MagicMock(parsed=parsed, refusal=None)
    response = mocker.MagicMock()
    response.choices = [mocker.MagicMock(message=message)]
    parse = mocker.AsyncMock(return_value=response)
    client = mocker.MagicMock()
    client.chat.completions.parse = parse
    mocker.patch.object(photo_context, "AsyncOpenAI", return_value=client)

    result = await photo_context.analyze_photos(
        [
            photo_context.PhotoInput(b"first", "image/jpeg"),
            photo_context.PhotoInput(b"second", "image/png"),
        ],
        "Jak sprawdzić ten element?",
        settings,
    )

    assert [item.component for item in result] == [
        "silnik elektryczny",
        "złącze sterownika",
    ]
    assert [item.main_identifier for item in result] == ["AF 124-L1", "X14"]
    request = parse.await_args.kwargs
    assert request["model"] == "gpt-5.6-luna"
    assert "reasoning_effort" not in request
    user_content = request["messages"][1]["content"]
    image_parts = [part for part in user_content if part["type"] == "image_url"]
    assert len(image_parts) == 2
    assert image_parts[0]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert image_parts[1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_augmented_query_contains_only_component_and_main_identifier():
    observations = [
        PhotoObservation(
            component="silnik elektryczny",
            main_identifier="AF 124-L1",
            confidence=0.94,
        ),
        PhotoObservation(
            component="silnik elektryczny",
            main_identifier="AF 124-L1",
            confidence=0.8,
        ),
        PhotoObservation(component="zaciski silnika", main_identifier=None),
    ]

    query = photo_context.build_augmented_rag_query(
        "Jak zmierzyć uzwojenia?", observations
    )

    assert query == (
        "Jak zmierzyć uzwojenia?\n\n"
        "Najważniejsze informacje ze zdjęć:\n"
        "- silnik elektryczny; główne oznaczenie: AF 124-L1\n"
        "- zaciski silnika"
    )
