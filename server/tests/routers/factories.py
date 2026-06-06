from datetime import datetime, timezone

from app.models import (
    Attachment,
    Brand,
    Chunk,
    ChatThread,
    Device,
    DeviceType,
    Message,
    MessageSender,
)


def make_attachment(path: str = "/tmp/manual.pdf", **kwargs) -> Attachment:
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
        sender=MessageSender.system,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return Message(**defaults)
