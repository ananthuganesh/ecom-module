"""Stock ledger helpers — warehouse balances + movements."""

from __future__ import annotations

from datetime import datetime

from bson import ObjectId
from fastapi import HTTPException
from pymongo import ReturnDocument

from app.documents import Coupon, Order, Product, StockBalance, StockMovement, Warehouse
from app.serializers import doc_to_dict
from app.services.variants import variant_sku


def sellable_qty(quantity: int | None, reserved: int | None, unavailable: int | None = 0) -> int:
    """Available to sell = on hand − committed − unavailable."""
    return max(0, int(quantity or 0) - int(reserved or 0) - int(unavailable or 0))


async def ensure_default_warehouse() -> Warehouse:
    existing = await Warehouse.find_all().to_list()
    if existing:
        default = next((w for w in existing if w.isDefault and w.isActive), None)
        if default:
            return default
        active = next((w for w in existing if w.isActive), existing[0])
        if not active.isDefault:
            for w in existing:
                if w.isDefault:
                    w.isDefault = False
                    w.updatedAt = datetime.utcnow()
                    await w.save()
            active.isDefault = True
            active.updatedAt = datetime.utcnow()
            await active.save()
        return active

    wh = Warehouse(name="Main Warehouse", code="MAIN", isDefault=True, isActive=True)
    await wh.insert()
    return wh


async def _clear_other_default_warehouses(except_id: ObjectId | None = None) -> None:
    others = await Warehouse.find(Warehouse.isDefault == True).to_list()  # noqa: E712
    for other in others:
        if except_id and other.id == except_id:
            continue
        other.isDefault = False
        other.updatedAt = datetime.utcnow()
        await other.save()


async def get_or_create_balance(product_id: str, warehouse_id: str, variant_sku: str = "") -> StockBalance:
    sku = variant_sku or ""
    bal = await StockBalance.find_one(
        StockBalance.productId == product_id,
        StockBalance.warehouseId == warehouse_id,
        StockBalance.variantSku == sku,
    )
    if bal:
        return bal
    bal = StockBalance(productId=product_id, warehouseId=warehouse_id, variantSku=sku, quantity=0, reserved=0)
    await bal.insert()
    return bal


