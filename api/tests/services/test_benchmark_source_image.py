from app.benchmarks.dataset import load_benchmark_dataset
from app.services.benchmark.judge import evaluate_source_images


def _source_image_case():
    return next(
        item
        for item in load_benchmark_dataset().cases
        if item.id == "show_electrical_schematic"
    )


def test_electrical_schematic_case_requires_a_displayable_source_image():
    case = _source_image_case()

    assert case.question == "pokaż schemat elektryczny"
    assert case.category == "source_image"
    assert case.evaluation_mode == "source_image"
    assert case.minimum_source_images == 1
    assert case.source.filename == "LWE200 EX - schemat elektryczny.pdf"
    assert len(case.required_facts) == 1


def test_source_image_judgement_requires_image_linked_to_assistant_message():
    case = _source_image_case()
    chunks = [
        {
            "source_name": case.source.filename,
            "metadata": {"images": ["/attachments/images/schematic.png"]},
            "linked_for_display": True,
        },
        {
            "source_name": case.source.filename,
            "metadata": {"images": ["/attachments/images/not-linked.png"]},
            "linked_for_display": False,
        },
    ]

    judge, chunk_judge, image_paths = evaluate_source_images(case, chunks)

    assert judge.required_facts[0].satisfied is True
    assert image_paths == ["/attachments/images/schematic.png"]
    assert chunk_judge.chunks[0].supported_fact_indexes == [0]
    assert chunk_judge.chunks[1].supported_fact_indexes == []


def test_source_image_judgement_rejects_images_from_a_different_source():
    case = _source_image_case()

    judge, _chunk_judge, image_paths = evaluate_source_images(
        case,
        [
            {
                "source_name": "different.pdf",
                "metadata": {"images": ["/attachments/images/schematic.png"]},
                "linked_for_display": True,
            }
        ],
    )

    assert judge.required_facts[0].satisfied is False
    assert image_paths == []
