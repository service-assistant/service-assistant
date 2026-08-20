import asyncio

import fitz
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Attachment, AttachmentDevice, Chunk, Device, IngestionStatus

from tests.routers.factories import (
    create_category,
    create_attachment,
    create_chunk,
    create_device,
    link_attachment_device,
)


class TestListAttachments:
    async def test_should_list_all_attachments(self, client, tmp_path, session):
        await create_attachment(
            session, original_filename="a.pdf", file_global_path=str(tmp_path / "a.pdf")
        )
        await create_attachment(
            session, original_filename="b.pdf", file_global_path=str(tmp_path / "b.pdf")
        )

        response = await client.get("/api/attachments")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        filenames = {a["original_filename"] for a in data}
        assert filenames == {"a.pdf", "b.pdf"}

    async def test_should_return_empty_list_when_no_attachments(self, client):
        response = await client.get("/api/attachments")

        assert response.status_code == 200
        assert response.json() == []


class TestUploadAttachments:
    async def test_should_upload_a_file_and_link_devices(
        self, client, tmp_path, session
    ):
        category = await create_category(session)
        device1 = await create_device(session, category.id, name="Device 1")
        device2 = await create_device(session, category.id, name="Device 2")

        response = await client.post(
            "/api/attachments",
            files=[
                ("files", ("manual.pdf", b"%PDF-1.4 test content", "application/pdf"))
            ],
            data={"device_ids": [str(device1.id), str(device2.id)]},
        )

        assert response.status_code == 201
        data = response.json()
        assert len(data) == 1
        assert data[0]["original_filename"] == "manual.pdf"
        assert data[0]["ingest_status"] == "ready"
        assert (tmp_path / "manual.pdf").exists()

        attachment = await session.get(Attachment, data[0]["id"])
        assert attachment.ingest_status == IngestionStatus.ready

    async def test_should_upload_multiple_files_in_one_request(
        self, client, tmp_path, session
    ):
        response = await client.post(
            "/api/attachments",
            files=[
                ("files", ("first.pdf", b"%PDF-1.4 one", "application/pdf")),
                ("files", ("second.pdf", b"%PDF-1.4 two", "application/pdf")),
                ("files", ("third.pdf", b"%PDF-1.4 three", "application/pdf")),
            ],
        )

        assert response.status_code == 201
        data = response.json()
        assert [item["original_filename"] for item in data] == [
            "first.pdf",
            "second.pdf",
            "third.pdf",
        ]
        assert all(item["ingest_status"] == "ready" for item in data)

    async def test_should_handle_filename_collision_on_upload(
        self, client, tmp_path, session
    ):
        (tmp_path / "manual.pdf").write_bytes(b"existing file")
        category = await create_category(session)
        device = await create_device(session, category.id)

        response = await client.post(
            "/api/attachments",
            files=[
                ("files", ("manual.pdf", b"%PDF-1.4 new content", "application/pdf"))
            ],
            data={"device_ids": [str(device.id)]},
        )

        assert response.status_code == 201
        assert (tmp_path / "manual.pdf").read_bytes() == b"existing file"
        assert (tmp_path / "manual__1.pdf").exists()

    async def test_should_reject_upload_without_any_file(self, client):
        response = await client.post("/api/attachments", data={"device_ids": []})

        assert response.status_code == 422

    async def test_should_return_404_when_uploading_with_nonexistent_device(
        self, client
    ):
        response = await client.post(
            "/api/attachments",
            files=[("files", ("manual.pdf", b"%PDF-1.4 content", "application/pdf"))],
            data={"device_ids": ["999"]},
        )

        assert response.status_code == 404
        assert "Device 999 not found" in response.json()["detail"]

    async def test_should_not_orphan_attachment_when_device_vanishes_mid_upload(
        self, client, session, engine, mocker
    ):
        """A device deleted between the existence check and the final commit
        must not leave a committed Attachment row behind pointing at a
        since-deleted file — the whole save is one transaction, not two."""
        category = await create_category(session)
        device = await create_device(session, category.id)

        async def copy_then_delete_device(function, *args, **kwargs):
            result = function(*args, **kwargs)
            async with AsyncSession(engine) as other_session:
                await other_session.execute(
                    delete(Device).where(Device.id == device.id)
                )
                await other_session.commit()
            return result

        mocker.patch(
            "app.services.attachments.run_blocking",
            side_effect=copy_then_delete_device,
        )

        response = await client.post(
            "/api/attachments",
            files=[("files", ("manual.pdf", b"%PDF-1.4 content", "application/pdf"))],
            data={"device_ids": [str(device.id)]},
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "One or more devices no longer exist"
        assert (await session.scalars(select(Attachment))).all() == []

    async def test_should_save_unique_filenames_on_concurrent_upload(
        self, client, tmp_path, session
    ):
        category = await create_category(session)
        device = await create_device(session, category.id)

        async with asyncio.TaskGroup() as tg:
            t1 = tg.create_task(
                client.post(
                    "/api/attachments",
                    files=[
                        (
                            "files",
                            ("manual.pdf", b"%PDF-1.4 content1", "application/pdf"),
                        )
                    ],
                    data={"device_ids": [str(device.id)]},
                )
            )
            t2 = tg.create_task(
                client.post(
                    "/api/attachments",
                    files=[
                        (
                            "files",
                            ("manual.pdf", b"%PDF-1.4 content2", "application/pdf"),
                        )
                    ],
                    data={"device_ids": [str(device.id)]},
                )
            )

        assert t1.result().status_code == 201
        assert t2.result().status_code == 201
        attachment_ids = {
            t1.result().json()[0]["id"],
            t2.result().json()[0]["id"],
        }
        assert len(attachment_ids) == 2
        paths = {
            attachment.file_global_path
            for attachment in (await session.scalars(select(Attachment))).all()
        }
        assert len(paths) == 2


class TestGetAttachment:
    async def test_should_return_attachment_metadata_when_id_exists(
        self, client, tmp_path, session
    ):
        attachment = await create_attachment(
            session,
            file_global_path=str(tmp_path / "manual.pdf"),
            original_filename="manual.pdf",
        )

        response = await client.get(f"/api/attachments/{attachment.id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == attachment.id
        assert data["original_filename"] == "manual.pdf"

    async def test_should_return_404_when_attachment_not_found(self, client):
        response = await client.get("/api/attachments/999")

        assert response.status_code == 404
        assert response.json()["detail"] == "Attachment not found"


class TestDownloadAttachmentFile:
    async def test_should_download_attachment_file_when_it_exists(
        self, client, tmp_path, session
    ):
        pdf_path = tmp_path / "manual.pdf"
        pdf_path.write_bytes(b"%PDF-1.4 test document")
        attachment = await create_attachment(
            session,
            file_global_path=str(pdf_path),
            original_filename="manual.pdf",
        )

        response = await client.get(f"/api/attachments/{attachment.id}/file")

        assert response.status_code == 200
        assert response.content == b"%PDF-1.4 test document"

    async def test_should_return_404_when_attachment_record_not_found_for_file_download(
        self, client
    ):
        response = await client.get("/api/attachments/999/file")

        assert response.status_code == 404
        assert response.json()["detail"] == "Attachment not found"

    async def test_should_return_404_when_file_missing_from_disk(
        self, client, tmp_path, session
    ):
        attachment = await create_attachment(
            session,
            file_global_path=str(tmp_path / "missing.pdf"),
            original_filename="missing.pdf",
        )

        response = await client.get(f"/api/attachments/{attachment.id}/file")

        assert response.status_code == 404
        assert response.json()["detail"] == "File not found on disk"


class TestPreviewAttachmentPage:
    async def test_should_render_pdf_page_as_png(self, client, tmp_path, session):
        pdf_path = tmp_path / "manual.pdf"
        with fitz.open() as document:
            page = document.new_page()
            page.insert_text((72, 72), "Service manual")
            document.save(pdf_path)

        attachment = await create_attachment(
            session,
            file_global_path=str(pdf_path),
            original_filename="manual.pdf",
        )

        response = await client.get(
            f"/api/attachments/{attachment.id}/preview/1?zoom=1"
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        assert response.headers["x-pdf-page-count"] == "1"
        assert response.headers["x-file-size"] == str(pdf_path.stat().st_size)
        assert response.content.startswith(b"\x89PNG\r\n\x1a\n")

    async def test_should_return_404_for_page_outside_pdf(
        self, client, tmp_path, session
    ):
        pdf_path = tmp_path / "manual.pdf"
        with fitz.open() as document:
            document.new_page()
            document.save(pdf_path)

        attachment = await create_attachment(
            session,
            file_global_path=str(pdf_path),
            original_filename="manual.pdf",
        )

        response = await client.get(f"/api/attachments/{attachment.id}/preview/2")

        assert response.status_code == 404
        assert response.json()["detail"] == "PDF page not found"


class TestDeleteAttachment:
    async def test_should_delete_attachment_and_remove_file_from_disk(
        self, client, tmp_path, session
    ):
        pdf_path = tmp_path / "manual.pdf"
        pdf_path.write_bytes(b"%PDF-1.4 content")
        attachment = await create_attachment(
            session,
            file_global_path=str(pdf_path),
            original_filename="manual.pdf",
        )
        attachment_id = attachment.id

        response = await client.delete(f"/api/attachments/{attachment_id}")

        assert response.status_code == 204
        assert not pdf_path.exists()
        session.expunge(attachment)
        assert await session.get(Attachment, attachment_id) is None

    async def test_should_delete_attachment_even_when_file_missing_from_disk(
        self, client, tmp_path, session
    ):
        attachment = await create_attachment(
            session,
            file_global_path=str(tmp_path / "gone.pdf"),
            original_filename="gone.pdf",
        )
        attachment_id = attachment.id

        response = await client.delete(f"/api/attachments/{attachment_id}")

        assert response.status_code == 204
        session.expunge(attachment)
        assert await session.get(Attachment, attachment_id) is None

    async def test_should_cascade_delete_chunks_via_the_db_constraint(
        self, client, tmp_path, session
    ):
        """chunks.attachment_id has ON DELETE CASCADE; the app never deletes
        chunks itself — deleting the attachment row is enough."""
        attachment = await create_attachment(
            session, file_global_path=str(tmp_path / "manual.pdf")
        )
        await create_chunk(session, attachment.id)
        await create_chunk(session, attachment.id)

        response = await client.delete(f"/api/attachments/{attachment.id}")

        assert response.status_code == 204
        remaining = (
            await session.scalars(
                select(Chunk).where(Chunk.attachment_id == attachment.id)
            )
        ).all()
        assert remaining == []

    async def test_should_return_404_when_deleting_nonexistent_attachment(self, client):
        response = await client.delete("/api/attachments/999")

        assert response.status_code == 404
        assert response.json()["detail"] == "Attachment not found"


class TestIngestAttachment:
    async def test_should_queue_ingestion_for_a_ready_attachment(
        self, client, tmp_path, session, procrastinate_connector
    ):
        pdf_path = tmp_path / "manual.pdf"
        pdf_path.write_bytes(b"%PDF-1.4 content")
        attachment = await create_attachment(
            session,
            file_global_path=str(pdf_path),
            original_filename="manual.pdf",
        )

        response = await client.post(f"/api/attachments/{attachment.id}/ingest")

        assert response.status_code == 202
        data = response.json()
        assert data["id"] == attachment.id
        assert data["ingest_status"] == "queued"
        assert data["original_filename"] == "manual.pdf"
        assert len(procrastinate_connector.jobs) == 1

        jobs = list(procrastinate_connector.jobs.values())
        assert jobs[0]["task_name"] == "ingest"
        assert jobs[0]["args"] == {"attachment_id": attachment.id}
        assert jobs[0]["lock"] == "ingest"

    async def test_should_requeue_a_succeeded_or_failed_attachment(
        self, client, tmp_path, session, procrastinate_connector
    ):
        for status in (IngestionStatus.succeeded, IngestionStatus.failed):
            attachment = await create_attachment(
                session,
                file_global_path=str(tmp_path / f"{status.value}.pdf"),
                ingest_status=status,
                ingest_chunks_indexed=7,
                ingest_error="boom" if status == IngestionStatus.failed else None,
            )

            response = await client.post(f"/api/attachments/{attachment.id}/ingest")

            assert response.status_code == 202
            data = response.json()
            assert data["ingest_status"] == "queued"
            # Requeueing resets stale numbers from the previous attempt.
            assert data["ingest_chunks_indexed"] == 0
            assert data["ingest_error"] is None

    async def test_should_reject_ingest_when_already_queued_or_running(
        self, client, tmp_path, session
    ):
        for status in (IngestionStatus.queued, IngestionStatus.running):
            attachment = await create_attachment(
                session,
                file_global_path=str(tmp_path / f"{status.value}.pdf"),
                ingest_status=status,
            )

            response = await client.post(f"/api/attachments/{attachment.id}/ingest")

            assert response.status_code == 409

    async def test_should_return_404_when_ingesting_nonexistent_attachment(
        self, client
    ):
        response = await client.post("/api/attachments/999/ingest")

        assert response.status_code == 404
        assert response.json()["detail"] == "Attachment not found"


class TestCancelIngestion:
    async def test_should_reset_queued_attachment_to_ready_on_cancel(
        self, client, tmp_path, session
    ):
        attachment = await create_attachment(
            session,
            file_global_path=str(tmp_path / "manual.pdf"),
            ingest_status=IngestionStatus.queued,
        )

        response = await client.post(f"/api/attachments/{attachment.id}/cancel")

        assert response.status_code == 200
        assert response.json()["ingest_status"] == "ready"

        await session.refresh(attachment)
        assert attachment.ingest_status == IngestionStatus.ready
        assert attachment.ingest_queued_at is None

    async def test_should_leave_running_ingestion_for_worker_to_finalize_on_cancel(
        self, client, tmp_path, session
    ):
        """A running job only gets an abort request; the worker resets the row."""
        attachment = await create_attachment(
            session,
            file_global_path=str(tmp_path / "manual.pdf"),
            ingest_status=IngestionStatus.running,
        )

        response = await client.post(f"/api/attachments/{attachment.id}/cancel")

        assert response.status_code == 200
        assert response.json()["ingest_status"] == "running"

        await session.refresh(attachment)
        assert attachment.ingest_status == IngestionStatus.running

    async def test_should_reject_cancelling_a_finished_or_ready_attachment(
        self, client, tmp_path, session
    ):
        for status in (IngestionStatus.ready, IngestionStatus.succeeded):
            attachment = await create_attachment(
                session,
                file_global_path=str(tmp_path / f"{status.value}.pdf"),
                ingest_status=status,
            )

            response = await client.post(f"/api/attachments/{attachment.id}/cancel")

            assert response.status_code == 409

    async def test_should_return_404_when_cancelling_nonexistent_attachment(
        self, client
    ):
        response = await client.post("/api/attachments/999/cancel")

        assert response.status_code == 404
        assert response.json()["detail"] == "Attachment not found"


class TestListAttachmentDevices:
    async def test_should_list_devices_for_attachment(self, client, session):
        category = await create_category(session)
        device1 = await create_device(session, category.id, name="Device 1")
        device2 = await create_device(session, category.id, name="Device 2")
        attachment = await create_attachment(session)
        await link_attachment_device(session, attachment.id, device1.id)
        await link_attachment_device(session, attachment.id, device2.id)

        response = await client.get(f"/api/attachments/{attachment.id}/devices")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    async def test_should_return_empty_list_when_attachment_has_no_devices(
        self, client, session
    ):
        attachment = await create_attachment(session)

        response = await client.get(f"/api/attachments/{attachment.id}/devices")

        assert response.status_code == 200
        assert response.json() == []

    async def test_should_return_404_when_listing_devices_for_nonexistent_attachment(
        self, client
    ):
        response = await client.get("/api/attachments/999/devices")

        assert response.status_code == 404
        assert response.json()["detail"] == "Attachment not found"


class TestLinkDevice:
    async def test_should_link_device_to_attachment(self, client, session):
        category = await create_category(session)
        device = await create_device(session, category.id)
        attachment = await create_attachment(session)

        response = await client.post(
            f"/api/attachments/{attachment.id}/devices/{device.id}"
        )

        assert response.status_code == 204

    async def test_should_be_idempotent_when_linking_already_linked_device(
        self, client, session
    ):
        category = await create_category(session)
        device = await create_device(session, category.id)
        attachment = await create_attachment(session)
        await link_attachment_device(session, attachment.id, device.id)

        response = await client.post(
            f"/api/attachments/{attachment.id}/devices/{device.id}"
        )

        assert response.status_code == 204

    async def test_should_return_404_when_linking_device_to_nonexistent_attachment(
        self, client, session
    ):
        category = await create_category(session)
        device = await create_device(session, category.id)

        response = await client.post(f"/api/attachments/999/devices/{device.id}")

        assert response.status_code == 404
        assert response.json()["detail"] == "Attachment not found"

    async def test_should_return_404_when_linking_nonexistent_device(
        self, client, session
    ):
        attachment = await create_attachment(session)

        response = await client.post(f"/api/attachments/{attachment.id}/devices/999")

        assert response.status_code == 404
        assert response.json()["detail"] == "Device not found"

    async def test_should_be_idempotent_on_concurrent_link_device(
        self, client, session
    ):
        category = await create_category(session)
        device = await create_device(session, category.id)
        attachment = await create_attachment(session)

        results = await asyncio.gather(
            client.post(f"/api/attachments/{attachment.id}/devices/{device.id}"),
            client.post(f"/api/attachments/{attachment.id}/devices/{device.id}"),
            return_exceptions=True,
        )

        non_errors = [r for r in results if not isinstance(r, Exception)]
        assert any(r.status_code == 204 for r in non_errors)

        result = await session.execute(
            select(AttachmentDevice).where(
                AttachmentDevice.attachment_id == attachment.id,
                AttachmentDevice.device_id == device.id,
            )
        )
        links = result.scalars().all()
        assert len(links) == 1


class TestUnlinkDevice:
    async def test_should_unlink_device_from_attachment(self, client, session):
        category = await create_category(session)
        device = await create_device(session, category.id)
        attachment = await create_attachment(session)
        await link_attachment_device(session, attachment.id, device.id)

        response = await client.delete(
            f"/api/attachments/{attachment.id}/devices/{device.id}"
        )

        assert response.status_code == 204

    async def test_should_be_idempotent_when_unlinking_device_not_linked(
        self, client, session
    ):
        category = await create_category(session)
        device = await create_device(session, category.id)
        attachment = await create_attachment(session)

        response = await client.delete(
            f"/api/attachments/{attachment.id}/devices/{device.id}"
        )

        assert response.status_code == 204
