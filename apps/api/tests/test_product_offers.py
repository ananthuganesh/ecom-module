from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.documents import Coupon
from app.main import create_app

PRODUCT = "6ab4efab899f998e16d88277"
OTHER = "6a659b4da15bf661a846c5f5"


async def _get(product_id: str) -> list[dict]:
    async with AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test") as c:
        res = await c.get(f"/api/coupons/product/{product_id}")
    assert res.status_code == 200
    return res.json()


@pytest.mark.usefixtures("db")
async def test_lists_only_opted_in_coupons_that_apply_to_the_product():
    await Coupon(code="SITEWIDE", discountValue=10, showOnProduct=True, badge="Most popular").insert()
    await Coupon(code="THISONE", kind="products", discountValue=50, maxDiscount=80, productIds=[PRODUCT], showOnProduct=True).insert()
    await Coupon(code="ELSEWHERE", kind="products", discountValue=20, productIds=[OTHER], showOnProduct=True).insert()
    await Coupon(code="PRIVATE", discountValue=30).insert()
    await Coupon(code="PAUSED", discountValue=5, showOnProduct=True, status="inactive").insert()
    await Coupon(code="OLD", discountValue=5, showOnProduct=True, expiryDate=datetime.utcnow() - timedelta(days=1)).insert()
    await Coupon(code="USEDUP", discountValue=5, showOnProduct=True, usageLimit=1, usedCount=1).insert()

    offers = await _get(PRODUCT)

    assert [o["code"] for o in offers] == ["SITEWIDE", "THISONE"]
    assert offers[0]["badge"] == "Most popular"
    # Cap, minimum order and usage stay out of the store.
    for key in ("maxDiscount", "minOrderAmount", "productIds", "usedCount"):
        assert key not in offers[1]


@pytest.mark.usefixtures("db")
async def test_buy_x_get_y_shows_on_its_buy_products():
    await Coupon(code="B2G1", kind="bxgy", buyQuantity=2, getQuantity=1, buyProductIds=[PRODUCT], showOnProduct=True).insert()

    assert [o["code"] for o in await _get(PRODUCT)] == ["B2G1"]
    assert await _get(OTHER) == []
