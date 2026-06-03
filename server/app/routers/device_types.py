from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import DeviceType

router = APIRouter()


class DeviceTypeCreate(BaseModel):
    name: str = Field(
        description="Display name of the device type.",
        examples=["Counterbalance Forklift"],
    )


class DeviceTypeUpdate(BaseModel):
    name: str | None = Field(
        default=None,
        description="New display name for the device type.",
        examples=["Counterbalance Forklift"],
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=DeviceType,
    summary="Create a device type",
    description="Creates a new device type category (e.g. Counterbalance Forklift, Reach Truck, Pallet Jack).",
)
async def create_device_type(
    body: DeviceTypeCreate,
    session: AsyncSession = Depends(get_session),
):
    device_type = DeviceType(**body.model_dump())
    session.add(device_type)
    await session.commit()
    await session.refresh(device_type)
    return device_type


@router.get(
    "",
    response_model=list[DeviceType],
    summary="List device types",
    description="Returns all device types.",
)
async def list_device_types(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(DeviceType))
    return result.scalars().all()


@router.get(
    "/{device_type_id}",
    response_model=DeviceType,
    summary="Get a device type",
    description="Returns a single device type by its ID.",
    responses={404: {"description": "Device type not found"}},
)
async def get_device_type(
    device_type_id: int,
    session: AsyncSession = Depends(get_session),
):
    device_type = await session.get(DeviceType, device_type_id)
    if not device_type:
        raise HTTPException(status_code=404, detail="Device type not found")
    return device_type


@router.patch(
    "/{device_type_id}",
    response_model=DeviceType,
    summary="Update a device type",
    description="Partially updates a device type. Only provided fields are changed.",
    responses={404: {"description": "Device type not found"}},
)
async def update_device_type(
    device_type_id: int,
    body: DeviceTypeUpdate,
    session: AsyncSession = Depends(get_session),
):
    device_type = await session.get(DeviceType, device_type_id)
    if not device_type:
        raise HTTPException(status_code=404, detail="Device type not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(device_type, field, value)
    device_type.updated_at = datetime.now(timezone.utc)
    session.add(device_type)
    await session.commit()
    await session.refresh(device_type)
    return device_type


@router.delete(
    "/{device_type_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a device type",
    description="Permanently deletes a device type. Fails with 409 if any devices still reference this type.",
    responses={
        404: {"description": "Device type not found"},
        409: {"description": "Device type is referenced by one or more devices"},
    },
)
async def delete_device_type(
    device_type_id: int,
    session: AsyncSession = Depends(get_session),
):
    device_type = await session.get(DeviceType, device_type_id)
    if not device_type:
        raise HTTPException(status_code=404, detail="Device type not found")
    try:
        await session.delete(device_type)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete device type: one or more devices reference it",
        )
