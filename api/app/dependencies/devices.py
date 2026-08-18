from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Device


async def get_device_or_404(
    device_id: int,
    session: AsyncSession = Depends(get_session),
) -> Device:
    device = await session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


DeviceDependency = Annotated[Device, Depends(get_device_or_404)]
