from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.documents import Product, Variant, StockAlert, User
from app.services import stock_alerts


async def _product(sizes: dict[str, int], **overrides) -> Product:
    defaults = dict(
        productName="Indian Elephant",
        slug="indian-elephant",
        status="active",
        variants=[Variant(size=s, quantity=q, sku=f"IE-{s}") for s, q in sizes.items()],
    )
    product = Product(**{**defaults, **overrides})
    await product.insert()
    return product


@pytest.fixture
def mailbox(monkeypatch):
    """Capture outgoing email instead of calling Resend."""
    sent: list[dict] = []
    state = {"result": {"ok": True, "id": "em_1"}}

    async def fake_send(*, to, subject, html_body, reply_to=None):
        sent.append({"to": to, "subject": subject, "html": html_body})
        return state["result"]

    from app.services import email_resend

    monkeypatch.setattr(email_resend, "send_email", fake_send)
    return sent, state


# ---------------------------------------------------------------- stock maths


@pytest.mark.usefixtures("db")
async def test_size_stock_counts_one_size():
    product = await _product({"S": 0, "M": 3, "L": 0})
    assert stock_alerts.size_stock(product, "M") == 3
    assert stock_alerts.size_stock(product, "m") == 3  # case-insensitive
    assert stock_alerts.size_stock(product, "S") == 0


@pytest.mark.usefixtures("db")
async def test_blank_size_means_the_whole_product():
    product = await _product({"S": 0, "M": 2})
    assert stock_alerts.size_stock(product, "") == 2


# ---------------------------------------------------------------- subscribing


@pytest.mark.usefixtures("db")
async def test_subscribe_to_a_sold_out_size():
    product = await _product({"S": 0, "M": 3})
    result = await stock_alerts.subscribe(str(product.id), email="Shopper@Example.com", size="S")
    assert result == {"subscribed": True, "inStock": False, "alreadyWaiting": False}

    alert = await StockAlert.find_one(StockAlert.productId == str(product.id))
    assert alert.email == "shopper@example.com"  # normalised
    assert alert.size == "S"
    assert alert.status == "pending"


@pytest.mark.usefixtures("db")
async def test_subscribing_twice_does_not_duplicate():
    product = await _product({"S": 0})
    await stock_alerts.subscribe(str(product.id), email="a@b.com", size="S")
    again = await stock_alerts.subscribe(str(product.id), email="A@B.com", size="S")
    assert again["alreadyWaiting"] is True
    assert await StockAlert.find_all().count() == 1


@pytest.mark.usefixtures("db")
async def test_in_stock_size_is_not_queued():
    """Nothing to wait for — tell the shopper instead of emailing them later."""
    product = await _product({"M": 4})
    result = await stock_alerts.subscribe(str(product.id), email="a@b.com", size="M")
    assert result == {"subscribed": False, "inStock": True}
    assert await StockAlert.find_all().count() == 0


@pytest.mark.usefixtures("db")
async def test_signed_in_shopper_can_omit_email():
    product = await _product({"S": 0})
    user = User(name="Buyer", email="buyer@example.com")
    await user.insert()
    await stock_alerts.subscribe(str(product.id), email=None, size="S", user=user)
    alert = await StockAlert.find_one(StockAlert.productId == str(product.id))
    assert alert.email == "buyer@example.com"
    assert alert.customerId == str(user.id)


@pytest.mark.parametrize("bad", ["", "not-an-email", "a@b", "@example.com", None])
@pytest.mark.usefixtures("db")
async def test_invalid_email_is_refused(bad):
    product = await _product({"S": 0})
    with pytest.raises(HTTPException) as exc:
        await stock_alerts.subscribe(str(product.id), email=bad, size="S")
    assert exc.value.status_code == 400


@pytest.mark.usefixtures("db")
async def test_unknown_size_is_refused():
    product = await _product({"S": 0, "M": 0})
    with pytest.raises(HTTPException) as exc:
        await stock_alerts.subscribe(str(product.id), email="a@b.com", size="XXL")
    assert "isn't offered" in str(exc.value.detail)


@pytest.mark.usefixtures("db")
async def test_missing_or_draft_product_is_refused():
    with pytest.raises(HTTPException) as exc:
        await stock_alerts.subscribe("507f1f77bcf86cd799439011", email="a@b.com")
    assert exc.value.status_code == 404

    draft = await _product({"S": 0}, status="draft")
    with pytest.raises(HTTPException):
        await stock_alerts.subscribe(str(draft.id), email="a@b.com", size="S")


# ---------------------------------------------------------------- dispatching


