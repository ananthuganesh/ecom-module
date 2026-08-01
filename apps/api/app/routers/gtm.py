"""Public GTM config for storefront injection (no secrets)."""

from fastapi import APIRouter

from app.config import get_settings

router = APIRouter(prefix="/api/gtm", tags=["gtm"])


def resolve_gtm_config() -> dict:
    """GTM container from server env only (GTM_ID / GTM_ENABLED)."""
    settings = get_settings()
    gtm_id = str(settings.gtm_id or "").strip().upper()
    if gtm_id and not gtm_id.startswith("GTM-"):
        gtm_id = ""
    enabled = bool(settings.gtm_enabled) and bool(gtm_id)
    return {"gtmId": gtm_id if enabled else "", "enabled": enabled}


@router.get("/config")
async def gtm_config():
    return resolve_gtm_config()
