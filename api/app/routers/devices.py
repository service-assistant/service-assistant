from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_session
from app.models import Attachment, AttachmentDevice, Brand, Device, DeviceType
from app.schemas import AttachmentRead, DeviceCreate, DeviceRead, DeviceUpdate

router = APIRouter()


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=DeviceRead,
    summary="Create a device",
    description="Creates a new device and associates it with a brand and device type.",
)
async def create_device(
    body: DeviceCreate, session: AsyncSession = Depends(get_session)
):
    brand = await session.get(Brand, body.brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    device_type = await session.get(DeviceType, body.device_type_id)
    if not device_type:
        raise HTTPException(status_code=404, detail="Device type not found")

    device = Device(**body.model_dump())
    session.add(device)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="Brand or device type no longer exists"
        )
    await session.refresh(device)
    return device


@router.get(
    "",
    response_model=list[DeviceRead],
    summary="List devices",
    description="Returns all devices.",
)
async def list_devices(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Device))
    return result.scalars().all()


@router.get(
    "/{device_id}/attachments",
    response_model=list[AttachmentRead],
    summary="List device attachments",
    description="Returns all instruction files (attachments) linked to the given device.",
    responses={404: {"description": "Device not found"}},
)
async def list_device_attachments(
    device_id: int, session: AsyncSession = Depends(get_session)
):
    device = await session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    result = await session.execute(
        select(Attachment)
        .join(
            AttachmentDevice,
            AttachmentDevice.attachment_id == Attachment.id,
        )
        .where(AttachmentDevice.device_id == device_id)
        .order_by(Attachment.created_at.desc())
    )
    return result.scalars().all()


@router.get(
    "/{device_id}",
    response_model=DeviceRead,
    summary="Get a device",
    description="Returns a single device by its ID.",
    responses={404: {"description": "Device not found"}},
)
async def get_device(device_id: int, session: AsyncSession = Depends(get_session)):
    device = await session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.patch(
    "/{device_id}",
    response_model=DeviceRead,
    summary="Update a device",
    description="Partially updates a device. Only provided fields are changed.",
    responses={404: {"description": "Device not found"}},
)
async def update_device(
    device_id: int,
    body: DeviceUpdate,
    session: AsyncSession = Depends(get_session),
):
    updates = body.model_dump(exclude_unset=True)

    device = await session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if "brand_id" in updates:
        brand = await session.get(Brand, updates["brand_id"])
        if not brand:
            raise HTTPException(status_code=404, detail="Brand not found")
    if "device_type_id" in updates:
        device_type = await session.get(DeviceType, updates["device_type_id"])
        if not device_type:
            raise HTTPException(status_code=404, detail="Device type not found")
    for field, value in updates.items():
        setattr(device, field, value)
    device.updated_at = datetime.now(timezone.utc)
    session.add(device)
    await session.commit()
    await session.refresh(device)
    return device


@router.delete(
    "/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a device",
    description="Permanently deletes a device. Fails with 409 if any chat threads still reference this device.",
    responses={
        404: {"description": "Device not found"},
        409: {"description": "Device is referenced by one or more chat threads"},
    },
)
async def delete_device(device_id: int, session: AsyncSession = Depends(get_session)):
    device = await session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    try:
        await session.delete(device)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete device: one or more chat threads reference it",
        )