async def ensure_balance_seeded_from_product(
    product_id: str,
    warehouse_id: str,
    variant_sku: str = "",
) -> StockBalance:
    """If warehouse balance is empty, copy opening qty from product/variant once."""
    bal = await get_or_create_balance(product_id, warehouse_id, variant_sku)
    if int(bal.quantity or 0) > 0 or int(bal.reserved or 0) > 0:
        return bal
    product = await Product.get(ObjectId(product_id)) if ObjectId.is_valid(product_id) else None
    if not product:
        return bal
    sku = (variant_sku or "").strip()
    seed = 0
    if sku and product.variants:
        for v in product.variants:
            if (v.sku or "").strip() == sku:
                seed = int(v.quantity or 0)
                break
    if seed <= 0:
        seed = int(product.totalStock or 0)
        if seed <= 0 and product.variants:
            seed = sum(int(v.quantity or 0) for v in product.variants)
    if seed <= 0:
        return bal
    col = StockBalance.get_pymongo_collection()
    updated = await col.find_one_and_update(
        {"_id": bal.id, "quantity": 0, "reserved": {"$in": [0, None]}},
        {"$set": {"quantity": seed, "reserved": 0, "updatedAt": datetime.utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    if updated is not None:
        await StockMovement(
            productId=product_id,
            warehouseId=warehouse_id,
            variantSku=sku,
            quantity=seed,
            type="opening",
            reason="Seed from product stock",
            balanceAfter=seed,
        ).insert()
        return await get_or_create_balance(product_id, warehouse_id, variant_sku)
    return await get_or_create_balance(product_id, warehouse_id, variant_sku)


async def sync_product_stock(product_id: str) -> Product | None:
    if not ObjectId.is_valid(product_id):
        return None
    product = await Product.get(ObjectId(product_id))
    if not product:
        return None

    balances = await StockBalance.find(StockBalance.productId == product_id).to_list()
    total = sum(sellable_qty(b.quantity, b.reserved) for b in balances)
    by_sku = {
        b.variantSku: sellable_qty(b.quantity, b.reserved)
        for b in balances
        if b.variantSku
    }

    for v in product.variants or []:
        sku = (v.sku or "").strip()
        if sku and sku in by_sku:
            v.quantity = max(0, by_sku[sku])

    product.totalStock = total
    product.updatedAt = datetime.utcnow()
    await product.save()
    return product


async def reserve_stock(
    *,
    product_id: str,
    warehouse_id: str | None = None,
    quantity: int,
    variant_sku: str = "",
    order_id: str | None = None,
) -> dict:
    qty = int(quantity)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="reserve quantity must be positive")
    wh_id = warehouse_id or str((await ensure_default_warehouse()).id)
    col = StockBalance.get_pymongo_collection()
    sku = variant_sku or ""

    for _ in range(8):
        bal = await ensure_balance_seeded_from_product(product_id, wh_id, sku)
        on_hand = int(bal.quantity or 0)
        reserved = int(bal.reserved or 0)
        if sellable_qty(on_hand, reserved) < qty:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock in warehouse (available {sellable_qty(on_hand, reserved)})",
            )
        updated = await col.find_one_and_update(
            {"_id": bal.id, "quantity": on_hand, "reserved": reserved},
            {
                "$inc": {"reserved": qty},
                "$set": {"updatedAt": datetime.utcnow()},
            },
            return_document=ReturnDocument.AFTER,
        )
        if updated is None:
            continue
        movement = StockMovement(
            productId=product_id,
            warehouseId=wh_id,
            variantSku=sku,
            quantity=qty,
            type="reserve",
            reason="Order reserve",
            referenceType="order",
            referenceId=order_id,
            balanceAfter=int(updated.get("quantity") or on_hand),
        )
        await movement.insert()
        await sync_product_stock(product_id)
        return {"balance": updated, "movement": doc_to_dict(movement)}
    raise HTTPException(status_code=409, detail="Stock reserve conflict; retry")


async def commit_reserved_stock(
    *,
    product_id: str,
    warehouse_id: str | None = None,
    quantity: int,
    variant_sku: str = "",
    order_id: str | None = None,
) -> dict:
    qty = int(quantity)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="commit quantity must be positive")
    wh_id = warehouse_id or str((await ensure_default_warehouse()).id)
    col = StockBalance.get_pymongo_collection()
    sku = variant_sku or ""

    for _ in range(8):
        bal = await get_or_create_balance(product_id, wh_id, sku)
        on_hand = int(bal.quantity or 0)
        reserved = int(bal.reserved or 0)
        if reserved < qty or on_hand < qty:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient reserved stock (reserved {reserved}, on hand {on_hand})",
            )
        updated = await col.find_one_and_update(
            {"_id": bal.id, "quantity": on_hand, "reserved": reserved},
            {
                "$inc": {"quantity": -qty, "reserved": -qty},
                "$set": {"updatedAt": datetime.utcnow()},
            },
            return_document=ReturnDocument.AFTER,
        )
        if updated is None:
            continue
        movement = StockMovement(
            productId=product_id,
            warehouseId=wh_id,
            variantSku=sku,
            quantity=-qty,
            type="sale",
            reason="Order sale",
            referenceType="order",
            referenceId=order_id,
            balanceAfter=int(updated.get("quantity") or (on_hand - qty)),
        )
        await movement.insert()
        await sync_product_stock(product_id)
        return {"balance": updated, "movement": doc_to_dict(movement)}
    raise HTTPException(status_code=409, detail="Stock commit conflict; retry")


async def release_reserved_stock(
    *,
    product_id: str,
    warehouse_id: str | None = None,
    quantity: int,
    variant_sku: str = "",
    order_id: str | None = None,
) -> dict:
    qty = int(quantity)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="release quantity must be positive")
    wh_id = warehouse_id or str((await ensure_default_warehouse()).id)
    col = StockBalance.get_pymongo_collection()
    sku = variant_sku or ""

    for _ in range(8):
        bal = await get_or_create_balance(product_id, wh_id, sku)
        on_hand = int(bal.quantity or 0)
        reserved = int(bal.reserved or 0)
        if reserved < qty:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient reserved stock to release (reserved {reserved})",
            )
        updated = await col.find_one_and_update(
            {"_id": bal.id, "quantity": on_hand, "reserved": reserved},
            {
                "$inc": {"reserved": -qty},
                "$set": {"updatedAt": datetime.utcnow()},
            },
            return_document=ReturnDocument.AFTER,
        )
        if updated is None:
            continue
        movement = StockMovement(
            productId=product_id,
            warehouseId=wh_id,
            variantSku=sku,
            quantity=-qty,
            type="reserve_release",
            reason="Order reserve release",
            referenceType="order",
            referenceId=order_id,
            balanceAfter=int(updated.get("quantity") or on_hand),
        )
        await movement.insert()
        await sync_product_stock(product_id)
        return {"balance": updated, "movement": doc_to_dict(movement)}
    raise HTTPException(status_code=409, detail="Stock release conflict; retry")


