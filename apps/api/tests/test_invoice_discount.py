"""Coupon discounts reduce the GST taxable value on order invoices (CGST Act s.15(3)(a))."""

from __future__ import annotations

import pytest

from app.documents import Order, OrderItem, Pricing, Product, Setting
from app.services import erp_ops


async def _kerala_store():
    await Setting(
        key="company_profile",
        value={"gstin": "32ABCDE1234F1Z5", "stateCode": "32", "stateName": "Kerala"},
    ).insert()


async def _product(name: str, mrp: float, selling: float) -> Product:
    product = Product(productName=name, slug=name.lower(), pricing=Pricing(mrp=mrp, sellingPrice=selling))
    await product.insert()
    return product


async def _paid_order(items: list[OrderItem], discount: float, state: str = "Kerala") -> Order:
    subtotal = sum(i.price * i.quantity for i in items)
    order = Order(
        items=items,
        shippingAddress={"name": "Test Buyer", "state": state},
        total=subtotal,
        discount=discount,
        discountAmount=discount,
        finalPrice=subtotal - discount,
        couponCode="SAVE80" if discount else None,
        paymentStatus="paid",
    )
    await order.insert()
    return order


@pytest.mark.usefixtures("db")
async def test_coupon_comes_off_before_gst():
    await _kerala_store()
    tee = await _product("Tee", mrp=1499, selling=1299)
    order = await _paid_order([OrderItem(productId=tee.id, quantity=1, price=1299)], discount=80)

    invoice = await erp_ops.ensure_order_invoice(order)

    [line] = invoice.items
    assert line.unitPrice == 1299
    assert line.discountAmount == 80
    assert line.taxRate == 5.0
    assert line.taxableAmount == 1160.95
    assert line.taxAmount == 58.05
    assert line.totalAmount == 1219
    assert invoice.subtotal == 1160.95
    assert invoice.taxTotal == 58.05
    assert invoice.igst == 0
    assert round(invoice.cgst + invoice.sgst, 2) == 58.05
    assert invoice.grandTotal == 1219
    assert invoice.amountPaid == 1219
    assert invoice.balanceDue == 0
    assert invoice.couponCode == "SAVE80"


@pytest.mark.usefixtures("db")
async def test_coupon_on_inter_state_order_is_igst():
    await _kerala_store()
    tee = await _product("Tee", mrp=1499, selling=1299)
    order = await _paid_order(
        [OrderItem(productId=tee.id, quantity=1, price=1299)], discount=80, state="Karnataka"
    )

    invoice = await erp_ops.ensure_order_invoice(order)

    assert invoice.igst == 58.05
    assert invoice.cgst == invoice.sgst == 0
    assert invoice.grandTotal == 1219


@pytest.mark.usefixtures("db")
async def test_discount_split_across_lines_sums_to_the_paise():
    await _kerala_store()
    tee = await _product("Tee", mrp=1499, selling=1299)
    cap = await _product("Cap", mrp=699, selling=499)
    order = await _paid_order(
        [
            OrderItem(productId=tee.id, quantity=2, price=1299),
            OrderItem(productId=cap.id, quantity=1, price=499),
        ],
        discount=100,
    )

    invoice = await erp_ops.ensure_order_invoice(order)

    shares = [line.discountAmount for line in invoice.items]
    assert shares == [83.89, 16.11]
    assert round(sum(shares), 2) == 100
    assert invoice.grandTotal == 2997
    assert round(invoice.subtotal + invoice.taxTotal, 2) == 2997


@pytest.mark.usefixtures("db")
async def test_no_coupon_leaves_lines_untouched():
    await _kerala_store()
    tee = await _product("Tee", mrp=1499, selling=1299)
    order = await _paid_order([OrderItem(productId=tee.id, quantity=1, price=1299)], discount=0)

    invoice = await erp_ops.ensure_order_invoice(order)

    [line] = invoice.items
    assert line.discountAmount == 0
    assert line.taxableAmount == 1237.14
    assert line.taxAmount == 61.86
    assert invoice.grandTotal == 1299
    assert invoice.couponCode is None


@pytest.mark.usefixtures("db")
async def test_slab_follows_sale_value_not_mrp():
    await _kerala_store()
    jacket = await _product("Jacket", mrp=3499, selling=2399)
    order = await _paid_order([OrderItem(productId=jacket.id, quantity=1, price=2399)], discount=0)

    invoice = await erp_ops.ensure_order_invoice(order)

    assert invoice.items[0].taxRate == 5.0


@pytest.mark.usefixtures("db")
async def test_coupon_can_bring_a_piece_under_the_slab():
    await _kerala_store()
    jacket = await _product("Jacket", mrp=3499, selling=2600)
    order = await _paid_order([OrderItem(productId=jacket.id, quantity=1, price=2600)], discount=200)

    invoice = await erp_ops.ensure_order_invoice(order)

    [line] = invoice.items
    assert line.taxRate == 5.0
    assert line.taxableAmount == 2285.71
    assert line.taxAmount == 114.29
    assert invoice.grandTotal == 2400


@pytest.mark.usefixtures("db")
async def test_piece_above_slab_is_18_percent():
    await _kerala_store()
    coat = await _product("Coat", mrp=3999, selling=2999)
    order = await _paid_order([OrderItem(productId=coat.id, quantity=1, price=2999)], discount=0)

    invoice = await erp_ops.ensure_order_invoice(order)

    assert invoice.items[0].taxRate == 18.0


def test_allocation_caps_discount_at_item_value():
    order = Order(items=[OrderItem(quantity=1, price=500)], discountAmount=900)
    assert erp_ops.allocate_order_discount(order) == [500.0]


def test_allocation_skips_free_lines():
    order = Order(
        items=[OrderItem(quantity=1, price=1000), OrderItem(quantity=1, price=0)],
        discountAmount=50,
    )
    assert erp_ops.allocate_order_discount(order) == [50.0, 0.0]
