from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.documents import Pricing, Product
from app.main import create_app


@pytest.mark.usefixtures("db")
async def test_suggestions_carry_sale_and_mrp_for_cards():
    await Product(productName="Mandala Tee", slug="mandala", pricing=Pricing(sellingPrice=999, mrp=1499)).insert()
    await Product(productName="Mandala Draft", slug="mandala-draft", status="draft").insert()
    app = create_app(with_lifespan=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/products/search/suggestions", params={"q": "mandala"})
    assert res.status_code == 200
    rows = res.json()
    assert [r["slug"] for r in rows] == ["mandala"]
    assert rows[0]["price"] == 999
    assert rows[0]["pricing"] == {"sellingPrice": 999, "mrp": 1499}
