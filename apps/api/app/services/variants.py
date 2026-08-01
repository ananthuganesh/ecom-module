"""Helpers for matching product variants (size-first; color optional)."""


def find_variant(product, *, color: str = "", size: str = ""):
    """Return the best-matching variant for an order/cart line.

    Preference: color+size → size → color. Siyara catalogs are size-led;
    color is optional and often empty.
    """
    variants = list(getattr(product, "variants", None) or [])
    color = (color or "").strip()
    size = (size or "").strip()

    def color_of(v) -> str:
        return (getattr(v, "color", None) or "").strip()

    def size_of(v) -> str:
        return (getattr(v, "size", None) or "").strip()

    if color and size:
        hit = next((v for v in variants if color_of(v) == color and size_of(v) == size), None)
        if hit is not None:
            return hit
    if size:
        hit = next((v for v in variants if size_of(v) == size), None)
        if hit is not None:
            return hit
    if color:
        hit = next((v for v in variants if color_of(v) == color), None)
        if hit is not None:
            return hit
    return None


def variant_sku(product, *, color: str = "", size: str = "") -> str:
    variant = find_variant(product, color=color, size=size)
    if not variant:
        return ""
    return (getattr(variant, "sku", None) or "").strip()
