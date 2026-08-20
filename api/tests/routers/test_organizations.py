from app.security import verify_password
from tests.routers.factories import (
    create_category,
    create_device,
    create_organization,
    create_thread,
)


class TestCreateOrganization:
    async def test_should_create_organization_with_first_admin_user(
        self, app_admin_client, session
    ):
        response = await app_admin_client.post(
            "/api/admin/organizations",
            json={
                "name": "Acme Forklifts",
                "slug": "acme-new",
                "admin_username": "alice",
                "admin_password": "correct-horse-battery-staple",
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert body["organization"]["slug"] == "acme-new"
        assert body["admin_user"]["username"] == "alice"
        assert body["admin_user"]["app_role"] == "user"
        assert body["admin_user"]["org_role"] == "admin"
        assert body["admin_user"]["organization_id"] == body["organization"]["id"]

    async def test_created_admin_can_log_in(self, app_admin_client, session):
        create_response = await app_admin_client.post(
            "/api/admin/organizations",
            json={
                "name": "Acme Forklifts",
                "slug": "acme-login-check",
                "admin_username": "bob",
                "admin_password": "correct-horse-battery-staple",
            },
        )
        assert create_response.status_code == 201

        login_response = await app_admin_client.post(
            "/auth/login",
            json={
                "organization_slug": "acme-login-check",
                "username": "bob",
                "password": "correct-horse-battery-staple",
            },
        )
        assert login_response.status_code == 200

    async def test_should_reject_duplicate_slug(self, app_admin_client, session):
        await create_organization(session, slug="taken-slug")

        response = await app_admin_client.post(
            "/api/admin/organizations",
            json={
                "name": "Another Org",
                "slug": "taken-slug",
                "admin_username": "carol",
                "admin_password": "correct-horse-battery-staple",
            },
        )

        assert response.status_code == 409

    async def test_should_reject_when_caller_is_not_app_admin(self, client):
        response = await client.post(
            "/api/admin/organizations",
            json={
                "name": "Acme Forklifts",
                "slug": "acme-forbidden",
                "admin_username": "dave",
                "admin_password": "correct-horse-battery-staple",
            },
        )

        assert response.status_code == 403

    async def test_should_hash_the_admin_password(self, app_admin_client, session):
        response = await app_admin_client.post(
            "/api/admin/organizations",
            json={
                "name": "Acme Forklifts",
                "slug": "acme-hash-check",
                "admin_username": "erin",
                "admin_password": "correct-horse-battery-staple",
            },
        )
        user_id = response.json()["admin_user"]["id"]

        from app.models import User

        stored = await session.get(User, user_id)
        assert stored is not None
        assert stored.password_hash != "correct-horse-battery-staple"
        assert verify_password("correct-horse-battery-staple", stored.password_hash)


class TestListOrganizations:
    async def test_should_list_organizations(self, app_admin_client, session):
        await create_organization(session, name="Org One")
        await create_organization(session, name="Org Two")

        response = await app_admin_client.get("/api/admin/organizations")

        assert response.status_code == 200
        names = {org["name"] for org in response.json()}
        assert {"Org One", "Org Two"}.issubset(names)

    async def test_should_reject_when_caller_is_not_app_admin(self, client):
        response = await client.get("/api/admin/organizations")

        assert response.status_code == 403


class TestDeleteOrganization:
    async def test_should_delete_organization_when_app_admin(
        self, app_admin_client, session
    ):
        organization = await create_organization(session)

        response = await app_admin_client.delete(
            f"/api/admin/organizations/{organization.id}"
        )

        assert response.status_code == 204
        list_response = await app_admin_client.get("/api/admin/organizations")
        ids = {org["id"] for org in list_response.json()}
        assert organization.id not in ids

    async def test_should_delete_organization_with_devices_and_chat_threads(
        self, app_admin_client, session
    ):
        organization = await create_organization(session)
        category = await create_category(session, organization_id=organization.id)
        device = await create_device(session, category_id=category.id)
        await create_thread(session, device_id=device.id)

        response = await app_admin_client.delete(
            f"/api/admin/organizations/{organization.id}"
        )

        assert response.status_code == 204

    async def test_should_return_404_when_organization_does_not_exist(
        self, app_admin_client
    ):
        response = await app_admin_client.delete("/api/admin/organizations/999999")

        assert response.status_code == 404

    async def test_should_reject_when_caller_is_not_app_admin(self, client, session):
        organization = await create_organization(session)

        response = await client.delete(f"/api/admin/organizations/{organization.id}")

        assert response.status_code == 403
