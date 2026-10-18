from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.documents import Order, OrderItem, Product
from app.main import create_app
from app.services import product_sales


@pytest.fixture(autouse=True)
def _clear_cache():
    product_sales._cache.clear()
    yield
    product_sales._cache.clear()


async def _product() -> Product:
    product = Product(productName="Mandala", slug="mandala")
    await product.insert()
    return product


async def _order(product: Product, qty: int, *, days_ago: int = 1, status="order placed", paid=True, **extra):
    order = Order(
        status=status,
        paymentStatus="paid" if paid else "pending",
        createdAt=datetime.utcnow() - timedelta(days=days_ago),
        items=[OrderItem(productId=str(product.id), productName="Mandala", quantity=qty)],
        **extra,
    )
    await order.insert()
    return order


@pytest.mark.parametrize(
    ("units", "shown"),
    [(0, None), (9, None), (10, 10), (47, 40), (99, 90), (100, 100), (523, 500), (1840, 1000)],
)
def test_display_floor_never_overstates(units, shown):
    assert product_sales.display_floor(units) == shown


@pytest.mark.usefixtures("db")
async def test_counts_only_recent_paid_live_orders():
    product = await _product()
    other = await _product()
    await _order(product, 6)
    await _order(product, 5, days_ago=3)
    await _order(product, 50, days_ago=8)  # outside the week
    await _order(product, 50, paid=False)  # unpaid
    await _order(product, 50, status="cancelled")
    await _order(product, 50, status="abandoned")
    await _order(other, 50)

    assert await product_sales.units_sold(str(product.id)) == 11
    assert await product_sales.sold_this_week(str(product.id)) == 10


@pytest.mark.usefixtures("db")
async def test_product_endpoint_hides_low_counts():
    product = await _product()
    await _order(product, 3)

    transport = ASGITransport(app=create_app(with_lifespan=False))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/products/slug/mandala")

    assert res.status_code == 200
    assert res.json()["soldThisWeek"] is None
