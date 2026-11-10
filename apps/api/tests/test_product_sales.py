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


# ─── Admin product-wise sales report ────────────────────────────────────────

from datetime import date  # noqa: E402

from app.documents import AdminAccount, ReturnItem, ReturnRequest, Role  # noqa: E402
from app.security import create_access_token  # noqa: E402


async def _report_client(permissions: list[str]) -> AsyncClient:
    role = Role(name="Reports", permissions=permissions)
    await role.insert()
    admin = AdminAccount(email="reports@example.com", name="Reports", roleId=str(role.id))
    await admin.insert()
    client = AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test")
    client.headers["Authorization"] = f"Bearer {create_access_token(admin.id)}"
    return client


async def _sale(created_at: datetime, *lines, status="delivered", paid=True, **extra) -> Order:
    order = Order(
        status=status,
        paymentStatus="paid" if paid else "pending",
        createdAt=created_at,
        items=[
            OrderItem(productId=pid, productName=name, size=size, color=color, quantity=qty, price=price)
            for (pid, name, size, color, qty, price) in lines
        ],
        **extra,
    )
    await order.insert()
    return order


@pytest.mark.usefixtures("db")
async def test_report_counts_pieces_per_product_with_variants_and_returns():
    tee = Product(productName="Mandala Tee", slug="mandala-tee")
    hoodie = Product(productName="Kolam Hoodie", slug="kolam-hoodie")
    await tee.insert()
    await hoodie.insert()
    t, h = str(tee.id), str(hoodie.id)
    day = datetime(2026, 10, 10, 6, 0)  # 11:30 IST

    returned_order = await _sale(day, (t, "Mandala Tee", "M", "Black", 2, 799), (h, "Kolam Hoodie", "L", "", 1, 1999))
    await _sale(day, (t, "Old name", "L", "Black", 3, 799), status="shipped")
    await _sale(day, (t, "Mandala Tee", "M", "Black", 1, 799), transactionDetails={"paymentStatus": "paid"}, paid=False)
    # Not sales:
    await _sale(day, (t, "Mandala Tee", "M", "Black", 50, 799), paid=False)
    await _sale(day, (t, "Mandala Tee", "M", "Black", 50, 799), status="cancelled")
    await _sale(day, (t, "Mandala Tee", "M", "Black", 50, 799), status="abandoned")
    # One tee came back (received); a still-pending return doesn't count.
    await ReturnRequest(number="R1", orderId=str(returned_order.id), status="received",
                        items=[ReturnItem(productId=t, quantity=1)]).insert()
    await ReturnRequest(number="R2", orderId=str(returned_order.id), status="requested",
                        items=[ReturnItem(productId=h, quantity=1)]).insert()

    report = await product_sales.sales_report()

    assert [r["productName"] for r in report["items"]] == ["Mandala Tee", "Kolam Hoodie"]
    tee_row, hoodie_row = report["items"]
    assert tee_row["unitsSold"] == 6
    assert tee_row["returnedUnits"] == 1
    assert tee_row["netUnits"] == 5
    assert tee_row["orders"] == 3
    assert tee_row["grossSales"] == 6 * 799
    assert tee_row["slug"] == "mandala-tee"
    assert tee_row["variants"] == [{"label": "L / Black", "units": 3}, {"label": "M / Black", "units": 3}]
    assert hoodie_row["unitsSold"] == 1 and hoodie_row["returnedUnits"] == 0
    assert hoodie_row["variants"] == [{"label": "L", "units": 1}]
    assert report["totals"] == {
        "products": 2, "orders": 3, "unitsSold": 7, "returnedUnits": 1, "netUnits": 6,
        "grossSales": 6 * 799 + 1999,
    }


@pytest.mark.usefixtures("db")
async def test_report_date_range_uses_ist_calendar_days():
    product = await _product()
    pid = str(product.id)
    # 1 Oct 00:10 IST is 30 Sep 18:40 UTC; 31 Oct 23:50 IST is 31 Oct 18:20 UTC.
    await _sale(datetime(2026, 9, 30, 18, 40), (pid, "Mandala", "", "", 1, 100))
    await _sale(datetime(2026, 10, 31, 18, 20), (pid, "Mandala", "", "", 2, 100))
    await _sale(datetime(2026, 9, 30, 18, 0), (pid, "Mandala", "", "", 10, 100))   # 30 Sep 23:30 IST
    await _sale(datetime(2026, 10, 31, 18, 40), (pid, "Mandala", "", "", 20, 100))  # 1 Nov 00:10 IST

    report = await product_sales.sales_report(date(2026, 10, 1), date(2026, 10, 31))

    assert report["totals"]["unitsSold"] == 3
    assert report["from"] == "2026-10-01" and report["to"] == "2026-10-31"


@pytest.mark.usefixtures("db")
async def test_report_keeps_lines_without_product_id_and_deleted_products():
    await _sale(datetime.utcnow(), (None, "Custom order", "", "", 2, 500))
    await _sale(datetime.utcnow(), ("64b000000000000000000000", "Discontinued tee", "", "", 1, 300))

    report = await product_sales.sales_report()

    rows = {r["productName"]: r for r in report["items"]}
    assert rows["Custom order"]["productId"] is None
    assert rows["Custom order"]["unitsSold"] == 2
    assert rows["Discontinued tee"]["inCatalog"] is False


@pytest.mark.usefixtures("db")
async def test_report_endpoint_filters_and_guards():
    product = await _product()
    await _sale(datetime(2026, 10, 10, 6, 0), (str(product.id), "Mandala", "M", "", 4, 100))

    async with await _report_client(["admin.access", "reports.read"]) as client:
        ok = await client.get("/api/admin/erp/reports/product-sales", params={"from": "2026-10-01", "to": "2026-10-31"})
        empty = await client.get("/api/admin/erp/reports/product-sales", params={"from": "2026-11-01"})
        backwards = await client.get("/api/admin/erp/reports/product-sales", params={"from": "2026-10-31", "to": "2026-10-01"})
        bad = await client.get("/api/admin/erp/reports/product-sales", params={"from": "yesterday"})

    assert ok.status_code == 200, ok.text
    assert ok.json()["items"][0]["unitsSold"] == 4
    assert empty.json()["items"] == []
    assert backwards.status_code == 400
    assert bad.status_code == 422


@pytest.mark.usefixtures("db")
async def test_report_endpoint_requires_reports_permission():
    async with await _report_client(["admin.access", "orders.read"]) as client:
        res = await client.get("/api/admin/erp/reports/product-sales")
    assert res.status_code == 403
