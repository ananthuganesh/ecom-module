import asyncio
import mimetypes
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.deps import AdminUser
from app.documents import MediaAsset
from app.services import image_optimize as img_opt
from app.services import r2 as r2_svc

router = APIRouter(prefix="/api/admin/media", tags=["admin"])
public_router = APIRouter(prefix="/api/reels", tags=["reels"])

_MAX_IMAGE_BYTES = 25 * 1024 * 1024
_MAX_VIDEO_BYTES = 200 * 1024 * 1024
_SPOOL_CHUNK = 1024 * 1024

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"
UPLOAD_FOLDERS = {
    "products": UPLOAD_ROOT / "products",
    "ai": UPLOAD_ROOT / "ai",
    "reels": UPLOAD_ROOT / "reels",
    # Homepage hero slides, managed under Store Theme.
    "banner": UPLOAD_ROOT / "banner",
}
LIBRARY_FOLDERS = ("products", "ai")
VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".avi", ".mkv"}
VIDEO_MIME_PREFIXES = ("video/",)


def _folders(folder: str) -> list[tuple[str, Path]]:
    if folder == "all":
        return [(name, UPLOAD_FOLDERS[name]) for name in LIBRARY_FOLDERS]
    if folder in UPLOAD_FOLDERS:
        return [(folder, UPLOAD_FOLDERS[folder])]
    raise HTTPException(
        status_code=400, detail="folder must be products, ai, reels, banner, or all"
    )


def _file_type(path: Path) -> str:
    mime_type, _ = mimetypes.guess_type(path.name)
    if (mime_type or "").startswith("image/"):
        return "image"
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".bmp", ".ico"}:
        return "image"
    if (mime_type or "").startswith("video/") or suffix in VIDEO_EXTENSIONS:
        return "video"
    return "file"


def _is_video_upload(filename: str | None, content_type: str | None) -> bool:
    mime = (content_type or "").lower()
    if any(mime.startswith(prefix) for prefix in VIDEO_MIME_PREFIXES):
        return True
    suffix = Path(filename or "").suffix.lower()
    return suffix in VIDEO_EXTENSIONS


def _asset_key(folder: str, name: str) -> str:
    return f"{folder}/{name}"


def _serialize_file(folder: str, path: Path) -> dict:
    stat = path.stat()
    return {
        "name": path.name,
        "url": f"/uploads/{folder}/{path.name}",
        "size": stat.st_size,
        "type": _file_type(path),
        "modifiedAt": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        "folder": folder,
        "altText": "",
        "visible": True,
    }


def _resolve_file(folder: str, name: str) -> Path:
    if folder not in UPLOAD_FOLDERS:
        raise HTTPException(status_code=400, detail="folder must be products, ai, reels, or banner")
    if not name or Path(name).name != name or ".." in Path(name).parts:
        raise HTTPException(status_code=400, detail="Invalid file name")

    root = UPLOAD_FOLDERS[folder].resolve()
    candidate = (root / name).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid file path") from exc
    return candidate


async def _meta_map(keys: list[str]) -> dict[str, dict]:
    if not keys:
        return {}
    docs = await MediaAsset.find({"key": {"$in": keys}}).to_list()
    return {
        d.key: {
            "altText": d.altText or "",
            "visible": True if d.visible is None else bool(d.visible),
        }
        for d in docs
    }


async def _attach_meta(files: list[dict]) -> list[dict]:
    keys = [_asset_key(f["folder"], f["name"]) for f in files if f.get("folder") and f.get("name")]
    meta = await _meta_map(keys)
    for f in files:
        key = _asset_key(f.get("folder") or "", f.get("name") or "")
        info = meta.get(key) or {}
        f["altText"] = info.get("altText", f.get("altText") or "")
        # Default visible when no metadata row exists
        f["visible"] = info.get("visible", True) if key in meta else True
        f["key"] = key
    return files


async def _list_folder_files(folder: str) -> list[dict]:
    if r2_svc.is_configured():
        files = r2_svc.list_objects(folder)
    else:
        files = []
        for folder_name, root in _folders(folder):
            if not root.exists():
                continue
            files.extend(
                _serialize_file(folder_name, path)
                for path in root.iterdir()
                if path.is_file()
            )
        files = sorted(files, key=lambda item: item["modifiedAt"], reverse=True)
    return await _attach_meta(files)


