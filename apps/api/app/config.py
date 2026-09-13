from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

_CONFIG_FILE = Path(__file__).resolve()


def _env_file_candidates() -> tuple[Path, ...]:
    """Resolve .env for monorepo (.../apps/api/app) and Docker (/app/app)."""
    parents = _CONFIG_FILE.parents
    candidates: list[Path] = []
    # Package root: monorepo apps/api or Docker /app
    if len(parents) > 1:
        candidates.append(parents[1] / ".env")
    # Monorepo repo root: .../ecom-module/.env
    if len(parents) > 3:
        candidates.append(parents[3] / ".env")
    candidates.append(Path(".env"))
    # Dedupe while preserving order
    seen: set[str] = set()
    out: list[Path] = []
    for path in candidates:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        out.append(path)
    return tuple(out)


_ENV_FILES = tuple(str(path) for path in _env_file_candidates() if path.is_file())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILES or ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mongo_uri: str = "mongodb://127.0.0.1:27017/urbanaana"
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_expire_days: int = 7
    environment: str = "development"
    node_env: str = "development"
    allowed_origins: str = ""

    razorpay_live_api_key: str = ""
    razorpay_live_key_secret: str = ""
    razorpay_webhook_secret: str = ""

    aisensy_api_key: str = ""
    aisensy_project_id: str = ""
    aisensy_project_api_key: str = ""

    r2_bucket: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_endpoint: str = ""
    r2_public_url: str = ""
    r2_key_prefix: str = ""

    delhivery_api_token: str = ""
    delhivery_pickup_location: str = ""

    resend_api_key: str = ""
    resend_from: str = "Urban Aana <noreply@urbanaana.com>"

    ga4_property_id: str = ""
    ga4_credentials_json: str = ""
    ga4_credentials_file: str = ""
    ga4_enabled: bool = True

    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 1.0

    def is_production(self) -> bool:
        return (
            str(self.environment or "").lower() == "production"
            or str(self.node_env or "").lower() == "production"
        )

    def assert_production_secrets(self) -> None:
        """Fail closed for insecure production secrets."""
        if not self.is_production():
            return
        secret = str(self.jwt_secret or "")
        if not secret or secret == "dev-secret-change-in-production" or len(secret) < 32:
            raise RuntimeError(
                "JWT_SECRET must be set to a strong value (32+ chars) in production"
            )
        if not str(self.razorpay_webhook_secret or "").strip():
            raise RuntimeError("RAZORPAY_WEBHOOK_SECRET is required in production")

    @property
    def cors_origins(self) -> List[str] | None:
        if not self.allowed_origins.strip():
            if self.environment == "production" or self.node_env == "production":
                return []
            return None
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
