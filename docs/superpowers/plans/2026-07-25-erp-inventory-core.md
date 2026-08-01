# ERP Phase 2 — Inventory Core Plan

**Goal:** Warehouses, stock balances, ledger, adjust/transfer, barcodes, order debit via ledger.

**Stack:** FastAPI + Beanie + Next.js admin (existing list UI patterns).

---

### Task 1: Models + stock service
- Add Warehouse, StockBalance, StockMovement; barcode + lowStockThreshold on Product/Variant
- `apps/api/app/services/stock.py` — ensure default warehouse, adjust, transfer, sync product totalStock, apply_sale

### Task 2: Admin stock/warehouse APIs
- CRUD warehouses; stock list/adjust/transfer/movements; product stock breakdown
- Wire order create to `apply_sale`

### Task 3: Web clients + Sidebar
- Services + endpoints; nav: Warehouses, Live stock, Movements, Purchase log

### Task 4: Admin pages + product barcode/labels
- warehouses, stock, movements pages; ProductModal barcode; simple label print
