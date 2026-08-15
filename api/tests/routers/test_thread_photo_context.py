from app.schemas import PhotoObservation

from tests.routers.factories import (
    create_category,
    create_device,
    create_thread,
)


async def test_extracts_photo_context_for_existing_thread(client, session, mocker):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)
    analyze = mocker.patch(
        "app.routers.threads.photo_context.analyze_photos",
        new=mocker.AsyncMock(
            return_value=[
                PhotoObservation(
                    component="silnik elektryczny",
                    main_identifier="AF 124-L1",
                    confidence=0.93,
                )
            ]
        ),
    )

    response = await client.post(
        f"/api/threads/{thread.id}/photo-context",
        data={"question": "Jak zmierzyć uzwojenia?"},
        files=[("photos", ("motor.jpg", b"image-bytes", "image/jpeg"))],
    )

    assert response.status_code == 200
    assert response.json() == {
        "observations": [
            {
                "component": "silnik elektryczny",
                "main_identifier": "AF 124-L1",
                "confidence": 0.93,
            }
        ]
    }
    photos, question, _settings = analyze.await_args.args
    assert question == "Jak zmierzyć uzwojenia?"
    assert photos[0].content == b"image-bytes"
    assert photos[0].media_type == "image/jpeg"


async def test_rejects_more_than_five_photos(client, session):
    category = await create_category(session)
    device = await create_device(session, category.id)
    thread = await create_thread(session, device.id)

    response = await client.post(
        f"/api/threads/{thread.id}/photo-context",
        files=[
            ("photos", (f"photo-{index}.jpg", b"image", "image/jpeg"))
            for index in range(6)
        ],
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Upload between 1 and 5 photos"
