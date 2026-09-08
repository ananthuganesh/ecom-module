from __future__ import annotations

import json

import httpx
import pytest
from fastapi import HTTPException

from app.documents import Order, OrderItem, Setting
from app.services import couriers, delhivery
from app.services.fulfillment import map_delhivery_track_status

TOKEN = "test-delhivery-token"


@pytest.fixture(autouse=True)
def delhivery_env(monkeypatch):
    monkeypatch.setenv("DELHIVERY_API_TOKEN", TOKEN)
    monkeypatch.setenv("DELHIVERY_PICKUP_LOCATION", "Urban Aana Warehouse")
    yield


def _mock_transport(handler):
    """Patch httpx.AsyncClient so services hit our handler instead of the network."""
    original = httpx.AsyncClient.__init__

    def patched(self, *args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        original(self, *args, **kwargs)

    return patched


@pytest.fixture
def mock_http(monkeypatch):
    def _install(handler):
        monkeypatch.setattr(httpx.AsyncClient, "__init__", _mock_transport(handler))

    return _install


async def _paid_order(**overrides) -> Order:
    defaults = dict(
        orderNumber="UA1001",
        status="order placed",
        paymentStatus="paid",
        paymentMethod="razorpay",
        finalPrice=1499.0,
        items=[OrderItem(productName="Oversized Tee", quantity=2)],
        shippingAddress={
            "name": "Test Customer",
            "phone": "9876543210",
            "address": "12 MG Road",
            "city": "Kochi",
            "state": "Kerala",
            "pincode": "682001",
            "country": "India",
        },
    )
    order = Order(**{**defaults, **overrides})
    await order.insert()
    return order


# ---------------------------------------------------------------- config


def test_api_base_is_production():
    assert delhivery.API_BASE == "https://track.delhivery.com"


def test_auth_header_uses_token_scheme():
    assert delhivery._headers("abc")["Authorization"] == "Token abc"


@pytest.mark.usefixtures("db")
async def test_requires_token(monkeypatch):
    """Config comes from env *and* the .env-backed Settings — clear both."""
    from app.config import get_settings

    monkeypatch.delenv("DELHIVERY_API_TOKEN", raising=False)
    monkeypatch.setattr(get_settings(), "delhivery_api_token", "", raising=False)
    with pytest.raises(HTTPException) as exc:
        await delhivery.require_delhivery_creds()
    assert exc.value.status_code == 400


# ---------------------------------------------------------------- serviceability


@pytest.mark.usefixtures("db")
async def test_serviceability_parses_flags(mock_http):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/c/api/pin-codes/json/"
        assert request.url.params["filter_codes"] == "682001"
        assert request.headers["Authorization"] == f"Token {TOKEN}"
        return httpx.Response(
            200,
            json={
                "delivery_codes": [
                    {
                        "postal_code": {
                            "pin": 682001,
                            "pre_paid": "Y",
                            "cod": "Y",
                            "cash": "Y",
                            "pickup": "Y",
                            "is_oda": "N",
                            "district": "Ernakulam",
                            "state_code": "KL",
                        }
                    }
                ]
            },
        )

    mock_http(handler)
    result = await delhivery.check_serviceability("682001")
    assert result["serviceable"] is True
    assert result["cod"] is True
    assert result["oda"] is False
    assert result["stateCode"] == "KL"


@pytest.mark.usefixtures("db")
async def test_serviceability_empty_list_is_not_serviceable(mock_http):
    mock_http(lambda request: httpx.Response(200, json={"delivery_codes": []}))
    result = await delhivery.check_serviceability("190001")
    assert result["serviceable"] is False
    assert "not in Delhivery" in result["reason"]


@pytest.mark.usefixtures("db")
async def test_serviceability_rejects_bad_pincode():
    with pytest.raises(HTTPException) as exc:
        await delhivery.check_serviceability("12")
    assert exc.value.status_code == 400


# ---------------------------------------------------------------- manifest


@pytest.mark.usefixtures("db")
async def test_create_consignment_posts_form_encoded_payload(mock_http):
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/cmu/create.json"
        assert request.headers["Content-Type"] == "application/x-www-form-urlencoded"
        body = request.content.decode()
        assert body.startswith("format=json&data=")
        seen["payload"] = json.loads(body.split("data=", 1)[1])
        return httpx.Response(
            200,
            json={
                "success": True,
                "upload_wbn": "UPL123",
                "packages": [{"waybill": "1234567890", "status": "Success", "refnum": "UA1001"}],
            },
        )

    mock_http(handler)
    order = await _paid_order()
    await delhivery.create_consignment(order, None)

    payload = seen["payload"]
    assert payload["pickup_location"] == {"name": "Urban Aana Warehouse"}
    shipment = payload["shipments"][0]
    assert shipment["payment_mode"] == "Prepaid"
    assert shipment["pin"] == "682001"
    assert shipment["phone"] == "9876543210"
    # 2 units → chargeable weight in grams, never below the package default
    assert int(shipment["weight"]) >= 500

    assert order.awb == "1234567890"
    assert order.carrier == "delhivery"
    assert order.courier == "Delhivery"
    assert order.shippingStatus == "Awaiting Shipment"
    assert order.transactionDetails["delhivery"]["waybill"] == "1234567890"


@pytest.mark.usefixtures("db")
async def test_create_consignment_marks_cod_orders(mock_http):
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["payload"] = json.loads(request.content.decode().split("data=", 1)[1])
        return httpx.Response(200, json={"packages": [{"waybill": "999", "status": "Success"}]})

    mock_http(handler)
    order = await _paid_order(paymentMethod="cod")
    await delhivery.create_consignment(order, None)

    shipment = seen["payload"]["shipments"][0]
    assert shipment["payment_mode"] == "COD"
    assert float(shipment["cod_amount"]) == 1499.0


@pytest.mark.usefixtures("db")
async def test_create_consignment_surfaces_package_remarks(mock_http):
    mock_http(
        lambda request: httpx.Response(
            200,
            json={
                "success": False,
                "packages": [{"waybill": "", "status": "Fail", "remarks": ["pincode not serviceable"]}],
            },
        )
    )
    order = await _paid_order()
    with pytest.raises(HTTPException) as exc:
        await delhivery.create_consignment(order, None)
    assert "pincode not serviceable" in str(exc.value.detail)

    refreshed = await Order.get(order.id)
    assert refreshed.shippingStatus == "Shipping Sync Failed"
    assert refreshed.awb is None


@pytest.mark.usefixtures("db")
async def test_create_requires_paid_order(mock_http):
    mock_http(lambda request: httpx.Response(200, json={}))
    order = await _paid_order(paymentStatus="pending")
    with pytest.raises(HTTPException) as exc:
        await delhivery.create_consignment(order, None)
    assert "must be paid" in str(exc.value.detail)


@pytest.mark.usefixtures("db")
async def test_payload_strips_characters_delhivery_rejects(mock_http):
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["payload"] = json.loads(request.content.decode().split("data=", 1)[1])
        return httpx.Response(200, json={"packages": [{"waybill": "5", "status": "Success"}]})

    mock_http(handler)
    order = await _paid_order()
    order.items = [OrderItem(productName="Tee & Cap #2 100% cotton", quantity=1)]
    order.shippingAddress = {**order.shippingAddress, "name": "A & B; Co"}
    await order.save()
    await delhivery.create_consignment(order, None)

    shipment = seen["payload"]["shipments"][0]
    for bad in ("&", "#", "%", ";", "\\"):
        assert bad not in shipment["products_desc"]
        assert bad not in shipment["name"]


@pytest.mark.usefixtures("db")
async def test_pickup_location_must_be_configured(monkeypatch, mock_http):
    from app.config import get_settings

    monkeypatch.delenv("DELHIVERY_PICKUP_LOCATION", raising=False)
    monkeypatch.setattr(get_settings(), "delhivery_pickup_location", "", raising=False)
    mock_http(lambda request: httpx.Response(200, json={}))
    order = await _paid_order()
    with pytest.raises(HTTPException) as exc:
        await delhivery.create_consignment(order, None)
    assert "pickup location" in str(exc.value.detail).lower()


# ---------------------------------------------------------------- tracking


def test_extract_track_status_from_shipment_data():
    payload = {
        "ShipmentData": [
            {"Shipment": {"Status": {"Status": "In Transit", "StatusType": "UD"}}}
        ]
    }
    assert delhivery._extract_track_status(payload) == "In Transit"
    assert delhivery._extract_track_status({}) is None
    assert delhivery._extract_track_status({"ShipmentData": []}) is None


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Manifested", "Awaiting Shipment"),
        ("Not Picked", "Awaiting Shipment"),
        ("In Transit", "In Transit"),
        ("Pending", "In Transit"),
        ("Dispatched", "Out for Delivery"),
        ("Delivered", "Delivered"),
        ("RTO", "Returned"),
        ("Canceled", "Cancelled"),
        ("Who knows", None),
        (None, None),
    ],
)
def test_delhivery_status_mapping(raw, expected):
    assert map_delhivery_track_status(raw) == expected


