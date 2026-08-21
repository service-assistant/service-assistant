from pathlib import Path

from tests.routers.factories import create_attachment, create_organization


def _write_image(
    tmp_path: Path, attachment_id: int, filename: str, content: bytes
) -> None:
    images_dir = tmp_path / "images" / str(attachment_id)
    images_dir.mkdir(parents=True, exist_ok=True)
    (images_dir / filename).write_bytes(content)


async def test_member_can_get_image_for_own_organizations_attachment(
    member_client, session, tmp_path
):
    attachment = await create_attachment(session)
    _write_image(
        tmp_path, attachment.id, "diagram.png", b"\x89PNG\r\n\x1a\nfake png data"
    )

    response = await member_client.get(f"/api/images/{attachment.id}/diagram.png")

    assert response.status_code == 200


async def test_should_return_image_file_when_it_exists(client, session, tmp_path):
    attachment = await create_attachment(session)
    _write_image(
        tmp_path, attachment.id, "diagram.png", b"\x89PNG\r\n\x1a\nfake png data"
    )

    response = await client.get(f"/api/images/{attachment.id}/diagram.png")

    assert response.status_code == 200
    assert response.content == b"\x89PNG\r\n\x1a\nfake png data"
    assert "image" in response.headers["content-type"]


async def test_should_return_404_when_image_file_not_found(client, session):
    attachment = await create_attachment(session)

    response = await client.get(f"/api/images/{attachment.id}/missing.png")

    assert response.status_code == 404
    assert response.json()["detail"] == "File not found on disk"


async def test_should_return_404_when_attachment_not_found(client):
    response = await client.get("/api/images/999999/diagram.png")

    assert response.status_code == 404


async def test_should_return_404_for_attachment_owned_by_another_organization(
    client, session, tmp_path
):
    other_org = await create_organization(session)
    attachment = await create_attachment(session, organization_id=other_org.id)
    _write_image(
        tmp_path, attachment.id, "diagram.png", b"\x89PNG\r\n\x1a\nfake png data"
    )

    response = await client.get(f"/api/images/{attachment.id}/diagram.png")

    assert response.status_code == 404


async def test_should_return_404_on_path_traversal(client, session):
    attachment = await create_attachment(session)

    response = await client.get(f"/api/images/{attachment.id}/../../../etc/passwd")

    assert response.status_code == 404
