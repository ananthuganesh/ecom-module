"""Unit tests for AiSensy Project API helpers."""

import pytest

from app.services.aisensy_project import (
    AiSensyProjectClient,
    is_duplicate_retailer_error,
    price_to_minor_units,
    retailer_id_for_variant,
)


def test_price_to_minor_units():
    assert price_to_minor_units(1) == "100"
    assert price_to_minor_units(5.99) == "599"
    assert price_to_minor_units(150) == "15000"
    assert price_to_minor_units(None) == "0"
    assert price_to_minor_units(-3) == "0"


def test_retailer_id_prefers_sku():
    assert (
        retailer_id_for_variant(
            product_id="p1",
            variant={"sku": "SKU-RED-M", "color": "Red"},
            index=0,
        )
        == "SKU-RED-M"
    )


def test_retailer_id_from_color_size():
    rid = retailer_id_for_variant(
        product_id="abc123",
        variant={"color": "Navy Blue", "size": "L"},
        index=1,
    )
    assert rid.startswith("abc123-")
    assert "Navy" in rid or "Navy-Blue" in rid
    assert rid.endswith("-L") or "-L" in rid


def test_retailer_id_without_variant():
    assert retailer_id_for_variant(product_id="p9", variant=None, index=0) == "p9-v0"


def test_is_duplicate_retailer_error():
    assert is_duplicate_retailer_error(
        {
            "ok": False,
            "error": "(#10800) Duplicate retailer_id when attempting to create a product..",
        }
    )
    assert is_duplicate_retailer_error(
        {
            "ok": False,
            "error": "failed",
            "response": {"message": "Duplicate retailer_id"},
        }
    )
    assert not is_duplicate_retailer_error({"ok": False, "error": "image missing"})
    assert not is_duplicate_retailer_error({"ok": True})


@pytest.mark.asyncio
async def test_create_product_treats_duplicate_as_existing():
    client = AiSensyProjectClient("proj", "pwd")

    async def fake_request(method, path, *, json=None):
        if path == "create-product":
            return {
                "ok": False,
                "status": 400,
                "error": "(#10800) Duplicate retailer_id when attempting to create a product..",
            }
        # update endpoints unavailable
        return {"ok": False, "status": 404, "error": "not found"}

    client._request = fake_request  # type: ignore[method-assign]
    result = await client.create_product({"retailer_id": "p1-S", "name": "Tee S"})
    assert result["ok"] is True
    assert result["alreadyExists"] is True


@pytest.mark.asyncio
async def test_create_product_prefers_update_on_duplicate():
    client = AiSensyProjectClient("proj", "pwd")

    async def fake_request(method, path, *, json=None):
        if path == "create-product":
            return {
                "ok": False,
                "error": "Duplicate retailer_id",
            }
        if path == "update-product":
            return {"ok": True, "response": {"updated": True}}
        return {"ok": False, "error": "skip"}

    client._request = fake_request  # type: ignore[method-assign]
    result = await client.create_product({"retailer_id": "p1-M", "name": "Tee M"})
    assert result["ok"] is True
    assert result["updated"] is True
    assert result["alreadyExists"] is True
