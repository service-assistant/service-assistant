import pytest
from sqlalchemy import text


@pytest.fixture(autouse=True)
async def clean_procrastinate_jobs(session):
    # procrastinate_jobs isn't covered by the shared clean_db truncate, so
    # these tests need their own isolation to avoid leaking rows between them.
    yield
    await session.execute(
        text("TRUNCATE TABLE procrastinate_jobs RESTART IDENTITY CASCADE")
    )
    await session.commit()


async def _insert_job(
    session, *, task_name: str, status: str, queue_name: str = "default"
):
    result = await session.execute(
        text(
            """
            INSERT INTO procrastinate_jobs (queue_name, task_name, args, status)
            VALUES (:queue_name, :task_name, '{}'::jsonb, :status)
            RETURNING id
            """
        ),
        {"queue_name": queue_name, "task_name": task_name, "status": status},
    )
    await session.commit()
    return result.scalar_one()


class TestListJobs:
    async def test_should_list_jobs_ordered_by_attention_first(
        self, app_admin_client, session
    ):
        await _insert_job(session, task_name="ingest_pdf", status="succeeded")
        doing_id = await _insert_job(session, task_name="ingest_pdf", status="doing")

        response = await app_admin_client.get("/api/admin/jobs")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 2
        assert body["items"][0]["id"] == doing_id
        assert body["items"][0]["status"] == "doing"

    async def test_should_paginate_jobs(self, app_admin_client, session):
        for _ in range(30):
            await _insert_job(session, task_name="ingest_pdf", status="succeeded")

        response = await app_admin_client.get("/api/admin/jobs", params={"page": 2})

        assert response.status_code == 200
        body = response.json()
        assert body["page"] == 2
        assert body["total_pages"] == 2
        assert len(body["items"]) == 5
