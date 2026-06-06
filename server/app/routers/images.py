import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from ..config import Settings, get_settings

router = APIRouter()


@router.get(
    "/{image_path:path}",
    response_class=FileResponse,
    summary="Get image by path",
    description=(
        "Requested path should be taken from `chunk.metadata.images[]`. "
        "This endpoint responds with the image file by using it's global path in file system."
    ),
    responses={
        status.HTTP_200_OK: {"description": "File stream returned successfully"},
        status.HTTP_404_NOT_FOUND: {"description": "Image file not found on disk"},
    },
)
def get_image(image_path: str, settings: Settings = Depends(get_settings)):
    allowed_dir = (settings.attachments_dir / "images").resolve()
    file_path = Path(image_path).resolve()

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
