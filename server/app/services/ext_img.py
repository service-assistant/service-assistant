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

    output_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4()}.png"

    output_path = output_dir / filename

    pix.save(str(output_path))
    pix = None

    return str(output_path)


# doc = fitz.open("/home/madghos/service-assistant/server/app/services/LWE140, LWE160, LWE180, LWE200, LWE250 - podręcznik serwisowy EN.pdf")

# for page_index in range(30): # iterate over pdf pages
#     page = doc[page_index] # get the page

#     print(extract_page_images(doc, page, Path("/home/madghos/service-assistant/server/app/services")))
#     print(save_drawing_region(page, Path("/home/madghos/service-assistant/server/app/services")))
