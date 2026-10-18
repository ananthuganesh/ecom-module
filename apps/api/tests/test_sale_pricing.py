from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.documents import AdminAccount, Pricing, Product, Role
from app.main import create_app
from app.security import create_access_token
from app.services import sale_pricing

NOW = datetime(2026, 11, 1, 12, 0)


def _product(selling=1199.0, mrp=1899.0, **sale) -> Product:
    product = Product(productName="Waveborn", slug="waveborn", pricing=Pricing(mrp=mrp, sellingPrice=selling))
    if sale:
        product.sale = sale_pricing.parse_sale(sale)
    return product


@pytest.mark.usefixtures("db")
async def test_sale_starts_holds_and_reverts_on_schedule():
    product = _product(price=949, startsAt=NOW.isoformat(), endsAt=(NOW + timedelta(days=3)).isoformat())

    assert sale_pricing.reconcile(product, NOW - timedelta(minutes=1)) is False
    assert product.pricing.sellingPrice == 1199

    assert sale_pricing.reconcile(product, NOW) is True
    assert product.pricing.sellingPrice == 949
    assert product.sale.live and product.sale.regularPrice == 1199

    assert sale_pricing.reconcile(product, NOW + timedelta(days=1)) is False

    assert sale_pricing.reconcile(product, NOW + timedelta(days=3)) is True
    assert product.pricing.sellingPrice == 1199
    assert product.sale.live is False and product.sale.price == 949


@pytest.mark.usefixtures("db")
async def test_sale_never_raises_the_price():
    product = _product(price=1299)
    assert sale_pricing.reconcile(product, NOW) is False
    assert product.pricing.sellingPrice == 1199


def test_parse_sale_accepts_timezones_and_rejects_bad_input():
    sale = sale_pricing.parse_sale({"price": "949", "startsAt": "2026-11-01T18:30:00+05:30"})
    assert sale.price == 949 and sale.startsAt == datetime(2026, 11, 1, 13, 0)
    assert sale_pricing.parse_sale({"price": ""}) is None
    for bad in ({"price": 0}, {"price": "abc"}, {"price": 9, "startsAt": "2026-11-02", "endsAt": "2026-11-01"}):
        with pytest.raises(HTTPException):
            sale_pricing.parse_sale(bad)


@pytest.mark.usefixtures("db")
async def test_editing_price_during_a_live_sale_changes_the_restore_price():
    product = _product(price=949)
    sale_pricing.reconcile(product)
    assert product.pricing.sellingPrice == 949

    state = sale_pricing.begin_edit(product)
    product.pricing = Pricing(mrp=1899, sellingPrice=1099)  # the admin form edits the regular price
    sale_pricing.finish_edit(product, state, price_written=True)
    assert product.pricing.sellingPrice == 949 and product.sale.regularPrice == 1099

    state = sale_pricing.begin_edit(product)
    sale_pricing.finish_edit(product, state, price_written=False, sale_body=None)  # clear the sale
    assert product.pricing.sellingPrice == 1099 and product.sale is None


@pytest.mark.usefixtures("db")
async def test_sweep_starts_and_ends_sales():
    product = _product(price=949, startsAt=NOW.isoformat(), endsAt=(NOW + timedelta(hours=1)).isoformat())
    await product.insert()
    untouched = Product(productName="Plain", pricing=Pricing(sellingPrice=799))
    await untouched.insert()

    assert (await sale_pricing.sweep(NOW))["changed"] == 1
    assert (await Product.get(product.id)).pricing.sellingPrice == 949
    assert (await sale_pricing.sweep(NOW + timedelta(hours=2)))["changed"] == 1
    assert (await Product.get(product.id)).pricing.sellingPrice == 1199
    assert (await Product.get(untouched.id)).pricing.sellingPrice == 799