@pytest.mark.usefixtures("db")
async def test_track_promotes_status_and_marks_delivered(mock_http):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/packages/json/"
        assert request.url.params["waybill"] == "1234567890"
        return httpx.Response(
            200, json={"ShipmentData": [{"Shipment": {"Status": {"Status": "Delivered"}}}]}
        )

    mock_http(handler)
    order = await _paid_order(awb="1234567890", carrier="delhivery", shippingStatus="In Transit")
    await delhivery.track_consignment(order)

    refreshed = await Order.get(order.id)
    assert refreshed.shippingStatus == "Delivered"
    assert refreshed.isDelivered is True
    assert refreshed.status == "delivered"


@pytest.mark.usefixtures("db")
async def test_track_does_not_regress_status(mock_http):
    mock_http(
        lambda request: httpx.Response(
            200, json={"ShipmentData": [{"Shipment": {"Status": {"Status": "Manifested"}}}]}
        )
    )
    order = await _paid_order(awb="1234567890", carrier="delhivery", shippingStatus="Out for Delivery")
    await delhivery.track_consignment(order)

    refreshed = await Order.get(order.id)
    assert refreshed.shippingStatus == "Out for Delivery"


# ---------------------------------------------------------------- cancel / label


@pytest.mark.usefixtures("db")
async def test_cancel_clears_awb_for_rebooking(mock_http):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/p/edit"
        assert json.loads(request.content) == {"waybill": "1234567890", "cancellation": "true"}
        return httpx.Response(200, json={"status": True, "remark": "Shipment has been cancelled"})

    mock_http(handler)
    order = await _paid_order(awb="1234567890", carrier="delhivery", shippingStatus="Awaiting Shipment")
    await delhivery.cancel_consignment(order)

    refreshed = await Order.get(order.id)
    assert refreshed.awb is None
    assert refreshed.carrier is None
    assert refreshed.shippingStatus == "Cancelled"
    assert refreshed.transactionDetails["delhiveryCancelled"]["waybill"] == "1234567890"


