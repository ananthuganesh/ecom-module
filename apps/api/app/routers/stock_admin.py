from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import AdminUser, require_permission
from app.documents import Product, StockBalance, StockMovement, User, Warehouse
from app.serializers import doc_to_dict
from app.services import stock as stock_service

router = APIRouter(prefix="/api/admin", tags=["admin-stock"])
StockWriter = Annotated[User, Depends(require_permission("stock.write"))]


@router.get("/stock")
async def list_stock(
    _: AdminUser,
    warehouseId: str | None = None,
    productId: str | None = None,
    lowStock: bool = False,
    threshold: int = Query(10, ge=0),
):
    await stock_service.ensure_default_warehouse()
    await stock_service.ensure_inventory_balances_for_catalog(seed_from_product=True)
    await stock_service.cleanup_duplicate_inventory_rows()

    query: dict = {}
    if warehouseId:
        query["warehouseId"] = warehouseId
    if productId:
        query["productId"] = productId

    balances = await StockBalance.find(query).to_list() if query else await StockBalance.find_all().to_list()

    # Hide empty blank-SKU rows when variant balances exist (non-zero blanks kept).
    variant_keys = {
        (b.productId, b.warehouseId)
        for b in balances
        if (b.variantSku or "").strip()
    }
    balances = [
        b
        for b in balances
        if (b.variantSku or "").strip()
        or (b.productId, b.warehouseId) not in variant_keys
        or int(b.quantity or 0) != 0
        or int(b.reserved or 0) != 0
    ]

    product_ids = list({b.productId for b in balances if ObjectId.is_valid(b.productId)})
    products = {}
    for pid in product_ids:
        p = await Product.get(ObjectId(pid))
        if p:
            products[pid] = p

    warehouses = {str(w.id): w for w in await Warehouse.find_all().to_list()}

    rows = []
    for b in balances:
        product = products.get(b.productId)
        wh = warehouses.get(b.warehouseId)
        product_threshold = (
            product.lowStockThreshold if product and product.lowStockThreshold is not None else threshold
        )
        is_low = b.quantity <= product_threshold
        if lowStock and not is_low:
            continue
        image = None
        if product:
            # Product has thumbnails; images live on variants only.
            image = next((u for u in (product.thumbnails or []) if u), None)
            if not image:
                for variant in product.variants or []:
                    image = next((u for u in (variant.images or []) if u), None)
                    if image:
                        break

        rows.append(
            {
                **doc_to_dict(b),
                "productName": (product.productName or product.name) if product else None,
                "productImage": image,
                "warehouseName": wh.name if wh else None,
                "warehouseCode": wh.code if wh else None,
                "lowStock": is_low,
                "threshold": product_threshold,
                # Shopify-style inventory buckets:
                # onHand = unavailable + committed + available
                "onHand": int(b.quantity or 0),
                "committed": int(b.reserved or 0),
                "unavailable": int(getattr(b, "unavailable", 0) or 0),
                "available": max(
                    0,
                    int(b.quantity or 0)
                    - int(b.reserved or 0)
                    - int(getattr(b, "unavailable", 0) or 0),
                ),
                "incoming": 0,
            }
        )

    rows.sort(key=lambda r: ((r.get("productName") or ""), r.get("warehouseName") or ""))
    return rows


@router.get("/stock/movements")
async def list_movements(
    _: AdminUser,
    warehouseId: str | None = None,
    productId: str | None = None,
    limit: int = Query(100, ge=1, le=500),
):
    q = {}
    if warehouseId:
        q["warehouseId"] = warehouseId
    if productId:
        q["productId"] = productId
    cursor = StockMovement.find(q) if q else StockMovement.find_all()
    rows = await cursor.sort([("createdAt", -1)]).limit(limit).to_list()

    product_ids = list({m.productId for m in rows if ObjectId.is_valid(m.productId)})
    products = {}
    for pid in product_ids:
        p = await Product.get(ObjectId(pid))
        if p:
            products[pid] = p
    warehouses = {str(w.id): w for w in await Warehouse.find_all().to_list()}

    out = []
    for m in rows:
        product = products.get(m.productId)
        wh = warehouses.get(m.warehouseId)
        out.append(
            {
                **doc_to_dict(m),
                "productName": (product.productName or product.name) if product else None,
                "warehouseName": wh.name if wh else None,
            }
        )
    return out


@router.get("/stock/product/{product_id}")
async def product_stock_breakdown(product_id: str, _: AdminUser):
    await stock_service.ensure_default_warehouse()
    balances = await StockBalance.find(StockBalance.productId == product_id).to_list()
    warehouses = {str(w.id): w for w in await Warehouse.find_all().to_list()}
    return [
        {
            **doc_to_dict(b),
            "warehouseName": warehouses.get(b.warehouseId).name if warehouses.get(b.warehouseId) else None,
            "warehouseCode": warehouses.get(b.warehouseId).code if warehouses.get(b.warehouseId) else None,
        }
        for b in balances
    ]


@router.post("/stock/adjust")
async def adjust_stock(body: dict, admin: StockWriter):
    product_id = body.get("productId")
    warehouse_id = body.get("warehouseId")
    if not product_id or not warehouse_id:
        raise HTTPException(status_code=400, detail="productId and warehouseId are required")
    try:
        quantity = int(body.get("quantity"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="quantity must be an integer")
    return await stock_service.adjust_stock(
        product_id=str(product_id),
        warehouse_id=str(warehouse_id),
        quantity=quantity,
        reason=body.get("reason"),
        variant_sku=body.get("variantSku") or "",
        created_by=str(admin.id),
    )


@router.post("/stock/backfill")
async def backfill_stock(_: StockWriter):
    # Create missing ledger rows for products/variants that have none yet.
    count = await stock_service.ensure_inventory_balances_for_catalog(seed_from_product=True)
    cleaned = await stock_service.cleanup_duplicate_inventory_rows()
    return {"created": count, **cleaned}
