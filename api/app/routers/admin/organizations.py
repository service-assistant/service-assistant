from app.dependencies.database import DbSessionDependency
from app.models import AppRole, Organization, OrgRole, User
from app.repositories import OrganizationRepository, UserRepository
from app.schemas import (
    OrganizationCreate,
    OrganizationCreateResponse,
    OrganizationRead,
    UserRead,
)
from app.security import hash_password
from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError

router = APIRouter()


@router.get(
    "",
    response_model=list[OrganizationRead],
    summary="List organizations",
    description="Returns every organization. app_admin only.",
)
async def list_organizations(session: DbSessionDependency):
    return await OrganizationRepository(session).list()


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=OrganizationCreateResponse,
    summary="Create an organization",
    description=(
        "Creates a new organization together with its first user "
        "(organization_admin). app_admin only — this is the only place a new "
        "tenant gets onboarded."
    ),
    responses={409: {"description": "Slug or username already taken"}},
)
async def create_organization(body: OrganizationCreate, session: DbSessionDependency):
    repository = OrganizationRepository(session)
    organization = Organization(name=body.name, slug=body.slug)

    try:
        await repository.add(organization)
        admin_user = User(
            organization_id=organization.id,
            username=body.admin_username,
            password_hash=hash_password(body.admin_password),
            app_role=AppRole.user,
            org_role=OrgRole.admin,
        )
        await UserRepository(session).add(admin_user)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Organization slug or username already taken",
        )

    await session.refresh(organization)
    await session.refresh(admin_user)

    return OrganizationCreateResponse(
        organization=OrganizationRead.model_validate(organization),
        admin_user=UserRead(
            id=admin_user.id,
            organization_id=organization.id,
            organization_slug=organization.slug,
            username=admin_user.username,
            app_role=admin_user.app_role.value,
            org_role=admin_user.org_role.value,
            created_at=admin_user.created_at,
            updated_at=admin_user.updated_at,
        ),
    )
