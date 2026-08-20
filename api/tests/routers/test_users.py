from app.config import get_settings
from app.main import app
from app.models import AppRole, OrgRole
from app.repositories import SessionRepository
from httpx import ASGITransport, AsyncClient
from tests.routers.conftest import _authenticated_client
from tests.routers.factories import (
    DEFAULT_ORGANIZATION_ID,
    create_organization,
    create_user,
)


class TestOrgMemberPermissions:
    async def test_member_cannot_list_users(self, member_client):
        response = await member_client.get("/api/users")
        assert response.status_code == 403


class TestListUsers:
    async def test_should_list_users_in_callers_organization(self, client, session):
        await create_user(
            session, organization_id=DEFAULT_ORGANIZATION_ID, username="bob"
        )

        response = await client.get("/api/users")

        assert response.status_code == 200
        usernames = {user["username"] for user in response.json()}
        assert "bob" in usernames

    async def test_should_not_list_users_from_other_organizations(
        self, client, session
    ):
        other_org = await create_organization(session)
        await create_user(session, organization_id=other_org.id, username="stranger")

        response = await client.get("/api/users")

        assert response.status_code == 200
        usernames = {user["username"] for user in response.json()}
        assert "stranger" not in usernames

    async def test_should_list_users_in_app_admins_own_organization(
        self, app_admin_client, session
    ):
        await create_user(
            session, organization_id=DEFAULT_ORGANIZATION_ID, username="bob"
        )

        response = await app_admin_client.get("/api/users")

        assert response.status_code == 200
        usernames = {user["username"] for user in response.json()}
        assert "bob" in usernames