async def apply_stock_change(
    *,
    product_id: str,
    warehouse_id: str,
    quantity_delta: int,
    movement_type: str,
    variant_sku: str = "",
    reason: str | None = None,
    reference_type: str | None = None,
    reference_id: str | None = None,
    created_by: str | None = None,
    allow_negative: bool = False,
) -> dict:
    if quantity_delta == 0:
        raise HTTPException(status_code=400, detail="quantity delta cannot be zero")

    product = await Product.get(ObjectId(product_id)) if ObjectId.is_valid(product_id) else None
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    warehouse = await Warehouse.get(ObjectId(warehouse_id)) if ObjectId.is_valid(warehouse_id) else None
    if not warehouse or not warehouse.isActive:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    sku = variant_sku or ""
    col = StockBalance.get_pymongo_collection()
    updated = None
    new_qty = 0
    for _ in range(8):
        bal = await get_or_create_balance(product_id, warehouse_id, sku)
        on_hand = int(bal.quantity or 0)
        reserved = int(bal.reserved or 0)
        new_qty = on_hand + quantity_delta
        if new_qty < 0 and not allow_negative:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock in warehouse (available {sellable_qty(on_hand, reserved)})",
            )
        if new_qty < reserved and not allow_negative:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot reduce stock below reserved amount (reserved {reserved})",
            )
        updated = await col.find_one_and_update(
            {"_id": bal.id, "quantity": on_hand, "reserved": reserved},
            {"$inc": {"quantity": quantity_delta}, "$set": {"updatedAt": datetime.utcnow()}},
            return_document=ReturnDocument.AFTER,
        )
        if updated is not None:
            break
    else:
        raise HTTPException(status_code=409, detail="Stock update conflict; retry")

    movement = StockMovement(
        productId=product_id,
        warehouseId=warehouse_id,
        variantSku=sku,
        quantity=quantity_delta,
        type=movement_type,
        reason=reason,
        referenceType=reference_type,
        referenceId=reference_id,
        balanceAfter=int(updated.get("quantity") if isinstance(updated, dict) else new_qty),
        createdBy=created_by,
    )
    await movement.insert()

    await sync_product_stock(product_id)
    product = await Product.get(ObjectId(product_id))

    return {
        "balance": updated if isinstance(updated, dict) else doc_to_dict(bal),
        "movement": doc_to_dict(movement),
        "product": doc_to_dict(product) if product else None,
    }


async def adjust_stock(
    *,
    product_id: str,
    warehouse_id: str,
    quantity: int,
    reason: str | None = None,
    variant_sku: str = "",
    created_by: str | None = None,
) -> dict:
    """Set absolute quantity via delta from current balance."""
    bal = await get_or_create_balance(product_id, warehouse_id, variant_sku or "")
    delta = int(quantity) - (bal.quantity or 0)
    if delta == 0:
        return {"balance": doc_to_dict(bal), "movement": None, "product": None}
    return await apply_stock_change(
        product_id=product_id,
        warehouse_id=warehouse_id,
        quantity_delta=delta,
        movement_type="adjustment",
        variant_sku=variant_sku,
        reason=reason or "Stock adjustment",
        created_by=created_by,
    )


async def transfer_stock(
    *,
    product_id: str,
    from_warehouse_id: str,
    to_warehouse_id: str,
    quantity: int,
    variant_sku: str = "",
    reason: str | None = None,
    created_by: str | None = None,
) -> dict:
    qty = int(quantity)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="transfer quantity must be positive")
    if from_warehouse_id == to_warehouse_id:
        raise HTTPException(status_code=400, detail="source and destination warehouses must differ")

    out = await apply_stock_change(
        product_id=product_id,
        warehouse_id=from_warehouse_id,
        quantity_delta=-qty,
        movement_type="transfer_out",
        variant_sku=variant_sku,
        reason=reason or "Transfer out",
        reference_type="warehouse",
        reference_id=to_warehouse_id,
        created_by=created_by,
    )
    inn = await apply_stock_change(
        product_id=product_id,
        warehouse_id=to_warehouse_id,
        quantity_delta=qty,
        movement_type="transfer_in",
        variant_sku=variant_sku,
        reason=reason or "Transfer in",
        reference_type="warehouse",
        reference_id=from_warehouse_id,
        created_by=created_by,
    )
    return {"out": out, "in": inn}


