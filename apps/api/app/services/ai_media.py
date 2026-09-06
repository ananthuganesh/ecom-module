"""Shared AI Studio helpers: job runner, image URLs, publish to content."""

from __future__ import annotations

import base64
import mimetypes
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from bson import ObjectId

from app.documents import AiMediaJob, Product
from app.services.openrouter import (
    file_to_data_url,
    generate_images,
    generate_product_image,
    save_ai_image,
    save_image,
)


def product_image_urls(product) -> list[str]:
    urls: list[str] = []
    for thumb in product.thumbnails or []:
        if thumb:
            urls.append(str(thumb))
    for variant in product.variants or []:
        for img in variant.images or []:
            if img:
                urls.append(str(img))
    seen: set[str] = set()
    out: list[str] = []
    for url in urls:
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


async def url_to_data_url(url: str) -> str:
    value = str(url or "").strip()
    if not value:
        raise ValueError("Image URL is required")
    if value.startswith("data:image/"):
        return value
    if value.startswith("/uploads/"):
        path = Path(__file__).resolve().parents[2] / value.lstrip("/")
        if not path.is_file():
            raise ValueError(f"Local image not found: {value}")
        return file_to_data_url(path)

    parsed = urlparse(value)
    if parsed.scheme in {"http", "https"}:
        host = (parsed.hostname or "").lower()
        if not host or host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}:
            raise ValueError("Blocked image host")
        if host.endswith(".local") or host.endswith(".internal"):
            raise ValueError("Blocked image host")
        # Block private / link-local / metadata ranges (SSRF).
        import ipaddress

        try:
            ip = ipaddress.ip_address(host)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_reserved
                or ip.is_multicast
            ):
                raise ValueError("Blocked image host")
        except ValueError as exc:
            if "Blocked" in str(exc):
                raise
            # Hostname is not a literal IP — allow DNS names (R2/CDN) but disable redirects.
            pass

        async with httpx.AsyncClient(timeout=60.0, follow_redirects=False) as client:
            res = await client.get(value)
            if res.is_redirect:
                raise ValueError("Redirects are not allowed for image fetch")
            res.raise_for_status()
            mime = (res.headers.get("content-type") or "image/jpeg").split(";")[0].strip().lower()
            if not mime.startswith("image/"):
                guessed, _ = mimetypes.guess_type(parsed.path)
                mime = guessed or "image/jpeg"
            b64 = base64.b64encode(res.content).decode("ascii")
            return f"data:{mime};base64,{b64}"

    raise ValueError(f"Unsupported image URL: {value}")


async def build_generation_data_urls(reference_path: Path, product_urls: list[str]) -> list[str]:
    urls = [file_to_data_url(reference_path)]
    for item in product_urls:
        urls.append(await url_to_data_url(item))
    return urls


async def fetch_image_bytes(url: str) -> tuple[bytes, str]:
    data_url = await url_to_data_url(url)
    if not data_url.startswith("data:image/"):
        raise ValueError("Could not load image bytes")
    header, b64 = data_url.split(",", 1)
    mime = header.split(";")[0].replace("data:", "").strip().lower()
    ext = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(mime, ".png")
    return base64.b64decode(b64), ext


async def run_ai_media_generation(
    *,
    job_id: str,
    reference_path: str,
    product_urls: list[str],
    prompt: str,
    api_key: str,
    model: str,
) -> None:
    job = await AiMediaJob.get(ObjectId(job_id)) if ObjectId.is_valid(job_id) else None
    if not job:
        return

    job.status = "processing"
    job.updatedAt = datetime.utcnow()
    await job.save()

    ref = Path(reference_path)
    try:
        image_data_urls = await build_generation_data_urls(ref, product_urls)
        raw, ext, _ = await generate_product_image(
            api_key=api_key,
            model=model,
            prompt=prompt,
            image_data_urls=image_data_urls,
        )
        out_url = save_ai_image(raw, ext)
        job.outputUrl = out_url
        job.status = "succeeded"
        job.reviewStatus = "pending"
        job.error = None
    except Exception as exc:
        job.status = "failed"
        job.error = str(exc)[:500]
    finally:
        job.updatedAt = datetime.utcnow()
        await job.save()
        if ref.is_file():
            try:
                ref.unlink()
            except OSError:
                pass


async def run_studio_image_generation(
    *,
    job_id: str,
    reference_paths: list[str],
    prompt: str,
    api_key: str,
    model: str,
    aspect_ratio: str = "3:4",
    quality: str = "high",
    background: str = "auto",
    n: int = 1,
) -> None:
    job = await AiMediaJob.get(ObjectId(job_id)) if ObjectId.is_valid(job_id) else None
    if not job:
        return

    job.status = "processing"
    job.updatedAt = datetime.utcnow()
    await job.save()

    paths = [Path(p) for p in reference_paths if p]
    try:
        image_data_urls = [file_to_data_url(p) for p in paths if p.is_file()]
        images, _ = await generate_images(
            api_key=api_key,
            prompt=prompt,
            model=model,
            aspect_ratio=aspect_ratio,
            quality=quality,
            background=background,
            n=n,
            image_data_urls=image_data_urls,
        )
        urls = [save_ai_image(raw, ext) for raw, ext in images]
        job.outputUrl = urls[0] if urls else None
        job.outputUrls = urls
        job.status = "succeeded"
        job.reviewStatus = "pending"
        job.error = None
    except Exception as exc:
        job.status = "failed"
        job.error = str(exc)[:500]
    finally:
        job.updatedAt = datetime.utcnow()
        await job.save()
        for path in paths:
            if path.is_file():
                try:
                    path.unlink()
                except OSError:
                    pass


async def approve_job_to_content(
    job: AiMediaJob,
    *,
    product: Product,
    admin_id: Any | None = None,
    variant_color: str = "",
) -> dict[str, Any]:
    if job.status != "succeeded" or not job.outputUrl:
        raise ValueError("Successful job with output required")
    if (job.reviewStatus or "pending") == "approved":
        raise ValueError("Job is already approved")

    raw, ext = await fetch_image_bytes(job.outputUrl)
    published_url = save_image(raw, ext, folder="products")

    thumbs = list(product.thumbnails or [])
    if published_url not in thumbs:
        thumbs.insert(0, published_url)
    product.thumbnails = thumbs

    if product.variants:
        target = None
        if variant_color:
            target = next((v for v in product.variants if (v.color or "") == variant_color), None)
        target = target or product.variants[0]
        images = list(target.images or [])
        if published_url not in images:
            images.insert(0, published_url)
        target.images = images

    product.updatedAt = datetime.utcnow()
    await product.save()

    job.reviewStatus = "approved"
    job.publishedUrl = published_url
    job.productId = product.id
    job.approvedAt = datetime.utcnow()
    job.approvedBy = admin_id
    job.updatedAt = datetime.utcnow()
    await job.save()

    return {"publishedUrl": published_url, "job": job, "product": product}
