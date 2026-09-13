from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.documents import Product
from app.main import create_app
from app.routers.products import _build_product_query


async def _product(name: str, **overrides) -> Product:
    defaults = {"productName": name, "status": "active", "totalStock": 5}
    product = Product(**{**defaults, **overrides})
    await product.insert()
    return product


async def _listed_names() -> list[str]:
    """Names in the order the storefront listing would return them."""
    rows = (
        await Product.find(_build_product_query())
        .sort([("sortOrder", 1), ("createdAt", -1)])
        .to_list()
    )
    return [p.productName for p in rows]


@pytest.mark.usefixtures("db")
async def test_manual_order_decides_the_listing():
    await _product("A", sortOrder=2)
    await _product("B", sortOrder=0)
    await _product("C", sortOrder=1)
    assert await _listed_names() == ["B", "C", "A"]


@pytest.mark.usefixtures("db")
async def test_unplaced_products_lead_the_list():
    """A new product should surface before the arranged ones, not sink below."""
    await _product("Arranged", sortOrder=0)
    await _product("Brand new")
    assert await _listed_names() == ["Brand new", "Arranged"]


@pytest.mark.usefixtures("db")
async def test_unplaced_products_fall_back_to_newest_first():
    from datetime import datetime, timedelta

    now = datetime.utcnow()
    await _product("Older", createdAt=now - timedelta(days=1))
    await _product("Newer", createdAt=now)
    assert await _listed_names() == ["Newer", "Older"]


@pytest.mark.usefixtures("db")
async def test_drafts_stay_out_of_the_listing():
    await _product("Live", sortOrder=1)
    await _product("Hidden", status="draft", sortOrder=0)
    assert await _listed_names() == ["Live"]


# ---------------------------------------------------------------- reorder endpoint


@pytest.fixture
async def client(db):
    app = create_app(with_lifespan=False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.usefixtures("db")
async def test_reorder_requires_admin(client):
    res = await client.put("/api/admin/products/reorder", json={"ids": ["x"]})
    assert res.status_code == 401


@pytest.mark.usefixtures("db")
async def test_reorder_assigns_positions_from_the_given_order():
    from app.routers.admin import reorder_products

    a = await _product("A")
    b = await _product("B")
    c = await _product("C")

    result = await reorder_products({"ids": [str(c.id), str(a.id), str(b.id)]}, None)
    assert result["ok"] is True
    assert result["ordered"] == 3
    assert await _listed_names() == ["C", "A", "B"]


@pytest.mark.usefixtures("db")
async def test_reorder_ignores_unknown_and_duplicate_ids():
    from bson import ObjectId

    from app.routers.admin import reorder_products

    a = await _product("A")
    b = await _product("B")
    missing = str(ObjectId())

    result = await reorder_products(
        {"ids": [str(b.id), str(b.id), missing, "not-an-id", str(a.id)]}, None
    )
    # b, missing, a were attempted; only the two real products matched.
    assert result["ordered"] == 2
    assert await _listed_names() == ["B", "A"]


@pytest.mark.usefixtures("db")
async def test_reorder_rejects_an_empty_list():
    from fastapi import HTTPException

    from app.routers.admin import reorder_products

    for body in ({}, {"ids": []}, {"ids": "nope"}):
        with pytest.raises(HTTPException) as exc:
            await reorder_products(body, None)
        assert exc.value.status_code == 400


@pytest.mark.usefixtures("db")
async def test_reorder_rejects_a_list_with_no_valid_ids():
    from fastapi import HTTPException

    from app.routers.admin import reorder_products

    with pytest.raises(HTTPException) as exc:
        await reorder_products({"ids": ["nope", ""]}, None)
    assert "No valid product ids" in str(exc.value.detail)