async def apply_sale(
    *,
    product_id: str,
    quantity: int,
    variant_sku: str = "",
    order_id: str | None = None,
) -> dict:
    wh = await ensure_default_warehouse()
    return await apply_stock_change(
        product_id=product_id,
        warehouse_id=str(wh.id),
        quantity_delta=-int(quantity),
        movement_type="sale",
        variant_sku=variant_sku,
        reason="Order sale",
        reference_type="order",
        reference_id=order_id,
    )


def _item_variant_sku(product: Product, item) -> str:
    return variant_sku(
        product,
        color=getattr(item, "color", None) or "",
        size=getattr(item, "size", None) or "",
    )


async def reserve_order_stock(order) -> None:
    """Reserve sellable stock for all order lines. Rolls back on failure."""
    reserved_lines: list[tuple[str, str, int]] = []
    wh = await ensure_default_warehouse()
    wh_id = str(wh.id)
    try:
        for item in order.items or []:
            product_id = str(item.productId or "")
            product = await Product.get(ObjectId(product_id)) if ObjectId.is_valid(product_id) else None
            if not product:
                raise HTTPException(status_code=404, detail=f"Product not found: {product_id}")
            sku = _item_variant_sku(product, item)
            qty = int(item.quantity or 0)
            if qty <= 0:
                continue
            await reserve_stock(
                product_id=product_id,
                warehouse_id=wh_id,
                quantity=qty,
                variant_sku=sku,
                order_id=str(order.id),
            )
            reserved_lines.append((product_id, sku, qty))
    except Exception:
        for product_id, sku, qty in reserved_lines:
            try:
                await release_reserved_stock(
                    product_id=product_id,
                    warehouse_id=wh_id,
                    quantity=qty,
                    variant_sku=sku,
                    order_id=str(order.id) if getattr(order, "id", None) else None,
                )
            except Exception:
                pass
        raise

    details = dict(order.transactionDetails or {})
    details["stockReserved"] = True
    details["reservedAt"] = datetime.utcnow().isoformat()
    order.transactionDetails = details
    if getattr(order, "id", None):
        await Order.get_pymongo_collection().update_one(
            {"_id": order.id},
            {"$set": {"transactionDetails.stockReserved": True, "transactionDetails.reservedAt": details["reservedAt"], "updatedAt": datetime.utcnow()}},
        )


async def release_order_stock(order) -> bool:
    """Release reserved stock if reserved and not yet applied."""
    details = dict(order.transactionDetails or {})
    if not details.get("stockReserved"):
        # Still release coupon reservation when stock was never held.
        await _release_coupon_reservation(order)
        return False
    if details.get("stockApplied"):
        return False
    if details.get("stockReleased"):
        await _release_coupon_reservation(order)
        return False

    col = Order.get_pymongo_collection()
    claim = await col.find_one_and_update(
        {
            "_id": order.id,
            "transactionDetails.stockReserved": True,
            "transactionDetails.stockApplied": {"$nin": [True]},
            "transactionDetails.stockReleased": {"$nin": [True]},
        },
        {"$set": {"transactionDetails.stockReleased": True, "updatedAt": datetime.utcnow()}},
    )
    if claim is None:
        await _release_coupon_reservation(order)
        return False

    wh = await ensure_default_warehouse()
    wh_id = str(wh.id)
    released_lines: list[tuple[str, str, int]] = []
    try:
        for item in order.items or []:
            product_id = str(item.productId or "")
            product = await Product.get(ObjectId(product_id)) if ObjectId.is_valid(product_id) else None
            if not product:
                continue
            sku = _item_variant_sku(product, item)
            qty = int(item.quantity or 0)
            if qty <= 0:
                continue
            await release_reserved_stock(
                product_id=product_id,
                warehouse_id=wh_id,
                quantity=qty,
                variant_sku=sku,
                order_id=str(order.id),
            )
            released_lines.append((product_id, sku, qty))
    except Exception:
        for product_id, sku, qty in released_lines:
            try:
                await reserve_stock(
                    product_id=product_id,
                    warehouse_id=wh_id,
                    quantity=qty,
                    variant_sku=sku,
                    order_id=str(order.id),
                )
            except Exception:
                pass
        await col.update_one(
            {"_id": order.id},
            {"$set": {"transactionDetails.stockReleased": False, "updatedAt": datetime.utcnow()}},
        )
        raise
    await _release_coupon_reservation(order)
    return True


