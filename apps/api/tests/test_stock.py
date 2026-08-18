import pytest
from bson import ObjectId
from fastapi import HTTPException

from app.documents import Order, OrderItem, Product, StockBalance
from app.services.order_abandon import mark_order_abandoned
from app.services.stock import (
    apply_order_commitments,
    commit_reserved_stock,
    ensure_default_warehouse,
    ensure_stock_for_payment,
    get_or_create_balance,
    release_order_stock,
    release_reserved_stock,
    reserve_order_stock,
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


async def _seed_reserved_order(qty: int = 10, line_qty: int = 1):
    product, warehouse, _ = await _seed(qty)
    order = Order(
        customerId=ObjectId(),
        items=[
            OrderItem(
                productId=str(product.id),
                productName="Test Tee",
                quantity=line_qty,
                price=100,
            )
        ],
        paymentStatus="pending",
        status="order placed",
        finalPrice=100,
        shippingStatus="Payment Pending",
        transactionDetails={"paymentStatus": "pending"},
    )
    await order.insert()
    await reserve_order_stock(order)
    order = await Order.get(order.id)
    return product, warehouse, order


@pytest.mark.usefixtures("db")
async def test_abandon_does_not_wipe_stock_released_flag():
    """Stale in-memory details must not overwrite stockReleased via a full save."""
    product, warehouse, order = await _seed_reserved_order()
    await release_order_stock(order)

    stale = await Order.get(order.id)
    details = dict(stale.transactionDetails or {})
    details.pop("stockReleased", None)
    stale.transactionDetails = details
    stale.status = "order placed"
    stale.paymentStatus = "pending"

    abandoned = await mark_order_abandoned(
        stale, reason="payment_dismissed", release_stock=False
    )
    assert abandoned is True

    reloaded = await Order.get(order.id)
    assert reloaded.status == "abandoned"
    assert reloaded.transactionDetails.get("abandonedReason") == "payment_dismissed"
    assert reloaded.transactionDetails.get("stockReleased") is True
    assert reloaded.transactionDetails.get("stockReserved") is True

    bal = await get_or_create_balance(str(product.id), str(warehouse.id), "")
    assert bal.reserved == 0


@pytest.mark.usefixtures("db")
async def test_ensure_stock_rereserves_when_flags_say_held_but_ledger_is_zero():
    """UA1337/UA1329: dismiss released stock then wiped stockReleased."""
    product, warehouse, order = await _seed_reserved_order()
    await release_order_stock(order)
    await Order.get_pymongo_collection().update_one(
        {"_id": order.id},
        {
            "$unset": {"transactionDetails.stockReleased": ""},
            "$set": {"transactionDetails.stockReserved": True},
        },
    )
    order = await Order.get(order.id)
    assert not order.transactionDetails.get("stockReleased")

    await ensure_stock_for_payment(order)
    bal = await get_or_create_balance(str(product.id), str(warehouse.id), "")
    assert bal.quantity == 10
    assert bal.reserved == 1
    refreshed = await Order.get(order.id)
    assert refreshed.transactionDetails.get("stockReserved") is True
    assert not refreshed.transactionDetails.get("stockReleased")


@pytest.mark.usefixtures("db")
async def test_late_upi_capture_commits_after_stale_dismiss_release():
    """Captured payment after modal dismiss should commit stock, not auto-refund."""
    product, warehouse, order = await _seed_reserved_order()
    await release_order_stock(order)
    await Order.get_pymongo_collection().update_one(
        {"_id": order.id},
        {
            "$unset": {"transactionDetails.stockReleased": ""},
            "$set": {
                "transactionDetails.stockReserved": True,
                "paymentStatus": "paid",
                "transactionDetails.paymentStatus": "paid",
            },
        },
    )
    order = await Order.get(order.id)
    await ensure_stock_for_payment(order)
    await apply_order_commitments(order)

    bal = await get_or_create_balance(str(product.id), str(warehouse.id), "")
    assert bal.quantity == 9
    assert bal.reserved == 0
    refreshed = await Order.get(order.id)
    assert refreshed.transactionDetails.get("stockApplied") is True


@pytest.mark.usefixtures("db")
async def test_commit_falls_back_to_sale_when_reserve_already_released():
    product, warehouse, order = await _seed_reserved_order()
    await release_order_stock(order)
    await Order.get_pymongo_collection().update_one(
        {"_id": order.id},
        {
            "$unset": {"transactionDetails.stockReleased": ""},
            "$set": {
                "transactionDetails.stockReserved": True,
                "paymentStatus": "paid",
                "transactionDetails.paymentStatus": "paid",
            },
        },
    )
    order = await Order.get(order.id)
    order.paymentStatus = "paid"
    # Skip ensure_stock — commitments should still sell from on-hand.
    await apply_order_commitments(order)

    bal = await get_or_create_balance(str(product.id), str(warehouse.id), "")
    assert bal.quantity == 9
    assert bal.reserved == 0

