"""Order numbers (UA1000…) are assigned on payment, so abandoned checkouts leave no gaps."""

from __future__ import annotations

import asyncio

import pytest

from app.documents import Order, SalesInvoice
from app.routers import payments
from app.routers.orders import assign_order_number


@pytest.fixture
def quiet_payments(monkeypatch):
    """Skip stock, fulfilment, invoices and messages; keep the numbering logic real."""

    async def noop(*args, **kwargs):
        return None

    for name in ("ensure_stock_for_payment", "apply_order_commitments", "process_full_order_flow"):
        monkeypatch.setattr(payments, name, noop)
    monkeypatch.setattr(payments, "_upgrade_guest_customer_from_order", noop)
    from app.services import aisensy, conversions, email_resend, erp_ops

    monkeypatch.setattr(conversions, "send_purchase", noop)
    monkeypatch.setattr(aisensy, "notify_order_event_once", noop)
    monkeypatch.setattr(email_resend, "notify_order_email_once", noop)
    monkeypatch.setattr(email_resend, "notify_staff_new_order", noop)
    monkeypatch.setattr(erp_ops, "ensure_order_invoice_safe", noop)


async def _unpaid(**extra) -> Order:
    order = Order(status="order placed", paymentStatus="pending", finalPrice=999, **extra)
    await order.insert()
    return order


async def _pay(order: Order, payment_id: str) -> Order:
    await payments._finalize_paid_order(
        order, rz_payment_id=payment_id, payment={"id": payment_id, "method": "upi"}
    )
    return await Order.get(order.id)


@pytest.mark.usefixtures("db")
async def test_unpaid_orders_have_no_number_and_can_coexist():
    first = await _unpaid()
    second = await _unpaid()
    assert (await Order.get(first.id)).orderNumber is None
    assert (await Order.get(second.id)).orderNumber is None


@pytest.mark.usefixtures("db", "quiet_payments")
async def test_paid_orders_count_up_without_gaps_from_abandoned_checkouts():
    paid_a = await _unpaid()
    abandoned = await _unpaid()
    paid_b = await _unpaid()

    a = await _pay(paid_a, "pay_a")
    abandoned.status = "abandoned"
    await abandoned.save()
    b = await _pay(paid_b, "pay_b")

    assert a.orderNumber and b.orderNumber
    assert int(b.orderNumber[2:]) == int(a.orderNumber[2:]) + 1
    assert (await Order.get(abandoned.id)).orderNumber is None


@pytest.mark.usefixtures("db", "quiet_payments")
async def test_verify_then_webhook_keeps_one_number():
    order = await _unpaid()
    first = await _pay(order, "pay_same")
    second = await _pay(first, "pay_same")
    assert second.orderNumber == first.orderNumber


@pytest.mark.usefixtures("db")
async def test_concurrent_assignment_settles_on_one_number():
    order = await _unpaid()
    copies = [await Order.get(order.id) for _ in range(4)]
    numbers = await asyncio.gather(*(assign_order_number(c) for c in copies))
    stored = (await Order.get(order.id)).orderNumber
    assert stored
    assert set(numbers) == {stored}


@pytest.mark.usefixtures("db")
async def test_existing_numbers_are_never_reassigned():
    order = await _unpaid(orderNumber="UA1500")
    assert await assign_order_number(order) == "UA1500"
    assert (await Order.get(order.id)).orderNumber == "UA1500"


@pytest.mark.usefixtures("db")
async def test_numbering_continues_after_legacy_orders():
    await Order(status="delivered", paymentStatus="paid", orderNumber="UA1599").insert()
    order = await _unpaid()
    assert await assign_order_number(order) == "UA1600"


@pytest.mark.usefixtures("db")
async def test_admin_mark_paid_assigns_a_number(monkeypatch):
    from app.routers import orders as orders_router

    async def noop(*args, **kwargs):
        return None

    monkeypatch.setattr(orders_router, "apply_order_commitments", noop)
    monkeypatch.setattr(orders_router, "process_full_order_flow", noop)
    from app.services import stock

    monkeypatch.setattr(stock, "ensure_stock_for_payment", noop)

    class Admin:
        id = "admin1"

    order = await _unpaid()
    result = await orders_router.mark_paid(str(order.id), Admin(), {"reason": "bank transfer"})
    assert result["orderNumber"]
    assert (await Order.get(order.id)).orderNumber == result["orderNumber"]


@pytest.mark.usefixtures("db")
async def test_checkout_does_not_create_an_invoice_before_payment():
    """Invoices are issued on payment, so abandoned checkouts don't use invoice numbers."""
    import inspect

    from app.routers import orders as orders_router

    source = inspect.getsource(orders_router.create_order)
    assert "ensure_order_invoice" not in source
    order = await _unpaid()
    assert await SalesInvoice.find_one(SalesInvoice.orderId == str(order.id)) is None
