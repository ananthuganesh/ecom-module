"""OpenRouter image generation helpers for AI Media studio."""

from __future__ import annotations

import base64
import re
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "google/gemini-3-pro-image"
AI_UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "ai"
AI_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_DATA_URL_RE = re.compile(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", re.DOTALL)


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
            m = _DATA_URL_RE.match(url)
            if not m:
                raise ValueError("Malformed image data URL")
            mime, b64 = m.group(1), m.group(2)
            ext = {
                "image/png": ".png",
                "image/jpeg": ".jpg",
                "image/jpg": ".jpg",
                "image/webp": ".webp",
                "image/gif": ".gif",
            }.get(mime.lower(), ".png")
            return base64.b64decode(b64), ext

    raise ValueError("No image found in OpenRouter response")


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
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://urbanaana.com",
        "X-Title": "Urban Aana AI Media",
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(OPENROUTER_CHAT_URL, headers=headers, json=body)
        try:
            data = res.json()
        except Exception as exc:
            raise ValueError(f"OpenRouter returned non-JSON ({res.status_code})") from exc
        if res.status_code >= 400:
            detail = data.get("error", {}).get("message") if isinstance(data, dict) else None
            raise ValueError(detail or f"OpenRouter error {res.status_code}")
        raw, ext = extract_image_from_response(data)
        return raw, ext, data
