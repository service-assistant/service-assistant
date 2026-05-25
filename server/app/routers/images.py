from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse
import mimetypes
from pathlib import Path

router = APIRouter()


@router.get(
    "/{image_path:path}",
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
def get_image(image_path: str):
    file_path = Path(image_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk"
        )

    media_type, _ = mimetypes.guess_type(str(file_path))

    return FileResponse(
        path=file_path, filename=file_path.name, media_type=media_type or "image/png"
    )
