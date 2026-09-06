"""OpenRouter image generation helpers for AI Media studio."""

from __future__ import annotations

import base64
import re
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images"
DEFAULT_MODEL = "google/gemini-3-pro-image"
IMAGE_MODEL = "openai/gpt-5.4-image-2"
AI_UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "ai"
AI_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ASPECT_RATIOS = frozenset(
    {"1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9", "auto"}
)
QUALITIES = frozenset({"auto", "low", "medium", "high"})
BACKGROUNDS = frozenset({"auto", "opaque"})

MIME_TO_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

_DATA_URL_RE = re.compile(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", re.DOTALL)


def _headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://urbanaana.com",
        "X-Title": "Urban Aana AI Studio",
    }


def _ext_for_mime(mime: str) -> str:
    return MIME_TO_EXT.get((mime or "").split(";")[0].strip().lower(), ".png")


def _bytes_from_data_url(url: str) -> tuple[bytes, str]:
    m = _DATA_URL_RE.match(url)
    if not m:
        raise ValueError("Malformed image data URL")
    mime, b64 = m.group(1), m.group(2)
    return base64.b64decode(b64), _ext_for_mime(mime)


def extract_image_from_response(payload: dict[str, Any]) -> tuple[bytes, str]:
    """
    Pull first generated image from OpenRouter chat completion.
    Returns (raw_bytes, extension_with_dot) e.g. (b'...', '.png').
    """
    if not isinstance(payload, dict):
        raise ValueError("Invalid OpenRouter response")

    choices = payload.get("choices") or []
    if not choices:
        raise ValueError("No choices in OpenRouter response")

    message = (choices[0] or {}).get("message") or {}
    candidates: list[str] = []

    for img in message.get("images") or []:
        if not isinstance(img, dict):
            continue
        url = (img.get("image_url") or {}).get("url") or img.get("url")
        if isinstance(url, str) and url.strip():
            candidates.append(url.strip())

    content = message.get("content")
    if isinstance(content, str) and content.startswith("data:image/"):
        candidates.append(content)
    elif isinstance(content, list):
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") in ("image_url", "output_image"):
                url = (part.get("image_url") or {}).get("url") or part.get("url")
                if isinstance(url, str) and url.strip():
                    candidates.append(url.strip())
            elif part.get("type") == "text" and isinstance(part.get("text"), str):
                text = part["text"].strip()
                if text.startswith("data:image/"):
                    candidates.append(text)

    for url in candidates:
        if url.startswith("data:image/"):
            return _bytes_from_data_url(url)

    raise ValueError("No image found in OpenRouter response")


def extract_images_from_image_api(payload: dict[str, Any]) -> list[tuple[bytes, str]]:
    """Pull generated images from OpenRouter Image API (`POST /api/v1/images`)."""
    if not isinstance(payload, dict):
        raise ValueError("Invalid OpenRouter image response")
    items = payload.get("data")
    if not isinstance(items, list) or not items:
        raise ValueError("No images in OpenRouter response")

    out: list[tuple[bytes, str]] = []
    pending_urls: list[tuple[str, str]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        media_type = str(item.get("media_type") or "image/png")
        ext = _ext_for_mime(media_type)
        b64 = item.get("b64_json")
        if isinstance(b64, str) and b64.strip():
            out.append((base64.b64decode(b64), ext))
            continue
        url = item.get("url")
        if isinstance(url, str) and url.strip().startswith("data:image/"):
            out.append(_bytes_from_data_url(url.strip()))
            continue
        if isinstance(url, str) and url.strip().startswith(("http://", "https://")):
            pending_urls.append((url.strip(), ext))

    if out:
        return out
    if pending_urls:
        raise ValueError("Image URL-only responses must be fetched by the caller")
    raise ValueError("No image found in OpenRouter image response")


def save_image(raw: bytes, ext: str = ".png", *, folder: str = "ai") -> str:
    if not ext.startswith("."):
        ext = f".{ext}"
    from app.services import r2 as r2_svc

    if r2_svc.is_configured():
        result = r2_svc.upload_bytes(
            folder=folder,
            data=raw,
            filename=f"out{ext}",
            content_type={
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".webp": "image/webp",
                ".gif": "image/gif",
            }.get(ext.lower(), "image/png"),
        )
        return result["url"]

    target_dir = AI_UPLOAD_DIR if folder == "ai" else AI_UPLOAD_DIR.parent / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uuid4().hex}{ext}"
    dest = target_dir / name
    dest.write_bytes(raw)
    return f"/uploads/{folder}/{name}"


def save_ai_image(raw: bytes, ext: str = ".png") -> str:
    return save_image(raw, ext, folder="ai")


