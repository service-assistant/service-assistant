"""
`app/schemas/` directory stores Pydantic request and response schemas.
"""

from .attachment import AttachmentRead
from .brand import BrandCreate, BrandRead, BrandUpdate
from .chat_thread import ChatThreadRead, ThreadCreate
from .chunk import ChunkRead
from .device import DeviceCreate, DeviceRead, DeviceUpdate
from .device_type import DeviceTypeCreate, DeviceTypeRead, DeviceTypeUpdate
from .message import MessageCreate, MessageRead, TranscriptResponse

__all__ = [
    "AttachmentRead",
    "BrandCreate",
    "BrandRead",
    "BrandUpdate",
    "ChatThreadRead",
    "ChunkRead",
    "DeviceCreate",
    "DeviceRead",
    "DeviceUpdate",
    "DeviceTypeCreate",
    "DeviceTypeRead",
    "DeviceTypeUpdate",
    "MessageCreate",
    "MessageRead",
    "ThreadCreate",
    "TranscriptResponse",
]
