from typing import Annotated

from app.models import AppRole, OrgRole, User
from app.repositories import SessionRepository, UserRepository
from fastapi import Depends, HTTPException, Request, status

from .database import DbSessionDependency
from .settings import SettingsDependency


def _extract_raw_token(request: Request) -> str | None:
    # app_admin (debug SPA) and organization_admin (admin SPA) sessions live
    # in separate cookies, so one browser can be logged into both apps at
    # once. The debug SPA marks every request with X-Auth-Scope: admin to say
    # which cookie to read. The Expo app never sends this header or any
    # cookie, so falling through to the Authorization header is exactly what
    # it needs.
    cookie_name = (
        "admin_session_token"
        if request.headers.get("X-Auth-Scope") == "admin"
        else "session_token"
    )
    cookie_token = request.cookies.get(cookie_name)
    if cookie_token:
        return cookie_token
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.removeprefix("Bearer ")
    return None


async def get_current_user(
    request: Request,
    session: DbSessionDependency,
    settings: SettingsDependency,
) -> User:
    raw_token = _extract_raw_token(request)
    if raw_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized"
        )

    session_repository = SessionRepository(session)

    user_session = await session_repository.get_active_session_by_token(raw_token)
    if user_session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized"
        )

    user = await UserRepository(session).get_by_id(user_session.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized"
        )

    await session_repository.touch_session(
        user_session,
        idle_timeout_minutes=settings.session_idle_timeout_minutes,
        extend_threshold_minutes=settings.session_extend_threshold_minutes,
    )

    return user


CurrentUserDependency = Annotated[User, Depends(get_current_user)]


async def get_optional_current_user(
    request: Request,
    session: DbSessionDependency,
    settings: SettingsDependency,
) -> User | None:
    # Used where an endpoint must respond either way instead of 401ing, e.g.
    # `/auth/me` reporting `{authenticated: false}` for a logged-out visitor.
    try:
        return await get_current_user(request, session, settings)
    except HTTPException:
        return None


OptionalCurrentUserDependency = Annotated[
    User | None, Depends(get_optional_current_user)
]


def get_current_organization_id(current_user: CurrentUserDependency) -> int:
    return current_user.organization_id


CurrentOrganizationDependency = Annotated[int, Depends(get_current_organization_id)]


def require_app_admin(current_user: CurrentUserDependency) -> User:
    if current_user.app_role != AppRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return current_user


AppAdminDependency = Annotated[User, Depends(require_app_admin)]


def require_org_admin(current_user: CurrentUserDependency) -> User:
    if current_user.org_role != OrgRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return current_user


OrgAdminDependency = Annotated[User, Depends(require_org_admin)]


def require_org_member(current_user: CurrentUserDependency) -> User:
    # Any authenticated org user — member or admin. org_role has only these
    # two values today, so this is currently a no-op check beyond auth, but
    # it documents intent and stays correct if roles are ever added.
    if current_user.org_role not in (OrgRole.member, OrgRole.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return current_user


OrgMemberDependency = Annotated[User, Depends(require_org_member)]
