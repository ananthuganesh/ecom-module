"""AiSensy Project API client (contacts, campaigns, catalog)."""

from __future__ import annotations

import re
from typing import Any

import httpx

BASE_URL = "https://apis.aisensy.com/project-apis/v1"
CATALOG_NAME_DEFAULT = "Urban Aana Store"


def price_to_minor_units(amount: float | int | None) -> str:
    """AiSensy expects price as minor units string (e.g. 5.99 → '599')."""
    try:
        value = float(amount or 0)
    except (TypeError, ValueError):
        value = 0.0
    if value < 0:
        value = 0.0
    return str(int(round(value * 100)))


def retailer_id_for_variant(*, product_id: str, variant: dict | None, index: int = 0) -> str:
    """Stable unique id per catalog item (one per variant)."""
    sku = str((variant or {}).get("sku") or "").strip()
    if sku:
        safe = re.sub(r"[^A-Za-z0-9._-]+", "-", sku)[:100]
        return safe or f"{product_id}-v{index}"
    color = str((variant or {}).get("color") or "").strip()
    size = str((variant or {}).get("size") or "").strip()
    custom = str((variant or {}).get("customValue") or "").strip()
    parts = [product_id]
    for part in (color, size, custom):
        if part:
            parts.append(re.sub(r"[^A-Za-z0-9._-]+", "-", part)[:40])
    if len(parts) == 1:
        parts.append(f"v{index}")
    return "-".join(parts)[:100]


