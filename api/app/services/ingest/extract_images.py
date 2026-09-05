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
    REGION_MINIMAL_ITEMS: int = 2,
    REGION_CONTAINMENT_TOLERANCE: float = 5.0,
    MINIMAL_TOO_MANY_REGIONS: int = 10,
) -> list[dict]:
    """
    Select maximal regions from a list of drawings.
    """

    def remove_duplicate_drawings(
        drawings: list[dict],
    ) -> list[dict]:
        """
        Remove duplicate drawings based on their bounding boxes.
        Prefers drawings with more items when duplicates are found.
        """

        unique_drawings = []
        seen_rects = set()
        small_drawings = []
        for drawing in drawings:
            rect_tuple = (
                drawing["rect"].x0,
                drawing["rect"].y0,
                drawing["rect"].x1,
                drawing["rect"].y1,
            )
            if rect_tuple not in seen_rects:
                if len(drawing["items"]) < REGION_MINIMAL_ITEMS:
                    small_drawings.append(drawing)
                else:
                    seen_rects.add(rect_tuple)
                    unique_drawings.append(drawing)

        for drawing in small_drawings:
            rect_tuple = (
                drawing["rect"].x0,
                drawing["rect"].y0,
                drawing["rect"].x1,
                drawing["rect"].y1,
            )
            if rect_tuple not in seen_rects:
                seen_rects.add(rect_tuple)
                unique_drawings.append(drawing)

        return unique_drawings

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
        )

    def main_select_maximal_regions(
        drawings: list[dict],
        use_item_threshold: bool = True,
    ) -> list[dict]:
        candidates = [dict(drawing) for drawing in drawings]

        # remove drawings that are contained by another drawing
        total_drawings = len(candidates)
        i = 0
        while i < total_drawings:
            drawing = candidates[i]
            rect = drawing["rect"]

            j = 0
            while j < total_drawings:
                other = candidates[j]
                if i != j:
                    if (
                        use_item_threshold
                        and not (
                            len(other.get("items", [])) < REGION_MINIMAL_ITEMS
                            and len(drawing.get("items", [])) < REGION_MINIMAL_ITEMS
                        )
                    ) or not use_item_threshold:
                        if approximately_contains(other["rect"], rect):
                            candidates.pop(i)
                            total_drawings -= 1
                            i -= 1
                            break

                j += 1
            i += 1

        result = []
        for candidate in candidates:
            if any(
                candidate != other
                and strictly_contains(candidate["rect"], other["rect"])
                for other in drawings
            ):
                result.append(dict(candidate))

        return result

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

    unique_drawings = remove_duplicate_drawings(drawings)

    result = main_select_maximal_regions(unique_drawings)
    result = expand_overlapping_regions(result)

    if len(result) > MINIMAL_TOO_MANY_REGIONS:
        result = main_select_maximal_regions(result, use_item_threshold=False)

    return result


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
        if region["rect"].width * region["rect"].height < 50 * 50:
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

        filename = f"{uuid.uuid4()}.png"
        image_path = output_dir / filename
        pix.save(str(image_path))
        image_paths.append(filename)

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
        image_paths.append(filename)

    image_paths.extend(save_drawing_region(page, output_dir))

    return image_paths
