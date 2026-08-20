from __future__ import annotations

from app.models import Attachment, AttachmentDevice, Category, Device
from sqlalchemy import select

from .base import Repository


class DeviceRepository(Repository[Device]):
    async def get(self, id: int) -> Device | None:
        return await self.session.scalar(
            select(Device)
            .join(Category, Category.id == Device.category_id)
            .where(
                Device.id == id,
                Category.organization_id == self.organization_id,
            )
        )

    async def list(self) -> list[Device]:
        result = await self.session.execute(
            select(Device)
            .join(Category, Category.id == Device.category_id)
            .where(Category.organization_id == self.organization_id)
        )
        return list(result.scalars().all())

    async def add(self, device: Device) -> Device:
        self.session.add(device)
        await self.session.commit()
        await self.session.refresh(device)
        return device

    async def delete(self, device: Device) -> None:
        await self.session.delete(device)
        await self.session.commit()

    async def list_attachments(self, device_id: int) -> list[Attachment]:
        result = await self.session.execute(
            select(Attachment)
            .join(AttachmentDevice, AttachmentDevice.attachment_id == Attachment.id)
            .where(
                AttachmentDevice.device_id == device_id,
                Attachment.organization_id == self.organization_id,
            )
            .order_by(Attachment.created_at.desc())
        )
        return list(result.scalars().all())

    async def update(self, device: Device, **fields: object) -> Device:
        for field, value in fields.items():
            setattr(device, field, value)
        self.session.add(device)
        await self.session.commit()
        await self.session.refresh(device)
        return device