async def _release_coupon_reservation(order) -> None:
    """Return coupon usage reserved at checkout create if payment never finalized."""
    details = dict(order.transactionDetails or {})
    if not details.get("couponReserved"):
        return
    if details.get("couponApplied"):
        return
    if details.get("couponReleased"):
        return
    col = Order.get_pymongo_collection()
    claim = await col.find_one_and_update(
        {
            "_id": order.id,
            "transactionDetails.couponReserved": True,
            "transactionDetails.couponApplied": {"$nin": [True]},
            "transactionDetails.couponReleased": {"$nin": [True]},
        },
        {"$set": {"transactionDetails.couponReleased": True, "updatedAt": datetime.utcnow()}},
    )
    if claim is None:
        return
    code = str(getattr(order, "couponCode", None) or "").strip()
    if code:
        from app.services import discounts as discount_svc

        await discount_svc.release_coupon_usage(code)


async def reverse_commit_reserved_stock(
    *,
    product_id: str,
    warehouse_id: str | None = None,
    quantity: int,
    variant_sku: str = "",
    order_id: str | None = None,
) -> dict:
    """Undo a successful commit_reserved_stock (quantity+, reserved+)."""
    qty = int(quantity)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="reverse quantity must be positive")
    wh_id = warehouse_id or str((await ensure_default_warehouse()).id)
    col = StockBalance.get_pymongo_collection()
    sku = variant_sku or ""

    for _ in range(8):
        bal = await get_or_create_balance(product_id, wh_id, sku)
        on_hand = int(bal.quantity or 0)
        reserved = int(bal.reserved or 0)
        updated = await col.find_one_and_update(
            {"_id": bal.id, "quantity": on_hand, "reserved": reserved},
            {
                "$inc": {"quantity": qty, "reserved": qty},
                "$set": {"updatedAt": datetime.utcnow()},
            },
            return_document=ReturnDocument.AFTER,
        )
        if updated is None:
            continue
        movement = StockMovement(
            productId=product_id,
            warehouseId=wh_id,
            variantSku=sku,
            quantity=qty,
            type="sale_reverse",
            reason="Compensate partial stock commit",
            referenceType="order",
            referenceId=order_id,
            balanceAfter=int(updated.get("quantity") or (on_hand + qty)),
        )
        await movement.insert()
        await sync_product_stock(product_id)
        return {"balance": updated, "movement": doc_to_dict(movement)}
    raise HTTPException(status_code=409, detail="Stock reverse conflict; retry")


async def ensure_stock_for_payment(order) -> None:
    """Guarantee a live soft-reserve before marking an order paid.

    Late pay after abandon/TTL release re-reserves; raises if stock is gone
    so the caller can refund instead of charging without inventory.
    """
    if not getattr(order, "id", None):
        raise HTTPException(status_code=400, detail="Order must be persisted before stock ensure")

    refreshed = await Order.get(order.id)
    if not refreshed:
        raise HTTPException(status_code=404, detail="Order not found")
    details = dict(refreshed.transactionDetails or {})
    if details.get("stockApplied"):
        order.transactionDetails = details
        return
    if details.get("stockReserved") and not details.get("stockReleased"):
        order.transactionDetails = details
        return

    # Prior reserve released or never reserved — clear flags and try again.
    await Order.get_pymongo_collection().update_one(
        {"_id": order.id},
        {
            "$set": {
                "transactionDetails.stockReserved": False,
                "transactionDetails.stockReleased": False,
                "updatedAt": datetime.utcnow(),
            }
        },
    )
    refreshed = await Order.get(order.id)
    refreshed.transactionDetails = {
        **dict(refreshed.transactionDetails or {}),
        "stockReserved": False,
        "stockReleased": False,
    }
    await reserve_order_stock(refreshed)
    order.transactionDetails = dict(refreshed.transactionDetails or {})


