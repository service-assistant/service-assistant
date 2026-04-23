from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_rag_route():
    pass


# TODO: Learn mocking in Python test and write tests for this endpoint
# Saved it for later to not block other tasks
