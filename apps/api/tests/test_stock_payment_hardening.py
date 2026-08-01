"""Stock payment / race hardening tests."""

import os

import pytest
import pytest_asyncio
from mongomock_motor import AsyncMongoMockClient

os.environ.setdefault("MONGO_URI", "mongodb://127.0.0.1:27017/urbanaana_stock_pay_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("ENVIRONMENT", "development")

from app.config import get_settings
from app.db import close_db, init_db
from app.documents import Order, OrderItem, Pricing, Product, StockBalance, Warehouse
from app.services import stock as stock_svc


@pytest_asyncio.fixture
async def db():
    get_settings.cache_clear()
    mock = AsyncMongoMockClient()
    await init_db(client=mock, db_name="urbanaana_stock_pay_test")
    yield
    await close_db()
    get_settings.cache_clear()


@pytest_asyncio.fixture
async def product_wh(db):
    wh = Warehouse(name="Main", code="MAIN", isDefault=True, isActive=True)
    await wh.insert()
    product = Product(
        productName="Race Tee",
        pricing=Pricing(sellingPrice=100, offerPrice=100),
        totalStock=1,
    )
    await product.insert()
    bal = StockBalance(
        productId=str(product.id),
        warehouseId=str(wh.id),
        variantSku="",
        quantity=1,
        reserved=0,
    )
    await bal.insert()
    await stock_svc.sync_product_stock(str(product.id))
    return product, wh


@pytest.mark.asyncio
async def test_concurrent_style_second_reserve_fails(product_wh):
    product, wh = product_wh
    await stock_svc.reserve_stock(
        product_id=str(product.id),
        warehouse_id=str(wh.id),
        quantity=1,
        order_id="order-a",
    )
    with pytest.raises(Exception):
        await stock_svc.reserve_stock(
            product_id=str(product.id),
            warehouse_id=str(wh.id),
            quantity=1,
            order_id="order-b",
        )


@pytest.mark.asyncio
async def test_ensure_stock_rereserves_after_release(product_wh):
    product, wh = product_wh
    order = Order(
        items=[OrderItem(productId=product.id, quantity=1, price=100)],
        finalPrice=100,
        paymentStatus="pending",
        paymentMethod="razorpay",
        status="abandoned",
        transactionDetails={"stockReserved": True, "stockReleased": True},
    )
    await order.insert()

    await stock_svc.ensure_stock_for_payment(order)
    details = dict(order.transactionDetails or {})
    assert details.get("stockReserved") is True
    assert details.get("stockReleased") in (False, None)
    bal = await StockBalance.find_one(
        StockBalance.productId == str(product.id),
        StockBalance.warehouseId == str(wh.id),
    )
    assert int(bal.reserved or 0) == 1


@pytest.mark.asyncio
async def test_restock_after_commit(product_wh):
    product, wh = product_wh
    order = Order(
        items=[OrderItem(productId=product.id, quantity=1, price=100)],
        finalPrice=100,
        paymentStatus="paid",
        paymentMethod="razorpay",
        status="order placed",
        transactionDetails={"stockReserved": True},
    )
    await order.insert()
    await stock_svc.reserve_stock(
        product_id=str(product.id),
        warehouse_id=str(wh.id),
        quantity=1,
        order_id=str(order.id),
    )
    order.transactionDetails = {**(order.transactionDetails or {}), "stockReserved": True}
    await order.save()
    await stock_svc.apply_order_commitments(order)

    bal = await StockBalance.find_one(
        StockBalance.productId == str(product.id),
        StockBalance.warehouseId == str(wh.id),
    )
    assert int(bal.quantity or 0) == 0
    assert int(bal.reserved or 0) == 0

    ok = await stock_svc.restock_order_stock(order)
    assert ok is True
    bal = await StockBalance.find_one(
        StockBalance.productId == str(product.id),
        StockBalance.warehouseId == str(wh.id),
    )
    assert int(bal.quantity or 0) == 1
    # Idempotent
    assert await stock_svc.restock_order_stock(order) is False
