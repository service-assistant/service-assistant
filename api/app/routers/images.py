import mimetypes

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from ..config import Settings, get_settings
from ..dependencies.entities import AttachmentDependency

router = APIRouter()


@router.get(
    "/{attachment_id}/{filename}",
    response_class=FileResponse,
    summary="Get an extracted page image by attachment and filename",
    description=(
        "`attachment_id` and `filename` should be taken from `chunk.attachment_id` "
        "and `chunk.metadata.images[]` respectively. Scoped to the caller's organization "
        "via the attachment's ownership."
    ),
    responses={
        status.HTTP_200_OK: {"description": "File stream returned successfully"},
        status.HTTP_404_NOT_FOUND: {"description": "Image file not found on disk"},
    },
)
def get_image(
    attachment: AttachmentDependency,
    filename: str,
    settings: Settings = Depends(get_settings),
):
    allowed_dir = (settings.attachments_dir / "images" / str(attachment.id)).resolve()
    file_path = (allowed_dir / filename).resolve()

    if not file_path.is_relative_to(allowed_dir):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk"
        )

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk"
        )

    media_type, _ = mimetypes.guess_type(str(file_path))

    return FileResponse(
        path=file_path, filename=file_path.name, media_type=media_type or "image/png"
    )
