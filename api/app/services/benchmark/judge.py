import json
from typing import Any, cast

from app.benchmarks.evaluation import (
    ChunkEvaluation,
    ChunkJudgeResult,
    CriterionResult,
    JudgeResult,
)
from app.benchmarks.models import BenchmarkCase
from app.config import Settings
from openai import AsyncOpenAI


def evaluate_source_images(
    case: BenchmarkCase,
    chunks: list[dict[str, Any]],
) -> tuple[JudgeResult, ChunkJudgeResult, list[str]]:
    source_image_paths: list[str] = []
    evaluations: list[ChunkEvaluation] = []
    for index, chunk in enumerate(chunks):
        metadata = chunk.get("metadata") or {}
        image_paths = [str(path) for path in metadata.get("images", []) if path]
        expected_source = chunk.get("source_name") == case.source.filename
        displayed = bool(chunk.get("linked_for_display"))
        supports_image_fact = expected_source and displayed and bool(image_paths)
        if supports_image_fact:
            source_image_paths.extend(image_paths)
        evaluations.append(
            ChunkEvaluation(
                index=index,
                relevance_score=3
                if supports_image_fact
                else (2 if expected_source else 0),
                supported_fact_indexes=(
                    list(range(len(case.required_facts))) if supports_image_fact else []
                ),
                evidence=(
                    f"Chunk is linked to the assistant message and exposes "
                    f"{len(image_paths)} image(s) from the expected source."
                    if supports_image_fact
                    else "Chunk does not expose a displayable image from the expected source."
                ),
            )
        )

    source_image_paths = list(dict.fromkeys(source_image_paths))
    passed = len(source_image_paths) >= case.minimum_source_images
    evidence = (
        f"Found {len(source_image_paths)} displayable image(s) from "
        f"{case.source.filename}; required {case.minimum_source_images}."
    )
    judge = JudgeResult(
        required_facts=[
            CriterionResult(index=index, satisfied=passed, evidence=evidence)
            for index in range(len(case.required_facts))
        ],
        required_behaviors=[],
        forbidden_claims=[],
        feedback=evidence,
    )
    chunk_judge = ChunkJudgeResult(
        chunks=evaluations,
        feedback=(
            "Source-image evaluation checks images on chunks actually linked to the "
            "assistant message, matching what the client can display."
        ),
    )
    return judge, chunk_judge, source_image_paths


async def judge_answer(
    case: BenchmarkCase,
    answer: str,
    settings: Settings,
) -> JudgeResult:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    schema = {
        "type": "json_schema",
        "json_schema": {
            "name": "benchmark_judgement",
            "strict": True,
            "schema": JudgeResult.model_json_schema(),
        },
    }
    payload = {
        "question": case.question,
        "reference_answer": case.reference_answer,
        "required_facts": list(enumerate(case.required_facts)),
        "required_behaviors": list(enumerate(case.required_behaviors)),
        "forbidden_claims": list(enumerate(case.forbidden_claims)),
        "assistant_answer": answer,
    }
    request: dict[str, Any] = {
        "model": settings.benchmark_judge_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Jesteś rygorystycznym sędzią odpowiedzi technicznych. Oceniaj "
                    "znaczenie, nie identyczność słów. Dla każdego required_facts zwróć "
                    "satisfied=true tylko gdy odpowiedź jasno przekazuje dany fakt. Dla "
                    "każdego required_behaviors zwróć satisfied=true tylko gdy odpowiedź "
                    "faktycznie realizuje opisane zachowanie; brak zachowania oznacza false. Dla "
                    "forbidden_claims zwróć satisfied=true, gdy odpowiedź zawiera lub "
                    "sugeruje zakazane twierdzenie. Nie uzupełniaj braków wiedzą z odpowiedzi "
                    "referencyjnej. Evidence ma być krótkim cytatem albo opisem braku. "
                    "Dla faktu normalizacji kodu uznaj kryterium za spełnione, gdy użytkownik "
                    "podaje kod bez separatora, a odpowiedź bezpośrednio opisuje odpowiadający "
                    "mu kod ze separatorem. Odpowiedź nie musi powtarzać surowego zapisu ani "
                    "mówić wprost, że oba zapisy są równoważne. "
                    "Zachowaj wszystkie indeksy i ich kolejność."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(payload, ensure_ascii=False),
            },
        ],
        "response_format": schema,
        "reasoning_effort": settings.benchmark_judge_reasoning_effort,
    }
    response = await client.chat.completions.create(**cast(Any, request))
    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("Judge returned an empty response.")
    result = JudgeResult.model_validate_json(content)
    required_indexes = [item.index for item in result.required_facts]
    behavior_indexes = [item.index for item in result.required_behaviors]
    forbidden_indexes = [item.index for item in result.forbidden_claims]
    if required_indexes != list(range(len(case.required_facts))):
        raise RuntimeError("Judge returned invalid required-fact indexes.")
    if behavior_indexes != list(range(len(case.required_behaviors))):
        raise RuntimeError("Judge returned invalid required-behavior indexes.")
    if forbidden_indexes != list(range(len(case.forbidden_claims))):
        raise RuntimeError("Judge returned invalid forbidden-claim indexes.")
    return result


async def judge_chunks(
    case: BenchmarkCase,
    chunks: list[dict[str, Any]],
    settings: Settings,
) -> ChunkJudgeResult:
    if not chunks:
        return ChunkJudgeResult(chunks=[], feedback="No chunks were retrieved.")

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    schema = {
        "type": "json_schema",
        "json_schema": {
            "name": "benchmark_chunk_judgement",
            "strict": True,
            "schema": ChunkJudgeResult.model_json_schema(),
        },
    }
    payload = {
        "question": case.question,
        "reference_answer": case.reference_answer,
        "required_facts": list(enumerate(case.required_facts)),
        "chunks_after_reranker": [
            {
                "index": index,
                "content": chunk["content"],
                "source_name": chunk.get("source_name"),
                "metadata": chunk.get("metadata", {}),
            }
            for index, chunk in enumerate(chunks)
        ],
    }
    request: dict[str, Any] = {
        "model": settings.benchmark_chunk_judge_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a strict retrieval evaluator. Evaluate every chunk only "
                    "against the question and required facts. relevance_score: 0 means "
                    "irrelevant, 1 weakly related, 2 useful and relevant, 3 directly "
                    "supports the central answer. Include a required-fact index only "
                    "when the chunk explicitly supports that fact. Do not infer missing "
                    "information from the reference answer. For an identifier-normalization "
                    "fact, a chunk containing the separator-form code corresponding to the "
                    "raw code in the question supports that fact; the chunk does not need to "
                    "state their equivalence explicitly. Return every chunk index once "
                    "and in the original order. Evidence must be concise."
                ),
            },
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        "response_format": schema,
        "reasoning_effort": settings.benchmark_judge_reasoning_effort,
    }
    response = await client.chat.completions.create(**cast(Any, request))
    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("Chunk judge returned an empty response.")
    result = ChunkJudgeResult.model_validate_json(content)
    if [item.index for item in result.chunks] != list(range(len(chunks))):
        raise RuntimeError("Chunk judge returned invalid chunk indexes.")
    valid_fact_indexes = set(range(len(case.required_facts)))
    if any(
        len(item.supported_fact_indexes) != len(set(item.supported_fact_indexes))
        or not set(item.supported_fact_indexes).issubset(valid_fact_indexes)
        for item in result.chunks
    ):
        raise RuntimeError("Chunk judge returned invalid required-fact indexes.")
    return result
