"""
`app/models/` directory is meant to store SQLAlchemy models
that are persitent in the database.
"""

from .associations import AttachmentDevice, ChunkMessage
from .attachment import Attachment, IngestionStatus
from .category import Category
from .chat_thread import ChatThread
from .chunk import EMBEDDING_DIMENSIONS, Chunk
from .device import Device
from .message import Message, MessageSender

__all__ = [
    "AttachmentDevice",
    "ChunkMessage",
    "Attachment",
    "IngestionStatus",
    "Category",
    "ChatThread",
    "Chunk",
    "Device",
    "Message",
    "MessageSender",
    "EMBEDDING_DIMENSIONS",
]
