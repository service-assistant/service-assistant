import json
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from app.config import get_settings
from app.main import app
from app.models import ChatThread, ChunkMessage, Message, MessageSender, OrgRole
from app.services.chat.retrieval import service as retrieval_module
from app.services.chat.common import sse as _sse
from app.services.chat.diagnostic.next_best_step import (
    DiagnosticPlan,
    DiagnosticPlanStatus,
    cache_diagnostic_plan,
)
from app.services.chat.diagnostic.router import MessageRoute, RouteDecision
from app.services.voice.stt import SttError
from app.services.voice.query_selector import VoiceDecision, VoiceQuerySelection
from sqlalchemy import select
from tests.routers.factories import (
    create_attachment,
    create_category,
    create_chunk,
    create_device,
    create_message,
    create_thread,
    link_attachment_device,
    make_thread,
)


@pytest.fixture
def reranker_enabled_settings(override_attachments_dir):
    """Overrides the get_settings dependency to enable reranking with a Voyage key.

    Depends on ``override_attachments_dir`` so this override is applied after
    (and therefore wins over) that autouse fixture's own settings override.
    """
    enabled_settings = get_settings().model_copy(
        update={"reranker_enabled": True, "voyage_api_key": "voyage-test-key"}
    )
    app.dependency_overrides[get_settings] = lambda: enabled_settings
    yield enabled_settings
    app.dependency_overrides.pop(get_settings, None)


def _assistant_message_context(mock_openai_llm) -> str:
    call_args = mock_openai_llm.chat.completions.create.call_args
    messages = call_args.kwargs["messages"]
    return messages[-1]["content"]


def _parse_message_event(response) -> dict:
    lines = response.text.splitlines()
    for i, line in enumerate(lines):
        if line == "event: message":
            return json.loads(lines[i + 1].removeprefix("data: "))
    raise AssertionError("No 'message' SSE event found in response")


def test_sse_preserves_every_line_of_streamed_checklist_chunk():
    assert _sse("chunk", "::checklist\n- First step\n- Second step") == (
        "event: chunk\ndata: ::checklist\ndata: - First step\ndata: - Second step\n\n"
    )


async def _persisted_source_chunk_ids(session, message_id: int) -> set[int]:
    result = await session.execute(
        select(ChunkMessage.chunk_id).where(ChunkMessage.message_id == message_id)
    )
    return set(result.scalars().all())


class _FakeVoyageResponse:
    def __init__(self, status_code: int = 200, payload: object = None):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> object:
        return self._payload


def _identity_ranking(candidate_count: int) -> _FakeVoyageResponse:
    """Rank candidates in their submitted order (highest score first)."""
    return _FakeVoyageResponse(
        payload={
            "data": [
                {"index": index, "relevance_score": 1.0 - index * 0.01}
                for index in range(candidate_count)
            ]
        }
    )


def _voyage_unavailable(candidate_count: int) -> _FakeVoyageResponse:
    return _FakeVoyageResponse(status_code=503)


def _mock_voyage_http(mocker, respond) -> dict:
    """Patch the Voyage HTTP transport; returns a dict tracking call count."""
    captured = {"posts": 0}

    class FakeAsyncClient:
        def __init__(self, *, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, url, *, headers, json):
            captured["posts"] += 1
            return respond(len(json["documents"]))

    mocker.patch(
        "app.services.chat.retrieval.reranker.httpx.AsyncClient", FakeAsyncClient
    )
    return captured


def _diagnostic_plan(problem: str) -> DiagnosticPlan:
    return DiagnosticPlan(
        status=DiagnosticPlanStatus.actions,
        problem=problem,
    )


