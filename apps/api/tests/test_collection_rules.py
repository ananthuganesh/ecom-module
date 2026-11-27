from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.documents import Category, Order, OrderItem, Product, Setting
from app.main import create_app
from app.services import collection_rules
from app.services import collections as collections_svc


@pytest.fixture(autouse=True)
def _clear_cache():
    collection_rules.clear_cache()
    yield
    collection_rules.clear_cache()


async def _product(name: str, *, days_old: int = 0, status: str = "active") -> Product:
    product = Product(
        productName=name,
        slug=name.lower(),
        status=status,
        createdAt=datetime.utcnow() - timedelta(days=days_old),
    )
    await product.insert()
    return product


async def _sale(product: Product, qty: int, *, days_ago: int = 1, status="order placed", paid=True):
    await Order(
        status=status,
        paymentStatus="paid" if paid else "pending",
        createdAt=datetime.utcnow() - timedelta(days=days_ago),
        items=[OrderItem(productId=str(product.id), productName=product.productName, quantity=qty)],
    ).insert()


def test_rule_inputs_are_validated_and_clamped():
    assert collection_rules.clean_rule("Best_Sellers") == "best_sellers"
    assert collection_rules.clean_rule("manual") is None
    assert collection_rules.clamp_limit(1) == collection_rules.MIN_LIMIT
    assert collection_rules.clamp_limit(10_000) == collection_rules.MAX_LIMIT
    assert collection_rules.clamp_limit("x") == 24
    assert collection_rules.clamp_days(1) == collection_rules.MIN_DAYS


@pytest.mark.usefixtures("db")
async def test_new_arrivals_are_newest_first_and_skip_drafts():
    old = await _product("Old", days_old=30)
    new = await _product("New", days_old=1)
    await _product("Draft", days_old=0, status="draft")
    doc = Category(name="New Arrivals", slug="new-arrivals", rule="new_arrivals")
    assert await collection_rules.rule_product_ids(doc) == [new.id, old.id]


@pytest.mark.usefixtures("db")
async def test_best_sellers_rank_by_paid_units_in_window():
    hit = await _product("Hit")
    steady = await _product("Steady")
    unpaid = await _product("Unpaid")
    stale = await _product("Stale")
    draft = await _product("Draft", status="draft")
    await _sale(hit, 3)
    await _sale(hit, 4)
    await _sale(steady, 5)
    await _sale(steady, 50, status="cancelled")
    await _sale(unpaid, 99, paid=False)
    await _sale(stale, 99, days_ago=200)
    await _sale(draft, 99)
    doc = Category(name="Best Sellers", slug="best-sellers", rule="best_sellers", ruleDays=60)
    assert await collection_rules.rule_product_ids(doc) == [hit.id, steady.id]


@pytest.mark.usefixtures("db")
async def test_limit_caps_the_list():
    for i in range(6):
        await _product(f"P{i}", days_old=i)
    doc = Category(name="New", slug="new", rule="new_arrivals", ruleLimit=4)
    assert len(await collection_rules.rule_product_ids(doc)) == 4


@pytest.mark.usefixtures("db")
async def test_automatic_collections_reject_manual_products():
    product = await _product("Tee")
    created = await collections_svc.create({"name": "Best Sellers", "rule": "best_sellers"})
    with pytest.raises(HTTPException) as exc:
        await collections_svc.add_products(created["_id"], [str(product.id)])
    assert exc.value.status_code == 400


@pytest.mark.usefixtures("db")
async def test_unknown_rule_is_rejected():
    with pytest.raises(HTTPException) as exc:
        await collections_svc.create({"name": "Odd", "rule": "random"})
    assert exc.value.status_code == 400


@pytest.mark.usefixtures("db")
async def test_switching_back_to_manual_clears_the_rule():
    created = await collections_svc.create({"name": "Picks", "rule": "new_arrivals"})
    updated = await collections_svc.update(created["_id"], {"rule": "manual"})
    assert updated["rule"] is None


@pytest.mark.usefixtures("db")
async def test_storefront_listing_follows_the_rule_order():
    low = await _product("Low")
    top = await _product("Top")
    await _sale(low, 1)
    await _sale(top, 9)
    await Category(name="Best Sellers", slug="best-sellers", rule="best_sellers").insert()

    app = create_app(with_lifespan=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/products", params={"collection": "best-sellers"})
    assert res.status_code == 200
    body = res.json()
    assert [p["productName"] for p in body["products"]] == ["Top", "Low"]
    assert body["total"] == 2


@pytest.mark.usefixtures("db")
async def test_defaults_are_seeded_once_and_respect_existing_urls():
    await Category(name="Our New In", slug="new-arrivals").insert()
    created = await collection_rules.ensure_default_auto_collections()
    assert created == ["best-sellers"]
    assert (await Category.find_one({"slug": "new-arrivals"})).rule is None
    assert (await Category.find_one({"slug": "best-sellers"})).rule == "best_sellers"

    # Deleting it afterwards sticks: seeding never runs twice.
    await (await Category.find_one({"slug": "best-sellers"})).delete()
    assert await collection_rules.ensure_default_auto_collections() == []
    assert await Category.find_one({"slug": "best-sellers"}) is None
    assert await Setting.find_one(Setting.key == collection_rules.SEEDED_KEY)
