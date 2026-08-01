import mimetypes
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.deps import AdminUser
from app.documents import MediaAsset
from app.services import image_optimize as img_opt
from app.services import r2 as r2_svc

router = APIRouter(prefix="/api/admin/media", tags=["admin"])
public_router = APIRouter(prefix="/api/reels", tags=["reels"])

_MAX_IMAGE_BYTES = 10 * 1024 * 1024
_MAX_VIDEO_BYTES = 80 * 1024 * 1024

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"
UPLOAD_FOLDERS = {
    "products": UPLOAD_ROOT / "products",
    "ai": UPLOAD_ROOT / "ai",
    "reels": UPLOAD_ROOT / "reels",
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
        status_code=400, detail="folder must be products, ai, reels, or all"
    )


def _file_type(path: Path) -> str:
    mime_type, _ = mimetypes.guess_type(path.name)
    if (mime_type or "").startswith("image/"):
        return "image"
    if (mime_type or "").startswith("video/") or path.suffix.lower() in VIDEO_EXTENSIONS:
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
    }


def _resolve_file(folder: str, name: str) -> Path:
    if folder not in UPLOAD_FOLDERS:
        raise HTTPException(status_code=400, detail="folder must be products, ai, or reels")
    if not name or Path(name).name != name or ".." in Path(name).parts:
        raise HTTPException(status_code=400, detail="Invalid file name")

    root = UPLOAD_FOLDERS[folder].resolve()
    candidate = (root / name).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid file path") from exc
    return candidate


async def _alt_map(keys: list[str]) -> dict[str, str]:
    if not keys:
        return {}
    docs = await MediaAsset.find({"key": {"$in": keys}}).to_list()
    return {d.key: (d.altText or "") for d in docs}


async def _attach_alt(files: list[dict]) -> list[dict]:
    keys = [_asset_key(f["folder"], f["name"]) for f in files if f.get("folder") and f.get("name")]
    alts = await _alt_map(keys)
    for f in files:
        key = _asset_key(f.get("folder") or "", f.get("name") or "")
        f["altText"] = alts.get(key, f.get("altText") or "")
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
    return await _attach_alt(files)


@router.post("/upload")
async def upload_media(
    _: AdminUser,
    folder: str = Query(default="products"),
    file: UploadFile | None = File(default=None),
    image: UploadFile | None = File(default=None),
):
    """Upload into products, ai, or reels. Images → WebP; reels folder accepts video."""
    if folder not in UPLOAD_FOLDERS:
        raise HTTPException(status_code=400, detail="folder must be products, ai, or reels")
    upload = file or image
    if not upload:
        raise HTTPException(status_code=422, detail="file or image is required")

    content = await upload.read()
    is_video = _is_video_upload(upload.filename, upload.content_type)

    if is_video:
        if folder != "reels":
            raise HTTPException(status_code=400, detail="Videos can only be uploaded to reels")
        if len(content) > _MAX_VIDEO_BYTES:
            raise HTTPException(status_code=400, detail="Video must be 80 MB or smaller")
        content_type = (
            upload.content_type
            or mimetypes.guess_type(upload.filename or "")[0]
            or "video/mp4"
        )
        if r2_svc.is_configured():
            result = r2_svc.upload_bytes(
                folder=folder,
                data=content,
                filename=upload.filename,
                content_type=content_type,
            )
            return {
                "url": result["url"],
                "name": result.get("name"),
                "folder": folder,
                "size": result.get("size") or len(content),
                "contentType": content_type,
                "type": "video",
                "optimized": False,
            }
        ext = Path(upload.filename or "reel.mp4").suffix.lower() or ".mp4"
        name = f"{uuid4().hex}{ext}"
        dest_dir = UPLOAD_FOLDERS[folder]
        dest_dir.mkdir(parents=True, exist_ok=True)
        (dest_dir / name).write_bytes(content)
        return {
            "url": f"/uploads/{folder}/{name}",
            "name": name,
            "folder": folder,
            "size": len(content),
            "contentType": content_type,
            "type": "video",
            "optimized": False,
        }

    if len(content) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="File must be 10 MB or smaller")
    webp_bytes, webp_name, content_type = img_opt.optimize_image_to_webp(
        content,
        filename=upload.filename,
    )
    if r2_svc.is_configured():
        result = r2_svc.upload_bytes(
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
    name = f"{uuid4().hex}.webp"
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
        raise HTTPException(status_code=400, detail="folder must be products, ai, or reels")
    if not name or Path(name).name != name or ".." in Path(name).parts:
        raise HTTPException(status_code=400, detail="Invalid file name")

    if r2_svc.is_configured():
        listed = r2_svc.list_objects(folder)
        if not any(f.get("name") == name for f in listed):
            raise HTTPException(status_code=404, detail="File not found")
        url = next((f.get("url") for f in listed if f.get("name") == name), None)
    else:
        path = _resolve_file(folder, name)
        if not path.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        url = f"/uploads/{folder}/{name}"

    key = _asset_key(folder, name)
    doc = await MediaAsset.find_one(MediaAsset.key == key)
    now = datetime.utcnow()
    if doc:
        doc.altText = alt_text
        doc.url = url
        doc.updatedAt = now
        await doc.save()
    else:
        doc = MediaAsset(
            key=key,
            folder=folder,
            name=name,
            altText=alt_text,
            url=url,
            createdAt=now,
            updatedAt=now,
        )
        await doc.insert()
    return {"ok": True, "key": key, "folder": folder, "name": name, "altText": alt_text, "url": url}


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
    """Storefront Street Reels — video URL + optional alt text."""
    files = await _list_folder_files("reels")
    videos = [f for f in files if f.get("type") == "video" and f.get("url")]
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
