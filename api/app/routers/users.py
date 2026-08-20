from app.dependencies.auth import CurrentOrganizationDependency, OrgAdminDependency
from app.dependencies.database import DbSessionDependency
from app.dependencies.entities import UserDependency
from app.models import AppRole, Organization, User
from app.repositories import UserRepository
from app.schemas import UserCreate, UserRead, UserUpdate
from app.security import hash_password
from app.services.organizations import get_system_organization_id
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
            created_at=user.created_at,
            updated_at=user.updated_at,
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
    current_user: OrgAdminDependency,
):
    organization = await session.get(Organization, organization_id)
    assert organization is not None

    system_organization_id = await get_system_organization_id(session)
    is_app_admin_promotion = (
        organization_id == system_organization_id
        and current_user.app_role == AppRole.admin
    )

    user = User(
        organization_id=organization_id,
        username=body.username,
        password_hash=hash_password(body.password),
        app_role=AppRole.admin if is_app_admin_promotion else AppRole.user,
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
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.patch(
    "/{user_id}",
    response_model=UserRead,
    summary="Update a user",
    description="Partially updates a user. Only the fields provided in the request body are changed.",
    responses={
        404: {"description": "User not found"},
        409: {"description": "Username already taken, or attempted to change own role"},
    },
)
async def update_user(
    user: UserDependency,
    body: UserUpdate,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
    current_user: OrgAdminDependency,
):
    updates = body.model_dump(exclude_unset=True)
    if "password" in updates:
        updates["password_hash"] = hash_password(updates.pop("password"))
    if (
        "org_role" in updates
        and user.id == current_user.id
        and updates["org_role"] != user.org_role
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot change your own role",
        )

    try:
        user = await UserRepository(session).update(user, **updates)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    organization = await session.get(Organization, organization_id)
    assert organization is not None

    return UserRead(
        id=user.id,
        organization_id=organization_id,
        organization_slug=organization.slug,
        username=user.username,
        app_role=user.app_role.value,
        org_role=user.org_role.value,
        created_at=user.created_at,
        updated_at=user.updated_at,
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
    user: UserDependency,
    session: DbSessionDependency,
    current_user: OrgAdminDependency,
):
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete your own account",
        )
    await UserRepository(session).delete(user)
