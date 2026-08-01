from urllib.parse import urlparse

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import get_settings
from app.documents import ALL_DOCUMENTS

_client = None


def _db_name_from_uri(uri: str, fallback: str = "urbanaana") -> str:
    path = urlparse(uri).path.lstrip("/")
    return path.split("?")[0] if path else fallback


async def init_db(mongo_uri: str | None = None, client=None, db_name: str | None = None) -> None:
    """Initialize Beanie. Pass a mock `client` in tests."""
    global _client
    settings = get_settings()
    uri = mongo_uri or settings.mongo_uri
    name = db_name or _db_name_from_uri(uri)
    if client is not None:
        _client = client
    else:
        _client = AsyncIOMotorClient(uri)
    db = _client[name]
    await init_beanie(database=db, document_models=ALL_DOCUMENTS)


async def close_db() -> None:
    global _client
    if _client is not None:
        close = getattr(_client, "close", None)
        if callable(close):
            close()
        _client = None
