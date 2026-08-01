"""ERP Phases 3–6 admin APIs: Purchase, Sales GST, Finance, Reports, RBAC."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import AdminUser, require_permission
from app.documents import (
    CreditNote,
    GoodsReceipt,
    Order,
    PartyPayment,
    Product,
    PurchaseInvoice,
    PurchaseOrder,
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
SuppliersWriter = Annotated[User, Depends(require_permission("suppliers.write"))]
SuppliersReader = Annotated[User, Depends(require_permission("suppliers.read", "suppliers.write"))]
PurchaseWriter = Annotated[User, Depends(require_permission("purchase.write"))]
PurchaseReader = Annotated[User, Depends(require_permission("purchase.read", "purchase.write"))]
StockWriter = Annotated[User, Depends(require_permission("stock.write"))]
StockReader = Annotated[User, Depends(require_permission("stock.read", "stock.write"))]
InvoicesWriter = Annotated[User, Depends(require_permission("invoices.write"))]
InvoicesReader = Annotated[User, Depends(require_permission("invoices.read", "invoices.write"))]
OrdersWriter = Annotated[User, Depends(require_permission("orders.write"))]
OrdersReader = Annotated[User, Depends(require_permission("orders.read", "orders.write"))]
PaymentsWriter = Annotated[User, Depends(require_permission("payments.write"))]
PaymentsReader = Annotated[User, Depends(require_permission("payments.read", "payments.write"))]
ReportsReader = Annotated[User, Depends(require_permission("reports.read"))]
# Role create/assign is owner-only (isAdmin / *), not loose admin.access.
RoleManager = AdminUser


async def _company() -> dict:
    s = await Setting.find_one(Setting.key == "company_profile")
    return dict(s.value) if s and isinstance(s.value, dict) else {}


def _oid(value: str, label: str = "id") -> ObjectId:
    if not value or not ObjectId.is_valid(str(value)):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
    return ObjectId(str(value))


# ─── Suppliers ───────────────────────────────────────────────

@router.get("/suppliers")
async def list_suppliers(_: SuppliersReader):
    rows = await Supplier.find_all().sort([("name", 1)]).limit(200).to_list()
    return [doc_to_dict(r) for r in rows]


@router.post("/suppliers", status_code=201)
async def create_supplier(body: dict, admin: SuppliersWriter):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    allowed = {
        "name", "gstin", "email", "phone", "addressLine1", "city",
        "stateName", "stateCode", "pincode", "notes", "isActive",
    }
    data = {k: v for k, v in (body or {}).items() if k in allowed}
    data["name"] = name
    doc = Supplier(**data)
    await doc.insert()
    await erp_ops.write_audit(actor=admin, action="supplier.create", entity_type="supplier", entity_id=str(doc.id))
    return doc_to_dict(doc)


@router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, body: dict, admin: SuppliersWriter):
    doc = await Supplier.get(_oid(supplier_id, "supplier_id"))
    if not doc:
        raise HTTPException(status_code=404, detail="Supplier not found")
    for k, v in body.items():
        if k in ("_id", "id"):
            continue
        if hasattr(doc, k):
            setattr(doc, k, v)
    doc.updatedAt = datetime.utcnow()
    await doc.save()
    await erp_ops.write_audit(actor=admin, action="supplier.update", entity_type="supplier", entity_id=supplier_id)
    return doc_to_dict(doc)


@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, admin: SuppliersWriter):
    doc = await Supplier.get(_oid(supplier_id, "supplier_id"))
    if not doc:
        raise HTTPException(status_code=404, detail="Supplier not found")
    await doc.delete()
    await erp_ops.write_audit(actor=admin, action="supplier.delete", entity_type="supplier", entity_id=supplier_id)
    return {"message": "Supplier removed"}


# ─── Purchase Orders ─────────────────────────────────────────

@router.get("/purchase-orders")
async def list_pos(_: PurchaseReader):
    rows = await PurchaseOrder.find_all().sort([("createdAt", -1)]).limit(200).to_list()
    return [doc_to_dict(r) for r in rows]


@router.post("/purchase-orders", status_code=201)
async def create_po(body: dict, admin: PurchaseWriter):
    supplier_id = body.get("supplierId")
    if not supplier_id:
        raise HTTPException(status_code=400, detail="supplierId is required")
    supplier = await Supplier.get(_oid(supplier_id, "supplierId"))
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    items = []
    for raw in body.get("items") or []:
        pid = raw.get("productId")
        product = await Product.get(ObjectId(pid)) if pid and ObjectId.is_valid(str(pid)) else None
        rate = float(raw.get("taxRate") or 0)
        if product and not rate:
            rate = await erp_ops.resolve_product_tax_rate(product)
        items.append(
            erp_ops.build_line(
                product_id=str(product.id) if product else None,
                product_name=raw.get("productName") or (product.productName if product else "Item"),
                quantity=raw.get("quantity") or 0,
                unit_price=raw.get("unitPrice") or 0,
                tax_rate=rate,
                inclusive=False,
                variant_sku=raw.get("variantSku") or "",
                hsn_code=raw.get("hsnCode") or (product.hsnCode if product else None),
            )
        )
    company = await _company()
    totals = erp_ops.summarize_lines(items, company.get("stateCode") or "", supplier.stateCode or "")
    doc = PurchaseOrder(
        number=await erp_ops.next_number("PO", "seq_purchase_order"),
        supplierId=str(supplier.id),
        warehouseId=body.get("warehouseId"),
        status=body.get("status") or "ordered",
        items=items,
        notes=body.get("notes"),
        **totals,
    )
    await doc.insert()
    await erp_ops.write_audit(actor=admin, action="po.create", entity_type="purchase_order", entity_id=str(doc.id))
    return doc_to_dict(doc)


@router.put("/purchase-orders/{po_id}/status")
async def update_po_status(po_id: str, body: dict, admin: PurchaseWriter):
    doc = await PurchaseOrder.get(_oid(po_id, "po_id"))
    if not doc:
        raise HTTPException(status_code=404, detail="PO not found")
    status = body.get("status")
    if status not in ("draft", "ordered", "partial", "received", "cancelled"):
        raise HTTPException(status_code=400, detail="Invalid status")
    doc.status = status
    doc.updatedAt = datetime.utcnow()
    await doc.save()
    await erp_ops.write_audit(actor=admin, action="po.status", entity_type="purchase_order", entity_id=po_id, meta={"status": status})
    return doc_to_dict(doc)


# ─── Goods Receipt ───────────────────────────────────────────

@router.get("/goods-receipts")
async def list_grn(_: StockReader):
    rows = await GoodsReceipt.find_all().sort([("createdAt", -1)]).limit(200).to_list()
    return [doc_to_dict(r) for r in rows]


@router.post("/goods-receipts", status_code=201)
async def create_grn(body: dict, admin: StockWriter):
    warehouse_id = body.get("warehouseId")
    if not warehouse_id:
        wh = await stock_service.ensure_default_warehouse()
        warehouse_id = str(wh.id)

    po = None
    if body.get("purchaseOrderId"):
        po = await PurchaseOrder.get(_oid(body["purchaseOrderId"], "purchaseOrderId"))

    raw_items = body.get("items") or ( [i.model_dump() for i in po.items] if po else [] )
    if not raw_items:
        raise HTTPException(status_code=400, detail="items required")

    items = []
    for raw in raw_items:
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

    grn = GoodsReceipt(
        number=await erp_ops.next_number("GRN", "seq_goods_receipt"),
        purchaseOrderId=str(po.id) if po else None,
        supplierId=body.get("supplierId") or (po.supplierId if po else None),
        warehouseId=warehouse_id,
        items=items,
        notes=body.get("notes"),
        status="posted",
    )
    await grn.insert()

    for item in items:
        if not item.productId or item.quantity <= 0:
            continue
        await stock_service.apply_stock_change(
            product_id=item.productId,
            warehouse_id=warehouse_id,
            quantity_delta=int(item.quantity),
            movement_type="purchase_receipt",
            variant_sku=item.variantSku or "",
            reason=f"GRN {grn.number}",
            reference_type="goods_receipt",
            reference_id=str(grn.id),
            created_by=str(admin.id),
        )

    if po:
        po.status = "received"
        po.updatedAt = datetime.utcnow()
        await po.save()

    await erp_ops.write_audit(actor=admin, action="grn.create", entity_type="goods_receipt", entity_id=str(grn.id))
    return doc_to_dict(grn)


# ─── Purchase Invoices ───────────────────────────────────────

@router.get("/purchase-invoices")
async def list_pi(_: PurchaseReader):
    rows = await PurchaseInvoice.find_all().sort([("createdAt", -1)]).limit(200).to_list()
    return [doc_to_dict(r) for r in rows]


@router.post("/purchase-invoices", status_code=201)
async def create_pi(body: dict, admin: PurchaseWriter):
    supplier_id = body.get("supplierId")
    supplier = await Supplier.get(_oid(supplier_id, "supplierId")) if supplier_id else None
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    items = []
    for raw in body.get("items") or []:
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
    company = await _company()
    totals = erp_ops.summarize_lines(items, company.get("stateCode") or "", supplier.stateCode or "")
    doc = PurchaseInvoice(
        number=await erp_ops.next_number("PI", "seq_purchase_invoice"),
        supplierId=str(supplier.id),
        purchaseOrderId=body.get("purchaseOrderId"),
        goodsReceiptId=body.get("goodsReceiptId"),
        items=items,
        amountPaid=0,
        balanceDue=totals["grandTotal"],
        notes=body.get("notes"),
        **totals,
    )
    await doc.insert()
    await erp_ops.write_audit(actor=admin, action="pi.create", entity_type="purchase_invoice", entity_id=str(doc.id))
    return doc_to_dict(doc)


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
    await erp_ops.write_audit(actor=admin, action="si.create", entity_type="sales_invoice", entity_id=str(doc.id))
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
    await erp_ops.write_audit(actor=admin, action="cn.create", entity_type="credit_note", entity_id=str(doc.id))
    return doc_to_dict(doc)


@router.get("/sales-returns")
async def list_returns(_: OrdersReader):
    return [doc_to_dict(r) for r in await SalesReturn.find_all().sort([("createdAt", -1)]).limit(200).to_list()]


@router.post("/sales-returns", status_code=201)
async def create_return(body: dict, admin: OrdersWriter):
    wh = await stock_service.ensure_default_warehouse()
    warehouse_id = body.get("warehouseId") or str(wh.id)
    items = []
    for raw in body.get("items") or []:
        items.append(
            erp_ops.build_line(
                product_id=raw.get("productId"),
                product_name=raw.get("productName") or "Item",
                quantity=raw.get("quantity") or 0,
                unit_price=raw.get("unitPrice") or 0,
                tax_rate=raw.get("taxRate") or 0,
                inclusive=True,
                variant_sku=raw.get("variantSku") or "",
                hsn_code=raw.get("hsnCode"),
            )
        )
    if not items:
        raise HTTPException(status_code=400, detail="items required")
    doc = SalesReturn(
        number=await erp_ops.next_number("SR", "seq_sales_return"),
        orderId=body.get("orderId"),
        salesInvoiceId=body.get("salesInvoiceId"),
        warehouseId=warehouse_id,
        customerId=body.get("customerId"),
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
    await erp_ops.write_audit(actor=admin, action="sr.create", entity_type="sales_return", entity_id=str(doc.id))
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

    await erp_ops.write_audit(actor=admin, action="payment.create", entity_type="party_payment", entity_id=str(doc.id))
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
    return [doc_to_dict(r) for r in roles]


@router.post("/roles", status_code=201)
async def create_role(body: dict, admin: RoleManager):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    if await Role.find_one(Role.name == name):
        raise HTTPException(status_code=400, detail="Role already exists")
    doc = Role(name=name, description=body.get("description"), permissions=list(body.get("permissions") or []))
    await doc.insert()
    await erp_ops.write_audit(actor=admin, action="role.create", entity_type="role", entity_id=str(doc.id))
    return doc_to_dict(doc)


@router.put("/roles/{role_id}")
async def update_role(role_id: str, body: dict, admin: RoleManager):
    doc = await Role.get(_oid(role_id, "role_id"))
    if not doc:
        raise HTTPException(status_code=404, detail="Role not found")
    if "description" in body:
        doc.description = body.get("description")
    if "permissions" in body:
        doc.permissions = list(body.get("permissions") or [])
    if "name" in body and not doc.isSystem:
        doc.name = (body.get("name") or doc.name).strip()
    doc.updatedAt = datetime.utcnow()
    await doc.save()
    return doc_to_dict(doc)


@router.put("/users/{user_id}/role")
async def assign_role(user_id: str, body: dict, admin: RoleManager):
    user = await User.get(_oid(user_id, "user_id"))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    role_id = body.get("roleId")
    if role_id:
        role = await Role.get(_oid(role_id, "roleId"))
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        user.roleId = str(role.id)
        perms = list(role.permissions or [])
        # Always sync isAdmin with role — demotion must clear the flag.
        user.isAdmin = role.name == "Admin" or "*" in perms
    else:
        user.roleId = None
        user.isAdmin = False
    user.updatedAt = datetime.utcnow()
    await user.save()
    await erp_ops.write_audit(actor=admin, action="user.role", entity_type="user", entity_id=user_id, meta={"roleId": role_id})
    return user_public(user)


@router.get("/audit-logs")
async def list_audit(_: AdminUser):
    from app.documents import AuditLog

    rows = await AuditLog.find_all().sort([("createdAt", -1)]).limit(200).to_list()
    return [doc_to_dict(r) for r in rows]
