import os
from pathlib import Path

from tests.routers.conftest import AUTH_HEADERS

IMAGES_DIR = Path(os.environ.get("ATTACHMENTS_DIR", "/tmp/attachments")) / "images"


def test_should_return_image_file_when_path_exists(client):
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    img_file = IMAGES_DIR / "diagram.png"
    img_file.write_bytes(b"\x89PNG\r\n\x1a\nfake png data")

    try:
        # Path type parameter captures everything after the prefix.
        # Passing the absolute path directly (leading slash merges with prefix slash).
        response = client.get(f"/api/images/{img_file}", headers=AUTH_HEADERS)

        assert response.status_code == 200
        assert response.content == b"\x89PNG\r\n\x1a\nfake png data"
        assert "image" in response.headers["content-type"]
    finally:
        img_file.unlink(missing_ok=True)


def test_should_return_404_when_image_file_not_found(client):
    response = client.get(
        "/api/images/nonexistent/path/missing.png", headers=AUTH_HEADERS
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "File not found on disk"


def test_should_return_404_on_path_traversal(client):
    response = client.get("/api/images/../../etc/passwd", headers=AUTH_HEADERS)

    assert response.status_code == 404
