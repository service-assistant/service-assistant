from datetime import datetime, timezone
from uuid import uuid4

from app.models import (
    EMBEDDING_DIMENSIONS,
    AppRole,
    Attachment,
    AttachmentDevice,
    Category,
    ChatThread,
    Chunk,
    Device,
    Message,
    MessageSender,
    Organization,
    OrgRole,
    User,
)
from app.security import hash_password
from sqlalchemy.ext.asyncio import AsyncSession

# Seeded once by the `seed_system_and_default_org` migration and never
# truncated by `clean_db`, so these ids are stable across the whole test session.
SYSTEM_ORGANIZATION_ID = 1
DEFAULT_ORGANIZATION_ID = 2


def make_attachment(path: str = "/nonexistent/manual.pdf", **kwargs) -> Attachment:
    defaults = dict(
        id=1,
        organization_id=DEFAULT_ORGANIZATION_ID,
        file_global_path=path,
        original_filename="manual.pdf",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return Attachment(**defaults)


def make_category(**kwargs) -> Category:
    defaults = dict(
        id=1,
        organization_id=DEFAULT_ORGANIZATION_ID,
        name="Toyota",
        image_url=None,
        parent_id=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return Category(**defaults)


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
        category_id=1,
        name="Toyota 8FBE20",
        model_serial_code=None,
        image_url=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    return Device(**defaults)


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


async def create_category(session: AsyncSession, **kwargs) -> Category:
    category = Category(
        organization_id=kwargs.get("organization_id", DEFAULT_ORGANIZATION_ID),
        name=kwargs.get("name", "Toyota"),
        image_url=kwargs.get("image_url"),
        parent_id=kwargs.get("parent_id"),
    )
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return category


async def create_device(session: AsyncSession, category_id: int, **kwargs) -> Device:
    device = Device(
        category_id=category_id,
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
    # Any `ingest_*` field (e.g. ingest_status=IngestionStatus.failed) can be
    # passed through to seed a particular ingestion state.
    defaults = dict(
        organization_id=DEFAULT_ORGANIZATION_ID,
        file_global_path="/nonexistent/manual.pdf",
        original_filename="manual.pdf",
    )
    defaults.update(kwargs)
    attachment = Attachment(**defaults)
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


async def create_organization(session: AsyncSession, **kwargs) -> Organization:
    # `organizations` isn't truncated between tests (it holds the persistent
    # system/default seed rows), so default to a unique slug per call.
    organization = Organization(
        name=kwargs.get("name", "Acme Forklifts"),
        slug=kwargs.get("slug", f"org-{uuid4().hex[:8]}"),
    )
    session.add(organization)
    await session.commit()
    await session.refresh(organization)
    return organization


async def create_user(
    session: AsyncSession,
    organization_id: int = DEFAULT_ORGANIZATION_ID,
    password: str = "correct-horse-battery-staple",
    **kwargs,
) -> User:
    user = User(
        organization_id=organization_id,
        username=kwargs.get("username", "technician"),
        password_hash=hash_password(password),
        app_role=kwargs.get("app_role", AppRole.user),
        org_role=kwargs.get("org_role", OrgRole.admin),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def link_attachment_device(
    session: AsyncSession, attachment_id: int, device_id: int
) -> AttachmentDevice:
    link = AttachmentDevice(attachment_id=attachment_id, device_id=device_id)
    session.add(link)
    await session.commit()
    return link
