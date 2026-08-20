import asyncio

from app.models import Category
from tests.routers.factories import create_category, create_device


class TestCreateCategory:
    async def test_should_create_category_when_valid_data_provided(self, client):
        response = await client.post(
            "/api/categories",
            json={"name": "Linde", "image_url": "https://example.com/logo.png"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Linde"
        assert data["image_url"] == "https://example.com/logo.png"
        assert data["parent_id"] is None
        assert isinstance(data["id"], int)

    async def test_should_create_child_category_when_parent_id_provided(
        self, client, session
    ):
        parent = await create_category(session, name="Toyota")

        response = await client.post(
            "/api/categories",
            json={"name": "Counterbalance Forklift", "parent_id": parent.id},
        )

        assert response.status_code == 201
        assert response.json()["parent_id"] == parent.id

    async def test_should_return_404_when_creating_category_with_missing_parent(
        self, client
    ):
        response = await client.post(
            "/api/categories", json={"name": "X", "parent_id": 999}
        )
        assert response.status_code == 404
        assert response.json()["detail"] == "Parent category not found"

    async def test_should_return_422_when_creating_category_without_name(self, client):
        response = await client.post("/api/categories", json={})
        assert response.status_code == 422


class TestListRootCategories:
    async def test_should_list_only_root_categories(self, client, session):
        root_a = await create_category(session, name="Toyota")
        root_b = await create_category(session, name="Linde")
        await create_category(session, name="Reach Truck", parent_id=root_a.id)

        response = await client.get("/api/categories")

        assert response.status_code == 200
        data = response.json()
        assert {c["id"] for c in data} == {root_a.id, root_b.id}

    async def test_should_return_empty_list_when_no_categories_exist(self, client):
        response = await client.get("/api/categories")
        assert response.status_code == 200
        assert response.json() == []


class TestGetCategoryTree:
    async def test_should_return_nested_tree_of_categories(self, client, session):
        root = await create_category(session, name="Toyota")
        child = await create_category(session, name="Reach Truck", parent_id=root.id)
        grandchild = await create_category(
            session, name="RRE Series", parent_id=child.id
        )

        response = await client.get("/api/categories/tree")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == root.id
        assert len(data[0]["children"]) == 1
        assert data[0]["children"][0]["id"] == child.id
        assert len(data[0]["children"][0]["children"]) == 1
        assert data[0]["children"][0]["children"][0]["id"] == grandchild.id

    async def test_should_return_empty_list_when_no_categories_exist(self, client):
        response = await client.get("/api/categories/tree")
        assert response.status_code == 200
        assert response.json() == []


class TestGetCategory:
    async def test_should_return_category_when_id_exists(self, client, session):
        category = await create_category(session, name="Toyota")

        response = await client.get(f"/api/categories/{category.id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == category.id
        assert data["name"] == "Toyota"

    async def test_should_return_404_when_category_id_not_found(self, client):
        response = await client.get("/api/categories/999")

        assert response.status_code == 404
        assert response.json()["detail"] == "Category not found"


class TestListCategoryChildren:
    async def test_should_return_direct_children_of_category(self, client, session):
        parent = await create_category(session, name="Toyota")
        child = await create_category(session, name="Reach Truck", parent_id=parent.id)
        grandchild = await create_category(
            session, name="RRE Series", parent_id=child.id
        )
        await create_category(session, name="Linde")

        response = await client.get(f"/api/categories/{parent.id}/children")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == child.id
        assert grandchild.id not in {c["id"] for c in data}

    async def test_should_return_empty_list_when_category_has_no_children(
        self, client, session
    ):
        category = await create_category(session, name="Toyota")

        response = await client.get(f"/api/categories/{category.id}/children")

        assert response.status_code == 200
        assert response.json() == []

    async def test_should_return_404_when_listing_children_of_missing_category(
        self, client
    ):
        response = await client.get("/api/categories/999/children")
        assert response.status_code == 404


class TestUpdateCategory:
    async def test_should_update_category_name_when_patch_provided(
        self, client, session
    ):
        category = await create_category(
            session,
            name="Toyota",
            image_url="https://example.com/logo.png",
        )

        response = await client.patch(
            f"/api/categories/{category.id}", json={"name": "Toyota MH"}
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Toyota MH"
        assert response.json()["image_url"] == "https://example.com/logo.png"
        await session.refresh(category)
        assert category.name == "Toyota MH"

    async def test_should_reparent_category_when_patch_provides_parent_id(
        self, client, session
    ):
        old_parent = await create_category(session, name="Toyota")
        new_parent = await create_category(session, name="Linde")
        child = await create_category(
            session, name="Reach Truck", parent_id=old_parent.id
        )

        response = await client.patch(
            f"/api/categories/{child.id}", json={"parent_id": new_parent.id}
        )

        assert response.status_code == 200
        assert response.json()["parent_id"] == new_parent.id

    async def test_should_return_422_when_category_set_as_own_parent(
        self, client, session
    ):
        category = await create_category(session, name="Toyota")

        response = await client.patch(
            f"/api/categories/{category.id}", json={"parent_id": category.id}
        )

        assert response.status_code == 422

    async def test_should_return_422_when_reparenting_creates_two_cycle(
        self, client, session
    ):
        a = await create_category(session, name="A")
        b = await create_category(session, name="B", parent_id=a.id)

        response = await client.patch(
            f"/api/categories/{a.id}", json={"parent_id": b.id}
        )

        assert response.status_code == 422
        assert "circular" in response.json()["detail"].lower()

    async def test_should_return_422_when_reparenting_creates_deep_cycle(
        self, client, session
    ):
        a = await create_category(session, name="A")
        b = await create_category(session, name="B", parent_id=a.id)
        c = await create_category(session, name="C", parent_id=b.id)

        response = await client.patch(
            f"/api/categories/{a.id}", json={"parent_id": c.id}
        )

        assert response.status_code == 422
        assert "circular" in response.json()["detail"].lower()

    async def test_should_return_404_when_updating_nonexistent_category(self, client):
        response = await client.patch("/api/categories/999", json={"name": "X"})
        assert response.status_code == 404
        assert response.json()["detail"] == "Category not found"

    async def test_should_return_404_when_updating_category_with_missing_parent(
        self, client, session
    ):
        category = await create_category(session, name="Toyota")

        response = await client.patch(
            f"/api/categories/{category.id}", json={"parent_id": 999}
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "Parent category not found"

    async def test_should_return_unchanged_category_when_empty_patch_sent(
        self, client, session
    ):
        category = await create_category(session, name="Toyota")

        response = await client.patch(f"/api/categories/{category.id}", json={})

        assert response.status_code == 200
        assert response.json()["name"] == "Toyota"
        await session.refresh(category)
        assert category.name == "Toyota"


class TestDeleteCategory:
    async def test_should_delete_category_when_id_exists(self, client, session):
        category = await create_category(session)
        category_id = category.id

        response = await client.delete(f"/api/categories/{category_id}")

        assert response.status_code == 204
        session.expunge(category)
        assert await session.get(Category, category_id) is None

    async def test_should_return_404_when_deleting_nonexistent_category(self, client):
        response = await client.delete("/api/categories/999")
        assert response.status_code == 404
        assert response.json()["detail"] == "Category not found"

    async def test_should_cascade_delete_children_when_deleting_category(
        self, client, session
    ):
        parent = await create_category(session, name="Toyota")
        child = await create_category(session, name="Reach Truck", parent_id=parent.id)

        response = await client.delete(f"/api/categories/{parent.id}")

        assert response.status_code == 204
        get_child_response = await client.get(f"/api/categories/{child.id}")
        assert get_child_response.status_code == 404

    async def test_should_return_409_when_deleting_category_referenced_by_device(
        self, client, session
    ):
        category = await create_category(session)
        device = await create_device(session, category.id)

        response = await client.delete(f"/api/categories/{category.id}")

        assert response.status_code == 409
        assert "Cannot delete category" in response.json()["detail"]
        await session.refresh(device)
        assert device.category_id == category.id

    async def test_should_return_409_when_deleting_category_with_device_on_descendant(
        self, client, session
    ):
        parent = await create_category(session, name="Toyota")
        child = await create_category(session, name="Reach Truck", parent_id=parent.id)
        device = await create_device(session, child.id)

        response = await client.delete(f"/api/categories/{parent.id}")

        assert response.status_code == 409
        assert "Cannot delete category" in response.json()["detail"]
        await session.refresh(device)
        assert device.category_id == child.id

    async def test_should_handle_concurrent_category_delete_and_child_create(
        self, client, session
    ):
        category = await create_category(session)

        async with asyncio.TaskGroup() as tg:
            t1 = tg.create_task(client.delete(f"/api/categories/{category.id}"))
            t2 = tg.create_task(
                client.post(
                    "/api/categories",
                    json={"name": "Child", "parent_id": category.id},
                )
            )

        delete_response = t1.result()
        create_response = t2.result()

        # Parent delete cascades to any child, so it always succeeds regardless
        # of the race outcome; a concurrently created child either never gets
        # inserted (404, parent already gone) or gets cascade-deleted with it.
        assert delete_response.status_code == 204
        assert create_response.status_code in (201, 404)
        if create_response.status_code == 201:
            child_id = create_response.json()["id"]
            get_child_response = await client.get(f"/api/categories/{child_id}")
            assert get_child_response.status_code == 404