async def _ensure_file_exists(folder: str, name: str) -> str | None:
    if r2_svc.is_configured():
        listed = r2_svc.list_objects(folder)
        match = next((f for f in listed if f.get("name") == name), None)
        if not match:
            raise HTTPException(status_code=404, detail="File not found")
        return match.get("url")
    path = _resolve_file(folder, name)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return f"/uploads/{folder}/{name}"


async def _upsert_media_meta(
    *,
    folder: str,
    name: str,
    url: str | None = None,
    alt_text: str | None = None,
    visible: bool | None = None,
) -> MediaAsset:
    key = _asset_key(folder, name)
    doc = await MediaAsset.find_one(MediaAsset.key == key)
    now = datetime.utcnow()
    if doc:
        if alt_text is not None:
            doc.altText = alt_text
        if visible is not None:
            doc.visible = bool(visible)
        if url is not None:
            doc.url = url
        doc.updatedAt = now
        await doc.save()
        return doc
    doc = MediaAsset(
        key=key,
        folder=folder,
        name=name,
        altText=alt_text or "",
        visible=True if visible is None else bool(visible),
        url=url,
        createdAt=now,
        updatedAt=now,
    )
    await doc.insert()
    return doc


async def _finish_reel_upload(
    *,
    folder: str,
    name: str,
    url: str,
    size: int,
    content_type: str,
) -> dict:
    try:
        await _upsert_media_meta(folder=folder, name=name, url=url, visible=True)
    except Exception:  # noqa: BLE001
        # File is already stored — don't fail the upload if metadata write fails.
        pass
    return {
        "url": url,
        "name": name,
        "folder": folder,
        "size": size,
        "contentType": content_type,
        "type": "video",
        "optimized": False,
        "visible": True,
        "altText": "",
    }


async def _spool_to_temp(upload: UploadFile, *, max_bytes: int) -> tuple[str, int]:
    """Write upload to a temp file in chunks (avoids loading 200MB into RAM)."""
    suffix = Path(upload.filename or "reel.mp4").suffix.lower() or ".mp4"
    fd, path = tempfile.mkstemp(prefix="ua-reel-", suffix=suffix)
    size = 0
    try:
        with os.fdopen(fd, "wb") as out:
            while True:
                chunk = await upload.read(_SPOOL_CHUNK)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(
                        status_code=400, detail="Video must be 200 MB or smaller"
                    )
                out.write(chunk)
        return path, size
    except Exception:
        try:
            os.unlink(path)
        except OSError:
            pass
        raise


@router.post("/upload")
async def upload_media(
    _: AdminUser,
    folder: str = Query(default="products"),
    file: UploadFile | None = File(default=None),
    image: UploadFile | None = File(default=None),
):
    """Upload into products, ai, or reels. Images → WebP; reels folder accepts video."""
    if folder not in UPLOAD_FOLDERS:
        raise HTTPException(status_code=400, detail="folder must be products, ai, reels, or banner")
    upload = file or image
    if not upload:
        raise HTTPException(status_code=422, detail="file or image is required")

    is_video = _is_video_upload(upload.filename, upload.content_type)

    if is_video:
        if folder != "reels":
            raise HTTPException(status_code=400, detail="Videos can only be uploaded to reels")
        content_type = (
            upload.content_type
            or mimetypes.guess_type(upload.filename or "")[0]
            or "video/mp4"
        )
        temp_path, size = await _spool_to_temp(upload, max_bytes=_MAX_VIDEO_BYTES)
        try:
            if r2_svc.is_configured():
                result = await asyncio.to_thread(
                    r2_svc.upload_file_path,
                    folder=folder,
                    path=temp_path,
                    filename=upload.filename,
                    content_type=content_type,
                )
                return await _finish_reel_upload(
                    folder=folder,
                    name=result.get("name") or "",
                    url=result["url"],
                    size=result.get("size") or size,
                    content_type=content_type,
                )
            ext = Path(upload.filename or "reel.mp4").suffix.lower() or ".mp4"
            name = r2_svc.safe_storage_name(upload.filename, default_ext=ext)
            dest_dir = UPLOAD_FOLDERS[folder]
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / name
            await asyncio.to_thread(shutil.copyfile, temp_path, dest)
            return await _finish_reel_upload(
                folder=folder,
                name=name,
                url=f"/uploads/{folder}/{name}",
                size=size,
                content_type=content_type,
            )
        finally:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    content = await upload.read()
    if len(content) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="File must be 25 MB or smaller")
    webp_bytes, webp_name, content_type = img_opt.optimize_image_to_webp(
        content,
        filename=upload.filename,
    )
    if r2_svc.is_configured():
        result = await asyncio.to_thread(
            r2_svc.upload_bytes,
            folder=folder,
            data=webp_bytes,
            filename=webp_name,
            content_type=content_type,
        )
        return {
            "url": result["url"],
            "name": result.get("name"),
            "folder": folder,
            "size": result.get("size") or len(webp_bytes),
            "contentType": content_type,
            "type": "image",
            "optimized": True,
            "format": "webp",
        }
    name = r2_svc.safe_storage_name(webp_name, default_ext=".webp")
    dest_dir = UPLOAD_FOLDERS[folder]
    dest_dir.mkdir(parents=True, exist_ok=True)
    (dest_dir / name).write_bytes(webp_bytes)
    return {
        "url": f"/uploads/{folder}/{name}",
        "name": name,
        "folder": folder,
        "size": len(webp_bytes),
        "contentType": content_type,
        "type": "image",
        "optimized": True,
        "format": "webp",
    }


