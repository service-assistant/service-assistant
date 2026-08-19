from app.config import get_settings


class TestLogin:
    async def test_should_authenticate_and_set_cookie_when_token_is_correct(
        self, unauthenticated_client
    ):
        response = await unauthenticated_client.post(
            "/auth/login", data={"token": get_settings().auth_token}
        )

        assert response.status_code == 200
        assert response.json() == {"ok": True}
        assert response.cookies.get("admin_token") == get_settings().auth_token

    async def test_should_reject_login_when_token_is_wrong(
        self, unauthenticated_client
    ):
        response = await unauthenticated_client.post(
            "/auth/login", data={"token": "wrong-token"}
        )

        assert response.status_code == 401
        assert "admin_token" not in response.cookies


class TestSession:
    async def test_should_report_authenticated_session_via_cookie(
        self, unauthenticated_client
    ):
        unauthenticated_client.cookies.set("admin_token", get_settings().auth_token)

        response = await unauthenticated_client.get("/auth/session")

        assert response.status_code == 200
        assert response.json() == {"authenticated": True}

    async def test_should_report_unauthenticated_session_without_cookie(
        self, unauthenticated_client
    ):
        response = await unauthenticated_client.get("/auth/session")

        assert response.status_code == 200
        assert response.json() == {"authenticated": False}


class TestLogout:
    async def test_should_clear_cookie_on_logout(self, unauthenticated_client):
        await unauthenticated_client.post(
            "/auth/login", data={"token": get_settings().auth_token}
        )

        response = await unauthenticated_client.post("/auth/logout")

        assert response.status_code == 200
        assert "admin_token" not in response.cookies

        session_response = await unauthenticated_client.get("/auth/session")
        assert session_response.json() == {"authenticated": False}


class TestCookieAuthenticatesOtherEndpoints:
    async def test_should_allow_authenticated_api_access_via_cookie_alone(
        self, unauthenticated_client
    ):
        unauthenticated_client.cookies.set("admin_token", get_settings().auth_token)

        response = await unauthenticated_client.get("/api/jobs")

        assert response.status_code == 200
