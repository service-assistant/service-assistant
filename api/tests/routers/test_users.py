from app.models import AppRole, OrgRole
from tests.routers.conftest import _authenticated_client
from tests.routers.factories import (
    DEFAULT_ORGANIZATION_ID,
    create_organization,
    create_user,
)


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
