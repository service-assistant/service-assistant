from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_hello_route():
    """
    Used to show how to test API routes in this repository, in this case it's example /api/hello route.
    """
    response = client.get("/api/hello")
    assert response.status_code == 200
    assert response.json() == {"hello": "world", "world": "hello"}