class TestCreateUser:
    async def test_should_create_user_when_valid_data_provided(self, client, session):
        response = await client.post(
            "/api/users",
            json={"username": "newbie", "password": "correct-horse-battery"},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["username"] == "newbie"
        assert body["organization_id"] == DEFAULT_ORGANIZATION_ID
        assert body["org_role"] == "member"

        list_response = await client.get("/api/users")
        usernames = {user["username"] for user in list_response.json()}
        assert "newbie" in usernames

    async def test_should_create_org_admin_user_when_org_role_provided(
        self, client, session
    ):
        response = await client.post(
            "/api/users",
            json={
                "username": "newadmin",
                "password": "correct-horse-battery",
                "org_role": "admin",
            },
        )

        assert response.status_code == 201
        assert response.json()["org_role"] == "admin"

    async def test_should_return_409_when_username_already_taken(self, client, session):
        await create_user(
            session, organization_id=DEFAULT_ORGANIZATION_ID, username="bob"
        )

        response = await client.post(
            "/api/users",
            json={"username": "bob", "password": "correct-horse-battery"},
        )

        assert response.status_code == 409

    async def test_should_return_403_when_caller_is_not_org_admin(self, session):
        async with await _authenticated_client(
            session,
            organization_id=DEFAULT_ORGANIZATION_ID,
            app_role=AppRole.user,
            org_role=OrgRole.member,
        ) as member_client:
            response = await member_client.post(
                "/api/users",
                json={"username": "newbie", "password": "correct-horse-battery"},
            )

        assert response.status_code == 403


class TestUpdateUser:
    async def test_should_update_username_only(self, client, session):
        user = await create_user(
            session,
            organization_id=DEFAULT_ORGANIZATION_ID,
            username="bob",
            org_role=OrgRole.member,
        )

        response = await client.patch(
            f"/api/users/{user.id}", json={"username": "robert"}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["username"] == "robert"
        assert body["org_role"] == "member"

    async def test_should_update_org_role_only(self, client, session):
        user = await create_user(
            session,
            organization_id=DEFAULT_ORGANIZATION_ID,
            username="bob",
            org_role=OrgRole.member,
        )

        response = await client.patch(
            f"/api/users/{user.id}", json={"org_role": "admin"}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["username"] == "bob"
        assert body["org_role"] == "admin"

    async def test_should_update_password(self, client, session):
        user = await create_user(
            session,
            organization_id=DEFAULT_ORGANIZATION_ID,
            username="bob",
            password="old-password",
        )

        response = await client.patch(
            f"/api/users/{user.id}", json={"password": "new-password-123"}
        )

        assert response.status_code == 200

        login_response = await client.post(
            "/auth/login",
            json={
                "organization_slug": "default",
                "username": "bob",
                "password": "new-password-123",
            },
        )
        assert login_response.status_code == 200

    async def test_should_return_200_and_no_changes_when_body_is_empty(
        self, client, session
    ):
        user = await create_user(
            session, organization_id=DEFAULT_ORGANIZATION_ID, username="bob"
        )

        response = await client.patch(f"/api/users/{user.id}", json={})

        assert response.status_code == 200
        assert response.json()["username"] == "bob"

    async def test_should_return_404_when_user_does_not_exist(self, client):
        response = await client.patch("/api/users/999999", json={"username": "ghost"})

        assert response.status_code == 404

    async def test_should_return_404_when_user_belongs_to_other_organization(
        self, client, session
    ):
        other_org = await create_organization(session)
        stranger = await create_user(
            session, organization_id=other_org.id, username="stranger"
        )

        response = await client.patch(
            f"/api/users/{stranger.id}", json={"username": "renamed"}
        )

        assert response.status_code == 404

    async def test_should_return_409_when_username_already_taken(self, client, session):
        await create_user(
            session, organization_id=DEFAULT_ORGANIZATION_ID, username="taken"
        )
        user = await create_user(
            session, organization_id=DEFAULT_ORGANIZATION_ID, username="bob"
        )

        response = await client.patch(
            f"/api/users/{user.id}", json={"username": "taken"}
        )

        assert response.status_code == 409

    async def test_should_return_409_when_changing_own_role(self, session):
        user = await create_user(
            session,
            organization_id=DEFAULT_ORGANIZATION_ID,
            username="self-admin",
            app_role=AppRole.user,
            org_role=OrgRole.admin,
        )
        _, raw_token = await SessionRepository(session).create_session(
            user, idle_timeout_minutes=get_settings().session_idle_timeout_minutes
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
            cookies={"session_token": raw_token},
        ) as self_client:
            response = await self_client.patch(
                f"/api/users/{user.id}", json={"org_role": "member"}
            )

        assert response.status_code == 409

    async def test_should_allow_changing_own_username(self, session):
        user = await create_user(
            session,
            organization_id=DEFAULT_ORGANIZATION_ID,
            username="self-admin",
            app_role=AppRole.user,
            org_role=OrgRole.admin,
        )
        _, raw_token = await SessionRepository(session).create_session(
            user, idle_timeout_minutes=get_settings().session_idle_timeout_minutes
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
            cookies={"session_token": raw_token},
        ) as self_client:
            response = await self_client.patch(
                f"/api/users/{user.id}", json={"username": "renamed-self"}
            )

        assert response.status_code == 200
        assert response.json()["username"] == "renamed-self"

    async def test_should_return_403_when_caller_is_not_org_admin(
        self, client, session
    ):
        target = await create_user(
            session, organization_id=DEFAULT_ORGANIZATION_ID, username="bob"
        )

        async with await _authenticated_client(
            session,
            organization_id=DEFAULT_ORGANIZATION_ID,
            app_role=AppRole.user,
            org_role=OrgRole.member,
            username="member",
        ) as member_client:
            response = await member_client.patch(
                f"/api/users/{target.id}", json={"username": "renamed"}
            )

        assert response.status_code == 403


class TestDeleteUser:
    async def test_should_delete_user_when_valid_id_provided(self, client, session):
        user = await create_user(
            session, organization_id=DEFAULT_ORGANIZATION_ID, username="bob"
        )

        response = await client.delete(f"/api/users/{user.id}")

        assert response.status_code == 204
        list_response = await client.get("/api/users")
        usernames = {u["username"] for u in list_response.json()}
        assert "bob" not in usernames

    async def test_should_return_404_when_user_belongs_to_other_organization(
        self, client, session
    ):
        other_org = await create_organization(session)
        stranger = await create_user(
            session, organization_id=other_org.id, username="stranger"
        )

        response = await client.delete(f"/api/users/{stranger.id}")

        assert response.status_code == 404

    async def test_should_return_404_when_user_does_not_exist(self, client):
        response = await client.delete("/api/users/999999")

        assert response.status_code == 404

    async def test_should_return_409_when_deleting_own_account(self, session):
        user = await create_user(
            session,
            organization_id=DEFAULT_ORGANIZATION_ID,
            username="self-admin",
            app_role=AppRole.user,
            org_role=OrgRole.admin,
        )
        _, raw_token = await SessionRepository(session).create_session(
            user, idle_timeout_minutes=get_settings().session_idle_timeout_minutes
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
            cookies={"session_token": raw_token},
        ) as self_client:
            response = await self_client.delete(f"/api/users/{user.id}")

        assert response.status_code == 409

    async def test_should_return_403_when_caller_is_not_org_admin(
        self, client, session
    ):
        target = await create_user(
            session, organization_id=DEFAULT_ORGANIZATION_ID, username="bob"
        )

        async with await _authenticated_client(
            session,
            organization_id=DEFAULT_ORGANIZATION_ID,
            app_role=AppRole.user,
            org_role=OrgRole.member,
            username="member",
        ) as member_client:
            response = await member_client.delete(f"/api/users/{target.id}")

        assert response.status_code == 403
