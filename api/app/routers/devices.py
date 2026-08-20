from datetime import datetime, timezone

from app.dependencies.auth import CurrentOrganizationDependency, require_org_admin
from app.dependencies.database import DbSessionDependency
from app.dependencies.entities import DeviceDependency
from app.models import Device
from app.repositories import CategoryRepository, DeviceRepository
from app.schemas import AttachmentRead, DeviceCreate, DeviceRead, DeviceUpdate
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError

router = APIRouter()


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=DeviceRead,
    summary="Create a device",
    description="Creates a new device and associates it with a category.",
    dependencies=[Depends(require_org_admin)],
)
async def create_device(
    body: DeviceCreate,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    category = await CategoryRepository(session, organization_id).get(body.category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    device = Device(**body.model_dump())
    try:
        return await DeviceRepository(session, organization_id).add(device)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Category no longer exists")


@router.get(
    "",
    response_model=list[DeviceRead],
    summary="List devices",
    description="Returns all devices.",
)
async def list_devices(
    session: DbSessionDependency, organization_id: CurrentOrganizationDependency
):
    return await DeviceRepository(session, organization_id).list()


@router.get(
    "/{device_id}/attachments",
    response_model=list[AttachmentRead],
    summary="List device attachments",
    description="Returns all instruction files (attachments) linked to the given device.",
    responses={404: {"description": "Device not found"}},
)
async def list_device_attachments(
    device: DeviceDependency,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    return await DeviceRepository(session, organization_id).list_attachments(device.id)


@router.get(
    "/{device_id}",
    response_model=DeviceRead,
    summary="Get a device",
    description="Returns a single device by its ID.",
    responses={404: {"description": "Device not found"}},
)
async def get_device(device: DeviceDependency):
    return device


@router.patch(
    "/{device_id}",
    response_model=DeviceRead,
    summary="Update a device",
    description="Partially updates a device. Only provided fields are changed.",
    responses={
        404: {"description": "Device not found"},
        422: {"description": "category_id cannot be cleared"},
    },
    dependencies=[Depends(require_org_admin)],
)
async def update_device(
    device: DeviceDependency,
    body: DeviceUpdate,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    repository = DeviceRepository(session, organization_id)
    updates = body.model_dump(exclude_unset=True)
    if "category_id" in updates:
        if updates["category_id"] is None:
            raise HTTPException(status_code=422, detail="category_id cannot be cleared")
        category = await CategoryRepository(session, organization_id).get(
            updates["category_id"]
        )
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")

    updates["updated_at"] = datetime.now(timezone.utc)
    return await repository.update(device, **updates)


@router.delete(
    "/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a device",
    description="Permanently deletes a device. Fails with 409 if any chat threads still reference this device.",
    responses={
        404: {"description": "Device not found"},
        409: {"description": "Device is referenced by one or more chat threads"},
    },
    dependencies=[Depends(require_org_admin)],
)
async def delete_device(
    device: DeviceDependency,
    session: DbSessionDependency,
    organization_id: CurrentOrganizationDependency,
):
    repository = DeviceRepository(session, organization_id)
    try:
        await repository.delete(device)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete device: one or more chat threads reference it",
        )