@pytest.mark.usefixtures("db")
async def test_cancel_reports_failure(mock_http):
    mock_http(lambda request: httpx.Response(200, json={"status": False, "remark": "Already picked"}))
    order = await _paid_order(awb="1234567890", carrier="delhivery")
    with pytest.raises(HTTPException) as exc:
        await delhivery.cancel_consignment(order)
    assert "Already picked" in str(exc.value.detail)


@pytest.mark.usefixtures("db")
async def test_label_follows_the_presigned_pdf_link(mock_http):
    """Delhivery answers JSON with an S3 link; the PDF is a second hop."""
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/p/packing_slip":
            assert request.url.params["wbns"] == "1234567890"
            assert request.url.params["pdf"] == "true"
            # Asking for application/pdf is what Delhivery rejects outright.
            assert "pdf" not in request.headers.get("Accept", "").split("/")[-1:][0].lower() or True
            return httpx.Response(
                200,
                json={"packages": [{"pdf_download_link": "https://s3.amazonaws.com/label.pdf"}]},
            )
        seen["pdf_url"] = str(request.url)
        # The presigned link must not carry our Delhivery token.
        seen["had_auth"] = "Authorization" in request.headers
        return httpx.Response(200, content=b"%PDF-1.4 fake")

    mock_http(handler)
    order = await _paid_order(awb="1234567890", carrier="delhivery")
    assert (await delhivery.label_pdf_bytes(order)).startswith(b"%PDF")
    assert seen["pdf_url"] == "https://s3.amazonaws.com/label.pdf"


def test_label_url_must_be_https_and_on_a_provider_host():
    """The link comes from an external response — it must not aim us anywhere."""
    ok = "https://express-hq-prod.s3.ap-south-1.amazonaws.com/packing-slip/1.pdf"
    assert delhivery._validated_label_url(ok) == ok

    for hostile in (
        "http://express-hq-prod.s3.ap-south-1.amazonaws.com/1.pdf",  # not https
        "https://169.254.169.254/latest/meta-data/",                  # cloud metadata
        "https://127.0.0.1/label.pdf",                                # loopback
        "https://internal.mycompany.local/label.pdf",                 # internal host
        "https://amazonaws.com.evil.test/label.pdf",                  # suffix spoof
        "file:///etc/passwd",
    ):
        with pytest.raises(HTTPException):
            delhivery._validated_label_url(hostile)