async def restock_order_stock(order) -> bool:
    """Restock a paid/committed order once (cancel / refund / return).

    Unpaid reserved orders are released instead.
    """
    details = dict(order.transactionDetails or {})
    if details.get("stockRestocked"):
        return False
    if not details.get("stockApplied"):
        return await release_order_stock(order)

    col = Order.get_pymongo_collection()
    claim = await col.find_one_and_update(
        {
            "_id": order.id,
            "transactionDetails.stockApplied": True,
            "transactionDetails.stockRestocked": {"$nin": [True]},
        },
        {"$set": {"transactionDetails.stockRestocked": True, "updatedAt": datetime.utcnow()}},
    )
    if claim is None:
        return False

    wh = await ensure_default_warehouse()
    wh_id = str(wh.id)
    restored: list[tuple[str, str, int]] = []
    try:
        for item in order.items or []:
            product_id = str(item.productId or "")
            product = await Product.get(ObjectId(product_id)) if ObjectId.is_valid(product_id) else None
            if not product:
                continue
            sku = _item_variant_sku(product, item)
            qty = int(item.quantity or 0)
            if qty <= 0:
                continue
            await apply_stock_change(
                product_id=product_id,
                warehouse_id=wh_id,
                quantity_delta=qty,
                movement_type="sale_return",
                variant_sku=sku,
                reason="Order restock",
                reference_type="order",
                reference_id=str(order.id),
            )
            restored.append((product_id, sku, qty))
    except Exception:
        for product_id, sku, qty in restored:
            try:
                await apply_stock_change(
                    product_id=product_id,
                    warehouse_id=wh_id,
                    quantity_delta=-qty,
                    movement_type="sale",
                    variant_sku=sku,
                    reason="Compensate failed restock",
                    reference_type="order",
                    reference_id=str(order.id),
                )
            except Exception:
                pass
        await col.update_one(
            {"_id": order.id},
            {"$set": {"transactionDetails.stockRestocked": False, "updatedAt": datetime.utcnow()}},
        )
        raise

    refreshed = await Order.get(order.id)
    if refreshed:
        order.transactionDetails = dict(refreshed.transactionDetails or {})
    return True


