import fitz
from app.models import IngestionStatus
from tests.routers.factories import create_attachment, create_chunk, create_organization


async def test_app_admin_lists_and_searches_chunk_files(app_admin_client, session):
    organization = await create_organization(session, name="Warsaw Service")
    attachment = await create_attachment(
        session,
        organization_id=organization.id,
        original_filename="hydraulics.pdf",
        ingest_status=IngestionStatus.succeeded,
        ingest_pages_total=4,
    )
    await create_chunk(session, attachment.id, extra_metadata={"page": 1})

    response = await app_admin_client.get("/api/admin/chunks/files?search=hydraulics")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    expected = {
        "id": attachment.id,
        "organization_id": organization.id,
        "organization_name": "Warsaw Service",
        "organization_slug": organization.slug,
        "original_filename": "hydraulics.pdf",
        "ingest_status": "succeeded",
        "ingest_pages_total": 4,
        "chunk_count": 1,
    }
    assert {key: data[0][key] for key in expected} == expected


async def test_app_admin_gets_one_based_chunk_pages(app_admin_client, session):
    attachment = await create_attachment(session, ingest_pages_total=5)
    first = await create_chunk(session, attachment.id, extra_metadata={"page": 0})
    await create_chunk(session, attachment.id, extra_metadata={"page": 0})
    third = await create_chunk(session, attachment.id, extra_metadata={"page": 2})
    await create_chunk(session, attachment.id, extra_metadata=None)

    detail_response = await app_admin_client.get(
        f"/api/admin/chunks/files/{attachment.id}"
    )
    page_response = await app_admin_client.get(
        f"/api/admin/chunks/files/{attachment.id}/chunks?page_number=3"
    )

    assert detail_response.status_code == 200
    assert detail_response.json()["chunk_pages"] == [
        {"page_number": 1, "chunk_count": 2},
        {"page_number": 3, "chunk_count": 1},
    ]
    assert [chunk["id"] for chunk in page_response.json()] == [third.id]
    assert first.id not in [chunk["id"] for chunk in page_response.json()]


async def test_chunk_debug_endpoints_require_app_admin(client):
    response = await client.get("/api/admin/chunks/files")
    assert response.status_code == 403


async def test_app_admin_previews_file_page(app_admin_client, session, tmp_path):
    file_path = tmp_path / "manual.pdf"
    document = fitz.open()
    document.new_page().insert_text((72, 72), "Page one")
    document.save(file_path)
    document.close()
    attachment = await create_attachment(
        session,
        file_global_path=str(file_path),
        original_filename="manual.pdf",
    )

    response = await app_admin_client.get(
        f"/api/admin/chunks/files/{attachment.id}/preview/1"
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["x-pdf-page-count"] == "1"
    assert response.content.startswith(b"\x89PNG")


async def test_app_admin_gets_extracted_chunk_image(
    app_admin_client, session, tmp_path
):
    attachment = await create_attachment(session)
    image_dir = tmp_path / "images" / str(attachment.id)
    image_dir.mkdir(parents=True)
    image = b"\x89PNG\r\n\x1a\nchunk image"
    (image_dir / "diagram.png").write_bytes(image)

    response = await app_admin_client.get(
        f"/api/admin/chunks/files/{attachment.id}/images/diagram.png"
    )

    assert response.status_code == 200
    assert response.content == image
    assert response.headers["content-type"] == "image/png"
