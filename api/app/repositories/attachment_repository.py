from app.models import Attachment, AttachmentDevice, Category, Device
from sqlalchemy import select

from .base import OrgScopedRepository


class AttachmentRepository(OrgScopedRepository[Attachment]):
    model = Attachment

    async def list_devices(self, attachment_id: int) -> list[Device]:
        result = await self.session.execute(
            select(Device)
            .join(AttachmentDevice, AttachmentDevice.device_id == Device.id)
            .join(Category, Category.id == Device.category_id)
            .where(
                AttachmentDevice.attachment_id == attachment_id,
                Category.organization_id == self.organization_id,
            )
        )
        return list(result.scalars().all())

    async def _get_link(
        self, attachment_id: int, device_id: int
    ) -> AttachmentDevice | None:
        return await self.session.scalar(
            select(AttachmentDevice).where(
                AttachmentDevice.attachment_id == attachment_id,
                AttachmentDevice.device_id == device_id,
            )
        )

    async def link_device(self, attachment_id: int, device_id: int) -> None:
        if await self._get_link(attachment_id, device_id):
            return
        self.session.add(
            AttachmentDevice(attachment_id=attachment_id, device_id=device_id)
        )
        await self.session.commit()

    async def unlink_device(self, attachment_id: int, device_id: int) -> None:
        link = await self._get_link(attachment_id, device_id)
        if link:
            await self.session.delete(link)
            await self.session.commit()
