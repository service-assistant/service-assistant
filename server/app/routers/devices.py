import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from app.database import get_session
from app.models import Brand, Device, DeviceType, Attachment, AttachmentDevice

router = APIRouter()


class DeviceCreate(BaseModel):
    brand_id: int = Field(
        description="ID of the brand this device belongs to.", examples=[1]
    )
    device_type_id: int = Field(
        description="ID of the device type category.", examples=[2]
    )
    name: str = Field(
        description="Human-readable device name.", examples=["Toyota 8FBE20"]
    )
    model_serial_code: str | None = Field(
        default=None,
        description="Manufacturer model or serial code used for identification.",
        examples=["8FBE20-12345"],
    )
    image_url: str | None = Field(
        default=None,
        description="Publicly accessible URL of the device image.",
        examples=["https://example.com/images/toyota-8fbe20.jpg"],
    )


class DeviceUpdate(BaseModel):
    brand_id: int | None = Field(
        default=None, description="New brand ID.", examples=[1]
    )
    device_type_id: int | None = Field(
        default=None, description="New device type ID.", examples=[2]
    )
    name: str | None = Field(
        default=None, description="New device name.", examples=["Toyota 8FBE20"]
    )
    model_serial_code: str | None = Field(
        default=None,
        description="New model or serial code.",
        examples=["8FBE20-12345"],
    )
    image_url: str | None = Field(
        default=None,
        description="New image URL. Pass `null` to clear.",
        examples=["https://example.com/images/toyota-8fbe20-v2.jpg"],
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=Device,
    summary="Create a device",
    description="Creates a new device and associates it with a brand and device type.",
)
async def create_device(
    body: DeviceCreate, session: AsyncSession = Depends(get_session)
):
    async with asyncio.TaskGroup() as tg:
        brand_task = tg.create_task(session.get(Brand, body.brand_id))
        device_type_task = tg.create_task(session.get(DeviceType, body.device_type_id))

    if not brand_task.result():
        raise HTTPException(status_code=404, detail="Brand not found")
    if not device_type_task.result():
        raise HTTPException(status_code=404, detail="Device type not found")

    device = Device(**body.model_dump())
    session.add(device)
    await session.commit()
    await session.refresh(device)
    return device


@router.get(
    "",
    response_model=list[Device],
    summary="List devices",
    description="Returns all devices.",
)
async def list_devices(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Device))
    return result.scalars().all()


@router.get(
    "/{device_id}/attachments",
    response_model=list[Attachment],
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
            col(AttachmentDevice.attachment_id) == col(Attachment.id),
        )
        .where(AttachmentDevice.device_id == device_id)
        .order_by(col(Attachment.created_at).desc())
    )
    return result.scalars().all()


@router.get(
    "/{device_id}",
    response_model=Device,
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
    response_model=Device,
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

    async with asyncio.TaskGroup() as tg:
        device_task = tg.create_task(session.get(Device, device_id))
        brand_task = (
            tg.create_task(session.get(Brand, updates["brand_id"]))
            if "brand_id" in updates
            else None
        )
        device_type_task = (
            tg.create_task(session.get(DeviceType, updates["device_type_id"]))
            if "device_type_id" in updates
            else None
        )

    device = device_task.result()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if brand_task and not brand_task.result():
        raise HTTPException(status_code=404, detail="Brand not found")
    if device_type_task and not device_type_task.result():
        raise HTTPException(status_code=404, detail="Device type not found")
    for field, value in updates.items():
        setattr(device, field, value)
    device.updated_at = datetime.utcnow()
    session.add(device)
    await session.commit()
    await session.refresh(device)
    return device


@router.delete(
    "/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a device",
    description="Permanently deletes a device. Associated chat threads will be blocked by the foreign-key constraint.",
    responses={404: {"description": "Device not found"}},
)
async def delete_device(device_id: int, session: AsyncSession = Depends(get_session)):
    device = await session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    await session.delete(device)
    await session.commit()
