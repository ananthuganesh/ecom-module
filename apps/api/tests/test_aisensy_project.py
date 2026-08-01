"""Unit tests for AiSensy Project API helpers."""

from app.services.aisensy_project import price_to_minor_units, retailer_id_for_variant


def test_price_to_minor_units():
    assert price_to_minor_units(1) == "100"
    assert price_to_minor_units(5.99) == "599"
    assert price_to_minor_units(150) == "15000"
    assert price_to_minor_units(None) == "0"
    assert price_to_minor_units(-3) == "0"


def test_retailer_id_prefers_sku():
    assert (
        retailer_id_for_variant(
            product_id="p1",
            variant={"sku": "SKU-RED-M", "color": "Red"},
            index=0,
        )
        == "SKU-RED-M"
    )


def test_retailer_id_from_color_size():
    rid = retailer_id_for_variant(
        product_id="abc123",
        variant={"color": "Navy Blue", "size": "L"},
        index=1,
    )
    assert rid.startswith("abc123-")
    assert "Navy" in rid or "Navy-Blue" in rid
    assert rid.endswith("-L") or "-L" in rid


def test_retailer_id_without_variant():
    assert retailer_id_for_variant(product_id="p9", variant=None, index=0) == "p9-v0"
