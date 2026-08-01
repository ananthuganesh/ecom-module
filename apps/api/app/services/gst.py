"""India GST calculation helpers for invoices (Foundation)."""

from __future__ import annotations

# GST state codes (partial — common commerce states + UTs)
GST_STATE_CODES: dict[str, str] = {
    "andaman and nicobar islands": "35",
    "andhra pradesh": "37",
    "arunachal pradesh": "12",
    "assam": "18",
    "bihar": "10",
    "chandigarh": "04",
    "chhattisgarh": "22",
    "dadra and nagar haveli and daman and diu": "26",
    "delhi": "07",
    "goa": "30",
    "gujarat": "24",
    "haryana": "06",
    "himachal pradesh": "02",
    "jammu and kashmir": "01",
    "jharkhand": "20",
    "karnataka": "29",
    "kerala": "32",
    "ladakh": "38",
    "lakshadweep": "31",
    "madhya pradesh": "23",
    "maharashtra": "27",
    "manipur": "14",
    "meghalaya": "17",
    "mizoram": "15",
    "nagaland": "13",
    "odisha": "21",
    "orissa": "21",
    "puducherry": "34",
    "pondicherry": "34",
    "punjab": "03",
    "rajasthan": "08",
    "sikkim": "11",
    "tamil nadu": "33",
    "telangana": "36",
    "tripura": "16",
    "uttar pradesh": "09",
    "uttarakhand": "05",
    "west bengal": "19",
}


def resolve_state_code(*candidates: str | None) -> str:
    """Return a 2-digit GST state code from code or state name."""
    for raw in candidates:
        if raw is None:
            continue
        value = str(raw).strip()
        if not value:
            continue
        if value.isdigit() and len(value) <= 2:
            return value.zfill(2)
        key = value.lower().replace("&", "and")
        if key in GST_STATE_CODES:
            return GST_STATE_CODES[key]
        # fuzzy: startswith match
        for name, code in GST_STATE_CODES.items():
            if name.startswith(key) or key.startswith(name):
                return code
    return ""


def taxable_and_tax(amount: float, rate: float, *, inclusive: bool) -> tuple[float, float]:
    """
    Split an amount into taxable value and tax.

    inclusive=True  → amount includes GST (retail MRP style)
    inclusive=False → amount is taxable; GST added on top
    """
    amount = float(amount or 0)
    rate = float(rate or 0)
    if amount < 0:
        raise ValueError("amount must be >= 0")
    if rate < 0 or rate > 100:
        raise ValueError("rate must be between 0 and 100")

    if rate == 0:
        return round(amount, 2), 0.0

    if inclusive:
        taxable = amount / (1 + rate / 100)
        tax = amount - taxable
    else:
        taxable = amount
        tax = amount * (rate / 100)

    return round(taxable, 2), round(tax, 2)


# Apparel / textile sale-price slabs (per piece)
GST_SLAB_THRESHOLD = 2500.0
GST_RATE_LOW = 5.0
GST_RATE_HIGH = 18.0


def gst_rate_for_unit_price(unit_price: float) -> float:
    """
    GST rate from sale price per piece:
    - up to ₹2,500 → 5%
    - above ₹2,500 → 18%
    """
    price = float(unit_price or 0)
    if price <= 0:
        return GST_RATE_LOW
    return GST_RATE_HIGH if price > GST_SLAB_THRESHOLD else GST_RATE_LOW


def split_cgst_sgst_igst(
    tax: float,
    seller_state_code: str,
    buyer_state_code: str,
) -> dict[str, float]:
    """
    Split total tax into CGST/SGST (intra-state) or IGST (inter-state).
    State codes are 2-digit GST state codes (e.g. "32" for Kerala).
    """
    tax = round(float(tax or 0), 2)
    seller = resolve_state_code(seller_state_code)
    buyer = resolve_state_code(buyer_state_code)

    if not seller or not buyer:
        # Ambiguous place of supply — treat as IGST until states are set
        return {"cgst": 0.0, "sgst": 0.0, "igst": tax}

    if seller == buyer:
        half = round(tax / 2, 2)
        # Fix 1-paise rounding drift on odd totals
        other = round(tax - half, 2)
        return {"cgst": half, "sgst": other, "igst": 0.0}

    return {"cgst": 0.0, "sgst": 0.0, "igst": tax}
