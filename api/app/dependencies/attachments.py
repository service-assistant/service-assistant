from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Attachment


async def get_attachment_or_404(
    attachment_id: int,
    session: AsyncSession = Depends(get_session),
) -> Attachment:
    attachment = await session.get(Attachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return attachment


AttachmentDependency = Annotated[Attachment, Depends(get_attachment_or_404)]
