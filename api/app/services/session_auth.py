from app.dependencies.settings import SettingsDependency
from app.models import Organization, User
from app.repositories import SessionRepository
from app.schemas import LoginResponse, UserRead
from fastapi import Request, Response
from sqlalchemy.ext.asyncio import AsyncSession


async def build_user_read(session: AsyncSession, user: User) -> UserRead:
    organization = await session.get(Organization, user.organization_id)
    assert organization is not None
    return UserRead(
        id=user.id,
        organization_id=user.organization_id,
        organization_slug=organization.slug,
        username=user.username,
        app_role=user.app_role.value,
        org_role=user.org_role.value,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def set_session_cookie(
    response: Response, settings: SettingsDependency, cookie_name: str, token: str
) -> None:
    response.set_cookie(
        cookie_name,
        token,
        httponly=True,
        samesite="lax",
        secure=settings.env != "development",
    )


async def build_login_response(
    session: AsyncSession,
    settings: SettingsDependency,
    user: User,
    cookie_name: str,
) -> Response:
    _, raw_token = await SessionRepository(session).create_session(
        user, idle_timeout_minutes=settings.session_idle_timeout_minutes
    )

    user_read = await build_user_read(session, user)
    response = Response(
        content=LoginResponse(token=raw_token, user=user_read).model_dump_json(),
        media_type="application/json",
    )
    set_session_cookie(response, settings, cookie_name, raw_token)
    return response


def bearer_token(request: Request) -> str | None:
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.removeprefix("Bearer ")
    return None


async def build_logout_response(
    request: Request,
    session: AsyncSession,
    settings: SettingsDependency,
    cookie_name: str,
) -> Response:
    raw_token = request.cookies.get(cookie_name) or bearer_token(request)
    if raw_token:
        await SessionRepository(session).revoke_session_by_token(raw_token)
    response = Response(content='{"ok": true}', media_type="application/json")
    response.delete_cookie(
        cookie_name,
        secure=settings.env != "development",
        samesite="lax",
    )
    return response