@pytest.mark.usefixtures("db")
async def test_restocked_size_emails_the_shopper(mailbox):
    sent, _ = mailbox
    product = await _product({"S": 0})
    await stock_alerts.subscribe(str(product.id), email="a@b.com", size="S")

    product.variants[0].quantity = 5
    await product.save()
    counts = await stock_alerts.dispatch_due_alerts()

    assert counts["sent"] == 1
    assert len(sent) == 1
    assert sent[0]["to"] == "a@b.com"
    assert sent[0]["subject"] == "Back in stock: Indian Elephant (S)"
    assert "/product/indian-elephant" in sent[0]["html"]

    alert = await StockAlert.find_one(StockAlert.productId == str(product.id))
    assert alert.status == "sent"
    assert alert.notifiedAt is not None


@pytest.mark.usefixtures("db")
async def test_still_sold_out_keeps_waiting(mailbox):
    sent, _ = mailbox
    product = await _product({"S": 0, "M": 9})
    await stock_alerts.subscribe(str(product.id), email="a@b.com", size="S")
    counts = await stock_alerts.dispatch_due_alerts()
    # Another size being in stock is not the size they asked about.
    assert counts == {"checked": 1, "sent": 0, "failed": 0, "cancelled": 0, "waiting": 1}
    assert sent == []


@pytest.mark.usefixtures("db")
async def test_each_alert_is_sent_only_once(mailbox):
    sent, _ = mailbox
    product = await _product({"S": 0})
    await stock_alerts.subscribe(str(product.id), email="a@b.com", size="S")
    product.variants[0].quantity = 5
    await product.save()

    await stock_alerts.dispatch_due_alerts()
    await stock_alerts.dispatch_due_alerts()
    assert len(sent) == 1


@pytest.mark.usefixtures("db")
async def test_failed_send_is_retried_next_sweep(mailbox):
    sent, state = mailbox
    product = await _product({"S": 0})
    await stock_alerts.subscribe(str(product.id), email="a@b.com", size="S")
    product.variants[0].quantity = 5
    await product.save()

    state["result"] = {"ok": False, "error": "rate limited"}
    first = await stock_alerts.dispatch_due_alerts()
    assert first["failed"] == 1
    alert = await StockAlert.find_one(StockAlert.productId == str(product.id))
    assert alert.status == "pending"
    assert alert.lastError == "rate limited"

    state["result"] = {"ok": True}
    second = await stock_alerts.dispatch_due_alerts()
    assert second["sent"] == 1
    assert len(sent) == 2


@pytest.mark.usefixtures("db")
async def test_unconfigured_email_closes_alerts_instead_of_looping(mailbox):
    """Retrying every sweep could never succeed without an email provider."""
    _, state = mailbox
    product = await _product({"S": 0})
    await stock_alerts.subscribe(str(product.id), email="a@b.com", size="S")
    product.variants[0].quantity = 5
    await product.save()

    state["result"] = {"skipped": True, "reason": "resend_not_configured"}
    await stock_alerts.dispatch_due_alerts()
    alert = await StockAlert.find_one(StockAlert.productId == str(product.id))
    assert alert.status == "sent"
    assert alert.lastError == "resend_not_configured"


@pytest.mark.usefixtures("db")
async def test_alerts_for_a_deleted_product_are_cancelled(mailbox):
    sent, _ = mailbox
    product = await _product({"S": 0})
    await stock_alerts.subscribe(str(product.id), email="a@b.com", size="S")
    await product.delete()

    counts = await stock_alerts.dispatch_due_alerts()
    assert counts["cancelled"] == 1
    assert sent == []


@pytest.mark.usefixtures("db")
async def test_many_shoppers_on_one_product_load_it_once(mailbox, monkeypatch):
    sent, _ = mailbox
    product = await _product({"S": 0})
    for i in range(5):
        await stock_alerts.subscribe(str(product.id), email=f"s{i}@b.com", size="S")
    product.variants[0].quantity = 5
    await product.save()

    loads = {"n": 0}
    original = stock_alerts._product

    async def counting(pid):
        loads["n"] += 1
        return await original(pid)

    monkeypatch.setattr(stock_alerts, "_product", counting)
    counts = await stock_alerts.dispatch_due_alerts()
    assert counts["sent"] == 5
    assert loads["n"] == 1


# ---------------------------------------------------------------- endpoint


@pytest.mark.usefixtures("db")
async def test_anonymous_shopper_can_subscribe_over_http():
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app

    product = await _product({"S": 0})
    transport = ASGITransport(app=create_app(with_lifespan=False))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        ok = await client.post(
            f"/api/products/{product.id}/stock-alerts", json={"email": "a@b.com", "size": "S"}
        )
        bad = await client.post(
            f"/api/products/{product.id}/stock-alerts", json={"email": "nope", "size": "S"}
        )
    assert ok.status_code == 201
    assert ok.json()["subscribed"] is True
    assert bad.status_code == 400
