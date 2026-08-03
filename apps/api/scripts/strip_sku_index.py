#!/usr/bin/env python3
"""Remove trailing variant index from SKUs (`TJ9I99-S-01` → `TJ9I99-S`).

Updates:
- products.variants[].sku
- stockbalances.variantSku
- stockmovements.variantSku
"""

from __future__ import annotations

import asyncio
import re
from collections import defaultdict

from app.db import init_db
from app.documents import Product, StockBalance, StockMovement

SKU_INDEX_RE = re.compile(r"-\d{2}$")


def strip_sku(value: object) -> str:
    sku = str(value or "").strip()
    if not sku:
        return ""
    return SKU_INDEX_RE.sub("", sku)


async def migrate_products() -> int:
    updated = 0
    products = await Product.find_all().to_list()
    for product in products:
        changed = False
        for variant in product.variants or []:
            old = str(variant.sku or "").strip()
            new = strip_sku(old)
            if old and new != old:
                variant.sku = new
                changed = True
        if changed:
            await product.save()
            updated += 1
    return updated


async def migrate_stock_balances() -> tuple[int, int]:
    updated = 0
    merged = 0
    rows = await StockBalance.find_all().to_list()
    # Group by new key so duplicates after strip can merge quantities.
    groups: dict[tuple[str, str, str], list[StockBalance]] = defaultdict(list)
    for row in rows:
        key = (
            str(row.productId or ""),
            str(row.warehouseId or ""),
            strip_sku(row.variantSku),
        )
        groups[key].append(row)

    for (product_id, warehouse_id, new_sku), items in groups.items():
        if not items:
            continue
        # Nothing to rewrite
        if all(str(i.variantSku or "").strip() == new_sku for i in items):
            continue

        keep = items[0]
        for extra in items[1:]:
            keep.quantity = int(keep.quantity or 0) + int(extra.quantity or 0)
            keep.reserved = int(keep.reserved or 0) + int(extra.reserved or 0)
            await extra.delete()
            merged += 1

        if str(keep.variantSku or "").strip() != new_sku or len(items) > 1:
            keep.variantSku = new_sku
            keep.productId = product_id
            keep.warehouseId = warehouse_id
            await keep.save()
            updated += 1

    return updated, merged


async def migrate_stock_movements() -> int:
    updated = 0
    rows = await StockMovement.find(
        {"variantSku": {"$regex": r"-\d{2}$"}}
    ).to_list()
    for row in rows:
        new = strip_sku(row.variantSku)
        if new and new != str(row.variantSku or "").strip():
            row.variantSku = new
            await row.save()
            updated += 1
    return updated


async def main() -> None:
    await init_db()
    products = await migrate_products()
    balances_updated, balances_merged = await migrate_stock_balances()
    movements = await migrate_stock_movements()
    print(
        "SKU index strip complete:",
        f"products={products}",
        f"stockbalances_updated={balances_updated}",
        f"stockbalances_merged={balances_merged}",
        f"stockmovements={movements}",
    )


if __name__ == "__main__":
    asyncio.run(main())