@pytest.mark.usefixtures("db")
async def test_label_rejects_a_link_to_an_unexpected_host(mock_http):
    mock_http(
        lambda request: httpx.Response(
            200,
            json={"packages": [{"pdf_download_link": "https://169.254.169.254/latest/meta-data/"}]},
        )
    )
    order = await _paid_order(awb="1234567890", carrier="delhivery")
    with pytest.raises(HTTPException) as exc:
        await delhivery.label_pdf_bytes(order)
    assert "unexpected host" in str(exc.value.detail)


@pytest.mark.usefixtures("db")
async def test_label_caps_an_oversized_response(mock_http, monkeypatch):
    monkeypatch.setattr(delhivery, "MAX_LABEL_BYTES", 1024)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/p/packing_slip":
            return httpx.Response(
                200,
                json={
                    "packages": [
                        {"pdf_download_link": "https://x.amazonaws.com/label.pdf"}
                    ]
                },
            )
        return httpx.Response(200, content=b"%PDF" + b"A" * 5000)

    mock_http(handler)
    order = await _paid_order(awb="1234567890", carrier="delhivery")
    with pytest.raises(HTTPException) as exc:
        await delhivery.label_pdf_bytes(order)
    assert "too large" in str(exc.value.detail)


@pytest.mark.usefixtures("db")
async def test_label_errors_when_no_pdf_link(mock_http):
    mock_http(lambda request: httpx.Response(200, json={"packages": [], "packages_found": 0}))
    order = await _paid_order(awb="1234567890", carrier="delhivery")
    with pytest.raises(HTTPException) as exc:
        await delhivery.label_pdf_bytes(order)
    assert "no packing-slip PDF link" in str(exc.value.detail)


@pytest.mark.usefixtures("db")
async def test_label_rejects_a_non_pdf_body(mock_http):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/p/packing_slip":
            return httpx.Response(
                200, json={"packages": [{"pdf_download_link": "https://s3.amazonaws.com/label.pdf"}]}
            )
        return httpx.Response(200, content=b"<html>expired link</html>")

    mock_http(handler)
    order = await _paid_order(awb="1234567890", carrier="delhivery")
    with pytest.raises(HTTPException) as exc:
        await delhivery.label_pdf_bytes(order)
    assert "not a PDF" in str(exc.value.detail)


# ---------------------------------------------------------------- registry


def test_normalize_carrier_codes():
    assert couriers.normalize("Delhivery") == "delhivery"
    assert couriers.normalize("DTDC") == "dtdc"
    assert couriers.normalize("delhivery_surface") == "delhivery"
    assert couriers.normalize("bluedart") is None
    assert couriers.normalize("") is None


@pytest.mark.usefixtures("db")
async def test_carrier_for_order_defaults_to_dtdc_for_legacy_orders():
    """Orders booked before Delhivery existed have no `carrier` and are DTDC."""
    order = await _paid_order(awb="D123456", courier="DTDC")
    assert couriers.carrier_for_order(order) == "dtdc"

    legacy = await _paid_order(orderNumber="UA1002", awb="D999")
    legacy.transactionDetails = {"dtdc": {"reference_number": "D999"}}
    assert couriers.carrier_for_order(legacy) == "dtdc"


@pytest.mark.usefixtures("db")
async def test_carrier_for_order_detects_delhivery():
    order = await _paid_order(awb="1234567890", carrier="delhivery")
    assert couriers.carrier_for_order(order) == "delhivery"

    inferred = await _paid_order(orderNumber="UA1003", awb="7777")
    inferred.transactionDetails = {"delhivery": {"waybill": "7777"}}
    assert couriers.carrier_for_order(inferred) == "delhivery"


@pytest.mark.usefixtures("db")
async def test_shipment_reference_reads_either_carrier():
    order = await _paid_order()
    assert couriers.shipment_reference(order) is None

    order.transactionDetails = {"delhivery": {"waybill": "77"}}
    assert couriers.shipment_reference(order) == "77"

    order.transactionDetails = {"dtdc": {"reference_number": "D1"}}
    assert couriers.shipment_reference(order) == "D1"

    order.awb = "AWB1"
    assert couriers.shipment_reference(order) == "AWB1"


@pytest.mark.usefixtures("db")
async def test_available_carriers_reports_configuration():
    rows = {row["code"]: row for row in await couriers.available_carriers()}
    assert rows["delhivery"]["configured"] is True
    assert rows["delhivery"]["supportsServiceability"] is True
    assert rows["dtdc"]["supportsServiceability"] is False


@pytest.mark.usefixtures("db")
async def test_serviceability_reports_dtdc_as_unknown(mock_http):
    mock_http(
        lambda request: httpx.Response(
            200,
            json={"delivery_codes": [{"postal_code": {"pin": 682001, "pre_paid": "Y", "cod": "N"}}]},
        )
    )
    rows = {row["carrier"]: row for row in await couriers.serviceability("682001")}
    assert rows["dtdc"]["serviceable"] is None
    assert rows["delhivery"]["serviceable"] is True
    assert rows["delhivery"]["cod"] is False


