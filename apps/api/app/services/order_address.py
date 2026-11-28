"""Change the delivery address on a placed order, before it ships.

The order keeps its own copy of the address (``Order.shippingAddress``); this is
the one place that rewrites it after checkout. Shared by the customer
(``PUT /api/orders/{id}/shipping-address``) and staff
(``PUT /api/admin/orders/{id}/shipping-address``).

Rules
- Only until the courier is booked. Once there is an AWB the address is with the
  carrier: staff cancel the shipment first (which clears the AWB), then edit and
  book again. Customers can't.
- Customers: paid orders only, and the new address must be in the same state —
  the GST invoice is issued at payment, and its CGST+SGST / IGST split depends
  on the state. Staff may change the state; the invoice split is then redone.
- The new PIN code must pass the same deliverability check as checkout.
- The delivery fee already paid is kept as is (no top-up or refund).
- Every change is logged on ``transactionDetails.addressChanges``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from fastapi import HTTPException

from app.documents import Order, User
from app.services.customer_addresses import (
    AddressBody,
    address_from_body,
    find_address_index,
    normalize_indian_mobile,
)
from app.services.gst import resolve_state_code

Actor = Literal["admin", "customer"]

# The order is finished or handed back — no delivery to redirect.
CLOSED_STATUSES = {"cancelled", "canceled", "abandoned", "delivered", "return requested", "returned"}
# The parcel is with the courier; even cancelling the booking won't stop it.
MOVING_SHIPPING = {"in transit", "out for delivery", "delivered", "returned"}
HISTORY_LIMIT = 20


class OrderAddressBody(AddressBody):
    # Customer: pick one of their saved addresses instead of typing one.
    addressId: str | None = None


def _paid(order: Order) -> bool:
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    return str(order.paymentStatus or details.get("paymentStatus") or "").strip().lower() == "paid"


def _shipment_ref(order: Order) -> str | None:
    from app.services.couriers import shipment_reference

    return shipment_reference(order)


def edit_block_reason(order: Order, actor: Actor) -> str | None:
    """Why this address can't be changed right now, or None if it can."""
    status = str(order.status or "").strip().lower()
    if status in CLOSED_STATUSES or bool(order.isDelivered):
        return f"This order is {status or 'closed'}; its address can't be changed."
    if str(order.shippingStatus or "").strip().lower() in MOVING_SHIPPING:
        return "The parcel is already with the courier; its address can't be changed."
    if _shipment_ref(order):
        if actor == "customer":
            return "Your order has already been handed to the courier. Contact us to change the address."
        return "A shipment is already booked. Cancel the shipment first, then change the address."
    if actor == "customer" and not _paid(order):
        return "Only paid orders can have their address changed."
    return None


def address_editable(order: Order, actor: Actor) -> dict[str, Any]:
    """For the UI: whether to show the edit action, and why not."""
    reason = edit_block_reason(order, actor)
    return {
        "editable": reason is None,
        "reason": reason,
        "shipmentBooked": bool(_shipment_ref(order)),
        "sameStateOnly": actor == "customer",
    }


def _order_address(addr, *, email: str, extra: dict) -> dict[str, Any]:
    """Saved-address model → the order address shape couriers, emails and invoices read."""
    name = " ".join(str(addr.name or "").split())
    first, _, last = name.partition(" ")
    return {
        **extra,
        "name": name,
        "firstName": first,
        "lastName": last,
        "email": email,
        "phone": addr.phone,
        "address": addr.house,
        "address2": "",
        "city": addr.city,
        "state": addr.state,
        "postalCode": addr.pincode,
        "pincode": addr.pincode,
        "country": addr.country or "India",
    }


def _state_code(addr: dict) -> str:
    return resolve_state_code(addr.get("stateCode"), addr.get("state"), addr.get("stateName"))


async def _assert_deliverable(pincode: str) -> None:
    from app.services import couriers

    result = await couriers.deliverability(pincode)
    # Only a definite "no" blocks — an unreachable carrier API must not.
    if result.get("deliverable") is False and result.get("pincode"):
        raise HTTPException(
            status_code=400,
            detail=result.get("reason") or "We don't deliver to this PIN code yet.",
        )


async def change_order_address(
    order: Order,
    body: OrderAddressBody,
    *,
    actor: Actor,
    actor_id: str | None = None,
    customer: User | None = None,
) -> dict[str, Any]:
    """Validate and apply a new delivery address. Returns what changed."""
    reason = edit_block_reason(order, actor)
    if reason:
        raise HTTPException(status_code=400, detail=reason)

    old = dict(order.shippingAddress or {})
    fallback_name = str(old.get("name") or " ".join(filter(None, [old.get("firstName"), old.get("lastName")])) or "")
    fallback_phone = str(old.get("phone") or old.get("contact") or "")

    if body.addressId:
        # One of the customer's saved addresses, re-validated as if typed.
        if customer is None:
            raise HTTPException(status_code=400, detail="Saved addresses need the customer account.")
        saved = customer.addresses[find_address_index(customer, body.addressId)]
        body = OrderAddressBody(**{**saved.model_dump(), "addressId": None})

    new_addr = address_from_body(body, fallback_name=fallback_name, fallback_phone=fallback_phone)
    if len(normalize_indian_mobile(new_addr.phone)) != 10:
        raise HTTPException(status_code=400, detail="A 10-digit mobile number is needed for the courier.")
    if not new_addr.name:
        raise HTTPException(status_code=400, detail="Enter the recipient's name.")

    old_state, new_state = _state_code(old), resolve_state_code(new_addr.state)
    if new_addr.state and not new_state:
        raise HTTPException(status_code=400, detail=f"Unknown state: {new_addr.state}")
    state_changed = bool(old_state) and new_state != old_state
    if actor == "customer" and state_changed:
        raise HTTPException(
            status_code=400,
            detail="The new address must be in the same state. Contact us to deliver to another state.",
        )

    await _assert_deliverable(new_addr.pincode)

    # Keep fields the form doesn't own (email, Razorpay ids, …); drop stale aliases.
    carry = {k: v for k, v in old.items() if k not in {"zip", "zipcode", "zipCode", "stateCode", "stateName",
                                                        "house", "street", "contact", "mobile", "fullName"}}
    new = _order_address(new_addr, email=str(old.get("email") or ""), extra=carry)
    if new_state:
        new["stateCode"] = new_state

    watched = ("name", "phone", "address", "address2", "city", "state", "postalCode", "country")
    if all(str(old.get(k) or "") == str(new.get(k) or "") for k in watched):
        return {"changed": False, "stateChanged": False, "invoiceUpdated": False}

    now = datetime.utcnow()
    details = dict(order.transactionDetails or {})
    history = list(details.get("addressChanges") or [])[-(HISTORY_LIMIT - 1):]
    history.append(
        {
            "at": now,
            "by": actor,
            "actorId": actor_id,
            "from": {k: old.get(k) for k in watched + ("pincode",)},
            "to": {k: new.get(k) for k in watched},
        }
    )
    details["addressChanges"] = history
    order.transactionDetails = details
    order.shippingAddress = new
    order.updatedAt = now

    from app.services.dtdc_est_cost import apply_dtdc_est_cost

    apply_dtdc_est_cost(order)  # zone may have moved
    await order.save()

    invoice_updated = False
    if state_changed:
        from app.services import erp_ops

        invoice_updated = await erp_ops.refresh_invoice_place_of_supply(order)

    return {"changed": True, "stateChanged": state_changed, "invoiceUpdated": invoice_updated}
