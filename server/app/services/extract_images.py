from pathlib import Path
import uuid
import fitz
from pymupdf import Pixmap, csRGB


def extract_page_images(
    doc: fitz.Document, page: fitz.Page, output_dir: Path
) -> list[str]:
    image_paths = []

    for img in page.get_images(full=True):
        xref = img[0]

        filename = f"{uuid.uuid4()}.png"
        image_path = output_dir / filename

        pix = Pixmap(doc, xref)
        if pix.n - pix.alpha > 3:
            pix = Pixmap(csRGB, pix)

        output_dir.mkdir(parents=True, exist_ok=True)
        pix.save(str(image_path))
        image_paths.append(str(image_path))

    vector_images = save_drawing_region(page, output_dir)
    if vector_images is not None:
        image_paths.append(vector_images)

    return image_paths


def save_drawing_region(
    page: fitz.Page,
    output_dir: Path,
    min_drawings: int = 30,
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

    combined_rect = combined_rect & page.rect

    if combined_rect.width <= 0 or combined_rect.height <= 0:
        return None

    pix = page.get_pixmap(
        matrix=fitz.Matrix(2, 2),
        clip=combined_rect,
    )

    if pix.width <= 0 or pix.height <= 0:
        return None

    output_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}.png"
    image_path = output_dir / filename

    pix.save(str(image_path))
    return str(image_path)
