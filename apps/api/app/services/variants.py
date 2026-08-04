"""Helpers for matching product variants (axes vary per product: size, color, custom)."""


def _s(value) -> str:
    return str(value or "").strip()


def product_variant_axes(product) -> dict[str, bool]:
    """Which sellable dimensions this product actually uses on its variants.

    Admins can configure Size, Color, and/or custom fields differently per product.
    Product-level colors[] alone does not count — only values on variant rows.
    """
    uses_size = False
    uses_color = False
    uses_custom = False
    for variant in getattr(product, "variants", None) or []:
        if _s(getattr(variant, "size", None)):
            uses_size = True
        if _s(getattr(variant, "color", None)):
            uses_color = True
        if _s(getattr(variant, "customName", None)) and _s(getattr(variant, "customValue", None)):
            uses_custom = True
    return {"size": uses_size, "color": uses_color, "custom": uses_custom}


def find_variant(product, *, color: str = "", size: str = ""):
    """Return the best-matching variant for an order/cart line.

    Preference: color+size → size → color. Color is optional when the product
    is size-only; size is optional when the product is color-only.
    """
    variants = list(getattr(product, "variants", None) or [])
    color = _s(color)
    size = _s(size)

    def color_of(v) -> str:
        return _s(getattr(v, "color", None))

    def size_of(v) -> str:
        return _s(getattr(v, "size", None))

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


def format_variant_label(product=None, *, size: str = "", color: str = "", variant=None) -> str:
    """Human label for emails/invoices using only axes this product sells.

    Example size-only: "Size: XL"
    Example size+color: "Size: M · Color: Black"
    Example custom: "Material: Cotton"
    """
    size = _s(size)
    color = _s(color)
    if variant is None and product is not None:
        variant = find_variant(product, color=color, size=size)

    axes = product_variant_axes(product) if product is not None else {
        "size": bool(size),
        "color": bool(color),
        "custom": False,
    }

    parts: list[str] = []
    if axes.get("size"):
        show_size = _s(getattr(variant, "size", None)) if variant is not None else size
        show_size = show_size or size
        if show_size:
            parts.append(f"Size: {show_size}")
    if axes.get("color"):
        show_color = _s(getattr(variant, "color", None)) if variant is not None else color
        show_color = show_color or color
        if show_color:
            parts.append(f"Color: {show_color}")
    if axes.get("custom") and variant is not None:
        cname = _s(getattr(variant, "customName", None))
        cval = _s(getattr(variant, "customValue", None))
        if cname and cval:
            parts.append(f"{cname}: {cval}")

    # No product context (legacy line): size only — avoid printing stale colors
    if product is None:
        return f"Size: {size}" if size else ""

    return " · ".join(parts)


def variant_sku(product, *, color: str = "", size: str = "") -> str:
    variant = find_variant(product, color=color, size=size)
    if not variant:
        return ""
    return _s(getattr(variant, "sku", None))
