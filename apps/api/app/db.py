from urllib.parse import urlparse

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import get_settings
from app.documents import ALL_DOCUMENTS

_client = None
_db_name: str | None = None


def _db_name_from_uri(uri: str, fallback: str = "urbanaana") -> str:
    path = urlparse(uri).path.lstrip("/")
    return path.split("?")[0] if path else fallback


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
        _client = AsyncIOMotorClient(uri)
    db = _client[name]
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
