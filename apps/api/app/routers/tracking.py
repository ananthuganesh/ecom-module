"""Storefront pixel events mirrored to Meta's Conversions API.

The browser fires ViewContent / AddToCart / InitiateCheckout through the pixel
and posts the same event here with the same `event_id`, so Meta keeps one copy
and still counts the shoppers whose browsers block the pixel. Purchase is not
accepted: it goes to Meta from the verified payment path.
"""

from __future__ import annotations

from typing import Literal
from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator

from app.config import get_settings
from app.deps import OptionalUser
from app.services import conversions
from app.services.rate_limit import rate_limit_dependency

router = APIRouter(prefix="/api/tracking", tags=["tracking"])

MAX_ITEMS = 50


class MetaContent(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    quantity: int = Field(ge=1, le=1000)
    item_price: float = Field(ge=0, le=1_000_000)


class MetaCustomData(BaseModel):
    content_ids: list[str] = Field(min_length=1, max_length=MAX_ITEMS)
    contents: list[MetaContent] = Field(min_length=1, max_length=MAX_ITEMS)
    value: float = Field(ge=0, le=1_000_000)
    num_items: int | None = Field(default=None, ge=1, le=10_000)
    content_name: str | None = Field(default=None, max_length=200)

    @field_validator("content_ids")
    @classmethod
    def _ids(cls, ids: list[str]) -> list[str]:
        if any(not i or len(i) > 100 for i in ids):
            raise ValueError("invalid content id")
        return ids


class MetaEventBody(BaseModel):
    event_name: Literal["ViewContent", "AddToCart", "InitiateCheckout"]
    event_id: str = Field(pattern=r"^[A-Za-z0-9_.-]{8,120}$")
    event_source_url: str = Field(max_length=2000)
    custom_data: MetaCustomData


def _own_site(url: str) -> bool:
    """Only pages on our own storefront, so the endpoint can't report other sites."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    host = parsed.hostname.lower().removeprefix("www.")
    site = (urlparse(conversions.site_url()).hostname or "").lower().removeprefix("www.")
    if host == site:
        return True
    return not get_settings().is_production() and host in {"localhost", "127.0.0.1"}


@router.post("/meta", status_code=204)
async def mirror_meta_event(
    body: MetaEventBody,
    request: Request,
    user: OptionalUser,
    background: BackgroundTasks,
    _: None = Depends(rate_limit_dependency("meta-event", limit=120)),
):
    if not _own_site(body.event_source_url):
        raise HTTPException(status_code=400, detail="Unsupported event_source_url")
    # Sent after the response so a slow Graph API never holds up the shopper.
    background.add_task(
        conversions.send_browser_event,
        event_name=body.event_name,
        event_id=body.event_id,
        event_source_url=body.event_source_url,
        custom_data=body.custom_data.model_dump(exclude_none=True),
        request=request,
        user=user,
    )
    return Response(status_code=204)