@pytest.mark.usefixtures("db")
async def test_admin_save_applies_sale_and_ignores_client_live_flags():
    role = Role(name="Owner", permissions=["*"])
    await role.insert()
    admin = AdminAccount(email="owner@example.com", name="Owner", roleId=str(role.id))
    await admin.insert()
    product = _product()
    await product.insert()

    transport = ASGITransport(app=create_app(with_lifespan=False))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        client.headers["Authorization"] = f"Bearer {create_access_token(admin.id)}"
        res = await client.put(
            f"/api/admin/products/{product.id}",
            json={
                "pricing": {"mrp": 1899, "sellingPrice": 1199},
                "sale": {"price": 949, "live": True, "regularPrice": 5},
            },
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["pricing"]["sellingPrice"] == 949
        assert body["sale"]["live"] is True and body["sale"]["regularPrice"] == 1199

        # Saving the form again (regular price in the price field) keeps the sale.
        res = await client.put(
            f"/api/admin/products/{product.id}",
            json={"pricing": {"mrp": 1899, "sellingPrice": 1199}, "sale": {"price": 949}},
        )
        assert res.json()["pricing"]["sellingPrice"] == 949

        store = (await client.get("/api/products/slug/waveborn")).json()
        assert store["pricing"]["sellingPrice"] == 949 and store["sale"]["live"] is True


# 2026-11-01 04:30 UTC is 10:00 in India.
IST_10AM = datetime(2026, 11, 1, 4, 30)


@pytest.mark.usefixtures("db")
async def test_daily_flash_window_turns_price_on_and_off_each_day():
    product = _product(
        price=949,
        startsAt=datetime(2026, 11, 1).isoformat(),
        endsAt=datetime(2026, 11, 3).isoformat(),
        dailyStart="10:00",
        dailyEnd="16:00",
    )

    assert sale_pricing.reconcile(product, IST_10AM - timedelta(minutes=1)) is False
    assert product.pricing.sellingPrice == 1199

    assert sale_pricing.reconcile(product, IST_10AM) is True
    assert product.pricing.sellingPrice == 949
    assert product.sale.liveUntil == IST_10AM + timedelta(hours=6)  # 16:00 IST
    assert sale_pricing.reconcile(product, IST_10AM + timedelta(hours=3)) is False

    assert sale_pricing.reconcile(product, IST_10AM + timedelta(hours=6)) is True
    assert product.pricing.sellingPrice == 1199 and product.sale.liveUntil is None

    next_day = IST_10AM + timedelta(days=1, minutes=5)
    assert sale_pricing.reconcile(product, next_day) is True
    assert product.pricing.sellingPrice == 949
    assert product.sale.regularPrice == 1199

    # The overall end (00:00 UTC on the 3rd) cuts the last stretch short.
    assert sale_pricing.reconcile(product, IST_10AM + timedelta(days=2)) is True
    assert product.pricing.sellingPrice == 1199


@pytest.mark.usefixtures("db")
async def test_daily_window_can_cross_midnight():
    product = _product(price=949, dailyStart="20:00", dailyEnd="02:00")
    ist_11pm = datetime(2026, 11, 1, 17, 30)
    assert sale_pricing.reconcile(product, ist_11pm) is True
    assert product.sale.liveUntil == datetime(2026, 11, 1, 20, 30)  # 02:00 IST next day
    assert sale_pricing.reconcile(product, datetime(2026, 11, 1, 21, 0)) is True  # 02:30 IST
    assert product.pricing.sellingPrice == 1199


def test_daily_times_must_come_in_pairs():
    with pytest.raises(HTTPException):
        sale_pricing.parse_sale({"price": 949, "dailyStart": "10:00"})
    with pytest.raises(HTTPException):
        sale_pricing.parse_sale({"price": 949, "dailyStart": "10:00", "dailyEnd": "10:00"})
    with pytest.raises(HTTPException):
        sale_pricing.parse_sale({"price": 949, "dailyStart": "25:00", "dailyEnd": "10:00"})


@pytest.mark.usefixtures("db")
async def test_sweep_keeps_edits_that_land_mid_sweep(monkeypatch):
    product = _product(price=949)
    await product.insert()
    real_reconcile = sale_pricing.reconcile

    async def admin_edits_meanwhile(**fields):
        await Product.get_pymongo_collection().update_one({"_id": product.id}, {"$set": fields})

    edits = []

    def racing_reconcile(p, now=None):
        changed = real_reconcile(p, now)
        edits.append(p.id)
        return changed

    monkeypatch.setattr(sale_pricing, "reconcile", racing_reconcile)

    # A description/stock edit mid-sweep survives; the sale still starts.
    original_find = Product.find

    def find_then_edit(*args, **kwargs):
        query = original_find(*args, **kwargs)
        to_list = query.to_list

        async def to_list_and_edit(*a, **k):
            rows = await to_list(*a, **k)
            await admin_edits_meanwhile(description="Edited", totalStock=7)
            return rows

        query.to_list = to_list_and_edit
        return query

    monkeypatch.setattr(Product, "find", find_then_edit)
    assert (await sale_pricing.sweep())["changed"] == 1
    monkeypatch.setattr(Product, "find", original_find)
    fresh = await Product.get(product.id)
    assert fresh.description == "Edited" and fresh.totalStock == 7
    assert fresh.pricing.sellingPrice == 949 and fresh.sale.live

    # If the price itself moved under us, the sweep skips and leaves it for next tick.
    monkeypatch.setattr(Product, "find", find_then_edit)
    await Product.get_pymongo_collection().update_one(
        {"_id": product.id}, {"$set": {"sale.endsAt": datetime(2000, 1, 1)}}
    )

    async def admin_changes_price(**_):
        await Product.get_pymongo_collection().update_one(
            {"_id": product.id}, {"$set": {"pricing.sellingPrice": 899}}
        )

    admin_edits_meanwhile = admin_changes_price  # noqa: F811
    assert (await sale_pricing.sweep())["changed"] == 0
    assert (await Product.get(product.id)).pricing.sellingPrice == 899