class AiSensyProjectClient:
    def __init__(self, project_id: str, api_password: str, *, timeout: float = 45.0):
        self.project_id = str(project_id or "").strip()
        self.api_password = str(api_password or "").strip()
        self.timeout = timeout

    @property
    def configured(self) -> bool:
        return bool(self.project_id and self.api_password)

    def _headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-AiSensy-Project-API-Pwd": self.api_password,
        }

    def _url(self, path: str) -> str:
        path = path.lstrip("/")
        return f"{BASE_URL}/project/{self.project_id}/{path}"

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
    ) -> dict[str, Any]:
        if not self.configured:
            return {"ok": False, "skipped": True, "reason": "project_not_configured"}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.request(
                    method.upper(),
                    self._url(path),
                    headers=self._headers(),
                    json=json,
                )
                data: Any = {}
                if resp.content:
                    try:
                        data = resp.json()
                    except Exception:
                        data = {"raw": resp.text[:500]}
                if resp.status_code >= 400:
                    err = ""
                    if isinstance(data, dict):
                        err = str(data.get("message") or data.get("error") or data.get("name") or "")
                    if not err:
                        err = resp.text[:500] or f"HTTP {resp.status_code}"
                    return {
                        "ok": False,
                        "error": err[:500],
                        "status": resp.status_code,
                        "response": data,
                    }
                return {"ok": True, "response": data, "status": resp.status_code}
        except Exception as exc:
            return {"ok": False, "error": str(exc)[:500]}

    async def create_contact(self, *, name: str, mobile_number: str) -> dict[str, Any]:
        result = await self._request(
            "POST",
            "contact",
            json={
                "name": (name or "Customer")[:80],
                "mobile_number": mobile_number,
            },
        )
        # Idempotent: contact already exists in AiSensy
        if not result.get("ok") and result.get("status") == 409:
            return {
                "ok": True,
                "alreadyExists": True,
                "status": 409,
                "response": result.get("response"),
            }
        return result

    async def send_campaign(
        self,
        *,
        campaign_name: str,
        phone_number: str,
        name: str,
        template_params: list[str] | None = None,
        source: str | None = None,
        tags: list[str] | None = None,
        attributes: dict | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "campaign_name": campaign_name,
            "phone_number": phone_number,
            "name": (name or "Customer")[:80],
            "default_country_code": "91",
        }
        if template_params:
            payload["template_params"] = [str(p) for p in template_params]
        if source:
            payload["source"] = source
        if tags:
            payload["tags"] = tags
        if attributes:
            payload["attributes"] = {
                str(k): str(v) for k, v in attributes.items() if v is not None
            }
        return await self._request("POST", "campaign/api/send", json=payload)

    async def get_catalogues(self) -> dict[str, Any]:
        return await self._request("GET", "get-catalog")

    async def create_catalog(
        self,
        *,
        name: str = CATALOG_NAME_DEFAULT,
        default_image_url: str = "",
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "vertical": "commerce",
            "name": name,
            "product_count": 0,
            "feed_count": 1,
            "is_catalog_segment": False,
        }
        if default_image_url:
            body["default_image_url"] = default_image_url
            body["fallback_image_url"] = [default_image_url]
        return await self._request("POST", "create-catalog", json=body)

    async def create_product(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request("POST", "create-product", json=payload)

    async def sync_catalog(self) -> dict[str, Any]:
        return await self._request("GET", "sync-catalog")

    async def sync_catalog_products(self) -> dict[str, Any]:
        return await self._request("GET", "sync-catalog-products")

    async def ensure_catalog_id(
        self,
        *,
        preferred_id: str | None = None,
        catalog_name: str = CATALOG_NAME_DEFAULT,
        default_image_url: str = "",
    ) -> dict[str, Any]:
        """Return catalogueId, creating a commerce catalog when none exist."""
        listed = await self.get_catalogues()
        if not listed.get("ok"):
            return listed

        catalogues = []
        resp = listed.get("response") or {}
        if isinstance(resp, dict):
            catalogues = list(resp.get("catalogues") or [])

        active = [
            c
            for c in catalogues
            if isinstance(c, dict)
            and c.get("catalogueId")
            and not c.get("isDeleted")
            and c.get("isActive", True)
        ]

        if preferred_id:
            for c in active:
                if str(c.get("catalogueId")) == str(preferred_id):
                    return {
                        "ok": True,
                        "catalogId": str(preferred_id),
                        "created": False,
                        "catalogue": c,
                    }

        for c in active:
            if str(c.get("catalogueName") or "") == catalog_name:
                return {
                    "ok": True,
                    "catalogId": str(c["catalogueId"]),
                    "created": False,
                    "catalogue": c,
                }

        if active:
            c = active[0]
            return {
                "ok": True,
                "catalogId": str(c["catalogueId"]),
                "created": False,
                "catalogue": c,
            }

        created = await self.create_catalog(name=catalog_name, default_image_url=default_image_url)
        if not created.get("ok"):
            return created

        # Re-list to resolve Meta catalogueId
        listed2 = await self.get_catalogues()
        if listed2.get("ok"):
            resp2 = listed2.get("response") or {}
            catalogues2 = list((resp2 or {}).get("catalogues") or []) if isinstance(resp2, dict) else []
            for c in catalogues2:
                if (
                    isinstance(c, dict)
                    and c.get("catalogueId")
                    and not c.get("isDeleted")
                    and str(c.get("catalogueName") or "") == catalog_name
                ):
                    return {
                        "ok": True,
                        "catalogId": str(c["catalogueId"]),
                        "created": True,
                        "catalogue": c,
                    }
            for c in catalogues2:
                if isinstance(c, dict) and c.get("catalogueId") and not c.get("isDeleted"):
                    return {
                        "ok": True,
                        "catalogId": str(c["catalogueId"]),
                        "created": True,
                        "catalogue": c,
                    }

        # Some create responses embed catalogue
        body = created.get("response") or {}
        if isinstance(body, dict):
            cat = body.get("catalogue") or body
            cid = cat.get("catalogueId") if isinstance(cat, dict) else None
            if cid:
                return {"ok": True, "catalogId": str(cid), "created": True, "catalogue": cat}

        return {
            "ok": False,
            "error": "Catalog created but catalogueId not found in AiSensy response",
            "response": created.get("response"),
        }
