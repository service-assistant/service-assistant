from app.dependencies.auth import CurrentOrganizationDependency, OrgAdminDependency
from app.dependencies.database import DbSessionDependency
from app.models import AppRole, Organization, User
from app.repositories import UserRepository
from app.schemas import UserCreate, UserRead
from app.security import hash_password
from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError

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


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=UserRead,
    summary="Create a user",
    description="Creates a new user in the caller's organization.",
    responses={409: {"description": "Username already taken"}},
)
async def create_user(
    body: UserCreate,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    organization = await session.get(Organization, organization_id)
    assert organization is not None

    user = User(
        organization_id=organization_id,
        username=body.username,
        password_hash=hash_password(body.password),
        app_role=AppRole.user,
        org_role=body.org_role,
    )

    try:
        await UserRepository(session).add(user)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    await session.refresh(user)

    return UserRead(
        id=user.id,
        organization_id=organization_id,
        organization_slug=organization.slug,
        username=user.username,
        app_role=user.app_role.value,
        org_role=user.org_role.value,
    )


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a user",
    description="Permanently deletes a user from the caller's organization.",
    responses={
        404: {"description": "User not found"},
        409: {"description": "Cannot delete your own account"},
    },
)
async def delete_user(
    user_id: int,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
    current_user: OrgAdminDependency,
):
    user = await UserRepository(session).get_by_id(user_id)
    if user is None or user.organization_id != organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete your own account",
        )
    await UserRepository(session).delete(user)
