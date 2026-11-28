"""Extract and persist Razorpay payment instrument details (card / UPI / netbanking).

Note: method label "wallet" means Razorpay's payment instrument type (e.g. Paytm wallet),
not the removed store-credit wallet feature.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any


INSTRUMENT_LABELS = {
    "card": "Card",
    "upi": "UPI",
    "netbanking": "Netbanking",
    "wallet": "Wallet",
    "emi": "EMI",
    "cardless_emi": "Cardless EMI",
    "paylater": "Pay Later",
}


def _as_dict(value: Any) -> dict:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    try:
        return dict(value)
    except Exception:
        return {}


def extract_instrument(payment: dict | None) -> dict[str, Any]:
    """Normalize Razorpay payment entity into display-friendly instrument fields."""
    payment = _as_dict(payment)
    if not payment:
        return {}

    method = str(payment.get("method") or "").strip().lower()
    if not method:
        return {}

    out: dict[str, Any] = {
        "instrument": method,
        "instrumentLabel": INSTRUMENT_LABELS.get(method, method.replace("_", " ").title()),
    }

    card = _as_dict(payment.get("card"))
    if method == "card" and card:
        last4 = str(card.get("last4") or "").strip()
        network = str(card.get("network") or "").strip()
        card_type = str(card.get("type") or "").strip()
        issuer = str(card.get("issuer") or "").strip()
        if network:
            out["cardNetwork"] = network
        if last4:
            out["cardLast4"] = last4
        if card_type:
            out["cardType"] = card_type
        if issuer:
            out["cardIssuer"] = issuer
        bits = [p for p in [network, f"···{last4}" if last4 else ""] if p]
        if bits:
            out["instrumentDetail"] = " ".join(bits)
        elif last4:
            out["instrumentDetail"] = f"···{last4}"

    vpa = str(payment.get("vpa") or "").strip()
    if method == "upi" and vpa:
        out["vpa"] = vpa
        out["instrumentDetail"] = vpa

    bank = str(payment.get("bank") or "").strip()
    if method == "netbanking" and bank:
        out["bank"] = bank
        out["instrumentDetail"] = bank

    wallet = str(payment.get("wallet") or "").strip()
    if method == "wallet" and wallet:
        out["wallet"] = wallet
        out["instrumentDetail"] = wallet.title()

    acquirer = _as_dict(payment.get("acquirer_data"))
    rrn = str(
        acquirer.get("rrn")
        or acquirer.get("upi_transaction_id")
        or acquirer.get("authentication_reference_number")
        or ""
    ).strip()
    if rrn:
        out["rrn"] = rrn

    if payment.get("id"):
        out["razorpayPaymentId"] = str(payment.get("id"))
    if payment.get("order_id"):
        out["razorpayOrderId"] = str(payment.get("order_id"))

    label = out["instrumentLabel"]
    detail = out.get("instrumentDetail")
    out["instrumentDisplay"] = f"{label} · {detail}" if detail else label
    return out


def apply_instrument_to_order(order: Any, payment: dict | None) -> bool:
    """Merge instrument fields into order.transactionDetails. Returns True if changed."""
    extracted = extract_instrument(payment)
    if not extracted:
        return False

    td = dict(order.transactionDetails or {})
    changed = False
    for key, value in extracted.items():
        if value is None or value == "":
            continue
        if td.get(key) != value:
            td[key] = value
            changed = True

    # Keep gateway method (razorpay) separate from instrument (upi/card/…).
    if not td.get("paymentMethod") and getattr(order, "paymentMethod", None):
        td["paymentMethod"] = order.paymentMethod
        changed = True

    if changed:
        order.transactionDetails = td
        if extracted.get("razorpayPaymentId") and not getattr(order, "razorpayPaymentId", None):
            order.razorpayPaymentId = extracted["razorpayPaymentId"]
        if extracted.get("razorpayOrderId") and not getattr(order, "razorpayOrderId", None):
            order.razorpayOrderId = extracted["razorpayOrderId"]
        order.updatedAt = datetime.utcnow()
    return changed


def order_needs_instrument(order: Any) -> bool:
    td = order.transactionDetails or {}
    if td.get("instrument") or td.get("instrumentDisplay"):
        return False
    return True


async def _resolve_payment_id(order: Any) -> str | None:
    td = order.transactionDetails or {}
    direct = (
        getattr(order, "razorpayPaymentId", None)
        or td.get("razorpayPaymentId")
        or td.get("paymentId")
    )
    if direct:
        return str(direct)

    try:
        from app.documents import PaymentTransaction

        txn = await PaymentTransaction.find_one(PaymentTransaction.orderId == order.id)
        if not txn and getattr(order, "razorpayOrderId", None):
            txn = await PaymentTransaction.find_one(
                PaymentTransaction.razorpayOrderId == order.razorpayOrderId
            )
        if txn and txn.razorpayPaymentId:
            return str(txn.razorpayPaymentId)
        payload = txn.webhookPayload if txn else None
        payment = (((payload or {}).get("payload") or {}).get("payment") or {}).get("entity") or {}
        if payment.get("id"):
            return str(payment["id"])
    except Exception as exc:
        print(f"[Payment] resolve payment id failed: {exc}")
    return None


async def _fetch_payment_entity(client: Any, payment_id: str) -> dict:
    payment = _as_dict(client.payment.fetch(str(payment_id)))

    # Card object is sometimes omitted; fetch card details explicitly.
    if str(payment.get("method") or "").lower() == "card" and not _as_dict(payment.get("card")):
        try:
            card = None
            if hasattr(client.payment, "fetchCardDetails"):
                card = client.payment.fetchCardDetails(str(payment_id))
            elif payment.get("card_id"):
                card = client.card.fetch(str(payment["card_id"]))
            card = _as_dict(card)
            if card:
                payment = {**payment, "card": card}
        except Exception as exc:
            print(f"[Payment] card expand failed for {payment_id}: {exc}")

    return payment


async def ensure_order_instrument(order: Any) -> bool:
    """Fetch Razorpay payment and backfill Paid via (instrument) if missing. Best-effort."""
    if not order_needs_instrument(order):
        return False

    # Prefer webhook payload already on the transaction (no API call).
    try:
        from app.documents import PaymentTransaction

        txn = await PaymentTransaction.find_one(PaymentTransaction.orderId == order.id)
        if not txn and getattr(order, "razorpayOrderId", None):
            txn = await PaymentTransaction.find_one(
                PaymentTransaction.razorpayOrderId == order.razorpayOrderId
            )
        if txn and isinstance(txn.webhookPayload, dict):
            payment = (((txn.webhookPayload or {}).get("payload") or {}).get("payment") or {}).get("entity")
            if apply_instrument_to_order(order, payment):
                if not order.razorpayPaymentId and txn.razorpayPaymentId:
                    order.razorpayPaymentId = txn.razorpayPaymentId
                await order.save()
                return True
    except Exception:
        pass

    payment_id = await _resolve_payment_id(order)
    if not payment_id:
        return False

    try:
        from app.services import razorpay_cfg
        import razorpay

        key_id, key_secret = razorpay_cfg.require_creds()
        client = razorpay.Client(auth=(key_id, key_secret))
        payment = await _fetch_payment_entity(client, payment_id)
    except Exception as exc:
        print(f"[Payment] instrument backfill failed for {payment_id}: {exc}")
        return False

    if apply_instrument_to_order(order, payment):
        if not order.razorpayPaymentId:
            order.razorpayPaymentId = payment_id
        await order.save()
        return True
    return False