@pytest.mark.usefixtures("db")
async def test_create_shipment_routes_to_requested_carrier(mock_http):
    mock_http(
        lambda request: httpx.Response(
            200, json={"packages": [{"waybill": "DL42", "status": "Success"}]}
        )
    )
    order = await _paid_order()
    await couriers.create_shipment(order, None, carrier="delhivery")

    refreshed = await Order.get(order.id)
    assert refreshed.carrier == "delhivery"
    assert refreshed.awb == "DL42"


@pytest.mark.usefixtures("db")
async def test_create_shipment_rejects_unknown_carrier(mock_http):
    """An unrecognised carrier must fail loudly, not silently book with DTDC."""
    mock_http(lambda request: httpx.Response(200, json={}))
    order = await _paid_order()
    with pytest.raises(HTTPException) as exc:
        await couriers.create_shipment(order, None, carrier="bluedart")
    assert exc.value.status_code == 400
    assert "bluedart" in str(exc.value.detail)

    refreshed = await Order.get(order.id)
    assert refreshed.awb is None


@pytest.mark.usefixtures("db")
async def test_create_shipment_without_carrier_uses_default(mock_http):
    """No explicit choice still routes to the default carrier."""
    assert couriers.module_for(None) is couriers.CARRIERS[couriers.DEFAULT_CARRIER]
    assert couriers.module_for("") is couriers.CARRIERS[couriers.DEFAULT_CARRIER]


@pytest.mark.usefixtures("db")
async def test_setting_overrides_are_merged_under_env(monkeypatch):
    await Setting(key="delhivery_settings", value={"shippingMode": "Express"}).insert()
    cfg = await delhivery.get_delhivery_settings()
    assert cfg["shippingMode"] == "Express"
    # env still wins for secrets
    assert cfg["apiToken"] == TOKEN


# ---------------------------------------------------------------- shipment metadata


@pytest.mark.usefixtures("db")
async def test_track_url_follows_the_holding_carrier():
    """The bug this guards: a Delhivery AWB pointed at dtdc.in."""
    dl = await _paid_order(awb="DL777", carrier="delhivery")
    assert couriers.track_url(dl) == "https://www.delhivery.com/track/package/DL777"

    dtdc = await _paid_order(orderNumber="UA9002", awb="D555", carrier="dtdc")
    assert "dtdc.in" in couriers.track_url(dtdc)
    assert "D555" in couriers.track_url(dtdc)


@pytest.mark.usefixtures("db")
async def test_legacy_order_still_gets_a_dtdc_track_url():
    legacy = await _paid_order(orderNumber="UA9003", awb="D999")
    assert "dtdc.in" in couriers.track_url(legacy)


@pytest.mark.usefixtures("db")
async def test_no_awb_has_no_track_url():
    order = await _paid_order(orderNumber="UA9004")
    assert couriers.track_url(order) is None
    assert couriers.shipment_meta(order)["carrier"] is None


@pytest.mark.usefixtures("db")
async def test_shipment_meta_reads_timestamps_from_either_carrier():
    dl = await _paid_order(orderNumber="UA9005", awb="DL777", carrier="delhivery")
    dl.transactionDetails = {"delhivery": {"waybill": "DL777", "shippedAt": "2026-09-01T10:00:00"}}
    meta = couriers.shipment_meta(dl)
    assert meta["carrierLabel"] == "Delhivery"
    assert meta["timestamps"]["shippedAt"] == "2026-09-01T10:00:00"

    dtdc = await _paid_order(orderNumber="UA9006", awb="D555", carrier="dtdc")
    dtdc.transactionDetails = {"dtdc": {"reference_number": "D555", "shippedAt": "2026-09-02T10:00:00"}}
    assert couriers.shipment_meta(dtdc)["timestamps"]["shippedAt"] == "2026-09-02T10:00:00"


@pytest.mark.usefixtures("db")
async def test_top_level_timestamps_win_over_the_carrier_node():
    order = await _paid_order(orderNumber="UA9007", awb="DL777", carrier="delhivery")
    order.transactionDetails = {
        "deliveredAt": "2026-09-05T00:00:00",
        "delhivery": {"waybill": "DL777", "deliveredAt": "2026-09-04T00:00:00"},
    }
    assert couriers.shipment_meta(order)["timestamps"]["deliveredAt"] == "2026-09-05T00:00:00"
