from app.dependencies.auth import OptionalCurrentUserDependency
from app.dependencies.database import DbSessionDependency
from app.dependencies.settings import SettingsDependency
from app.models import OrgRole
from app.repositories import UserRepository
from app.schemas import LoginRequest, LoginResponse, SessionResponse
from app.security import verify_password
from app.services.session_auth import (
    build_login_response,
    build_logout_response,
    build_user_read,
)
from fastapi import APIRouter, HTTPException, Request, status

router = APIRouter()

SESSION_COOKIE_NAME = "session_token"


async def _authenticate(body: LoginRequest, session: DbSessionDependency):
    user = await UserRepository(session).get_by_username_and_org_slug(
        body.organization_slug, body.username
    )
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    return user


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    session: DbSessionDependency,
    settings: SettingsDependency,
):
    user = await _authenticate(body, session)
    return await build_login_response(session, settings, user, SESSION_COOKIE_NAME)


@router.post("/admin-login", response_model=LoginResponse)
async def admin_login(
    body: LoginRequest,
    session: DbSessionDependency,
    settings: SettingsDependency,
):
    # Used by the admin/ dashboard — same credential check as /login, but only
    # org_role=admin users may sign in here. Technicians (org_role=member) log
    # in fine via /login for the mobile app; they're rejected here.
    user = await _authenticate(body, session)
    if user.org_role != OrgRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await build_login_response(session, settings, user, SESSION_COOKIE_NAME)


@router.get("/me", response_model=SessionResponse)
async def me(
    session: DbSessionDependency,
    current_user: OptionalCurrentUserDependency,
):
    if current_user is None:
        return SessionResponse(authenticated=False)
    return SessionResponse(
        authenticated=True, user=await build_user_read(session, current_user)
    )


@router.post("/logout")
async def logout(
    request: Request, session: DbSessionDependency, settings: SettingsDependency
):
    return await build_logout_response(request, session, settings, SESSION_COOKIE_NAME)
