"""Optimize uploaded images for the web (WebP)."""

from __future__ import annotations

import io
from pathlib import Path

from fastapi import HTTPException

MAX_IMAGE_BYTES = 25 * 1024 * 1024  # 25 MB
# Keep enough resolution for PDP / zoom; only downscale very large camera dumps.
MAX_EDGE_PX = 3600
# Higher quality WebP — 80 was visibly soft on fashion product photography.
WEBP_QUALITY = 92
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def optimize_image_to_webp(
    data: bytes,
    *,
    filename: str | None = None,
) -> tuple[bytes, str, str]:
    """
    Validate size, convert to high-quality WebP.

    Returns (webp_bytes, safe_filename_stem_with_webp, content_type).
    """
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=400,
            detail="Image must be 25 MB or smaller",
        )

    ext = Path(filename or "image.jpg").suffix.lower() or ".jpg"
    if ext not in ALLOWED_IMAGE_EXTS:
        raise HTTPException(status_code=400, detail="Invalid image type")

    try:
        from PIL import Image, ImageOps
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="Image processing is unavailable (Pillow not installed)",
        ) from exc

    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid or corrupt image file") from exc

    has_alpha = img.mode in ("RGBA", "LA") or (
        img.mode == "P" and "transparency" in img.info
    )
    if has_alpha:
        img = img.convert("RGBA")
    elif img.mode != "RGB":
        img = img.convert("RGB")

    w, h = img.size
    longest = max(w, h)
    if longest > MAX_EDGE_PX:
        scale = MAX_EDGE_PX / float(longest)
        img = img.resize(
            (max(1, int(w * scale)), max(1, int(h * scale))),
            Image.Resampling.LANCZOS,
        )

    out = io.BytesIO()
    save_kwargs: dict = {
        "format": "WEBP",
        "quality": WEBP_QUALITY,
        "method": 4,
    }
    if has_alpha:
        # Keep transparency instead of flattening onto white.
        save_kwargs["lossless"] = False
    img.save(out, **save_kwargs)
    webp = out.getvalue()
    if not webp:
        raise HTTPException(status_code=500, detail="Failed to encode WebP")

    stem = Path(filename or "image").stem or "image"
    # Keep a short readable stem; storage layer usually regenerates uuid names
    safe_name = f"{stem}.webp"
    return webp, safe_name, "image/webp"
