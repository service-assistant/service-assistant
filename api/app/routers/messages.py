from app.dependencies.auth import CurrentOrganizationDependency
from app.dependencies.database import DbSessionDependency
from app.dependencies.entities import MessageDependency
from app.repositories import MessageRepository
from app.schemas import ChunkRead
from fastapi import APIRouter

router = APIRouter()


@router.get(
    "/{message_id}/chunks",
    response_model=list[ChunkRead],
    summary="Get source chunks for a message",
    description=(
        "Returns the document chunks that were retrieved from the vector store "
        "and used as RAG context when generating the assistant message. "
        "Only applicable to messages with `sender = system`."
    ),
    responses={404: {"description": "Message not found"}},
)
async def get_message_chunks(
    message: MessageDependency,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    return await MessageRepository(session, organization_id).list_chunks(message.id)
