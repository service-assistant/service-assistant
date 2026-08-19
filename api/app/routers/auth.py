from app.dependencies.settings import SettingsDependency
from fastapi import APIRouter, Form, Request, status
from fastapi.responses import JSONResponse

router = APIRouter()


@router.post("/login")
async def login(
    settings: SettingsDependency,
    token: str = Form(...),
):
    if token != settings.auth_token:
        return JSONResponse(
            {"error": "Niepoprawny token."}, status_code=status.HTTP_401_UNAUTHORIZED
        )
    response = JSONResponse({"ok": True})
    response.set_cookie(
        "admin_token",
        token,
        httponly=True,
        samesite="lax",
        secure=settings.env != "development",
    )
    return response


@router.get("/session")
async def session_status(request: Request, settings: SettingsDependency):
    return {"authenticated": request.cookies.get("admin_token") == settings.auth_token}


@router.post("/logout")
async def logout(settings: SettingsDependency):
    response = JSONResponse({"ok": True})
    response.delete_cookie(
        "admin_token",
        secure=settings.env != "development",
        samesite="lax",
    )
    return response


@router.get("/logout")
async def logout_get(settings: SettingsDependency):
    return await logout(settings)
