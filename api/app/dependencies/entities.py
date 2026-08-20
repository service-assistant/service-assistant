from typing import Annotated, Any

from app.models import Attachment, Category, ChatThread, Chunk, Device, Message, User
from app.repositories import (
    AttachmentRepository,
    CategoryRepository,
    ChunkRepository,
    DeviceRepository,
    MessageRepository,
    Repository,
    ThreadRepository,
    UserRepository,
)
from fastapi import Depends, HTTPException, Path, status

from .auth import CurrentOrganizationDependency
from .database import DbSessionDependency


def org_scoped_entity_dependency(
    repository_cls: type[Repository[Any]], id_param: str, not_found_detail: str
):
    """Builds a path-param dependency for the "fetch by <x>_id, 404 if missing,
    scoped to the caller's organization" pattern repeated across every router.

    `id_param` becomes the actual path parameter name via `Path(alias=...)` —
    the function's own parameter name doesn't need to match `{category_id}`,
    `{device_id}`, etc., so one generic implementation covers every entity.
    """

    async def get_entity_or_404(
        entity_id: Annotated[int, Path(alias=id_param)],
        session: DbSessionDependency,
        organization_id: CurrentOrganizationDependency,
    ) -> Any:
        entity = await repository_cls(session, organization_id).get(entity_id)
        if entity is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=not_found_detail
            )
        return entity

    return get_entity_or_404


CategoryDependency = Annotated[
    Category,
    Depends(
        org_scoped_entity_dependency(
            CategoryRepository, "category_id", "Category not found"
        )
    ),
]
DeviceDependency = Annotated[
    Device,
    Depends(
        org_scoped_entity_dependency(DeviceRepository, "device_id", "Device not found")
    ),
]
AttachmentDependency = Annotated[
    Attachment,
    Depends(
        org_scoped_entity_dependency(
            AttachmentRepository, "attachment_id", "Attachment not found"
        )
    ),
]
ThreadDependency = Annotated[
    ChatThread,
    Depends(
        org_scoped_entity_dependency(ThreadRepository, "thread_id", "Thread not found")
    ),
]
MessageDependency = Annotated[
    Message,
    Depends(
        org_scoped_entity_dependency(
            MessageRepository, "message_id", "Message not found"
        )
    ),
]
ChunkDependency = Annotated[
    Chunk,
    Depends(
        org_scoped_entity_dependency(ChunkRepository, "chunk_id", "Chunk not found")
    ),
]


async def get_user_or_404(
    user_id: Annotated[int, Path()],
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
) -> User:
    """`UserRepository` isn't an `OrgScopedRepository` (it's also used unscoped
    for login/session lookups), so it can't go through
    `org_scoped_entity_dependency` — this mirrors that dependency's shape by
    hand instead."""
    user = await UserRepository(session).get_by_id_for_organization(
        user_id, organization_id
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return user


UserDependency = Annotated[User, Depends(get_user_or_404)]
