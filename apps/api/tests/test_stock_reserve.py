"""Stock soft-reserve: reserve / commit / release atomicity."""

import os

import pytest
import pytest_asyncio
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

os.environ.setdefault("MONGO_URI", "mongodb://127.0.0.1:27017/urbanaana_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("ENVIRONMENT", "development")

from app.config import get_settings
from app.db import close_db, init_db
from app.documents import Pricing, Product, StockBalance, Warehouse
from app.services import stock as stock_svc


@pytest_asyncio.fixture
async def db():
    get_settings.cache_clear()
    mock = AsyncMongoMockClient()
    await init_db(client=mock, db_name="urbanaana_stock_test")
    yield
    await close_db()
    get_settings.cache_clear()


@pytest_asyncio.fixture
async def product_wh(db):
    wh = Warehouse(name="Main", code="MAIN", isDefault=True, isActive=True)
    await wh.insert()
    product = Product(
        productName="Tee",
        pricing=Pricing(sellingPrice=100, offerPrice=100),
        totalStock=0,
    )
    await product.insert()
    bal = StockBalance(
        productId=str(product.id),
        warehouseId=str(wh.id),
        variantSku="",
        quantity=5,
        reserved=0,
    )
    await bal.insert()
    await stock_svc.sync_product_stock(str(product.id))
    return product, wh, bal


@pytest.mark.asyncio
async def test_reserve_increments_reserved_and_reduces_sellable(product_wh):
    product, wh, _ = product_wh
    await stock_svc.reserve_stock(
        product_id=str(product.id),
        warehouse_id=str(wh.id),
        quantity=2,
        order_id="ord1",
    )
    bal = await StockBalance.find_one(
        StockBalance.productId == str(product.id),
        StockBalance.warehouseId == str(wh.id),
    )
    assert bal.quantity == 5
    assert bal.reserved == 2
    refreshed = await Product.get(product.id)
    assert refreshed.totalStock == 3


@pytest.mark.asyncio
async def test_reserve_fails_when_insufficient_sellable(product_wh):
    product, wh, _ = product_wh
    with pytest.raises(HTTPException) as exc:
        await stock_svc.reserve_stock(
            product_id=str(product.id),
            warehouse_id=str(wh.id),
            quantity=6,
            order_id="ord1",
        )
    assert exc.value.status_code == 400
    bal = await StockBalance.find_one(StockBalance.productId == str(product.id))
    assert bal.reserved == 0


@pytest.mark.asyncio
async def test_commit_reserved_decrements_quantity_and_reserved(product_wh):
    product, wh, _ = product_wh
    await stock_svc.reserve_stock(
        product_id=str(product.id),
        warehouse_id=str(wh.id),
        quantity=2,
        order_id="ord1",
    )
    await stock_svc.commit_reserved_stock(
        product_id=str(product.id),
        warehouse_id=str(wh.id),
        quantity=2,
        order_id="ord1",
    )
    bal = await StockBalance.find_one(StockBalance.productId == str(product.id))
    assert bal.quantity == 3
    assert bal.reserved == 0
    refreshed = await Product.get(product.id)
    assert refreshed.totalStock == 3


@pytest.mark.asyncio
async def test_release_reserved_restores_sellable(product_wh):
    product, wh, _ = product_wh
    await stock_svc.reserve_stock(
        product_id=str(product.id),
        warehouse_id=str(wh.id),
        quantity=2,
        order_id="ord1",
    )
    await stock_svc.release_reserved_stock(
        product_id=str(product.id),
        warehouse_id=str(wh.id),
        quantity=2,
        order_id="ord1",
    )
    bal = await StockBalance.find_one(StockBalance.productId == str(product.id))
    assert bal.quantity == 5
    assert bal.reserved == 0
    refreshed = await Product.get(product.id)
    assert refreshed.totalStock == 5


@pytest.mark.asyncio
async def test_cleanup_drops_blank_sku_orphans_when_variants_exist(db):
    from app.documents import Variant

    wh = Warehouse(name="Main", code="MAIN", isDefault=True, isActive=True)
    await wh.insert()
    product = Product(
        productName="Keralathinayi",
        pricing=Pricing(sellingPrice=100, offerPrice=100),
        totalStock=0,
        variants=[
            Variant(size="S", sku="KER-S", quantity=12),
            Variant(size="L", sku="KER-L", quantity=28),
        ],
    )
    await product.insert()
    pid = str(product.id)
    wid = str(wh.id)

    await StockBalance(productId=pid, warehouseId=wid, variantSku="", quantity=107, reserved=0).insert()
    await StockBalance(productId=pid, warehouseId=wid, variantSku="KER-S", quantity=12, reserved=0).insert()
    await StockBalance(productId=pid, warehouseId=wid, variantSku="KER-L", quantity=28, reserved=0).insert()

    result = await stock_svc.cleanup_duplicate_inventory_rows()
    assert result["removedOrphans"] == 1

    rows = await StockBalance.find(StockBalance.productId == pid).to_list()
    skus = sorted((r.variantSku or "") for r in rows)
    assert skus == ["KER-L", "KER-S"]


@pytest.mark.asyncio
async def test_cleanup_merges_duplicate_balance_keys(db):
    wh = Warehouse(name="Main", code="MAIN", isDefault=True, isActive=True)
    await wh.insert()
    product = Product(
        productName="Simple Tee",
        pricing=Pricing(sellingPrice=100, offerPrice=100),
        totalStock=0,
    )
    await product.insert()
    pid = str(product.id)
    wid = str(wh.id)

    # Same SKU with whitespace variance → one logical key after strip.
    await StockBalance(productId=pid, warehouseId=wid, variantSku=" TEE-M", quantity=50, reserved=0).insert()
    await StockBalance(productId=pid, warehouseId=wid, variantSku="TEE-M", quantity=57, reserved=1).insert()

    result = await stock_svc.cleanup_duplicate_inventory_rows()
    assert result["merged"] == 1

    rows = await StockBalance.find(StockBalance.productId == pid).to_list()
    assert len(rows) == 1
    assert (rows[0].variantSku or "") == "TEE-M"
    assert int(rows[0].quantity or 0) == 107
    assert int(rows[0].reserved or 0) == 1
