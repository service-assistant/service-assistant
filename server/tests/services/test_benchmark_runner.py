import asyncio
import json
from types import SimpleNamespace
from typing import cast

import pytest

from app.config import Settings
from app.services import benchmark_runner
from app.services.benchmark_cases import load_benchmark_dataset


def test_pass_thresholds_require_seven_of_eight_facts():
    assert 6 / 8 < benchmark_runner.REQUIRED_FACTS_PASS_THRESHOLD
    assert 7 / 8 >= benchmark_runner.REQUIRED_FACTS_PASS_THRESHOLD
    assert 6 / 8 < benchmark_runner.FACT_COVERAGE_PASS_THRESHOLD
    assert 7 / 8 >= benchmark_runner.FACT_COVERAGE_PASS_THRESHOLD


def test_parse_sse_should_preserve_multiline_data():
    events = benchmark_runner._parse_sse(
        "event: route\ndata: start_diagnostic\n\n"
        "event: chunk\ndata: first\ndata: second\n\n"
    )

    assert events == [
        ("route", "start_diagnostic"),
        ("chunk", "first\nsecond"),
    ]


async def test_conversation_should_follow_at_most_three_promised_continuations():
    sent: list[str] = []

    async def send(content: str):
        sent.append(content)
        return {
            "route": "standard_query",
            "message": {
                "id": len(sent),
                "content": f"answer {len(sent)}",
                "has_continuation": True,
            },
            "debug": [],
        }

    turns = await benchmark_runner._collect_benchmark_conversation(
        "mam blad 2504", send
    )

    assert sent == ["mam blad 2504", "kontynuuj", "kontynuuj", "kontynuuj"]
    assert len(turns) == 4


async def test_conversation_should_stop_after_complete_first_answer():
    sent: list[str] = []

    async def send(content: str):
        sent.append(content)
        return {
            "route": "standard_query",
            "message": {
                "id": 1,
                "content": "complete answer",
                "has_continuation": False,
            },
            "debug": [],
        }

    turns = await benchmark_runner._collect_benchmark_conversation(
        "mam blad 2504", send
    )

    assert sent == ["mam blad 2504"]
    assert len(turns) == 1


def test_merge_chunks_should_deduplicate_sources_from_both_messages():
    merged = benchmark_runner._merge_chunks(
        [{"id": 1}, {"id": 2}],
        [{"id": 2}, {"id": 3}],
    )

    assert [chunk["id"] for chunk in merged] == [1, 2, 3]


async def test_cancellation_should_interrupt_active_async_operation():
    cancellation_event = asyncio.Event()
    operation_started = asyncio.Event()
    operation_cancelled = asyncio.Event()

    async def long_operation():
        operation_started.set()
        try:
            await asyncio.sleep(60)
        finally:
            operation_cancelled.set()

    task = asyncio.create_task(
        benchmark_runner._await_with_cancellation(long_operation(), cancellation_event)
    )
    await operation_started.wait()
    cancellation_event.set()

    with pytest.raises(
        benchmark_runner.BenchmarkCancelledError,
        match="cancelled",
    ):
        await task
    assert operation_cancelled.is_set()


async def test_judge_should_use_reasoning_model_and_validate_all_criteria(mocker):
    case = load_benchmark_dataset().cases[0]
    result_payload = {
        "required_facts": [
            {"index": index, "satisfied": True, "evidence": "present"}
            for index in range(len(case.required_facts))
        ],
        "forbidden_claims": [
            {"index": index, "satisfied": False, "evidence": "absent"}
            for index in range(len(case.forbidden_claims))
        ],
        "feedback": "Correct.",
    }
    create = mocker.AsyncMock(
        return_value=SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=json.dumps(result_payload, ensure_ascii=False)
                    )
                )
            ]
        )
    )
    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )
    mocker.patch("app.services.benchmark_runner.AsyncOpenAI", return_value=client)
    settings = SimpleNamespace(
        openai_api_key="test",
        benchmark_judge_model="gpt-5.1",
        benchmark_judge_reasoning_effort="high",
    )

    result = await benchmark_runner._judge_answer(
        case, "answer", cast(Settings, settings)
    )

    assert all(item.satisfied for item in result.required_facts)
    assert not any(item.satisfied for item in result.forbidden_claims)
    request = create.await_args.kwargs
    assert request["model"] == "gpt-5.1"
    assert request["reasoning_effort"] == "high"
    assert request["response_format"]["type"] == "json_schema"
    assert "nie musi powtarzać surowego zapisu" in request["messages"][0]["content"]


async def test_chunk_judge_should_score_each_chunk_and_fact_coverage(mocker):
    case = load_benchmark_dataset().cases[0]
    result_payload = {
        "chunks": [
            {
                "index": 0,
                "relevance_score": 3,
                "supported_fact_indexes": [0, 1],
                "evidence": "Directly describes the fault.",
            },
            {
                "index": 1,
                "relevance_score": 1,
                "supported_fact_indexes": [],
                "evidence": "Only weakly related.",
            },
        ],
        "feedback": "One useful chunk.",
    }
    create = mocker.AsyncMock(
        return_value=SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=json.dumps(result_payload))
                )
            ]
        )
    )
    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )
    mocker.patch("app.services.benchmark_runner.AsyncOpenAI", return_value=client)
    settings = SimpleNamespace(
        openai_api_key="test",
        benchmark_judge_model="gpt-5.1",
        benchmark_judge_reasoning_effort="high",
    )

    result = await benchmark_runner._judge_chunks(
        case,
        [
            {"content": "fault details", "source_name": "manual.pdf"},
            {"content": "generic text", "source_name": "manual.pdf"},
        ],
        cast(Settings, settings),
    )

    assert [item.relevance_score for item in result.chunks] == [3, 1]
    assert result.chunks[0].supported_fact_indexes == [0, 1]
    request = create.await_args.kwargs
    assert request["model"] == "gpt-5.1"
    assert request["reasoning_effort"] == "high"
    assert request["response_format"]["json_schema"]["strict"] is True
    assert (
        "does not need to state their equivalence" in request["messages"][0]["content"]
    )
