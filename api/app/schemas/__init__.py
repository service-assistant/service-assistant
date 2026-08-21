"""
`app/schemas/` directory stores Pydantic request and response schemas.
"""

from .attachment import AttachmentRead
from .auth import (
    AdminLoginRequest,
    LoginRequest,
    LoginResponse,
    SessionResponse,
    UserCreate,
    UserRead,
    UserUpdate,
)
from .category import CategoryCreate, CategoryRead, CategoryTreeRead, CategoryUpdate
from .chat_thread import ChatThreadRead, ThreadCreate
from .chunk import ChunkRead
from .device import DeviceCreate, DeviceRead, DeviceUpdate
from .job import JobListRead, JobRead
from .message import MessageCreate, MessageRead, TranscriptDecision, TranscriptResponse
from .nameplate import (
    NameplateAttribute,
    NameplateData,
    NameplateDeviceCandidate,
    NameplateRecognitionResponse,
)
from .organization import (
    OrganizationCreate,
    OrganizationCreateResponse,
    OrganizationRead,
    OrganizationUpdate,
)
from .photo_context import PhotoContextResponse, PhotoObservation
from .tts import TtsRequest

__all__ = [
    "AttachmentRead",
    "AdminLoginRequest",
    "LoginRequest",
    "LoginResponse",
    "SessionResponse",
    "UserCreate",
    "UserRead",
    "UserUpdate",
    "CategoryCreate",
    "CategoryRead",
    "CategoryTreeRead",
    "CategoryUpdate",
    "ChatThreadRead",
    "ChunkRead",
    "DeviceCreate",
    "DeviceRead",
    "DeviceUpdate",
    "JobListRead",
    "JobRead",
    "MessageCreate",
    "MessageRead",
    "NameplateAttribute",
    "NameplateData",
    "NameplateDeviceCandidate",
    "NameplateRecognitionResponse",
    "OrganizationCreate",
    "OrganizationCreateResponse",
    "OrganizationRead",
    "OrganizationUpdate",
    "PhotoContextResponse",
    "PhotoObservation",
    "ThreadCreate",
    "TranscriptResponse",
    "TranscriptDecision",
    "TtsRequest",
]
