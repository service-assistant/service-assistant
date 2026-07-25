from app.schemas import NameplateAttribute, NameplateData

from tests.routers.factories import create_brand, create_device, create_device_type


async def test_recognize_nameplate_returns_automatic_device_match(
    client, session, mocker
):
    brand = await create_brand(session)
    device_type = await create_device_type(session)
    device = await create_device(
        session,
        brand.id,
        device_type.id,
        name="Series 1D1",
        model_serial_code="1D1",
    )
    mocker.patch(
        "app.routers.nameplates.recognize_nameplate",
        mocker.AsyncMock(
            return_value=NameplateData(
                model="XXX1D1XXX",
                attributes=[
                    NameplateAttribute(
                        label="Serial number",
                        value="558123",
                    )
                ],
                raw_text="MODEL XXX1D1XXX\nSERIAL 558123",
                model_confidence=0.98,
            )
        ),
    )

    response = await client.post(
        "/api/nameplates/recognize",
        files={"photo": ("nameplate.jpg", b"image-bytes", "image/jpeg")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["matched_device"]["id"] == device.id
    assert data["requires_confirmation"] is False
    assert data["nameplate_data"]["attributes"][0]["value"] == "558123"
    assert data["nameplate_data"]["match_confidence"] > 0


async def test_recognize_nameplate_rejects_unsupported_file(client):
    response = await client.post(
        "/api/nameplates/recognize",
        files={"photo": ("nameplate.txt", b"text", "text/plain")},
    )

    assert response.status_code == 415


async def test_recognize_nameplate_returns_confirmation_without_match(client, mocker):
    mocker.patch(
        "app.routers.nameplates.recognize_nameplate",
        mocker.AsyncMock(
            return_value=NameplateData(
                model="UNKNOWN-999",
                raw_text="MODEL UNKNOWN-999",
                model_confidence=0.99,
            )
        ),
    )

    response = await client.post(
        "/api/nameplates/recognize",
        files={"photo": ("nameplate.jpg", b"image-bytes", "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.json()["matched_device"] is None
    assert response.json()["requires_confirmation"] is True
