import pytest
from fastapi import HTTPException

from app.documents import Product, StockBalance
from app.services.stock import (
    commit_reserved_stock,
    ensure_default_warehouse,
    get_or_create_balance,
    release_reserved_stock,
    reserve_stock,
    sellable_qty,
)


def test_sellable_never_negative():
    assert sellable_qty(5, 2) == 3
    assert sellable_qty(2, 5) == 0
    assert sellable_qty(None, None) == 0


async def _seed(qty: int = 10):
    product = Product(productName="Test Tee", totalStock=qty)
    await product.insert()
    warehouse = await ensure_default_warehouse()
    balance = await get_or_create_balance(str(product.id), str(warehouse.id), "")
    balance.quantity = qty
    balance.reserved = 0
    await balance.save()
    return product, warehouse, balance


@pytest.mark.usefixtures("db")
async def test_reserve_commit_reduces_on_hand():
    product, warehouse, _ = await _seed(10)
    pid, wid = str(product.id), str(warehouse.id)

    await reserve_stock(product_id=pid, warehouse_id=wid, quantity=3)
    mid = await StockBalance.find_one(
        StockBalance.productId == pid, StockBalance.warehouseId == wid
    )
    assert mid.quantity == 10
    assert mid.reserved == 3
    assert sellable_qty(mid.quantity, mid.reserved) == 7

    await commit_reserved_stock(product_id=pid, warehouse_id=wid, quantity=3)
    done = await StockBalance.find_one(
        StockBalance.productId == pid, StockBalance.warehouseId == wid
    )
    assert done.quantity == 7
    assert done.reserved == 0


@pytest.mark.usefixtures("db")
async def test_release_returns_sellable():
    product, warehouse, _ = await _seed(10)
    pid, wid = str(product.id), str(warehouse.id)

    await reserve_stock(product_id=pid, warehouse_id=wid, quantity=4)
    await release_reserved_stock(product_id=pid, warehouse_id=wid, quantity=4)
    bal = await StockBalance.find_one(
        StockBalance.productId == pid, StockBalance.warehouseId == wid
    )
    assert bal.quantity == 10
    assert bal.reserved == 0


@pytest.mark.usefixtures("db")
async def test_cannot_oversell_reserved():
    product, warehouse, _ = await _seed(10)
    pid, wid = str(product.id), str(warehouse.id)

    await reserve_stock(product_id=pid, warehouse_id=wid, quantity=8)
    with pytest.raises(HTTPException) as exc:
        await reserve_stock(product_id=pid, warehouse_id=wid, quantity=5)
    assert exc.value.status_code == 400
    assert "Insufficient stock" in str(exc.value.detail)


@pytest.mark.usefixtures("db")
async def test_commit_without_reserve_fails():
    product, warehouse, _ = await _seed(10)
    with pytest.raises(HTTPException) as exc:
        await commit_reserved_stock(
            product_id=str(product.id), warehouse_id=str(warehouse.id), quantity=2
        )
    assert exc.value.status_code == 400