@router.get("")
@router.get("/")
async def list_media(_: AdminUser, folder: str = Query(default="all")):
    return await _list_folder_files(folder)


@router.patch("/alt")
async def update_media_alt(body: dict, _: AdminUser):
    folder = str(body.get("folder") or "").strip()
    name = str(body.get("name") or "").strip()
    alt_text = str(body.get("altText") if body.get("altText") is not None else "").strip()
    if len(alt_text) > 500:
        raise HTTPException(status_code=400, detail="Alt text must be 500 characters or fewer")
    if folder not in UPLOAD_FOLDERS:
        raise HTTPException(status_code=400, detail="folder must be products, ai, reels, or banner")
    if not name or Path(name).name != name or ".." in Path(name).parts:
        raise HTTPException(status_code=400, detail="Invalid file name")

    url = await _ensure_file_exists(folder, name)
    doc = await _upsert_media_meta(
        folder=folder, name=name, url=url, alt_text=alt_text
    )
    return {
        "ok": True,
        "key": doc.key,
        "folder": folder,
        "name": name,
        "altText": doc.altText or "",
        "visible": True if doc.visible is None else bool(doc.visible),
        "url": url,
    }


@router.patch("/visible")
async def update_media_visible(body: dict, _: AdminUser):
    folder = str(body.get("folder") or "").strip()
    name = str(body.get("name") or "").strip()
    if "visible" not in body:
        raise HTTPException(status_code=400, detail="visible is required")
    visible = bool(body.get("visible"))
    if folder != "reels":
        raise HTTPException(status_code=400, detail="Visibility is only supported for reels")
    if not name or Path(name).name != name or ".." in Path(name).parts:
        raise HTTPException(status_code=400, detail="Invalid file name")

    url = await _ensure_file_exists(folder, name)
    doc = await _upsert_media_meta(
        folder=folder, name=name, url=url, visible=visible
    )
    return {
        "ok": True,
        "key": doc.key,
        "folder": folder,
        "name": name,
        "altText": doc.altText or "",
        "visible": bool(doc.visible),
        "url": url,
    }


@router.delete("")
@router.delete("/")
async def delete_media_path(_: AdminUser, path: str):
    parts = Path(path.lstrip("/")).parts
    if len(parts) != 2 or parts[0] not in UPLOAD_FOLDERS:
        raise HTTPException(
            status_code=400, detail="path must be products/<name>, ai/<name>, or reels/<name>"
        )
    return await _delete_file(parts[0], parts[1])


@router.delete("/{name}")
async def delete_media(_: AdminUser, name: str, folder: str = Query(default="products")):
    return await _delete_file(folder, name)


async def _delete_file(folder: str, name: str) -> dict:
    if r2_svc.is_configured():
        result = r2_svc.delete_object(folder=folder, name=name)
    else:
        path = _resolve_file(folder, name)
        if not path.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        path.unlink()
        result = {"ok": True}

    key = _asset_key(folder, name)
    doc = await MediaAsset.find_one(MediaAsset.key == key)
    if doc:
        await doc.delete()
    return result


@public_router.get("")
@public_router.get("/")
async def list_public_reels():
    """Storefront Product Showcase — only visible reels."""
    files = await _list_folder_files("reels")
    videos = [
        f
        for f in files
        if f.get("type") == "video"
        and f.get("url")
        and f.get("visible", True)
    ]
    return [
        {
            "id": f.get("name") or f.get("key"),
            "videoUrl": f.get("url"),
            "altText": (f.get("altText") or "").strip(),
            "name": f.get("name"),
            "modifiedAt": f.get("modifiedAt"),
        }
        for f in videos
    ]
