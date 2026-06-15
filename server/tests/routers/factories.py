from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Attachment,
    AttachmentDevice,
    Brand,
    ChatThread,
    Chunk,
    Device,
    DeviceType,
    Message,
    MessageSender,
    EMBEDDING_DIMENSIONS,
)


def make_attachment(path: str = "/nonexistent/manual.pdf", **kwargs) -> Attachment:
    defaults = dict(
        id=1,
        file_global_path=path,
        original_filename="manual.pdf",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return Attachment(**defaults)


def make_brand(**kwargs) -> Brand:
    defaults = dict(
        id=1,
        name="Toyota",
        logo_url=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return Brand(**defaults)


def make_chunk(**kwargs) -> Chunk:
    defaults = dict(
        id=1,
        content="Fault code E-23 means hydraulic error.",
        attachment_id=1,
        extra_metadata={"page": 5},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return Chunk(**defaults)


def make_device(**kwargs) -> Device:
    defaults = dict(
        id=1,
        brand_id=1,
        device_type_id=1,
        name="Toyota 8FBE20",
        model_serial_code=None,
        image_url=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return Device(**defaults)


def make_device_type(**kwargs) -> DeviceType:
    defaults = dict(
        id=1,
        name="Counterbalance Forklift",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return DeviceType(**defaults)


def make_thread(**kwargs) -> ChatThread:
    defaults = dict(
        id=1,
        device_id=1,
        title="Mast won't lift",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return ChatThread(**defaults)


def make_message(**kwargs) -> Message:
    defaults = dict(
        id=1,
        content="Test content",
        thread_id=1,
        sender=MessageSender.assistant,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return Message(**defaults)


async def create_brand(session: AsyncSession, **kwargs) -> Brand:
    brand = Brand(
        name=kwargs.get("name", "Toyota"),
        logo_url=kwargs.get("logo_url"),
    )
    session.add(brand)
    await session.commit()
    await session.refresh(brand)
    return brand


async def create_device_type(session: AsyncSession, **kwargs) -> DeviceType:
    dt = DeviceType(
        name=kwargs.get("name", "Counterbalance Forklift"),
    )
    session.add(dt)
    await session.commit()
    await session.refresh(dt)
    return dt


async def create_device(
    session: AsyncSession, brand_id: int, device_type_id: int, **kwargs
) -> Device:
    device = Device(
        brand_id=brand_id,
        device_type_id=device_type_id,
        name=kwargs.get("name", "Toyota 8FBE20"),
        model_serial_code=kwargs.get("model_serial_code"),
        image_url=kwargs.get("image_url"),
    )
    session.add(device)
    await session.commit()
    await session.refresh(device)
    return device


async def create_thread(session: AsyncSession, device_id: int, **kwargs) -> ChatThread:
    thread = ChatThread(
        device_id=device_id,
        title=kwargs.get("title", "Mast won't lift"),
    )
    session.add(thread)
    await session.commit()
    await session.refresh(thread)
    return thread


async def create_attachment(session: AsyncSession, **kwargs) -> Attachment:
    # Tests that access the file on disk must pass file_global_path=str(tmp_path / "...")
    attachment = Attachment(
        file_global_path=kwargs.get(
            "file_global_path",
            "/nonexistent/manual.pdf",
        ),
        original_filename=kwargs.get(
            "original_filename",
            "manual.pdf",
        ),
    )
    session.add(attachment)
    await session.commit()
    await session.refresh(attachment)
    return attachment


async def create_message(session: AsyncSession, thread_id: int, **kwargs) -> Message:
    message = Message(
        content=kwargs.get("content", "Test content"),
        thread_id=thread_id,
        sender=kwargs.get("sender", MessageSender.assistant),
    )
    session.add(message)
    await session.commit()
    await session.refresh(message)
    return message


async def create_chunk(session: AsyncSession, attachment_id: int, **kwargs) -> Chunk:
    chunk = Chunk(
        content=kwargs.get("content", "Fault code E-23 means hydraulic error."),
        embedding=kwargs.get("embedding", [0.0] * EMBEDDING_DIMENSIONS),
        extra_metadata=kwargs.get("extra_metadata", {"page": 5}),
        attachment_id=attachment_id,
    )
    session.add(chunk)
    await session.commit()
    await session.refresh(chunk)
    return chunk


async def link_attachment_device(
    session: AsyncSession, attachment_id: int, device_id: int
) -> AttachmentDevice:
    link = AttachmentDevice(attachment_id=attachment_id, device_id=device_id)
    session.add(link)
    await session.commit()
    return link
