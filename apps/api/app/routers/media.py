import mimetypes
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from app.deps import AdminUser
from app.documents import MediaAsset
from app.services import r2 as r2_svc

router = APIRouter(prefix="/api/admin/media", tags=["media"])

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"
UPLOAD_FOLDERS = {
    "products": UPLOAD_ROOT / "products",
    "ai": UPLOAD_ROOT / "ai",
}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".avi", ".mkv"}


def _folders(folder: str) -> list[tuple[str, Path]]:
    if folder == "all":
        return list(UPLOAD_FOLDERS.items())
    if folder in UPLOAD_FOLDERS:
        return [(folder, UPLOAD_FOLDERS[folder])]
    raise HTTPException(status_code=400, detail="folder must be products, ai, or all")


def _file_type(path: Path) -> str:
    mime_type, _ = mimetypes.guess_type(path.name)
    if (mime_type or "").startswith("image/"):
        return "image"
    if (mime_type or "").startswith("video/") or path.suffix.lower() in VIDEO_EXTENSIONS:
        return "video"
    return "file"


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
        raise HTTPException(status_code=400, detail="folder must be products or ai")
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


@router.get("")
@router.get("/")
async def list_media(_: AdminUser, folder: str = Query(default="all")):
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


@router.patch("/alt")
async def update_media_alt(body: dict, _: AdminUser):
    folder = str(body.get("folder") or "").strip()
    name = str(body.get("name") or "").strip()
    alt_text = str(body.get("altText") if body.get("altText") is not None else "").strip()
    if len(alt_text) > 500:
        raise HTTPException(status_code=400, detail="Alt text must be 500 characters or fewer")
    if folder not in UPLOAD_FOLDERS:
        raise HTTPException(status_code=400, detail="folder must be products or ai")
    if not name or Path(name).name != name or ".." in Path(name).parts:
        raise HTTPException(status_code=400, detail="Invalid file name")

    # Ensure file exists
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
        raise HTTPException(status_code=400, detail="path must be products/<name> or ai/<name>")
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