async def apply_order_commitments(order) -> bool:
    """Commit an eligible order's stock and coupon once after placement/payment."""
    payment_status = str(order.paymentStatus or "").lower()
    payment_method = str(order.paymentMethod or "").lower()
    if payment_status not in ("paid", "pay_on_delivery") and payment_method != "cod":
        return False

    col = Order.get_pymongo_collection()
    changed = False
    now = datetime.utcnow()

    # Atomically claim stock application so concurrent verify/webhook cannot double-debit.
    stock_claim = await col.find_one_and_update(
        {
            "_id": order.id,
            "$or": [
                {"transactionDetails.stockApplied": {"$exists": False}},
                {"transactionDetails.stockApplied": False},
                {"transactionDetails.stockApplied": None},
            ],
        },
        {"$set": {"transactionDetails.stockApplied": True, "updatedAt": now}},
    )
    if stock_claim is not None:
        # Re-read flags after claim — avoid stale was_reserved after TTL release.
        fresh = await Order.get(order.id)
        details = dict((fresh or order).transactionDetails or {})
        still_reserved = bool(details.get("stockReserved")) and not details.get("stockReleased")
        completed: list[tuple[str, str, str, int]] = []
        try:
            wh = await ensure_default_warehouse()
            wh_id = str(wh.id)
            for item in (fresh or order).items or []:
                product_id = str(item.productId or "")
                product = await Product.get(ObjectId(product_id)) if ObjectId.is_valid(product_id) else None
                if not product:
                    raise HTTPException(status_code=404, detail=f"Product not found: {product_id}")

                line_sku = _item_variant_sku(product, item)
                qty = int(item.quantity or 0)
                if qty <= 0:
                    continue
                if still_reserved:
                    await commit_reserved_stock(
                        product_id=product_id,
                        warehouse_id=wh_id,
                        quantity=qty,
                        variant_sku=line_sku,
                        order_id=str(order.id),
                    )
                    completed.append(("commit", product_id, line_sku, qty))
                else:
                    await apply_sale(
                        product_id=product_id,
                        quantity=qty,
                        variant_sku=line_sku,
                        order_id=str(order.id),
                    )
                    completed.append(("sale", product_id, line_sku, qty))
        except Exception:
            wh = await ensure_default_warehouse()
            wh_id = str(wh.id)
            for mode, product_id, line_sku, qty in reversed(completed):
                try:
                    if mode == "commit":
                        await reverse_commit_reserved_stock(
                            product_id=product_id,
                            warehouse_id=wh_id,
                            quantity=qty,
                            variant_sku=line_sku,
                            order_id=str(order.id),
                        )
                    else:
                        await apply_stock_change(
                            product_id=product_id,
                            warehouse_id=wh_id,
                            quantity_delta=qty,
                            movement_type="sale_return",
                            variant_sku=line_sku,
                            reason="Compensate partial stock commit",
                            reference_type="order",
                            reference_id=str(order.id),
                        )
                except Exception as compensate_exc:
                    print(f"[Stock] Compensate failed for {order.id} {product_id}: {compensate_exc}")
            await col.update_one(
                {"_id": order.id},
                {"$set": {"transactionDetails.stockApplied": False, "updatedAt": datetime.utcnow()}},
            )
            raise
        changed = True

    coupon_claim = await col.find_one_and_update(
        {
            "_id": order.id,
            "$or": [
                {"transactionDetails.couponApplied": {"$exists": False}},
                {"transactionDetails.couponApplied": False},
                {"transactionDetails.couponApplied": None},
            ],
        },
        {"$set": {"transactionDetails.couponApplied": True, "updatedAt": now}},
    )
    if coupon_claim is not None:
        coupon_code = str(order.couponCode or "").strip().upper()
        details = dict((coupon_claim or {}).get("transactionDetails") or {})
        # Preferred path: usage already reserved at order create — do not increment again.
        if coupon_code and details.get("couponReserved"):
            changed = True
        elif coupon_code:
            # Legacy orders without create-time reservation — claim now or fail closed.
            coupon_col = Coupon.get_pymongo_collection()
            claimed = await coupon_col.find_one_and_update(
                {
                    "code": coupon_code,
                    "$expr": {
                        "$or": [
                            {"$eq": [{"$ifNull": ["$usageLimit", None]}, None]},
                            {
                                "$lt": [
                                    {"$ifNull": ["$usedCount", 0]},
                                    "$usageLimit",
                                ]
                            },
                        ]
                    },
                },
                {"$inc": {"usedCount": 1}},
            )
            if claimed is None:
                await col.update_one(
                    {"_id": order.id},
                    {
                        "$set": {
                            "transactionDetails.couponApplied": False,
                            "transactionDetails.couponLimitExceeded": True,
                            "updatedAt": datetime.utcnow(),
                        }
                    },
                )
                raise HTTPException(
                    status_code=409,
                    detail="Discount usage limit reached",
                )
            changed = True
        else:
            changed = True

    if changed:
        refreshed = await Order.get(order.id)
        if refreshed:
            order.transactionDetails = dict(refreshed.transactionDetails or {})
            order.updatedAt = refreshed.updatedAt
    return changed


async def backfill_opening_from_products() -> int:
    """One-time-ish: if no balances exist, copy product/variant qty into default warehouse."""
    existing = await StockBalance.find_all().limit(1).to_list()
    if existing:
        return 0
    wh = await ensure_default_warehouse()
    products = await Product.find_all().to_list()
    created = 0
    for p in products:
        pid = str(p.id)
        variants = p.variants or []
        sku_variants = [v for v in variants if (v.sku or "").strip()]
        if sku_variants:
            for v in sku_variants:
                qty = int(v.quantity or 0)
                if qty <= 0:
                    continue
                await apply_stock_change(
                    product_id=pid,
                    warehouse_id=str(wh.id),
                    quantity_delta=qty,
                    movement_type="opening",
                    variant_sku=(v.sku or "").strip(),
                    reason="Opening balance from product",
                    allow_negative=False,
                )
                created += 1
        else:
            qty = int(p.totalStock or 0)
            if qty <= 0 and variants:
                qty = sum(int(v.quantity or 0) for v in variants)
            if qty <= 0:
                continue
            await apply_stock_change(
                product_id=pid,
                warehouse_id=str(wh.id),
                quantity_delta=qty,
                movement_type="opening",
                reason="Opening balance from product",
            )
            created += 1
    return created
