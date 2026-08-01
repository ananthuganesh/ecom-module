# ERP Phase 2 Design — Inventory Core

Date: 2026-07-25  
Status: Implementing

## Goals

- Multi-warehouse master  
- Per-warehouse stock balances linked to products  
- Immutable stock movement ledger (audit trail)  
- Stock adjustment + inter-warehouse transfer  
- Variant barcodes + basic label print  
- Keep product `totalStock` in sync (sum of balances)  
- Low-stock threshold (company default + per-product override)  

## Non-goals (later)

- Full WMS bins/racks, pick/pack  
- Purchase PO → GRN (Phase 3)  
- Batch/serial/expiry  
- Zoho sync engine  

## Data model

### `Warehouse`
- name, code, address fields, isDefault, isActive, createdAt, updatedAt  

### `StockBalance`
- productId, warehouseId, variantSku (optional), quantity, updatedAt  
- Unique index: (productId, warehouseId, variantSku)  

### `StockMovement`
- productId, warehouseId, variantSku?, quantity (signed: +in / −out)  
- type: `adjustment` | `transfer_in` | `transfer_out` | `sale` | `sale_return` | `opening` | `damage`  
- reason, referenceType, referenceId, balanceAfter, createdAt, createdBy?  

### Product / Variant
- Variant.barcode optional  
- Product.lowStockThreshold optional (default from company_profile.lowStockThreshold = 10)  

### Legacy `Inventory` (purchase batches)
- Unchanged for Phase 3 purchase; still at `/admin/inventory` as “Purchase log”

## APIs

| Method | Path |
|--------|------|
| CRUD | `/api/admin/warehouses` |
| GET | `/api/admin/stock` ?warehouseId&productId&lowStock=1 |
| POST | `/api/admin/stock/adjust` |
| POST | `/api/admin/stock/transfer` |
| GET | `/api/admin/stock/movements` |
| GET | `/api/admin/stock/product/{id}` warehouse breakdown |

Seed one default warehouse `MAIN` if none exist.  
On first stock list, optionally backfill opening balances from product.totalStock / variant qty into default warehouse.

## Order integration

Place-order stock debit goes through stock service against **default warehouse** (movement type `sale`).

## Admin UI

- `/admin/warehouses` — warehouse CRUD  
- `/admin/stock` — live stock table (warehouse filter, low stock)  
- `/admin/stock/movements` — ledger  
- Sidebar Inventory submenu: Warehouses, Live stock, Movements, Purchase log  
- Product sheet: barcode per variant; print labels action  

## Success criteria

- Create warehouse, adjust stock, transfer between warehouses  
- Movements appear in ledger  
- Product totalStock matches sum of balances  
- Order reduces default warehouse stock + writes sale movement  
- Barcode printable from admin  
