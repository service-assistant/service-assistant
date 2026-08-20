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
