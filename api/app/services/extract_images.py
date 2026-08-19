import uuid
from pathlib import Path

import fitz
from pymupdf import Pixmap, csRGB


PNG_COLORSPACES = {"DeviceGray", "DeviceRGB"}
REGION_CONTAINMENT_TOLERANCE = 5.0
REGION_MINIMAL_ITEMS = 2


def normalize_for_png(pix: Pixmap) -> Pixmap | None:
    """Return a PNG-compatible pixmap, or None for a standalone image mask."""
    if pix.colorspace is None:
        return None

    if pix.colorspace.name not in PNG_COLORSPACES:
        return Pixmap(csRGB, pix)

    return pix


def select_maximal_regions(
    drawings: list[dict],
) -> list[dict]:
    """
    Select maximal regions from a list of drawings.
    """

    def strictly_contains(outer: fitz.Rect, inner: fitz.Rect) -> bool:
        return (
            outer.x0 <= inner.x0
            and outer.y0 <= inner.y0
            and outer.x1 >= inner.x1
            and outer.y1 >= inner.y1
            and outer != inner
        )

    def approximately_contains(
        outer: fitz.Rect,
        inner: fitz.Rect,
        tolerance: float = REGION_CONTAINMENT_TOLERANCE,
    ) -> bool:
        return (
            outer.x0 <= inner.x0 + tolerance
            and outer.y0 <= inner.y0 + tolerance
            and outer.x1 >= inner.x1 - tolerance
            and outer.y1 >= inner.y1 - tolerance
            and outer != inner
        )

    # Keep the original index so a drawing is never compared with itself.
    candidates = [
        (index, drawing)
        for index, drawing in enumerate(drawings)
        if any(
            index != other_index
            and len(other.get("items", [])) >= REGION_MINIMAL_ITEMS
            and strictly_contains(drawing["rect"], other["rect"])
            for other_index, other in enumerate(drawings)
        )
    ]

    # Remove candidates contained by another candidate, except when both
    # drawings contain less than REGION_MINIMAL_ITEMS.
    result = [
        drawing
        for index, drawing in candidates
        if not any(
            index != other_index
            and approximately_contains(other["rect"], drawing["rect"])
            and not (
                len(drawing.get("items", [])) < REGION_MINIMAL_ITEMS
                and len(other.get("items", [])) < REGION_MINIMAL_ITEMS
            )
            for other_index, other in candidates
        )
    ]

    # remove duplicates
    result = list({d["rect"]: d for d in result}.values())

    # Remove regions that contain another region from the remaining result.
    result = [
        drawing
        for drawing in result
        if not any(
            drawing != other and strictly_contains(drawing["rect"], other["rect"])
            for other in result
        )
    ]

    def expand_overlapping_regions(
        regions: list[dict],
    ) -> list[dict]:
        """
        Expand overlapping regions to create a single encompassing region.
        """
        regions = [dict(region) for region in regions]

        def overlaps(a: fitz.Rect, b: fitz.Rect) -> bool:
            return a.x0 < b.x1 and a.x1 > b.x0 and a.y0 < b.y1 and a.y1 > b.y0

        changed = True

        while changed:
            changed = False

            for i, region in enumerate(regions):
                current_rect = region["rect"]
                current_area = current_rect.width * current_rect.height

                overlapping_indices = []

                for j, other in enumerate(regions):
                    if i == j:
                        continue

                    other_rect = other["rect"]

                    if overlaps(current_rect, other_rect):
                        overlapping_indices.append(j)

                if not overlapping_indices:
                    continue

                largest_index = i
                largest_area = current_area

                for j in overlapping_indices:
                    rect = regions[j]["rect"]
                    area = rect.width * rect.height

                    if area > largest_area:
                        largest_index = j
                        largest_area = area

                if largest_index != i:
                    continue

                new_rect = fitz.Rect(current_rect)

                for j in overlapping_indices:
                    new_rect |= regions[j]["rect"]

                if new_rect != current_rect:
                    regions[i]["rect"] = new_rect
                    changed = True

        return regions

    return expand_overlapping_regions(result)


def save_drawing_region(
    page: fitz.Page,
    output_dir: Path,
    padding: float = 10.0,
) -> list[str]:
    """
    Save the maximal drawing regions of a page as images in the specified output directory.
    Returns a list of paths to the saved images.
    """
    maximal_regions = select_maximal_regions(page.get_drawings())
    output_dir.mkdir(parents=True, exist_ok=True)
    image_paths = []

    for region in maximal_regions:
        # skip icons and small drawings
        if (
            region["rect"].width < 50
            or region["rect"].height < 50
            or (region["rect"].width < 100 and region["rect"].height < 100)
        ):
            continue

        region_rect = fitz.Rect(region["rect"])

        region_rect.x0 -= padding
        region_rect.y0 -= padding
        region_rect.x1 += padding
        region_rect.y1 += padding

        region_rect &= page.rect

        pix = page.get_pixmap(
            matrix=fitz.Matrix(2, 2),
            clip=region_rect,
        )

        if pix.width <= 0 or pix.height <= 0:
            continue

        image_path = output_dir / f"{uuid.uuid4()}.png"
        pix.save(str(image_path))
        image_paths.append(str(image_path))

    return image_paths


def extract_page_images(
    doc: fitz.Document, page: fitz.Page, output_dir: Path
) -> list[str]:
    """
    Extract images from a page and save them to the specified output directory.
    Returns a list of paths to the saved images.
    """
    image_paths = []

    for img in page.get_images(full=True):
        xref = img[0]

        filename = f"{uuid.uuid4()}.png"
        image_path = output_dir / filename

        pix = normalize_for_png(Pixmap(doc, xref))
        if pix is None:
            continue

        if (
            pix.width <= 50
            or pix.height <= 50
            or (pix.width < 100 and pix.height < 100)
        ):
            continue

        output_dir.mkdir(parents=True, exist_ok=True)
        pix.save(str(image_path))
        image_paths.append(str(image_path))

    image_paths.extend(save_drawing_region(page, output_dir))

    return image_paths
