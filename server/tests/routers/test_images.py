from tests.routers.conftest import AUTH_HEADERS


async def test_should_return_image_file_when_path_exists(client, tmp_path):
    images_dir = tmp_path / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    img_file = images_dir / "diagram.png"
    img_file.write_bytes(b"\x89PNG\r\n\x1a\nfake png data")

    # Path type parameter captures everything after the prefix.
    # Passing the absolute path directly (leading slash merges with prefix slash).
    response = await client.get(f"/api/images/{img_file}", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.content == b"\x89PNG\r\n\x1a\nfake png data"
    assert "image" in response.headers["content-type"]


async def test_should_return_404_when_image_file_not_found(client):
    response = await client.get(
        "/api/images/nonexistent/path/missing.png", headers=AUTH_HEADERS
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "File not found on disk"


async def test_should_return_404_on_path_traversal(client):
    response = await client.get("/api/images/../../etc/passwd", headers=AUTH_HEADERS)

    assert response.status_code == 404
