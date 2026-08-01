"""Shared ERP helpers — line totals, numbering, audit."""

from __future__ import annotations

from datetime import datetime

from app.documents import AuditLog, LineItem, Role, Setting, TaxClass
from app.services.gst import resolve_state_code, split_cgst_sgst_igst, taxable_and_tax, gst_rate_for_unit_price
from app.services.variants import variant_sku


async def next_number(prefix: str, key: str) -> str:
    s = await Setting.find_one(Setting.key == key)
    n = 1
    if s and isinstance(s.value, dict):
        n = int(s.value.get("seq") or 0) + 1
        s.value = {**s.value, "seq": n}
        await s.save()
    else:
        await Setting(key=key, value={"seq": n}).insert()
    return f"{prefix}-{datetime.utcnow().strftime('%Y%m')}-{n:05d}"


SALES_INVOICE_START = 100000


async def next_sales_invoice_number() -> str:
    """Sales invoices: INV-100000, INV-100001, … (6 digits)."""
    key = "seq_sales_invoice"
    s = await Setting.find_one(Setting.key == key)
    if s and isinstance(s.value, dict):
        n = int(s.value.get("seq") or 0) + 1
        if n < SALES_INVOICE_START:
            n = SALES_INVOICE_START
        s.value = {**s.value, "seq": n, "format": "INV-6"}
        await s.save()
    else:
        n = SALES_INVOICE_START
        await Setting(key=key, value={"seq": n, "format": "INV-6"}).insert()
    return f"INV-{n:06d}"


def build_line(
    *,
    product_id: str | None,
    product_name: str,
    quantity: float,
    unit_price: float,
    tax_rate: float = 0,
    inclusive: bool = True,
    variant_sku: str = "",
    hsn_code: str | None = None,
) -> LineItem:
    qty = float(quantity or 0)
    price = float(unit_price or 0)
    rate = float(tax_rate or 0)
    line_amount = qty * price
    taxable, tax = taxable_and_tax(line_amount, rate, inclusive=inclusive)
    return LineItem(
        productId=product_id,
        productName=product_name,
        variantSku=variant_sku or "",
        hsnCode=hsn_code,
        quantity=qty,
        unitPrice=price,
        taxRate=rate,
        taxableAmount=taxable,
        taxAmount=tax,
        totalAmount=round(taxable + tax, 2) if not inclusive else round(line_amount, 2),
    )


def summarize_lines(items: list[LineItem], seller_state: str, buyer_state: str) -> dict:
    subtotal = round(sum(i.taxableAmount for i in items), 2)
    tax_total = round(sum(i.taxAmount for i in items), 2)
    split = split_cgst_sgst_igst(tax_total, seller_state, buyer_state)
    grand = round(subtotal + tax_total, 2)
    return {
        "subtotal": subtotal,
        "taxTotal": tax_total,
        "cgst": split["cgst"],
        "sgst": split["sgst"],
        "igst": split["igst"],
        "grandTotal": grand,
    }


async def get_tax_rate(tax_class_id: str | None) -> float:
    from bson import ObjectId

    if tax_class_id and ObjectId.is_valid(tax_class_id):
        tc = await TaxClass.get(ObjectId(tax_class_id))
        if tc and float(tc.rate or 0) > 0:
            return float(tc.rate)

    # Fall back to store default tax class (e.g. GST 5%)
    default = await TaxClass.find_one(TaxClass.isDefault == True, TaxClass.isActive == True)  # noqa: E712
    if default and float(default.rate or 0) > 0:
        return float(default.rate)

    active = await TaxClass.find_one(TaxClass.isActive == True)  # noqa: E712
    if active and float(active.rate or 0) > 0:
        return float(active.rate)

    return 0.0


async def resolve_product_tax_rate(product) -> float:
    """Apparel GST slab from product MRP (automatic)."""
    pricing = getattr(product, "pricing", None) if product else None
    mrp = float(getattr(pricing, "mrp", None) or 0) if pricing else 0.0
    return gst_rate_for_unit_price(mrp)


