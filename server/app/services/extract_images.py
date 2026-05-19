from pathlib import Path
import uuid
import fitz
from pymupdf import pymupdf


def extract_page_images(doc, page, output_dir: Path) -> list[str]:
    image_paths = []

    for img in page.get_images(full=True):
        xref = img[0]

        filename = f"{uuid.uuid4()}.png"
        image_path = output_dir / filename

        pix = pymupdf.Pixmap(doc, xref)
        if pix.n - pix.alpha > 3:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)

        pix.save(str(image_path))
        pix = None

        image_paths.append(str(image_path))

    vector_images = save_drawing_region(page, output_dir)
    if vector_images is not None:
        image_paths.append(vector_images)

    return image_paths


def save_drawing_region(
    page,
    output_dir: Path,
    min_drawings: int = 50,
    min_drawing_size: int = 5,
) -> str | None:
    drawings = page.get_drawings()

    if len(drawings) < min_drawings:
        return None

    rects = [
        d["rect"]
        for d in drawings
        if d["rect"].width > min_drawing_size and d["rect"].height > min_drawing_size
    ]

    if not rects:
        return None

    combined_rect = rects[0]

    for r in rects[1:]:
        combined_rect |= r

    padding = 20

    combined_rect.x0 -= padding
    combined_rect.y0 -= padding
    combined_rect.x1 += padding
    combined_rect.y1 += padding

    matrix = fitz.Matrix(2, 2)

    pix = page.get_pixmap(
        matrix=matrix,
        clip=combined_rect,
    )

    filename = f"{uuid.uuid4()}.png"
    image_path = output_dir / filename

    pix.save(str(image_path))
    pix = None

    return str(image_path)
