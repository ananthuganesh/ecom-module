"""ERP Phases 3–6 admin APIs: Purchase, Sales GST, Finance, Reports, RBAC."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import AdminUser, RoleManager, require_permission
from app.documents import (
    CreditNote,
    Order,
    PartyPayment,
    PurchaseInvoice,
    Role,
    SalesInvoice,
    SalesReturn,
    Setting,
    Supplier,
    User,
)
from app.serializers import doc_to_dict, user_public
from app.services import erp_ops, stock as stock_service

router = APIRouter(prefix="/api/admin/erp", tags=["erp"])
InvoicesWriter = Annotated[User, Depends(require_permission("invoices.write"))]
InvoicesReader = Annotated[User, Depends(require_permission("invoices.read", "invoices.write"))]
OrdersWriter = Annotated[User, Depends(require_permission("orders.write"))]
OrdersReader = Annotated[User, Depends(require_permission("orders.read", "orders.write"))]
PaymentsWriter = Annotated[User, Depends(require_permission("payments.write"))]
PaymentsReader = Annotated[User, Depends(require_permission("payments.read", "payments.write"))]
ReportsReader = Annotated[User, Depends(require_permission("reports.read"))]


async def _company() -> dict:
    s = await Setting.find_one(Setting.key == "company_profile")
    return dict(s.value) if s and isinstance(s.value, dict) else {}


def _oid(value: str, label: str = "id") -> ObjectId:
    if not value or not ObjectId.is_valid(str(value)):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
    return ObjectId(str(value))


# ─── Sales Invoices ──────────────────────────────────────────

@router.get("/sales-invoices")
async def list_si(_: InvoicesReader):
    rows = await SalesInvoice.find_all().sort([("createdAt", -1)]).limit(200).to_list()
    return [doc_to_dict(r) for r in rows]


@router.post("/sales-invoices", status_code=201)
async def create_si(body: dict, admin: InvoicesWriter):
    """Create invoice from orderId (preferred) or explicit items."""
    if body.get("orderId"):
        order = await Order.get(_oid(body["orderId"], "orderId"))
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        doc = await erp_ops.ensure_order_invoice(order, actor=admin)
        if not doc:
            raise HTTPException(status_code=400, detail="No invoice items")
        return doc_to_dict(doc)

    company = await _company()
    use_gst = erp_ops.gst_enabled(company)
    seller_state = company.get("stateCode") or ""
    items = []
    for raw in body.get("items") or []:
        unit_price = float(raw.get("unitPrice") or 0)
        rate = float(raw.get("taxRate") or 0) if use_gst else 0.0
        if use_gst and rate <= 0:
            from app.services.gst import gst_rate_for_unit_price

            rate = gst_rate_for_unit_price(unit_price)
        items.append(
            erp_ops.build_line(
                product_id=raw.get("productId"),
                product_name=raw.get("productName") or "Item",
                quantity=raw.get("quantity") or 0,
                unit_price=unit_price,
                tax_rate=rate,
                inclusive=bool(raw.get("inclusive", True)),
                variant_sku=raw.get("variantSku") or "",
                hsn_code=raw.get("hsnCode"),
            )
        )

    if not items:
        raise HTTPException(status_code=400, detail="No invoice items")

    totals = erp_ops.summarize_lines(items, seller_state, body.get("customerStateCode") or "")
    amount_paid = float(body.get("amountPaid") or 0)
    doc = SalesInvoice(
        number=await erp_ops.next_sales_invoice_number(),
        customerId=body.get("customerId"),
        customerName=body.get("customerName"),
        customerGstin=body.get("customerGstin"),
        customerStateCode=body.get("customerStateCode") or "",
        sellerStateCode=seller_state,
        items=items,
        amountPaid=amount_paid,
        balanceDue=round(totals["grandTotal"] - amount_paid, 2),
        status="paid" if amount_paid >= totals["grandTotal"] else "open",
        isGstInvoice=use_gst,
        notes=body.get("notes"),
        **totals,
    )
    await doc.insert()
    return doc_to_dict(doc)


@router.post("/sales-invoices/from-order/{order_id}", status_code=201)
async def invoice_from_order(order_id: str, admin: InvoicesWriter):
    return await create_si({"orderId": order_id}, admin)


@router.get("/sales-invoices/by-order/{order_id}")
async def invoice_by_order(order_id: str, _: InvoicesReader):
    from app.services.order_resolve import resolve_order

    order = await resolve_order(order_id)
    if order and order.invoiceId and ObjectId.is_valid(str(order.invoiceId)):
        inv = await SalesInvoice.get(ObjectId(str(order.invoiceId)))
        if inv:
            return doc_to_dict(inv)
    if order:
        inv = await SalesInvoice.find_one(SalesInvoice.orderId == str(order.id))
        if inv:
            return doc_to_dict(inv)
    inv = await SalesInvoice.find_one(SalesInvoice.orderId == str(order_id))
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return doc_to_dict(inv)


# ─── Credit notes & returns ──────────────────────────────────

@router.get("/credit-notes")
async def list_cn(_: InvoicesReader):
    return [doc_to_dict(r) for r in await CreditNote.find_all().sort([("createdAt", -1)]).limit(200).to_list()]


@router.post("/credit-notes", status_code=201)
async def create_cn(body: dict, admin: InvoicesWriter):
    inv = None
    if body.get("salesInvoiceId"):
        inv = await SalesInvoice.get(_oid(body["salesInvoiceId"], "salesInvoiceId"))
    company = await _company()
    items = []
    source_items = body.get("items") or ( [i.model_dump() for i in inv.items] if inv else [] )
    for raw in source_items:
        items.append(
            erp_ops.build_line(
                product_id=raw.get("productId"),
                product_name=raw.get("productName") or "Item",
                quantity=raw.get("quantity") or 0,
                unit_price=raw.get("unitPrice") or 0,
                tax_rate=raw.get("taxRate") or 0,
                inclusive=False,
                variant_sku=raw.get("variantSku") or "",
                hsn_code=raw.get("hsnCode"),
            )
        )
    buyer = (inv.customerStateCode if inv else body.get("customerStateCode")) or ""
    totals = erp_ops.summarize_lines(items, company.get("stateCode") or "", buyer)
    doc = CreditNote(
        number=await erp_ops.next_number("CN", "seq_credit_note"),
        salesInvoiceId=str(inv.id) if inv else None,
        orderId=body.get("orderId") or (inv.orderId if inv else None),
        customerId=body.get("customerId") or (inv.customerId if inv else None),
        reason=body.get("reason"),
        items=items,
        **totals,
    )
    await doc.insert()
    return doc_to_dict(doc)


@router.get("/sales-returns")
async def list_returns(_: OrdersReader):
    return [doc_to_dict(r) for r in await SalesReturn.find_all().sort([("createdAt", -1)]).limit(200).to_list()]


@router.post("/sales-returns", status_code=201)
async def create_return(body: dict, admin: OrdersWriter):
    order_id = body.get("orderId")
    if not order_id:
        raise HTTPException(status_code=400, detail="orderId is required")
    order = await Order.get(_oid(order_id, "orderId"))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Cap restock qty to what the order actually sold.
    ordered_qty: dict[str, int] = {}
    for line in order.items or []:
        pid = str(getattr(line, "productId", None) or "")
        if not pid:
            continue
        ordered_qty[pid] = ordered_qty.get(pid, 0) + int(getattr(line, "quantity", 0) or 0)

    wh = await stock_service.ensure_default_warehouse()
    warehouse_id = body.get("warehouseId") or str(wh.id)
    items = []
    returned_so_far: dict[str, int] = {}
    for raw in body.get("items") or []:
        pid = str(raw.get("productId") or "")
        sku = str(raw.get("variantSku") or "")
        qty = int(raw.get("quantity") or 0)
        if qty <= 0:
            continue
        max_qty = ordered_qty.get(pid, 0)
        if max_qty <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Product {pid or 'unknown'} is not on this order",
            )
        used = returned_so_far.get(pid, 0)
        if used + qty > max_qty:
            raise HTTPException(
                status_code=400,
                detail=f"Return qty for {pid} exceeds ordered qty ({max_qty})",
            )
        returned_so_far[pid] = used + qty
        items.append(
            erp_ops.build_line(
                product_id=pid,
                product_name=raw.get("productName") or "Item",
                quantity=qty,
                unit_price=raw.get("unitPrice") or 0,
                tax_rate=raw.get("taxRate") or 0,
                inclusive=True,
                variant_sku=sku,
                hsn_code=raw.get("hsnCode"),
            )
        )
    if not items:
        raise HTTPException(status_code=400, detail="items required")
    doc = SalesReturn(
        number=await erp_ops.next_number("SR", "seq_sales_return"),
        orderId=str(order.id),
        salesInvoiceId=body.get("salesInvoiceId"),
        warehouseId=warehouse_id,
        customerId=body.get("customerId") or str(order.customerId or ""),
        items=items,
        reason=body.get("reason"),
        restock=bool(body.get("restock", True)),
    )
    await doc.insert()
    if doc.restock:
        for item in items:
            if not item.productId:
                continue
            await stock_service.apply_stock_change(
                product_id=item.productId,
                warehouse_id=warehouse_id,
                quantity_delta=int(item.quantity),
                movement_type="sale_return",
                variant_sku=item.variantSku or "",
                reason=f"Return {doc.number}",
                reference_type="sales_return",
                reference_id=str(doc.id),
                created_by=str(admin.id),
            )
    return doc_to_dict(doc)


# ─── Payments (Finance) ──────────────────────────────────────

@router.get("/payments")
async def list_payments(_: PaymentsReader):
    return [doc_to_dict(r) for r in await PartyPayment.find_all().sort([("paymentDate", -1)]).limit(200).to_list()]


@router.post("/payments", status_code=201)
async def create_payment(body: dict, admin: PaymentsWriter):
    party_type = body.get("partyType")
    party_id = body.get("partyId")
    direction = body.get("direction")
    amount = float(body.get("amount") or 0)
    if party_type not in ("customer", "supplier"):
        raise HTTPException(status_code=400, detail="partyType must be customer or supplier")
    if direction not in ("in", "out"):
        raise HTTPException(status_code=400, detail="direction must be in or out")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be positive")

    party_name = body.get("partyName")
    if party_type == "supplier":
        s = await Supplier.get(_oid(party_id, "partyId"))
        if not s:
            raise HTTPException(status_code=404, detail="Supplier not found")
        party_name = party_name or s.name
    else:
        u = await User.get(_oid(party_id, "partyId"))
        if not u:
            raise HTTPException(status_code=404, detail="Customer not found")
        party_name = party_name or u.name

    doc = PartyPayment(
        number=await erp_ops.next_number("PAY", "seq_party_payment"),
        partyType=party_type,
        partyId=party_id,
        partyName=party_name,
        direction=direction,
        amount=amount,
        method=body.get("method") or "cash",
        reference=body.get("reference"),
        invoiceType=body.get("invoiceType"),
        invoiceId=body.get("invoiceId"),
        notes=body.get("notes"),
    )
    await doc.insert()

    # Apply against invoice balances
    if body.get("invoiceId") and body.get("invoiceType") == "sales_invoice":
        inv = await SalesInvoice.get(_oid(body["invoiceId"], "invoiceId"))
        if inv and direction == "in":
            inv.amountPaid = round((inv.amountPaid or 0) + amount, 2)
            inv.balanceDue = round(max(0, (inv.grandTotal or 0) - inv.amountPaid), 2)
            inv.status = "paid" if inv.balanceDue <= 0 else "partial"
            await inv.save()
    if body.get("invoiceId") and body.get("invoiceType") == "purchase_invoice":
        inv = await PurchaseInvoice.get(_oid(body["invoiceId"], "invoiceId"))
        if inv and direction == "out":
            inv.amountPaid = round((inv.amountPaid or 0) + amount, 2)
            inv.balanceDue = round(max(0, (inv.grandTotal or 0) - inv.amountPaid), 2)
            inv.status = "paid" if inv.balanceDue <= 0 else "partial"
            await inv.save()
    return doc_to_dict(doc)


# ─── Reports ─────────────────────────────────────────────────

@router.get("/reports/overview")
async def reports_overview(_: ReportsReader):
    from app.documents import StockBalance

    orders_col = Order.get_pymongo_collection()
    sales_col = SalesInvoice.get_pymongo_collection()
    purchase_col = PurchaseInvoice.get_pymongo_collection()
    payments_col = PartyPayment.get_pymongo_collection()
    bal_col = StockBalance.get_pymongo_collection()

    async def _sum(col, field: str, match: dict | None = None) -> float:
        pipeline = []
        if match:
            pipeline.append({"$match": match})
        pipeline.append({"$group": {"_id": None, "total": {"$sum": f"${field}"}}})
        rows = await col.aggregate(pipeline).to_list(1)
        return float((rows[0]["total"] if rows else 0) or 0)

    orders_count = await orders_col.count_documents({})
    sales_total = await _sum(orders_col, "finalPrice")
    invoice_sales = await _sum(sales_col, "grandTotal")
    purchase_total = await _sum(purchase_col, "grandTotal")
    ar = await _sum(sales_col, "balanceDue", {"status": {"$ne": "void"}})
    ap = await _sum(purchase_col, "balanceDue", {"status": {"$ne": "void"}})
    payments_in = await _sum(payments_col, "amount", {"direction": "in"})
    payments_out = await _sum(payments_col, "amount", {"direction": "out"})
    stock_rows = await bal_col.aggregate(
        [{"$group": {"_id": None, "total": {"$sum": "$quantity"}}}]
    ).to_list(1)
    stock_units = int((stock_rows[0]["total"] if stock_rows else 0) or 0)
    cgst = await _sum(sales_col, "cgst")
    sgst = await _sum(sales_col, "sgst")
    igst = await _sum(sales_col, "igst")

    return {
        "ordersCount": orders_count,
        "salesTotal": round(sales_total, 2),
        "salesInvoiceTotal": round(invoice_sales, 2),
        "purchaseInvoiceTotal": round(purchase_total, 2),
        "accountsReceivable": round(ar, 2),
        "accountsPayable": round(ap, 2),
        "paymentsIn": round(payments_in, 2),
        "paymentsOut": round(payments_out, 2),
        "stockUnits": stock_units,
        "gst": {"cgst": round(cgst, 2), "sgst": round(sgst, 2), "igst": round(igst, 2)},
    }


# ─── RBAC ────────────────────────────────────────────────────

@router.get("/roles")
async def list_roles(_: AdminUser):
    roles = await erp_ops.ensure_default_roles()
    return [doc_to_dict(r) for r in roles if r.name in erp_ops.ACTIVE_ROLE_NAMES]


@router.get("/users")
async def list_staff_users(_: RoleManager):
    """Admin + Staff accounts only (not storefront customers)."""
    await erp_ops.ensure_default_roles()
    roles = await Role.find_all().to_list()
    active = {
        str(r.id): r
        for r in roles
        if r.name in erp_ops.ACTIVE_ROLE_NAMES
    }
    active_ids = list(active.keys())
    users = await User.find(
        {
            "$or": [
                {"isAdmin": True},
                {"roleId": {"$in": active_ids}},
            ]
        }
    ).to_list()
    # Extra guard: roleId must still resolve to Admin/Staff.
    staff = [
        u
        for u in users
        if u.isAdmin or (str(u.roleId or "") in active)
    ]
    staff.sort(key=lambda u: (not u.isAdmin, (u.name or u.email or "").lower()))
    return [user_public(u) for u in staff]


@router.post("/users", status_code=201)
async def create_staff_user(body: dict, admin: RoleManager):
    """Create a staff user with email/password and an assigned role."""
    from app.security import hash_password
    from app.services.customer_url_id import next_customer_url_id

    name = str(body.get("name") or "").strip()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    role_id = body.get("roleId")

    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not role_id:
        raise HTTPException(status_code=400, detail="Role is required")

    role = await Role.get(_oid(role_id, "roleId"))
    if not role or role.name not in erp_ops.ACTIVE_ROLE_NAMES:
        raise HTTPException(status_code=400, detail="Role must be Admin or Staff")
    if await User.find_one(User.email == email):
        raise HTTPException(status_code=400, detail="A user with this email already exists")

    perms = list(role.permissions or [])
    user = User(
        name=name,
        email=email,
        password=hash_password(password),
        roleId=str(role.id),
        isAdmin=role.name == "Admin" or "*" in perms,
        customerUrlId=await next_customer_url_id(),
    )
    await user.insert()
    return user_public(user)


@router.put("/users/{user_id}/role")
async def assign_role(user_id: str, body: dict, admin: RoleManager):
    user = await User.get(_oid(user_id, "user_id"))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    role_id = body.get("roleId")
    if role_id:
        role = await Role.get(_oid(role_id, "roleId"))
        if not role or role.name not in erp_ops.ACTIVE_ROLE_NAMES:
            raise HTTPException(status_code=400, detail="Role must be Admin or Staff")
        becoming_admin = role.name == "Admin" or "*" in list(role.permissions or [])
        # Never demote the last Admin — locks the store owner out of user management.
        if user.isAdmin and not becoming_admin:
            other_admins = await User.find(
                {
                    "isAdmin": True,
                    "_id": {"$ne": user.id},
                }
            ).to_list()
            if not other_admins:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot demote the only Admin. Assign Admin to another user first.",
                )
        user.roleId = str(role.id)
        user.isAdmin = becoming_admin
    else:
        if user.isAdmin:
            other_admins = await User.find(
                {
                    "isAdmin": True,
                    "_id": {"$ne": user.id},
                }
            ).to_list()
            if not other_admins:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot remove the only Admin role.",
                )
        user.roleId = None
        user.isAdmin = False
    user.updatedAt = datetime.utcnow()
    await user.save()
    return user_public(user)