async def write_audit(*, actor, action: str, entity_type: str | None = None, entity_id: str | None = None, meta: dict | None = None):
    await AuditLog(
        actorId=str(actor.id) if actor else None,
        actorEmail=getattr(actor, "email", None),
        action=action,
        entityType=entity_type,
        entityId=entity_id,
        meta=meta or {},
    ).insert()


DEFAULT_ROLES = [
    {
        "name": "Admin",
        "description": "Full access",
        "isSystem": True,
        "permissions": ["*"],
    },
    {
        "name": "Sales",
        "description": "Orders, invoices, customers",
        "isSystem": True,
        "permissions": [
            "orders.read",
            "orders.write",
            "invoices.read",
            "invoices.write",
            "customers.read",
            "reports.read",
            "analytics.read",
        ],
    },
    {
        "name": "Purchase",
        "description": "Suppliers and purchase docs",
        "isSystem": True,
        "permissions": [
            "purchase.read",
            "purchase.write",
            "suppliers.read",
            "suppliers.write",
            "stock.read",
            "stock.write",
        ],
    },
    {
        "name": "Warehouse",
        "description": "Stock and GRN",
        "isSystem": True,
        "permissions": [
            "stock.read",
            "stock.write",
            "purchase.read",
            "warehouses.read",
        ],
    },
    {
        "name": "Finance",
        "description": "Payments and reports",
        "isSystem": True,
        "permissions": [
            "payments.read",
            "payments.write",
            "invoices.read",
            "purchase.read",
            "reports.read",
        ],
    },
]


async def ensure_default_roles() -> list[Role]:
    existing = await Role.find_all().to_list()
    if not existing:
        created = []
        for row in DEFAULT_ROLES:
            r = Role(**row)
            await r.insert()
            created.append(r)
        return created

    # Merge newly defined permissions onto system roles without removing custom grants.
    # Always strip obsolete admin.access from non-Admin system roles (RBAC collapse fix).
    by_name = {r.name: r for r in existing}
    for row in DEFAULT_ROLES:
        role = by_name.get(row["name"])
        if not role or not role.isSystem:
            continue
        current = list(role.permissions or [])
        if role.name != "Admin":
            current = [p for p in current if p != "admin.access"]
        merged = list(dict.fromkeys([*current, *row["permissions"]]))
        if role.name != "Admin":
            merged = [p for p in merged if p != "admin.access"]
        if merged != list(role.permissions or []):
            role.permissions = merged
            role.updatedAt = datetime.utcnow()
            await role.save()
    return await Role.find_all().to_list()


async def company_profile() -> dict:
    s = await Setting.find_one(Setting.key == "company_profile")
    return dict(s.value) if s and isinstance(s.value, dict) else {}


def gst_enabled(company: dict | None = None) -> bool:
    profile = company or {}
    return bool(str(profile.get("gstin") or "").strip())


