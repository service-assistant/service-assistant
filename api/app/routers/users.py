from app.dependencies.auth import CurrentOrganizationDependency
from app.dependencies.database import DbSessionDependency
from app.models import Organization
from app.repositories import UserRepository
from app.schemas import UserRead
from fastapi import APIRouter

router = APIRouter()


@router.get(
    "",
    response_model=list[UserRead],
    summary="List users",
    description="Returns every user in the caller's organization.",
)
async def list_users(
    session: DbSessionDependency, organization_id: CurrentOrganizationDependency
):
    organization = await session.get(Organization, organization_id)
    assert organization is not None
    users = await UserRepository(session).list_for_organization(organization_id)
    return [
        UserRead(
            id=user.id,
            organization_id=organization_id,
            organization_slug=organization.slug,
            username=user.username,
            app_role=user.app_role.value,
            org_role=user.org_role.value,
        )
        for user in users
    ]
