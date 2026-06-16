import pytest


async def test_should_return_healthy_when_database_is_reachable(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


async def test_should_return_401_when_no_auth_header_provided(unauthenticated_client):
    response = await unauthenticated_client.get("/api/brands")
    assert response.status_code == 401
    assert response.json() == {"detail": "Unauthorized"}


def _api_routes():
    import re
    from fastapi.routing import APIRoute
    from app.main import app

    result = []
    for route in app.routes:
        if isinstance(route, APIRoute) and route.path.startswith("/api/"):
            path = re.sub(r"\{[^}]+\}", "1", route.path)
            method = next(iter(route.methods)).lower()
            result.append(
                pytest.param(method, path, id=f"{method.upper()} {route.path}")
            )
    return result


@pytest.mark.parametrize("method,path", _api_routes())
async def test_should_return_401_when_no_token_provided(
    unauthenticated_client, method, path
):
    call = getattr(unauthenticated_client, method)
    response = await call(path)
    assert response.status_code == 401


@pytest.mark.parametrize("method,path", _api_routes())
async def test_should_return_401_when_wrong_token_provided(
    unauthenticated_client, method, path
):
    call = getattr(unauthenticated_client, method)
    response = await call(path, headers={"Authorization": "Bearer wrong-token"})
    assert response.status_code == 401


def _public_routes():
    return [
        pytest.param(method, path)
        for method, path in [
            ("get", "/docs"),
            ("get", "/redoc"),
            ("get", "/openapi.json"),
            ("get", "/health"),
        ]
    ]


@pytest.mark.parametrize("method,path", _public_routes())
async def test_should_allow_public_routes_without_auth(
    unauthenticated_client, method, path
):
    call = getattr(unauthenticated_client, method)
    response = await call(path, headers={})
    assert response.status_code == 200
