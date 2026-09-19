from __future__ import annotations

from datetime import datetime, timedelta

import httpx
import pytest
from fastapi import HTTPException

from app.documents import Order, OrderItem, Product, ReturnRequest, StockBalance
from app.services import returns as returns_svc
from app.services.stock import ensure_default_warehouse, get_or_create_balance


@pytest.fixture(autouse=True)
def delhivery_env(monkeypatch):
    monkeypatch.setenv("DELHIVERY_API_TOKEN", "test-token")
    monkeypatch.setenv("DELHIVERY_PICKUP_LOCATION", "Urban Aana Warehouse")
    yield


@pytest.fixture
def mock_http(monkeypatch):
    def _install(handler):
        original = httpx.AsyncClient.__init__

        def patched(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            original(self, *args, **kwargs)

        monkeypatch.setattr(httpx.AsyncClient, "__init__", patched)

    return _install


async def _delivered_order(*, days_ago: float = 0.0, **overrides) -> Order:
    delivered = datetime.utcnow() - timedelta(days=days_ago)
    defaults = dict(
        orderNumber="UA3001",
        status="delivered",
        isDelivered=True,
        deliveredAt=delivered,
        paymentStatus="paid",
        finalPrice=2000.0,
        items=[
            OrderItem(productName="Oversized Tee", quantity=2, price=700, size="M"),
            OrderItem(productName="Cap", quantity=1, price=600),
        ],
        shippingAddress={
            "name": "Test Customer",
            "phone": "9876543210",
            "address": "1 Main Road",
            "city": "Kochi",
            "state": "Kerala",
            "postalCode": "682001",
        },
    )
    order = Order(**{**defaults, **overrides})
    await order.insert()
    return order


# ---------------------------------------------------------------- the 3-day window


@pytest.mark.usefixtures("db")
async def test_delivered_today_is_returnable():
    order = await _delivered_order(days_ago=0)
    check = await returns_svc.eligibility(order)
    assert check["eligible"] is True
    assert check["windowDays"] == 3
    assert len(check["items"]) == 2


@pytest.mark.usefixtures("db")
async def test_inside_the_window_is_returnable():
    order = await _delivered_order(days_ago=2.9)
    assert (await returns_svc.eligibility(order))["eligible"] is True


@pytest.mark.usefixtures("db")
async def test_past_three_days_is_refused():
    order = await _delivered_order(days_ago=3.1)
    check = await returns_svc.eligibility(order)
    assert check["eligible"] is False
    assert "window closed" in check["reason"]


@pytest.mark.usefixtures("db")
async def test_undelivered_order_is_refused():
    order = await _delivered_order(status="shipped", isDelivered=False, deliveredAt=None)
    check = await returns_svc.eligibility(order)
    assert check["eligible"] is False
    assert "delivered orders" in check["reason"]


@pytest.mark.usefixtures("db")
async def test_missing_delivery_date_does_not_silently_open_the_window():
    """An unknown delivery date must not be guessed in either direction."""
    order = await _delivered_order()
    order.deliveredAt = None
    order.deliveryDate = None
    check = await returns_svc.eligibility(order)
    assert check["eligible"] is False
    assert "Delivery date unavailable" in check["reason"]


@pytest.mark.usefixtures("db")
async def test_window_closes_three_days_after_delivery():
    order = await _delivered_order(days_ago=0)
    closes = returns_svc.window_closes_at(order)
    assert (closes - order.deliveredAt) == timedelta(days=3)


# ---------------------------------------------------------------- creating a request


@pytest.mark.usefixtures("db")
async def test_customer_returns_only_chosen_items():
    order = await _delivered_order()
    request = await returns_svc.create_request(
        order, user=None, selections=[{"index": 0, "quantity": 1}], reason="Too small"
    )

    assert request.status == "requested"
    assert len(request.items) == 1
    assert request.items[0].productName == "Oversized Tee"
    assert request.items[0].quantity == 1
    assert request.number == "UA3001-R1"

    refreshed = await Order.get(order.id)
    assert refreshed.status == "return requested"


@pytest.mark.usefixtures("db")
async def test_partial_quantity_leaves_the_rest_returnable():
    order = await _delivered_order()
    await returns_svc.create_request(order, user=None, selections=[{"index": 0, "quantity": 1}])

    check = await returns_svc.eligibility(order)
    tee = check["items"][0]
    assert tee["returnedQuantity"] == 1
    assert tee["returnableQuantity"] == 1


@pytest.mark.usefixtures("db")
async def test_cannot_return_more_than_was_ordered():
    order = await _delivered_order()
    with pytest.raises(HTTPException) as exc:
        await returns_svc.create_request(order, user=None, selections=[{"index": 0, "quantity": 5}])
    assert "can still be returned" in str(exc.value.detail)


@pytest.mark.usefixtures("db")
async def test_cannot_return_the_same_unit_twice():
    order = await _delivered_order()
    await returns_svc.create_request(order, user=None, selections=[{"index": 1, "quantity": 1}])
    with pytest.raises(HTTPException):
        await returns_svc.create_request(order, user=None, selections=[{"index": 1, "quantity": 1}])


@pytest.mark.usefixtures("db")
async def test_empty_selection_is_refused():
    order = await _delivered_order()
    with pytest.raises(HTTPException) as exc:
        await returns_svc.create_request(order, user=None, selections=[])
    assert "at least one item" in str(exc.value.detail)


@pytest.mark.usefixtures("db")
async def test_expired_window_blocks_creation():
    order = await _delivered_order(days_ago=4)
    with pytest.raises(HTTPException):
        await returns_svc.create_request(order, user=None, selections=[{"index": 0, "quantity": 1}])


# ---------------------------------------------------------------- refund amount


@pytest.mark.usefixtures("db")
async def test_refund_is_item_value_only():
    """Delivery charge is never refunded on a return."""
    order = await _delivered_order(deliveryAmount=99.0)
    request = await returns_svc.create_request(
        order, user=None, selections=[{"index": 0, "quantity": 2}]
    )
    assert request.refundAmount == 1400.0  # 2 x 700, no delivery


@pytest.mark.usefixtures("db")
async def test_order_discount_is_spread_across_returned_items():
    order = await _delivered_order(discountAmount=200.0)
    # Gross 2000; the cap is 600 of that, so it carries 30% of the discount.
    request = await returns_svc.create_request(
        order, user=None, selections=[{"index": 1, "quantity": 1}]
    )
    assert request.refundAmount == 540.0


# ---------------------------------------------------------------- approval


@pytest.mark.usefixtures("db")
async def test_approval_books_a_delhivery_reverse_pickup(mock_http):
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if "pin-codes" in request.url.path:
            return httpx.Response(
                200,
                json={"delivery_codes": [{"postal_code": {"pin": 682001, "pickup": "Y", "pre_paid": "Y"}}]},
            )
        import json as _json

        seen["payload"] = _json.loads(request.content.decode().split("data=", 1)[1])
        return httpx.Response(200, json={"packages": [{"waybill": "RV123", "status": "Success"}]})

    mock_http(handler)
    order = await _delivered_order()
    request = await returns_svc.create_request(order, user=None, selections=[{"index": 0, "quantity": 1}])
    result = await returns_svc.approve(request)

    assert result["pickupBooked"] is True
    assert seen["payload"]["shipments"][0]["payment_mode"] == "Pickup"
    assert seen["payload"]["shipments"][0]["pin"] == "682001"

    refreshed = await ReturnRequest.get(request.id)
    assert refreshed.status == "approved"
    assert refreshed.awb == "RV123"
    assert refreshed.pickupServiceable is True


@pytest.mark.usefixtures("db")
async def test_unpickable_pincode_still_approves_but_is_flagged(mock_http):
    """Approval must not be blocked — it is flagged for manual collection."""
    mock_http(
        lambda request: httpx.Response(
            200,
            json={"delivery_codes": [{"postal_code": {"pin": 682001, "pickup": "N", "pre_paid": "Y"}}]},
        )
    )
    order = await _delivered_order()
    request = await returns_svc.create_request(order, user=None, selections=[{"index": 0, "quantity": 1}])
    result = await returns_svc.approve(request)

    assert result["pickupBooked"] is False
    assert "does not offer pickup" in result["pickupError"]

    refreshed = await ReturnRequest.get(request.id)
    assert refreshed.status == "approved"
    assert refreshed.pickupServiceable is False
    assert refreshed.awb is None


@pytest.mark.usefixtures("db")
async def test_cannot_approve_twice(mock_http):
    mock_http(
        lambda request: httpx.Response(
            200, json={"delivery_codes": [{"postal_code": {"pin": 682001, "pickup": "N"}}]}
        )
    )
    order = await _delivered_order()
    request = await returns_svc.create_request(order, user=None, selections=[{"index": 0, "quantity": 1}])
    await returns_svc.approve(request)
    with pytest.raises(HTTPException):
        await returns_svc.approve(request)


# ---------------------------------------------------------------- reject / receive


@pytest.mark.usefixtures("db")
async def test_reject_frees_the_items_and_clears_order_status():
    order = await _delivered_order()
    request = await returns_svc.create_request(order, user=None, selections=[{"index": 0, "quantity": 2}])
    await returns_svc.reject(request, reason="Worn beyond resale")

    refreshed = await ReturnRequest.get(request.id)
    assert refreshed.status == "rejected"
    assert refreshed.rejectionReason == "Worn beyond resale"

    order_after = await Order.get(order.id)
    assert order_after.status == "delivered"
    # The rejected units are returnable again.
    assert (await returns_svc.eligibility(order_after))["items"][0]["returnableQuantity"] == 2


@pytest.mark.usefixtures("db")
async def test_received_restocks_and_never_refunds(mock_http):
    mock_http(
        lambda request: httpx.Response(
            200, json={"delivery_codes": [{"postal_code": {"pin": 682001, "pickup": "N"}}]}
        )
    )
    warehouse = await ensure_default_warehouse()
    product = Product(productName="Oversized Tee", totalStock=5)
    await product.insert()
    product_id = str(product.id)

    order = await _delivered_order()
    order.items[0].productId = product_id
    await order.save()

    balance = await get_or_create_balance(product_id, str(warehouse.id), "")
    balance.quantity = 5
    await balance.save()

    request = await returns_svc.create_request(order, user=None, selections=[{"index": 0, "quantity": 2}])
    await returns_svc.approve(request)
    result = await returns_svc.mark_received(request)

    assert result["restockedUnits"] == 2
    # Refund is surfaced for the admin, never taken automatically.
    assert result["refundDue"] == 1400.0

    after = await StockBalance.find_one(
        StockBalance.productId == product_id,
        StockBalance.warehouseId == str(warehouse.id),
    )
    assert after.quantity == 7

    order_after = await Order.get(order.id)
    assert order_after.paymentStatus == "paid"  # untouched
    assert result["restockErrors"] == []


@pytest.mark.usefixtures("db")
async def test_receipt_survives_a_deleted_product(mock_http):
    """A product removed since the order must not make the return un-receivable."""
    mock_http(
        lambda request: httpx.Response(
            200, json={"delivery_codes": [{"postal_code": {"pin": 682001, "pickup": "N"}}]}
        )
    )
    await ensure_default_warehouse()
    order = await _delivered_order()
    order.items[0].productId = "507f1f77bcf86cd799439011"  # valid id, no such product
    await order.save()

    request = await returns_svc.create_request(order, user=None, selections=[{"index": 0, "quantity": 1}])
    await returns_svc.approve(request)
    result = await returns_svc.mark_received(request)

    assert result["restockedUnits"] == 0
    assert len(result["restockErrors"]) == 1
    assert (await ReturnRequest.get(request.id)).status == "received"


@pytest.mark.usefixtures("db")
async def test_returning_everything_marks_the_order_returned(mock_http):
    mock_http(
        lambda request: httpx.Response(
            200, json={"delivery_codes": [{"postal_code": {"pin": 682001, "pickup": "N"}}]}
        )
    )
    order = await _delivered_order()
    request = await returns_svc.create_request(
        order,
        user=None,
        selections=[{"index": 0, "quantity": 2}, {"index": 1, "quantity": 1}],
    )
    await returns_svc.approve(request)
    await returns_svc.mark_received(request)

    order_after = await Order.get(order.id)
    assert order_after.status == "returned"
    assert order_after.shippingStatus == "Returned"


@pytest.mark.usefixtures("db")
async def test_partial_receipt_leaves_the_order_delivered(mock_http):
    mock_http(
        lambda request: httpx.Response(
            200, json={"delivery_codes": [{"postal_code": {"pin": 682001, "pickup": "N"}}]}
        )
    )
    order = await _delivered_order()
    request = await returns_svc.create_request(order, user=None, selections=[{"index": 1, "quantity": 1}])
    await returns_svc.approve(request)
    await returns_svc.mark_received(request)

    assert (await Order.get(order.id)).status == "delivered"


# ---------------------------------------------------------------- size SKU, double restock, order payloads


def _pickup_ok(mock_http):
    mock_http(
        lambda request: httpx.Response(
            200, json={"delivery_codes": [{"postal_code": {"pin": 682001, "pickup": "N"}}]}
        )
    )


async def _sized_product():
    from app.documents import Variant

    product = Product(
        productName="Indian Elephant",
        variants=[Variant(size="S", quantity=0, sku="EHY0G1-S"), Variant(size="M", quantity=5, sku="EHY0G1-M")],
    )
    await product.insert()
    return product


@pytest.mark.usefixtures("db")
async def test_return_line_records_the_size_sku():
    product = await _sized_product()
    order = await _delivered_order(
        items=[OrderItem(productId=str(product.id), productName="Indian Elephant", quantity=1, price=1199, size="S")]
    )
    request = await returns_svc.create_request(order, user=None, selections=[{"index": 0, "quantity": 1}])
    assert request.items[0].variantSku == "EHY0G1-S"


@pytest.mark.usefixtures("db")
async def test_receipt_restocks_the_size_row_even_for_old_blank_sku_requests(mock_http):
    _pickup_ok(mock_http)
    warehouse = await ensure_default_warehouse()
    product = await _sized_product()
    order = await _delivered_order(
        items=[OrderItem(productId=str(product.id), productName="Indian Elephant", quantity=1, price=1199, size="S")]
    )
    request = await returns_svc.create_request(order, user=None, selections=[{"index": 0, "quantity": 1}])
    request.items[0].variantSku = ""  # as saved before the fix
    await request.save()
    await returns_svc.approve(request)
    await returns_svc.mark_received(request)

    size_row = await StockBalance.find_one(
        StockBalance.productId == str(product.id),
        StockBalance.warehouseId == str(warehouse.id),
        StockBalance.variantSku == "EHY0G1-S",
    )
    assert size_row is not None and size_row.quantity == 1


@pytest.mark.usefixtures("db")
async def test_receipt_never_restocks_an_order_already_restocked(mock_http):
    _pickup_ok(mock_http)
    warehouse = await ensure_default_warehouse()
    product = Product(productName="Oversized Tee", totalStock=5)
    await product.insert()
    order = await _delivered_order()
    order.items[0].productId = str(product.id)
    order.transactionDetails = {"stockApplied": True, "stockRestocked": True}
    await order.save()
    balance = await get_or_create_balance(str(product.id), str(warehouse.id), "")
    balance.quantity = 5
    await balance.save()

    request = await returns_svc.create_request(order, user=None, selections=[{"index": 0, "quantity": 2}])
    await returns_svc.approve(request)
    result = await returns_svc.mark_received(request)

    assert result["restockedUnits"] == 0
    assert "already returned" in result["restockErrors"][0]
    after = await StockBalance.find_one(StockBalance.id == balance.id)
    assert after.quantity == 5


@pytest.mark.usefixtures("db")
async def test_admin_order_payload_carries_return_progress(mock_http):
    from app.serializers import enrich_orders

    _pickup_ok(mock_http)
    order = await _delivered_order()
    request = await returns_svc.create_request(order, user=None, selections=[{"index": 1, "quantity": 1}])

    payload = (await enrich_orders([await Order.get(order.id)]))[0]
    assert payload["status"] == "return requested"
    assert payload["returns"][0]["number"] == request.number
    assert payload["returns"][0]["label"] == "Return requested"

    await returns_svc.approve(request)
    payload = (await enrich_orders([await Order.get(order.id)]))[0]
    assert payload["returns"][0]["status"] == "approved"
    assert payload["returns"][0]["approvedAt"]


@pytest.mark.usefixtures("db")
async def test_retired_one_click_return_is_refused():
    from app.routers.admin import order_return

    order = await _delivered_order(status="return requested")
    with pytest.raises(HTTPException) as exc:
        await order_return(str(order.id), {"action": "approve"}, None)
    assert exc.value.status_code == 410
    assert (await Order.get(order.id)).status == "return requested"


@pytest.mark.usefixtures("db")
async def test_return_statuses_cannot_be_set_by_hand():
    from app.routers.admin import order_status

    order = await _delivered_order()
    for status in ("returned", "Return Requested"):
        with pytest.raises(HTTPException) as exc:
            await order_status(str(order.id), {"status": status}, None)
        assert exc.value.status_code == 400
    assert (await Order.get(order.id)).status == "delivered"


# ---------------------------------------------------------------- return numbers


@pytest.mark.usefixtures("db")
async def test_return_numbers_follow_the_order_number(mock_http):
    order = await _delivered_order(orderNumber="UA1586")
    first = await returns_svc.create_request(order, user=None, selections=[{"index": 1, "quantity": 1}])
    assert first.number == "UA1586-R1"

    await returns_svc.reject(first, reason="Worn")
    order = await Order.get(order.id)
    second = await returns_svc.create_request(order, user=None, selections=[{"index": 1, "quantity": 1}])
    # A rejected return still uses up its number.
    assert second.number == "UA1586-R2"


@pytest.mark.usefixtures("db")
async def test_older_rr_returns_on_the_order_still_count():
    order = await _delivered_order(orderNumber="UA1586")
    await ReturnRequest(
        number="RR-202609-00001", orderId=str(order.id), orderNumber="UA1586", status="rejected"
    ).insert()
    request = await returns_svc.create_request(order, user=None, selections=[{"index": 1, "quantity": 1}])
    assert request.number == "UA1586-R2"


@pytest.mark.usefixtures("db")
async def test_numbering_is_per_order():
    a = await _delivered_order(orderNumber="UA2001")
    b = await _delivered_order(orderNumber="UA2002")
    ra = await returns_svc.create_request(a, user=None, selections=[{"index": 1, "quantity": 1}])
    rb = await returns_svc.create_request(b, user=None, selections=[{"index": 1, "quantity": 1}])
    assert (ra.number, rb.number) == ("UA2001-R1", "UA2002-R1")


@pytest.mark.usefixtures("db")
async def test_order_without_a_number_falls_back_to_rr():
    order = await _delivered_order(orderNumber=None)
    request = await returns_svc.create_request(order, user=None, selections=[{"index": 1, "quantity": 1}])
    assert request.number.startswith("RR-")
