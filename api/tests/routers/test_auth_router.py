from app.models import AppRole, OrgRole
from tests.routers.factories import create_organization, create_user


class TestLogin:
    async def test_should_authenticate_and_set_cookie_when_credentials_are_correct(
        self, unauthenticated_client, session
    ):
        org = await create_organization(session)
        await create_user(
            session,
            organization_id=org.id,
            username="alice",
            password="s3cret-pw",
        )

        response = await unauthenticated_client.post(
            "/auth/login",
            json={
                "organization_slug": org.slug,
                "username": "alice",
                "password": "s3cret-pw",
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["user"]["username"] == "alice"
        assert body["user"]["organization_slug"] == org.slug
        assert body["token"]
        assert response.cookies.get("session_token") == body["token"]

    async def test_should_reject_login_when_password_is_wrong(
        self, unauthenticated_client, session
    ):
        org = await create_organization(session)
        await create_user(
            session, organization_id=org.id, username="alice", password="s3cret-pw"
        )

        response = await unauthenticated_client.post(
            "/auth/login",
            json={
                "organization_slug": org.slug,
                "username": "alice",
                "password": "wrong-password",
            },
        )

        assert response.status_code == 401
        assert "session_token" not in response.cookies

    async def test_should_reject_login_when_organization_slug_is_unknown(
        self, unauthenticated_client
    ):
        response = await unauthenticated_client.post(
            "/auth/login",
            json={
                "organization_slug": "does-not-exist",
                "username": "alice",
                "password": "whatever",
            },
        )

        assert response.status_code == 401


class TestOrgAdminLogin:
    async def test_should_authenticate_org_admin_when_credentials_are_correct(
        self, unauthenticated_client, session
    ):
        org = await create_organization(session)
        await create_user(
            session,
            organization_id=org.id,
            username="alice",
            password="s3cret-pw",
            org_role=OrgRole.admin,
        )

        response = await unauthenticated_client.post(
            "/auth/admin-login",
            json={
                "organization_slug": org.slug,
                "username": "alice",
                "password": "s3cret-pw",
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["user"]["username"] == "alice"
        assert body["user"]["org_role"] == "admin"
        assert response.cookies.get("session_token") == body["token"]

    async def test_should_reject_login_when_user_is_org_member(
        self, unauthenticated_client, session
    ):
        org = await create_organization(session)
        await create_user(
            session,
            organization_id=org.id,
            username="bob",
            password="s3cret-pw",
            org_role=OrgRole.member,
        )

        response = await unauthenticated_client.post(
            "/auth/admin-login",
            json={
                "organization_slug": org.slug,
                "username": "bob",
                "password": "s3cret-pw",
            },
        )

        assert response.status_code == 403
        assert "session_token" not in response.cookies

    async def test_should_reject_login_when_password_is_wrong(
        self, unauthenticated_client, session
    ):
        org = await create_organization(session)
        await create_user(
            session,
            organization_id=org.id,
            username="alice",
            password="s3cret-pw",
            org_role=OrgRole.admin,
        )

        response = await unauthenticated_client.post(
            "/auth/admin-login",
            json={
                "organization_slug": org.slug,
                "username": "alice",
                "password": "wrong-password",
            },
        )

        assert response.status_code == 401


class TestAdminLogin:
    async def test_should_authenticate_app_admin_when_credentials_are_correct(
        self, unauthenticated_client, session
    ):
        org = await create_organization(session)
        await create_user(
            session,
            organization_id=org.id,
            username="root",
            password="s3cret-pw",
            app_role=AppRole.admin,
            org_role=OrgRole.admin,
        )

        response = await unauthenticated_client.post(
            "/admin/auth/login",
            json={"username": "root", "password": "s3cret-pw"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["user"]["username"] == "root"
        assert body["user"]["app_role"] == "admin"
        assert body["user"]["org_role"] == "admin"
        assert response.cookies.get("admin_session_token") == body["token"]
        assert "session_token" not in response.cookies

    async def test_should_reject_login_when_user_is_not_app_admin(
        self, unauthenticated_client, session
    ):
        org = await create_organization(session)
        await create_user(
            session,
            organization_id=org.id,
            username="alice",
            password="s3cret-pw",
            app_role=AppRole.user,
            org_role=OrgRole.admin,
        )

        response = await unauthenticated_client.post(
            "/admin/auth/login",
            json={"username": "alice", "password": "s3cret-pw"},
        )

        assert response.status_code == 401

    async def test_should_reject_login_when_password_is_wrong(
        self, unauthenticated_client, session
    ):
        org = await create_organization(session)
        await create_user(
            session,
            organization_id=org.id,
            username="root",
            password="s3cret-pw",
            app_role=AppRole.admin,
            org_role=OrgRole.admin,
        )

        response = await unauthenticated_client.post(
            "/admin/auth/login",
            json={"username": "root", "password": "wrong-password"},
        )

        assert response.status_code == 401


class TestDualSessions:
    async def test_should_stay_logged_into_both_identities_at_once_in_one_client(
        self, unauthenticated_client, session
    ):
        org = await create_organization(session)
        await create_user(
            session, organization_id=org.id, username="alice", password="s3cret-pw"
        )
        await create_user(
            session,
            organization_id=org.id,
            username="root",
            password="s3cret-pw",
            app_role=AppRole.admin,
            org_role=OrgRole.admin,
        )

        org_login = await unauthenticated_client.post(
            "/auth/login",
            json={
                "organization_slug": org.slug,
                "username": "alice",
                "password": "s3cret-pw",
            },
        )
        admin_login = await unauthenticated_client.post(
            "/admin/auth/login",
            json={"username": "root", "password": "s3cret-pw"},
        )
        # See TestMe: `Secure` cookies aren't auto-persisted over httpx's
        # plain-http test transport — set both explicitly, as a real HTTPS
        # browser would after receiving both Set-Cookie headers.
        unauthenticated_client.cookies.set("session_token", org_login.json()["token"])
        unauthenticated_client.cookies.set(
            "admin_session_token", admin_login.json()["token"]
        )

        org_me = await unauthenticated_client.get("/auth/me")
        admin_me = await unauthenticated_client.get(
            "/auth/me", headers={"X-Auth-Scope": "admin"}
        )

        assert org_me.json()["user"]["username"] == "alice"
        assert admin_me.json()["user"]["username"] == "root"

    async def test_admin_logout_should_not_revoke_org_session(
        self, unauthenticated_client, session
    ):
        org = await create_organization(session)
        await create_user(
            session, organization_id=org.id, username="alice", password="s3cret-pw"
        )
        await create_user(
            session,
            organization_id=org.id,
            username="root",
            password="s3cret-pw",
            app_role=AppRole.admin,
            org_role=OrgRole.admin,
        )
        org_login = await unauthenticated_client.post(
            "/auth/login",
            json={
                "organization_slug": org.slug,
                "username": "alice",
                "password": "s3cret-pw",
            },
        )
        admin_login = await unauthenticated_client.post(
            "/admin/auth/login",
            json={"username": "root", "password": "s3cret-pw"},
        )
        unauthenticated_client.cookies.set("session_token", org_login.json()["token"])
        unauthenticated_client.cookies.set(
            "admin_session_token", admin_login.json()["token"]
        )

        logout_response = await unauthenticated_client.post("/admin/auth/logout")

        assert logout_response.status_code == 200
        assert "admin_session_token" not in logout_response.cookies
        org_me = await unauthenticated_client.get("/auth/me")
        assert org_me.json()["authenticated"] is True
        assert org_me.json()["user"]["username"] == "alice"


class TestMe:
    async def test_should_report_authenticated_session_via_cookie(
        self, unauthenticated_client, session
    ):
        org = await create_organization(session)
        await create_user(
            session, organization_id=org.id, username="alice", password="s3cret-pw"
        )
        login_response = await unauthenticated_client.post(
            "/auth/login",
            json={
                "organization_slug": org.slug,
                "username": "alice",
                "password": "s3cret-pw",
            },
        )
        assert login_response.status_code == 200
        # The login response sets the cookie with `Secure`, which httpx's test
        # transport (plain http, no TLS) won't persist automatically — set it
        # on the client explicitly, the way a real HTTPS browser would.
        unauthenticated_client.cookies.set(
            "session_token", login_response.json()["token"]
        )

        response = await unauthenticated_client.get("/auth/me")

        assert response.status_code == 200
        body = response.json()
        assert body["authenticated"] is True
        assert body["user"]["username"] == "alice"

    async def test_should_report_authenticated_session_via_bearer_token(
        self, unauthenticated_client, session
    ):
        org = await create_organization(session)
        await create_user(
            session, organization_id=org.id, username="alice", password="s3cret-pw"
        )
        login_response = await unauthenticated_client.post(
            "/auth/login",
            json={
                "organization_slug": org.slug,
                "username": "alice",
                "password": "s3cret-pw",
            },
        )
        token = login_response.json()["token"]
        unauthenticated_client.cookies.clear()

        response = await unauthenticated_client.get(
            "/auth/me", headers={"Authorization": f"Bearer {token}"}
        )

        assert response.status_code == 200
        assert response.json()["authenticated"] is True

    async def test_should_report_unauthenticated_session_without_credentials(
        self, unauthenticated_client
    ):
        response = await unauthenticated_client.get("/auth/me")

        assert response.status_code == 200
        assert response.json() == {"authenticated": False, "user": None}


class TestLogout:
    async def test_should_revoke_session_and_clear_cookie_on_logout(
        self, unauthenticated_client, session
    ):
        org = await create_organization(session)
        await create_user(
            session, organization_id=org.id, username="alice", password="s3cret-pw"
        )
        login_response = await unauthenticated_client.post(
            "/auth/login",
            json={
                "organization_slug": org.slug,
                "username": "alice",
                "password": "s3cret-pw",
            },
        )
        token = login_response.json()["token"]
        # See test_should_report_authenticated_session_via_cookie: the `Secure`
        # cookie isn't auto-persisted over httpx's plain-http test transport.
        unauthenticated_client.cookies.set("session_token", token)

        response = await unauthenticated_client.post("/auth/logout")

        assert response.status_code == 200
        assert "session_token" not in response.cookies

        me_response = await unauthenticated_client.get(
            "/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert me_response.json()["authenticated"] is False
