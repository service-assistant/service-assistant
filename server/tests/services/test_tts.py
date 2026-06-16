import pytest

from app.services.tts import extract_sentences


@pytest.mark.parametrize(
    "buffer,expected_sentences,expected_remainder",
    [
        (
            "This is the first sentence. And this is the second one. Still streaming",
            ["This is the first sentence.", "And this is the second one."],
            "Still streaming",
        ),
        (
            "Only one long enough sentence. ",
            ["Only one long enough sentence."],
            "",
        ),
        (
            "No boundary here just keeps going",
            [],
            "No boundary here just keeps going",
        ),
        (
            # "Short." is < 20 chars so it merges with the next sentence
            "Short. This sentence is long enough to pass the minimum length check. Tail",
            ["Short. This sentence is long enough to pass the minimum length check."],
            "Tail",
        ),
        (
            # Both sentences are >= 20 chars so each is emitted independently
            "Question mark works? Yes it does work fine. Remainder",
            ["Question mark works?", "Yes it does work fine."],
            "Remainder",
        ),
    ],
)
def test_should_extract_sentences_correctly(
    buffer, expected_sentences, expected_remainder
):
    sentences, remainder = extract_sentences(buffer)
    assert sentences == expected_sentences
    assert remainder == expected_remainder
