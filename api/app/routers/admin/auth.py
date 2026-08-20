from app.dependencies.database import DbSessionDependency
from app.dependencies.settings import SettingsDependency
from app.models import AppRole
from app.repositories import UserRepository
from app.schemas import AdminLoginRequest, LoginResponse
from app.security import verify_password
from app.services.session_auth import build_login_response, build_logout_response
from fastapi import APIRouter, HTTPException, Request, status

router = APIRouter()

ADMIN_SESSION_COOKIE_NAME = "admin_session_token"


@router.post("/login", response_model=LoginResponse)
async def admin_login(
    body: AdminLoginRequest,
    session: DbSessionDependency,
    settings: SettingsDependency,
):
    user = await UserRepository(session).get_by_username_and_app_role(
        body.username, AppRole.admin
    )
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    return await build_login_response(
        session, settings, user, ADMIN_SESSION_COOKIE_NAME
    )


@router.post("/logout")
async def admin_logout(
    request: Request, session: DbSessionDependency, settings: SettingsDependency
):
    return await build_logout_response(
        request, session, settings, ADMIN_SESSION_COOKIE_NAME
    )