def file_to_data_url(path: Path) -> str:
    raw = path.read_bytes()
    ext = path.suffix.lower()
    mime = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "image/jpeg")
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{b64}"


def build_user_content(prompt: str, image_data_urls: list[str]) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for url in image_data_urls:
        content.append({"type": "image_url", "image_url": {"url": url}})
    return content


async def generate_product_image(
    *,
    api_key: str,
    model: str,
    prompt: str,
    image_data_urls: list[str],
    timeout: float = 180.0,
) -> tuple[bytes, str, dict[str, Any]]:
    if not api_key:
        raise ValueError("OpenRouter API key is required")
    if not prompt.strip():
        raise ValueError("Prompt is required")
    if not image_data_urls:
        raise ValueError("At least one reference image is required")

    body = {
        "model": model or DEFAULT_MODEL,
        "messages": [
            {
                "role": "user",
                "content": build_user_content(prompt.strip(), image_data_urls),
            }
        ],
        "modalities": ["image", "text"],
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(OPENROUTER_CHAT_URL, headers=_headers(api_key), json=body)
        try:
            data = res.json()
        except Exception as exc:
            raise ValueError(f"OpenRouter returned non-JSON ({res.status_code})") from exc
        if res.status_code >= 400:
            detail = data.get("error", {}).get("message") if isinstance(data, dict) else None
            raise ValueError(detail or f"OpenRouter error {res.status_code}")
        raw, ext = extract_image_from_response(data)
        return raw, ext, data


def _openrouter_error_message(status_code: int, data: Any) -> str:
    if isinstance(data, dict):
        err = data.get("error")
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])
        if isinstance(err, str) and err.strip():
            return err.strip()
    return f"OpenRouter error {status_code}"


async def generate_images(
    *,
    api_key: str,
    prompt: str,
    model: str = IMAGE_MODEL,
    aspect_ratio: str = "3:4",
    quality: str = "high",
    background: str = "auto",
    n: int = 1,
    image_data_urls: list[str] | None = None,
    timeout: float = 180.0,
) -> tuple[list[tuple[bytes, str]], dict[str, Any]]:
    """Generate images via OpenRouter Image API (`openai/gpt-5.4-image-2`)."""
    if not api_key:
        raise ValueError("OpenRouter API key is required")
    text = (prompt or "").strip()
    if not text:
        raise ValueError("Prompt is required")

    ratio = (aspect_ratio or "3:4").strip() or "3:4"
    if ratio not in ASPECT_RATIOS:
        raise ValueError("Unsupported aspect ratio")
    q = (quality or "high").strip() or "high"
    if q not in QUALITIES:
        raise ValueError("Unsupported quality")
    bg = (background or "auto").strip() or "auto"
    if bg not in BACKGROUNDS:
        raise ValueError("Unsupported background")
    count = int(n or 1)
    if count < 1 or count > 10:
        raise ValueError("n must be between 1 and 10")

    refs = [u for u in (image_data_urls or []) if isinstance(u, str) and u.strip()]
    if len(refs) > 16:
        raise ValueError("At most 16 reference images are allowed")

    body: dict[str, Any] = {
        "model": (model or IMAGE_MODEL).strip() or IMAGE_MODEL,
        "prompt": text,
        "n": count,
        "aspect_ratio": ratio,
        "quality": q,
        "background": bg,
    }
    if refs:
        body["input_references"] = [
            {"type": "image_url", "image_url": {"url": url}} for url in refs
        ]

    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(OPENROUTER_IMAGES_URL, headers=_headers(api_key), json=body)
        try:
            data = res.json()
        except Exception as exc:
            raise ValueError(f"OpenRouter returned non-JSON ({res.status_code})") from exc
        if res.status_code >= 400:
            raise ValueError(_openrouter_error_message(res.status_code, data))
        try:
            images = extract_images_from_image_api(data)
        except ValueError as exc:
            if "URL-only" not in str(exc):
                raise
            images = await _fetch_image_urls(client, data)
        if not images:
            raise ValueError("No image found in OpenRouter image response")
        return images, data


async def _fetch_image_urls(
    client: httpx.AsyncClient, payload: dict[str, Any]
) -> list[tuple[bytes, str]]:
    items = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return []
    out: list[tuple[bytes, str]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        url = item.get("url")
        if not isinstance(url, str) or not url.strip().startswith(("http://", "https://")):
            continue
        res = await client.get(url.strip())
        res.raise_for_status()
        mime = (res.headers.get("content-type") or item.get("media_type") or "image/png")
        out.append((res.content, _ext_for_mime(str(mime))))
    return out
