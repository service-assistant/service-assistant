from abc import ABC, abstractmethod
from typing import Generic, Protocol, TypeVar, cast

from app.database import Base
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped

EntityT = TypeVar("EntityT")


class Repository(ABC, Generic[EntityT]):
    """Base class for all repositories.

    Every repository is constructed with a session scoped to the caller's
    organization and must be able to fetch a single entity by id, scoped to
    that organization — the pattern `org_scoped_entity_dependency`
    (`app/dependencies/entities.py`) relies on for every `*Dependency` path
    param.
    """

    def __init__(self, session: AsyncSession, organization_id: int):
        self.session = session
        self.organization_id = organization_id

    @abstractmethod
    async def get(self, id: int) -> EntityT | None: ...


class HasOrganizationId(Protocol):
    id: Mapped[int]
    organization_id: Mapped[int]


ModelT = TypeVar("ModelT", bound=Base)


class OrgScopedRepository(Repository[ModelT], Generic[ModelT]):
    """CRUD scoped to a single organization.

    Every method filters by `organization_id`, so a caller physically cannot
    read or write another tenant's rows through this class. `model` must have
    its own `organization_id` column (i.e. be one of the root tables —
    Category, Attachment); models scoped via a join to a parent (Device,
    ChatThread, Message, Chunk) get their own repository instead, see
    `device_repository.py`, `thread_repository.py` etc.
    """

    model: type[ModelT]

    async def get(self, id: int) -> ModelT | None:
        model = cast(type[HasOrganizationId], self.model)
        return await self.session.scalar(
            select(self.model).where(
                model.id == id,
                model.organization_id == self.organization_id,
            )
        )

    async def list(self) -> list[ModelT]:
        model = cast(type[HasOrganizationId], self.model)
        result = await self.session.execute(
            select(self.model).where(model.organization_id == self.organization_id)
        )
        return list(result.scalars().all())

    async def add(self, instance: ModelT) -> ModelT:
        cast(HasOrganizationId, instance).organization_id = self.organization_id
        self.session.add(instance)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def delete(self, instance: ModelT) -> None:
        await self.session.delete(instance)
        await self.session.commit()
