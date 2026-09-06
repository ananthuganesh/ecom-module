from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import OperationFailure

from app.config import get_settings
from app.documents import ALL_DOCUMENTS

logger = logging.getLogger(__name__)

_client = None
_db_name: str | None = None

# Keep one live socket so Atlas TLS handshakes are not done on every idle request.
# Fail a bit faster than PyMongo's 20s connect default when a handshake stalls.
MONGO_CLIENT_KWARGS = {
    "retryReads": True,
    "retryWrites": True,
    "minPoolSize": 1,
    "connectTimeoutMS": 10_000,
    "serverSelectionTimeoutMS": 15_000,
}

_INDEX_NAME_RE = re.compile(r'name:\s*"([^"]+)"')


def _db_name_from_uri(uri: str, fallback: str = "urbanaana") -> str:
    path = urlparse(uri).path.lstrip("/")
    return path.split("?")[0] if path else fallback


def _wanted_index_flags(index_model) -> dict:
    doc = getattr(index_model, "document", None) or {}
    return {
        "unique": bool(doc.get("unique")),
        "sparse": bool(doc.get("sparse")),
    }


def _index_name(index_model) -> str | None:
    doc = getattr(index_model, "document", None) or {}
    name = doc.get("name")
    if name:
        return str(name)
    key = doc.get("key")
    if not key:
        return None
    parts = []
    items = key.items() if hasattr(key, "items") else key
    for field, direction in items:
        parts.append(f"{field}_{direction}")
    return "_".join(parts) if parts else None


async def _drop_conflicting_indexes(db) -> list[str]:
    """Drop same-name indexes whose unique/sparse flags differ from Beanie models."""
    dropped: list[str] = []
    for model in ALL_DOCUMENTS:
        settings = getattr(model, "Settings", None)
        if settings is None:
            continue
        coll_name = getattr(settings, "name", None)
        wanted_indexes = getattr(settings, "indexes", None) or []
        if not coll_name or not wanted_indexes:
            continue

        coll = db[coll_name]
        try:
            existing = {}
            async for ix in coll.list_indexes():
                existing[ix["name"]] = ix
        except Exception:
            # Collection may not exist yet.
            continue

        for index_model in wanted_indexes:
            name = _index_name(index_model)
            if not name or name not in existing:
                continue
            wanted = _wanted_index_flags(index_model)
            have = existing[name]
            have_flags = {
                "unique": bool(have.get("unique")),
                "sparse": bool(have.get("sparse")),
            }
            if have_flags != wanted:
                await coll.drop_index(name)
                dropped.append(f"{coll_name}.{name}")
                logger.warning(
                    "Dropped conflicting index %s.%s (had %s, want %s)",
                    coll_name,
                    name,
                    have_flags,
                    wanted,
                )
    return dropped


async def init_db(mongo_uri: str | None = None, client=None, db_name: str | None = None) -> None:
    """Initialize Beanie. Pass a mock `client` in tests."""
    global _client, _db_name
    settings = get_settings()
    uri = mongo_uri or settings.mongo_uri
    name = db_name or _db_name_from_uri(uri)
    _db_name = name
    if client is not None:
        _client = client
    else:
        _client = AsyncIOMotorClient(uri, **MONGO_CLIENT_KWARGS)
    db = _client[name]

    # Avoid startup crash when Atlas already has same-name indexes with different options
    # (e.g. unique slug_1 vs sparse slug_1).
    if client is None:
        try:
            await _drop_conflicting_indexes(db)
        except Exception:
            logger.exception("Index reconcile failed; continuing to init_beanie")

    try:
        await init_beanie(database=db, document_models=ALL_DOCUMENTS)
    except OperationFailure as exc:
        # Last-resort: drop the named conflicting index from the error and retry once.
        if getattr(exc, "code", None) != 86:
            raise
        names = _INDEX_NAME_RE.findall(str(exc))
        if not names:
            raise
        index_name = names[0]
        logger.warning("Retrying init_beanie after IndexKeySpecsConflict on %s", index_name)
        for model in ALL_DOCUMENTS:
            settings = getattr(model, "Settings", None)
            coll_name = getattr(settings, "name", None) if settings else None
            if not coll_name:
                continue
            try:
                await db[coll_name].drop_index(index_name)
            except Exception:
                pass
        await init_beanie(database=db, document_models=ALL_DOCUMENTS)


def get_db():
    """Return the active Motor database, or None if not initialized."""
    if _client is None or not _db_name:
        return None
    return _client[_db_name]


async def close_db() -> None:
    global _client, _db_name
    if _client is not None:
        close = getattr(_client, "close", None)
        if callable(close):
            close()
        _client = None
    _db_name = None