async def ensure_order_invoice(order, *, actor=None):
    """
    Every order gets an invoice.
    GST lines (CGST/SGST/IGST) only when store GSTIN is set in Settings → General.
    """
    from bson import ObjectId

    from app.documents import Order, Product, SalesInvoice, User

    if getattr(order, "invoiceId", None):
        existing = await SalesInvoice.get(ObjectId(order.invoiceId)) if ObjectId.is_valid(str(order.invoiceId)) else None
        if existing:
            return existing

    existing = await SalesInvoice.find_one(SalesInvoice.orderId == str(order.id))
    if existing:
        if not order.invoiceId:
            order.invoiceId = str(existing.id)
            order.invoiceNumber = existing.number
            await order.save()
        return existing

    company = await company_profile()
    use_gst = gst_enabled(company)
    seller_state = resolve_state_code(company.get("stateCode"), company.get("stateName"))

    customer_id = str(order.customerId) if order.customerId else None
    customer_name = None
    customer_gstin = None
    customer_state = ""
    if customer_id and ObjectId.is_valid(customer_id):
        user = await User.get(ObjectId(customer_id))
        if user:
            customer_name = user.name
            customer_gstin = getattr(user, "gstin", None)
            customer_state = resolve_state_code(
                getattr(user, "stateCode", None),
                getattr(user, "stateName", None),
            )

    addr = order.shippingAddress or {}
    customer_state = resolve_state_code(
        customer_state,
        addr.get("stateCode"),
        addr.get("state"),
        addr.get("stateName"),
    )
    if not customer_name:
        customer_name = addr.get("name") or addr.get("fullName") or None
    if not customer_gstin:
        customer_gstin = addr.get("gstin") or addr.get("GSTIN") or None

    items: list[LineItem] = []
    for oi in order.items or []:
        product = None
        if oi.productId:
            try:
                pid = oi.productId if isinstance(oi.productId, ObjectId) else ObjectId(str(oi.productId))
                product = await Product.get(pid)
            except Exception:
                product = None

        if use_gst:
            # Override tax class, else apparel slab from MRP
            rate = await resolve_product_tax_rate(product)
            inclusive = (product.priceTaxMode if product else "inclusive") != "exclusive"
        else:
            rate = 0.0
            inclusive = True

        sku = ""
        if product:
            sku = variant_sku(
                product,
                color=getattr(oi, "color", None) or "",
                size=getattr(oi, "size", None) or "",
            )

        items.append(
            build_line(
                product_id=str(product.id) if product else (str(oi.productId) if oi.productId else None),
                product_name=(product.productName if product else "Item"),
                quantity=oi.quantity,
                unit_price=oi.price,
                tax_rate=rate,
                inclusive=inclusive,
                variant_sku=sku,
                hsn_code=product.hsnCode if product else None,
            )
        )

    if not items:
        return None

    totals = summarize_lines(items, seller_state, customer_state)
    amount_paid = 0.0
    status = "open"
    if order.paymentStatus == "paid":
        amount_paid = totals["grandTotal"]
        status = "paid"

    doc = SalesInvoice(
        number=await next_sales_invoice_number(),
        orderId=str(order.id),
        customerId=customer_id,
        customerName=customer_name,
        customerGstin=customer_gstin,
        customerStateCode=customer_state,
        sellerStateCode=seller_state,
        items=items,
        amountPaid=amount_paid,
        balanceDue=round(totals["grandTotal"] - amount_paid, 2),
        status=status if amount_paid < totals["grandTotal"] else "paid",
        isGstInvoice=use_gst,
        **totals,
    )
    await doc.insert()

    order.invoiceId = str(doc.id)
    order.invoiceNumber = doc.number
    await order.save()

    await write_audit(
        actor=actor,
        action="si.create",
        entity_type="sales_invoice",
        entity_id=str(doc.id),
        meta={"orderId": str(order.id), "isGstInvoice": use_gst},
    )
    return doc


async def ensure_order_invoice_safe(order, *, actor=None, context: str = "") -> None:
    """Best-effort invoice create — never blocks order/payment/fulfillment flows."""
    try:
        await ensure_order_invoice(order, actor=actor)
    except Exception as exc:
        label = f" ({context})" if context else ""
        print(f"[Invoice] auto-create failed{label}: {exc}")


_FULFILLMENT_ORDER_STATUSES = {
    "processing",
    "shipped",
    "out for delivery",
    "delivered",
}


def is_fulfillment_status(status: str | None = None, shipping_status: str | None = None) -> bool:
    s = str(status or "").strip().lower()
    ship = str(shipping_status or "").strip().lower()
    if s in _FULFILLMENT_ORDER_STATUSES:
        return True
    tokens = ("ship", "transit", "deliver", "ready", "awaiting", "out for", "fulfill")
    return any(t in ship for t in tokens)


async def ensure_invoice_on_fulfillment(order, *, actor=None, context: str = "fulfillment") -> None:
    """Create invoice when an order moves into fulfillment (shipped / delivered / etc.)."""
    if is_fulfillment_status(getattr(order, "status", None), getattr(order, "shippingStatus", None)):
        await ensure_order_invoice_safe(order, actor=actor, context=context)
