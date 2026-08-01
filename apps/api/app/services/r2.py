"""Cloudflare R2 (S3-compatible) media storage helpers."""

from __future__ import annotations

import mimetypes
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

from botocore.client import Config
from botocore.exceptions import ClientError
from fastapi import HTTPException

from app.config import get_settings

ALLOWED_FOLDERS = {"products", "ai"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".avi", ".mkv"}


def is_configured() -> bool:
    settings = get_settings()
    return bool(
        settings.r2_bucket
        and settings.r2_access_key_id
        and settings.r2_secret_access_key
        and settings.r2_endpoint
    )


def _key_prefix() -> str:
    return (get_settings().r2_key_prefix or "").strip().strip("/")


def _object_key(folder: str, name: str) -> str:
    prefix = _key_prefix()
    base = f"{folder}/{name.lstrip('/')}"
    return f"{prefix}/{base}" if prefix else base


def _folder_prefix(folder: str) -> str:
    prefix = _key_prefix()
    base = f"{folder}/"
    return f"{prefix}/{base}" if prefix else base


@lru_cache(maxsize=1)
def _client():
    import boto3

    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def _public_url(key: str) -> str:
    settings = get_settings()
    base = (settings.r2_public_url or "").rstrip("/")
    if not base:
        base = f"{settings.r2_endpoint.rstrip('/')}/{settings.r2_bucket}"
    return f"{base}/{key.lstrip('/')}"


def _file_type(name: str) -> str:
    mime_type, _ = mimetypes.guess_type(name)
    if (mime_type or "").startswith("image/"):
        return "image"
    suffix = Path(name).suffix.lower()
    if (mime_type or "").startswith("video/") or suffix in VIDEO_EXTENSIONS:
        return "video"
    return "file"


def _safe_name(filename: str | None, default_ext: str = ".jpg") -> str:
    ext = Path(filename or f"file{default_ext}").suffix.lower() or default_ext
    return f"{uuid4().hex}{ext}"


def upload_bytes(
    *,
    folder: str,
    data: bytes,
    filename: str | None = None,
    content_type: str | None = None,
) -> dict:
    if folder not in ALLOWED_FOLDERS:
        raise HTTPException(status_code=400, detail="folder must be products or ai")
    if not is_configured():
        raise HTTPException(status_code=503, detail="R2 is not configured")

    name = _safe_name(filename)
    key = _object_key(folder, name)
    ctype = content_type or mimetypes.guess_type(name)[0] or "application/octet-stream"
    settings = get_settings()
    try:
        _client().put_object(
            Bucket=settings.r2_bucket,
            Key=key,
            Body=data,
            ContentType=ctype,
        )
    except ClientError as exc:
        code = (exc.response or {}).get("Error", {}).get("Code") or "ClientError"
        raise HTTPException(status_code=502, detail=f"Failed to upload to R2 ({code})") from exc

    return {
        "key": key,
        "name": name,
        "url": _public_url(key),
        "size": len(data),
        "type": _file_type(name),
        "folder": folder,
        "contentType": ctype,
    }


def list_objects(folder: str = "all") -> list[dict]:
    if not is_configured():
        raise HTTPException(status_code=503, detail="R2 is not configured")
    if folder == "all":
        prefixes = list(ALLOWED_FOLDERS)
    elif folder in ALLOWED_FOLDERS:
        prefixes = [folder]
    else:
        raise HTTPException(status_code=400, detail="folder must be products, ai, or all")

    settings = get_settings()
    client = _client()
    files: list[dict] = []
    for folder_name in prefixes:
        token = None
        while True:
            kwargs = {"Bucket": settings.r2_bucket, "Prefix": _folder_prefix(folder_name)}
            if token:
                kwargs["ContinuationToken"] = token
            try:
                resp = client.list_objects_v2(**kwargs)
            except ClientError as exc:
                code = (exc.response or {}).get("Error", {}).get("Code") or "ClientError"
                raise HTTPException(status_code=502, detail=f"Failed to list R2 objects ({code})") from exc
            for item in resp.get("Contents") or []:
                key = item.get("Key") or ""
                name = Path(key).name
                if not name or key.endswith("/"):
                    continue
                modified = item.get("LastModified")
                files.append(
                    {
                        "name": name,
                        "url": _public_url(key),
                        "size": int(item.get("Size") or 0),
                        "type": _file_type(name),
                        "modifiedAt": modified.isoformat() if modified else None,
                        "folder": folder_name,
                    }
                )
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")

    return sorted(files, key=lambda row: row.get("modifiedAt") or "", reverse=True)


def delete_object(*, folder: str, name: str) -> dict:
    if folder not in ALLOWED_FOLDERS:
        raise HTTPException(status_code=400, detail="folder must be products or ai")
    if not name or Path(name).name != name or ".." in Path(name).parts:
        raise HTTPException(status_code=400, detail="Invalid file name")
    if not is_configured():
        raise HTTPException(status_code=503, detail="R2 is not configured")

    key = _object_key(folder, name)
    settings = get_settings()
    client = _client()
    try:
        client.head_object(Bucket=settings.r2_bucket, Key=key)
    except ClientError as exc:
        code = (exc.response or {}).get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            raise HTTPException(status_code=404, detail="File not found") from exc
        raise HTTPException(status_code=502, detail="Failed to access R2 object") from exc
    try:
        client.delete_object(Bucket=settings.r2_bucket, Key=key)
    except ClientError as exc:
        raise HTTPException(status_code=502, detail="Failed to delete R2 object") from exc
    return {"ok": True}