async def test_should_create_thread_when_valid_data_provided(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)

    response = await client.post(
        "/api/threads",
        json={"device_id": device.id, "title": "Mast won't lift"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Mast won't lift"
    assert data["device_id"] == device.id


async def test_should_store_nameplate_data_on_thread(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)
    nameplate_data = {
        "model": "XXX1D1XXX",
        "attributes": [
            {
                "label": "Numer seryjny",
                "value": "558123",
                "unit": None,
                "confidence": 0.96,
            }
        ],
        "raw_text": "MODEL XXX1D1XXX",
        "model_confidence": 0.98,
        "match_confidence": 0.94,
    }

    response = await client.post(
        "/api/threads",
        json={
            "device_id": device.id,
            "title": "Tabliczka: XXX1D1XXX",
            "nameplate_data": nameplate_data,
        },
    )

    assert response.status_code == 201
    assert response.json()["nameplate_data"] == nameplate_data


async def test_member_can_create_and_list_threads(member_client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)

    create_response = await member_client.post(
        "/api/threads",
        json={"device_id": device.id, "title": "Mast won't lift"},
    )
    assert create_response.status_code == 201

    list_response = await member_client.get("/api/threads")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


async def test_should_return_404_when_creating_thread_with_nonexistent_device(client):
    response = await client.post(
        "/api/threads",
        json={"device_id": 999, "title": "Test"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Device not found"


async def test_should_list_all_threads(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)
    await create_thread(session, device.id, title="Thread 1")
    await create_thread(session, device.id, title="Thread 2")

    response = await client.get("/api/threads")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    titles = {t["title"] for t in data}
    assert titles == {"Thread 1", "Thread 2"}


async def test_should_return_empty_list_when_no_threads_exist(client):
    response = await client.get("/api/threads")
    assert response.status_code == 200
    assert response.json() == []


async def test_should_list_threads_in_app_admins_own_organization(
    app_admin_client, session
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    await create_thread(session, device.id, title="Thread 1")

    response = await app_admin_client.get("/api/threads")

    assert response.status_code == 200
    assert len(response.json()) == 1


async def test_should_return_thread_when_id_exists(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id, title="Mast won't lift")

    response = await client.get(f"/api/threads/{thread.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == thread.id
    assert data["title"] == "Mast won't lift"
    assert data["device_id"] == device.id


async def test_should_return_404_when_getting_nonexistent_thread(client):
    response = await client.get("/api/threads/999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Thread not found"


async def test_should_delete_thread_when_id_exists(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    thread_id = thread.id

    response = await client.delete(f"/api/threads/{thread_id}")

    assert response.status_code == 204
    session.expunge(thread)
    assert await session.get(ChatThread, thread_id) is None


async def test_should_return_404_when_deleting_nonexistent_thread(client):
    response = await client.delete("/api/threads/999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Thread not found"


async def test_should_send_message_and_return_assistant_reply(
    client, session, mock_azure_embeddings, mock_openai_llm
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)

    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={"content": "What is error E-23?"},
    )

    assert response.status_code == 200
    lines = response.text.splitlines()
    message_data = None
    for i, line in enumerate(lines):
        if line == "event: message":
            message_data = json.loads(lines[i + 1].removeprefix("data: "))
            break
    assert message_data is not None
    assert message_data["sender"] == "assistant"
    assert message_data["content"] == "Test response"
    assert message_data["has_continuation"] is False
    assert isinstance(message_data["id"], int)


async def test_should_skip_diagnostic_mode_when_client_disables_it(
    client, session, mock_azure_embeddings, mock_openai_llm, mocker
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    build_diagnostic_plan = mocker.patch(
        "app.services.chat.diagnostic.next_best_step.build_diagnostic_plan",
        new=mocker.AsyncMock(return_value="should not be used"),
    )

    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={"content": "Mam błąd 2:002", "mode": "standard"},
    )

    assert response.status_code == 200
    assert _parse_message_event(response)["router_decision"] == "standard_query"
    build_diagnostic_plan.assert_not_awaited()


async def test_photo_context_augments_retrieval_and_keeps_original_user_message(
    client, session, mock_openai_llm, mocker
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    retrieve = mocker.patch(
        "app.services.chat.retrieval.service.retrieve_context_chunks",
        new=mocker.AsyncMock(return_value=[]),
    )

    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={
            "content": "Jak zmierzyć uzwojenia?",
            "photo_context": [
                {
                    "component": "silnik elektryczny",
                    "main_identifier": "AF 124-L1",
                    "confidence": 0.94,
                }
            ],
        },
    )

    assert response.status_code == 200
    retrieval_query = retrieve.await_args.args[1]
    assert retrieval_query == (
        "Jak zmierzyć uzwojenia?\n\n"
        "Najważniejsze informacje ze zdjęć:\n"
        "- silnik elektryczny; główne oznaczenie: AF 124-L1"
    )
    user_message = await session.scalar(
        select(Message).where(
            Message.thread_id == thread.id,
            Message.sender == MessageSender.user,
        )
    )
    assert user_message is not None
    assert user_message.content == "Jak zmierzyć uzwojenia?"
    llm_context = _assistant_message_context(mock_openai_llm)
    assert "Technician photo observations" in llm_context
    assert "AF 124-L1" in llm_context


async def test_standard_mode_should_not_use_diagnostic_flow_for_exhausted_continuation(
    client, session, mock_openai_llm, mocker
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    attachment = await create_attachment(session)
    chunk = await create_chunk(
        session, attachment.id, content="Procedura diagnostyczna"
    )
    diagnostic_message = await create_message(
        session,
        thread.id,
        content="Sprawdź ciśnienie układu.",
        sender=MessageSender.assistant,
    )
    session.add(ChunkMessage(message_id=diagnostic_message.id, chunk_id=chunk.id))
    await session.commit()
    cache_diagnostic_plan(
        f"{thread.id}:{diagnostic_message.id}",
        _diagnostic_plan("E-23"),
    )
    route_message = mocker.patch(
        "app.services.chat.diagnostic.router.route_message",
        new=mocker.AsyncMock(),
    )
    build_followup_plan = mocker.patch(
        "app.services.chat.diagnostic.next_best_step.build_followup_plan",
        new=mocker.AsyncMock(),
    )
    retrieve_context_chunks = mocker.patch(
        "app.services.chat.retrieval.service.retrieve_context_chunks",
        new=mocker.AsyncMock(),
    )

    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={"content": "Co dalej?", "mode": "standard"},
    )

    assert response.status_code == 200
    assert _parse_message_event(response)["content"] == (
        "To już wszystko, co dokumentacja zawiera na ten temat."
    )
    route_message.assert_not_awaited()
    build_followup_plan.assert_not_awaited()
    retrieve_context_chunks.assert_not_awaited()
    mock_openai_llm.chat.completions.create.assert_not_awaited()


async def test_should_start_diagnostic_for_any_error_when_mode_is_enabled(
    client, session, mock_azure_embeddings, mock_openai_llm, mocker
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    build_diagnostic_plan = mocker.patch(
        "app.services.chat.diagnostic.next_best_step.build_diagnostic_plan",
        new=mocker.AsyncMock(return_value=_diagnostic_plan("2:004")),
    )
    mocker.patch.object(DiagnosticPlan, "has_next_action", return_value=True)
    mocker.patch(
        "app.services.chat.retrieval.service.retrieve_context_chunks",
        new=mocker.AsyncMock(return_value=[]),
    )
    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={"content": "Mam błąd 2:004", "mode": "diagnostic"},
    )

    assert response.status_code == 200
    assert "event: route\ndata: start_diagnostic" in response.text
    message_data = _parse_message_event(response)
    assert message_data["router_decision"] == "start_diagnostic"
    assert message_data["has_continuation"] is True
    build_diagnostic_plan.assert_awaited_once_with([], "2:004", mocker.ANY)


async def test_should_emit_pipeline_trace_when_debug_is_requested(
    client, session, mock_openai_llm, mocker
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    mocker.patch(
        "app.services.chat.retrieval.service.retrieve_context_chunks",
        new=mocker.AsyncMock(return_value=[]),
    )
    mocker.patch(
        "app.services.chat.diagnostic.next_best_step.build_diagnostic_plan",
        new=mocker.AsyncMock(return_value=_diagnostic_plan("2:004")),
    )

    response = await client.post(
        f"/api/threads/{thread.id}/messages?debug=true",
        json={"content": "Mam błąd 2:004", "mode": "diagnostic"},
    )

    assert response.status_code == 200
    events = response.text.split("\n\n")
    debug_payloads = [
        json.loads(event.split("data: ", maxsplit=1)[1])
        for event in events
        if event.startswith("event: debug\n")
    ]
    assert [payload["step"] for payload in debug_payloads] == [
        "route",
        "retrieval",
        "plan",
        "generation",
        "complete",
    ]
    assert debug_payloads[0]["data"]["effective_route"] == "start_diagnostic"
    assert debug_payloads[2]["data"] == {
        "active": True,
        "status": "actions",
        "problem": "2:004",
        "actions": [],
        "observation_summary": "",
        "technician_response": "",
        "completed_action_id": None,
    }
    assert debug_payloads[3]["duration_ms"] >= 0
    assert debug_payloads[3]["data"] == {"status": "completed"}
    assert debug_payloads[-1]["data"]["answer_characters"] == len("Test response")


async def test_should_send_side_question_through_standard_rag_during_diagnostic(
    client, session, mock_azure_embeddings, mock_openai_llm, mocker
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    attachment = await create_attachment(session)
    chunk = await create_chunk(session, attachment.id, content="Procedura 2:002")
    await create_message(
        session,
        thread.id,
        content="Mam błąd 2:002",
        sender=MessageSender.user,
    )
    assistant_message = await create_message(
        session,
        thread.id,
        content="Sprawdź parametry fabryczne.",
        sender=MessageSender.assistant,
    )
    session.add(ChunkMessage(message_id=assistant_message.id, chunk_id=chunk.id))
    await session.commit()

    mocker.patch(
        "app.services.chat.diagnostic.router.route_message",
        new=mocker.AsyncMock(
            return_value=RouteDecision(
                route=MessageRoute.standard_query,
                confidence=0.99,
                recognized_problem=None,
                diagnostic_message_id=None,
            )
        ),
    )
    build_followup_plan = mocker.patch(
        "app.services.chat.diagnostic.next_best_step.build_followup_plan",
        new=mocker.AsyncMock(return_value=(True, "should not be used")),
    )
    mocker.patch(
        "app.services.chat.retrieval.service.retrieve_context_chunks",
        new=mocker.AsyncMock(return_value=[]),
    )
    mocker.patch(
        "app.services.chat.generation.is_message_continuation_request",
        new=mocker.AsyncMock(return_value=False),
    )

    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={
            "content": "Jak bezpiecznie podnosić urządzenie?",
            "mode": "diagnostic",
        },
    )

    assert response.status_code == 200
    assert "Test response" in response.text
    build_followup_plan.assert_not_awaited()


async def test_should_reconstruct_diagnostic_from_history_for_any_problem(
    client, session, mock_openai_llm, mocker
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    attachment = await create_attachment(session)
    chunk = await create_chunk(session, attachment.id, content="Procedura błędu E-23")
    diagnostic_message = await create_message(
        session,
        thread.id,
        content="Sprawdź ciśnienie układu.",
        sender=MessageSender.assistant,
    )
    session.add(ChunkMessage(message_id=diagnostic_message.id, chunk_id=chunk.id))
    await session.commit()
    cache_diagnostic_plan(
        f"{thread.id}:{diagnostic_message.id}",
        _diagnostic_plan("E-23"),
    )

    mocker.patch(
        "app.services.chat.diagnostic.router.route_message",
        new=mocker.AsyncMock(
            return_value=RouteDecision(
                route=MessageRoute.diagnostic_followup,
                confidence=0.99,
                recognized_problem="E-23",
                diagnostic_message_id=diagnostic_message.id,
            )
        ),
    )
    mocker.patch(
        "app.services.chat.retrieval.service.retrieve_context_chunks",
        new=mocker.AsyncMock(return_value=[]),
    )
    mocker.patch(
        "app.services.chat.generation.is_message_continuation_request",
        new=mocker.AsyncMock(return_value=False),
    )
    build_followup_plan = mocker.patch(
        "app.services.chat.diagnostic.next_best_step.build_followup_plan",
        new=mocker.AsyncMock(
            return_value=(
                True,
                _diagnostic_plan("E-23"),
            )
        ),
    )

    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={
            "content": "Ciśnienie jest za niskie",
            "mode": "diagnostic",
        },
    )

    assert response.status_code == 200
    build_followup_plan.assert_awaited_once_with(
        _diagnostic_plan("E-23"),
        "Sprawdź ciśnienie układu.",
        "Ciśnienie jest za niskie",
        mocker.ANY,
    )


async def test_should_store_user_message_before_reply(
    client, session, mock_azure_embeddings, mock_openai_llm
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)

    await client.post(
        f"/api/threads/{thread.id}/messages",
        json={"content": "My question"},
    )

    result = await session.execute(
        select(Message).where(Message.thread_id == thread.id)
    )
    messages = result.scalars().all()
    assert len(messages) == 2
    senders = {m.sender for m in messages}
    assert MessageSender.user in senders
    assert MessageSender.assistant in senders


async def test_should_chunk_events_concatenate_to_full_message_content(
    client, session, mock_azure_embeddings, mock_openai_llm
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)

    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={"content": "What is error E-23?"},
    )

    assert response.status_code == 200
    lines = response.text.splitlines()

    chunks: list[str] = []
    message_content: str | None = None
    for i, line in enumerate(lines):
        if line == "event: chunk":
            chunks.append(lines[i + 1].removeprefix("data: "))
        elif line == "event: message":
            message_content = json.loads(lines[i + 1].removeprefix("data: "))["content"]

    assert len(chunks) > 0
    assert message_content is not None
    assert "".join(chunks) == message_content


async def test_should_return_404_when_thread_not_found_on_send_message(client):
    response = await client.post(
        "/api/threads/999/messages",
        json={"content": "test question"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Thread not found"


async def test_should_list_messages_in_thread_chronologically(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    await create_message(
        session, thread.id, content="User question", sender=MessageSender.user
    )
    await create_message(
        session, thread.id, content="Assistant answer", sender=MessageSender.assistant
    )

    response = await client.get(f"/api/threads/{thread.id}/messages")

    assert response.status_code == 200
    messages = response.json()
    assert len(messages) == 2
    assert messages[0]["sender"] == "user"
    assert messages[0]["content"] == "User question"
    assert messages[1]["sender"] == "assistant"
    assert messages[1]["content"] == "Assistant answer"
    assert messages[1]["has_continuation"] is False


async def test_should_return_continuation_flag_for_assistant_reply(
    client, session, mock_azure_embeddings, mock_openai_llm, mocker
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)

    async def stream_with_next_marker():
        event = mocker.MagicMock()
        event.choices[
            0
        ].delta.content = "Pierwszy etap.\n\n::next\nDokumentacja zawiera dalsze kroki."
        yield event

    mock_openai_llm.chat.completions.create = mocker.AsyncMock(
        return_value=stream_with_next_marker()
    )

    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={"content": "How do I complete the procedure?"},
    )

    lines = response.text.splitlines()
    message_data = next(
        json.loads(lines[index + 1].removeprefix("data: "))
        for index, line in enumerate(lines)
        if line == "event: message"
    )
    assert message_data["has_continuation"] is True

    history_response = await client.get(f"/api/threads/{thread.id}/messages")
    assert history_response.json()[-1]["has_continuation"] is True


async def test_should_continue_from_previous_next_section(
    client, session, mock_azure_embeddings, mock_openai_llm
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    await create_message(
        session,
        thread.id,
        content="Pierwszy etap.\n\n::next\nDokręć zacisk węża.",
        sender=MessageSender.assistant,
    )
    mock_openai_llm.responses.create.return_value.output_text = "1"

    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={"content": "Co dalej?"},
    )

    lines = response.text.splitlines()
    message_data = next(
        json.loads(lines[index + 1].removeprefix("data: "))
        for index, line in enumerate(lines)
        if line == "event: message"
    )
    assert message_data["content"] == "Test response"
    assert message_data["has_continuation"] is False
    mock_openai_llm.responses.create.assert_not_awaited()
    llm_prompt = mock_openai_llm.chat.completions.create.call_args.kwargs["messages"][
        -1
    ]["content"]
    assert "Dokręć zacisk węża" in llm_prompt


async def test_should_return_empty_list_when_thread_has_no_messages(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)

    response = await client.get(f"/api/threads/{thread.id}/messages")

    assert response.status_code == 200
    assert response.json() == []


async def test_should_return_404_when_listing_messages_for_nonexistent_thread(client):
    response = await client.get("/api/threads/999/messages")

    assert response.status_code == 404
    assert response.json()["detail"] == "Thread not found"


async def test_should_transcribe_audio_when_thread_exists(client, session, mocker):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)

    mock_response = mocker.MagicMock(status_code=200)
    mock_response.json.return_value = {"text": "Oil pressure low. Bring me the wrench."}
    mock_http = mocker.AsyncMock()
    mock_http.post = mocker.AsyncMock(return_value=mock_response)
    mock_http.__aenter__ = mocker.AsyncMock(return_value=mock_http)
    mock_http.__aexit__ = mocker.AsyncMock(return_value=False)
    mocker.patch("app.services.voice.stt.httpx.AsyncClient", return_value=mock_http)
    selector = mocker.patch(
        "app.routers.threads.query_selector.select_technician_query",
        new=mocker.AsyncMock(
            return_value=VoiceQuerySelection(
                decision=VoiceDecision.accept,
                selected_text="Oil pressure low.",
                confidence=0.98,
            )
        ),
    )

    response = await client.post(
        f"/api/threads/{thread.id}/messages/transcribe",
        files={"audio": ("recording.m4a", b"fake audio bytes", "audio/m4a")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "decision": "accept",
        "transcript": "Oil pressure low.",
        "message": None,
    }
    selector.assert_awaited_once()
    stt_call = mock_http.post.call_args
    assert stt_call.args[0] == "https://api.openai.com/v1/audio/transcriptions"
    assert stt_call.kwargs["headers"] == {"Authorization": "Bearer test-openai-key"}
    assert stt_call.kwargs["files"] == {
        "file": ("recording.m4a", b"fake audio bytes", "audio/m4a")
    }
    assert stt_call.kwargs["data"]["model"] == "gpt-transcribe"
    assert stt_call.kwargs["data"]["language"] == "pl"
    assert "Nie zgaduj" in stt_call.kwargs["data"]["prompt"]


async def test_should_return_404_when_transcribing_for_nonexistent_thread(client):
    response = await client.post(
        "/api/threads/999/messages/transcribe",
        files={"audio": ("recording.m4a", b"fake audio bytes", "audio/m4a")},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Thread not found"


async def test_should_return_502_when_stt_service_fails(client, session, mocker):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)

    mock_response = mocker.MagicMock(status_code=503, text="service unavailable")
    mock_http = mocker.AsyncMock()
    mock_http.post = mocker.AsyncMock(return_value=mock_response)
    mock_http.__aenter__ = mocker.AsyncMock(return_value=mock_http)
    mock_http.__aexit__ = mocker.AsyncMock(return_value=False)
    mocker.patch("app.services.voice.stt.httpx.AsyncClient", return_value=mock_http)

    response = await client.post(
        f"/api/threads/{thread.id}/messages/transcribe",
        files={"audio": ("recording.m4a", b"fake audio bytes", "audio/m4a")},
    )

    assert response.status_code == 502


async def test_should_return_422_when_audio_is_empty(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)

    response = await client.post(
        f"/api/threads/{thread.id}/messages/transcribe",
        files={"audio": ("recording.m4a", b"", "audio/m4a")},
    )

    assert response.status_code == 422


async def test_should_not_leave_orphaned_user_message_when_retrieval_fails(
    client, session, mocker
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)

    mock_client = mocker.MagicMock()
    mock_client.embeddings.create = mocker.AsyncMock(
        side_effect=Exception("Azure embedding service down")
    )
    mocker.patch(
        "app.services.chat.retrieval.embedding.AsyncAzureOpenAI",
        return_value=mock_client,
    )

    # Unhandled exceptions may propagate through starlette BaseHTTPMiddleware
    # rather than being caught as 500 responses — handle both cases.
    try:
        response = await client.post(
            f"/api/threads/{thread.id}/messages",
            json={"content": "What is error E-23?"},
        )
        assert response.status_code == 500
    except Exception:
        pass

    result = await session.execute(
        select(Message).where(Message.thread_id == thread.id)
    )
    messages = result.scalars().all()
    assert len(messages) == 0


def _mock_authenticated_ws_session(mock_session, thread):
    """`transcribe_stream` now authenticates via a real session-token lookup
    (`get_active_session_by_token` then `get_by_id`) instead of a bare string
    compare, before doing its own org-scoped thread lookup — stub all three
    `session` calls in order on the fully-mocked `ws_client` session."""
    fake_user = SimpleNamespace(id=1, organization_id=1, org_role=OrgRole.admin)
    fake_user_session = SimpleNamespace(user_id=1)
    mock_session.scalar = AsyncMock(side_effect=[fake_user_session, thread])
    mock_session.get.return_value = fake_user


def test_should_stream_final_transcript_when_audio_sent(ws_client, mocker):
    client, mock_session = ws_client
    _mock_authenticated_ws_session(mock_session, make_thread(id=1))

    class MockDgWs:
        def __init__(self):
            self.send = mocker.AsyncMock()

        def __aiter__(self):
            return self._iter()

        async def _iter(self):
            yield json.dumps(
                {
                    "type": "Results",
                    "is_final": True,
                    "channel": {
                        "alternatives": [
                            {"transcript": "Opisz mi co mówi kod błedu 2:002?"}
                        ]
                    },
                }
            )

    @asynccontextmanager
    async def mock_deepgram_ws(*args, **kwargs):
        yield MockDgWs()

    mocker.patch("app.routers.threads.stt.deepgram_websocket", new=mock_deepgram_ws)

    with client.websocket_connect(
        "/api/threads/1/messages/transcribe-stream?token=CHANGEMELATER"
    ) as ws:
        ws.send_bytes(b"\x00" * 64)
        data = ws.receive_json()

    assert data["type"] == "final"
    assert data["transcript"] == "Opisz mi co mówi kod błedu 2:002?"


def test_should_send_error_when_thread_not_found_via_websocket(ws_client):
    client, mock_session = ws_client
    _mock_authenticated_ws_session(mock_session, None)

    with client.websocket_connect(
        "/api/threads/999/messages/transcribe-stream?token=CHANGEMELATER"
    ) as ws:
        data = ws.receive_json()

    assert data["type"] == "error"
    assert "Thread not found" in data["message"]


def test_should_send_error_when_stt_service_fails_during_stream(ws_client, mocker):
    client, mock_session = ws_client
    _mock_authenticated_ws_session(mock_session, make_thread(id=1))

    @asynccontextmanager
    async def mock_failing_dg_ws(*args, **kwargs):
        raise SttError("Deepgram connection failed")
        yield

    mocker.patch("app.routers.threads.stt.deepgram_websocket", new=mock_failing_dg_ws)

    with client.websocket_connect(
        "/api/threads/1/messages/transcribe-stream?token=CHANGEMELATER"
    ) as ws:
        data = ws.receive_json()

    assert data["type"] == "error"
    assert "Deepgram connection failed" in data["message"]


async def test_should_return_completion_without_retrieval_when_no_next_was_promised(
    client, session, mock_openai_llm, mocker
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    await create_message(
        session,
        thread.id,
        content="Previous answer text",
        sender=MessageSender.assistant,
    )
    retrieve_context_chunks = mocker.patch(
        "app.services.chat.retrieval.service.retrieve_context_chunks",
        new=mocker.AsyncMock(),
    )

    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={"content": "dalej", "mode": "standard"},
    )

    assert response.status_code == 200
    message_data = _parse_message_event(response)
    assert message_data["content"] == (
        "To już wszystko, co dokumentacja zawiera na ten temat."
    )
    message_id = message_data["id"]
    persisted_ids = await _persisted_source_chunk_ids(session, message_id)
    assert persisted_ids == set()
    retrieve_context_chunks.assert_not_awaited()
    mock_openai_llm.responses.create.assert_not_awaited()
    mock_openai_llm.chat.completions.create.assert_not_awaited()


async def test_should_use_fresh_chunks_when_short_message_is_not_classified_as_continuation(
    client, session, mock_azure_embeddings, mock_openai_llm, mocker
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    attachment = await create_attachment(session)
    await link_attachment_device(session, attachment.id, device.id)
    # Deliberately not linked to the device, so fresh retrieval for this
    # device cannot find it even though it was the prior answer's source.
    unlinked_attachment = await create_attachment(session)

    previous_chunk = await create_chunk(
        session, unlinked_attachment.id, content="Stale fragment about a past topic."
    )
    fresh_chunk = await create_chunk(
        session, attachment.id, content="Reset procedure explained here."
    )

    previous_message = await create_message(
        session,
        thread.id,
        content="Previous answer text",
        sender=MessageSender.assistant,
    )
    session.add(
        ChunkMessage(message_id=previous_message.id, chunk_id=previous_chunk.id)
    )
    await session.commit()

    mock_openai_llm.responses.create = mocker.AsyncMock(
        return_value=mocker.MagicMock(output_text="0")
    )

    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={"content": "reset teraz", "mode": "standard"},
    )

    assert response.status_code == 200

    message_id = _parse_message_event(response)["id"]
    persisted_ids = await _persisted_source_chunk_ids(session, message_id)
    assert persisted_ids == {fresh_chunk.id}

    context = _assistant_message_context(mock_openai_llm)
    assert fresh_chunk.content in context
    assert previous_chunk.content not in context


async def test_should_persist_five_sources_matching_llm_context_on_successful_rerank(
    client,
    session,
    mock_azure_embeddings,
    mock_openai_llm,
    reranker_enabled_settings,
    mocker,
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    attachment = await create_attachment(session)
    await link_attachment_device(session, attachment.id, device.id)

    for i in range(8):
        await create_chunk(session, attachment.id, content=f"Manual fragment {i}")

    _mock_voyage_http(mocker, _identity_ranking)
    spy = mocker.spy(retrieval_module, "retrieve_context_chunks")

    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={
            "content": "Completely unrelated inquiry about nothing important",
            "mode": "standard",
        },
    )

    assert response.status_code == 200
    actual_chunks = spy.spy_return
    assert len(actual_chunks) == 5

    message_id = _parse_message_event(response)["id"]
    persisted_ids = await _persisted_source_chunk_ids(session, message_id)
    assert persisted_ids == {chunk["id"] for chunk in actual_chunks}

    context = _assistant_message_context(mock_openai_llm)
    for chunk in actual_chunks:
        assert chunk["content"] in context


async def test_should_persist_wider_sources_matching_llm_context_on_rerank_fallback(
    client,
    session,
    mock_azure_embeddings,
    mock_openai_llm,
    reranker_enabled_settings,
    mocker,
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    attachment = await create_attachment(session)
    await link_attachment_device(session, attachment.id, device.id)

    for i in range(10):
        await create_chunk(session, attachment.id, content=f"Manual fragment {i}")

    captured = _mock_voyage_http(mocker, _voyage_unavailable)
    spy = mocker.spy(retrieval_module, "retrieve_context_chunks")

    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={
            "content": "Completely unrelated inquiry about nothing important",
            "mode": "standard",
        },
    )

    assert response.status_code == 200
    assert captured["posts"] == 3
    actual_chunks = spy.spy_return
    # Fallback slices the already-fetched pool to at most 3 exact + 7 semantic
    # + 3 BM25 (deduplicated), never the full 3/15/15 expanded pool.
    assert 5 < len(actual_chunks) <= 13

    message_id = _parse_message_event(response)["id"]
    persisted_ids = await _persisted_source_chunk_ids(session, message_id)
    assert persisted_ids == {chunk["id"] for chunk in actual_chunks}

    context = _assistant_message_context(mock_openai_llm)
    for chunk in actual_chunks:
        assert chunk["content"] in context


async def test_should_persist_wider_sources_matching_llm_context_on_diagnostic_bypass(
    client,
    session,
    mock_azure_embeddings,
    mock_openai_llm,
    reranker_enabled_settings,
    mocker,
):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    attachment = await create_attachment(session)
    await link_attachment_device(session, attachment.id, device.id)

    for i in range(10):
        await create_chunk(session, attachment.id, content=f"Manual fragment {i}")

    captured = _mock_voyage_http(mocker, _identity_ranking)
    spy = mocker.spy(retrieval_module, "retrieve_context_chunks")

    response = await client.post(
        f"/api/threads/{thread.id}/messages",
        json={
            "content": "Completely unrelated inquiry about nothing important",
            "mode": "diagnostic",
        },
    )

    assert response.status_code == 200
    assert captured["posts"] == 0

    actual_chunks = spy.spy_return
    # Bypass keeps the narrow 3/7/3 limits, never the expanded 3/15/15 pool.
    assert 5 < len(actual_chunks) <= 13

    message_id = _parse_message_event(response)["id"]
    persisted_ids = await _persisted_source_chunk_ids(session, message_id)
    assert persisted_ids == {chunk["id"] for chunk in actual_chunks}

    context = _assistant_message_context(mock_openai_llm)
    for chunk in actual_chunks:
        assert chunk["content"] in context
