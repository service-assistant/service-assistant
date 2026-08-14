from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Unique attachment ID.")
    file_global_path: str = Field(description="Absolute path to the file on disk.")
    original_filename: str = Field(
        description="Original filename as uploaded by the user.",
        examples=["toyota_8fbe20_manual.pdf"],
    )
    created_at: datetime = Field(
        description="Timestamp when the attachment was uploaded."
    )
    updated_at: datetime = Field(description="Timestamp of the last update.")
