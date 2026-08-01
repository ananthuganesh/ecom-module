# ERP Foundation Design — Company GST + Tax Classes + Product Tax

Date: 2026-07-25  
Status: Approved for implementation (Approach 1)

## Context

Urban Aana is a DTC e-commerce platform (Next.js + FastAPI + Mongo). This is **sub-project 1 of 6** toward a full India-GST commerce ERP.

**Roadmap (one-by-one after Foundation):**
1. **Foundation** (this spec) — company GSTIN, tax classes, product HSN/tax mode  
2. Inventory core — stock ledger, multi-warehouse, barcodes/labels  
3. Purchase — suppliers, PO, GRN, purchase invoices  
4. Sales GST — tax invoices, credit notes, returns  
5. Finance — AR/AP, payments, reconciliation  
6. Reports + RBAC — KPIs, GST reports, roles, audit  

## Decisions locked

| Decision | Choice |
|----------|--------|
| Tax regime | India GST only (CGST/SGST/IGST) |
| Legal entity | Single company, one GSTIN |
| Product tax attachment | Tax class + HSN on product |
| Price mode | Inclusive and exclusive; storefront default **inclusive** |
| Barcodes | Deferred to Inventory phase |

## Goals

- Persist a real company/GST profile (replace Store Details stub)  
- Manage GST tax classes (0/5/12/18/28 seeded)  
- Attach `hsnCode`, `taxClassId`, `priceTaxMode` to every product  
- Prepare shared GST calculation helpers for later invoice work  
- No storefront checkout tax engine yet (data foundation only)

## Non-goals

- Tax invoices, credit/debit notes  
- Multi-warehouse, barcodes, purchase, RBAC  
- Tally/Zoho tax sync  
- Multi-company / multi-GSTIN  

## Data model

### `TaxClass` (new collection `taxclasses`)

| Field | Type | Notes |
|-------|------|-------|
| name | string | e.g. "GST 18%" |
| rate | float | Percent 0–100 |
| description | string? | Optional |
| isActive | bool | default true |
| isDefault | bool | at most one default |
| createdAt / updatedAt | datetime | |

### `Product` (extend)

| Field | Type | Notes |
|-------|------|-------|
| hsnCode | string? | 4–8 digit HSN/SAC |
| taxClassId | string? | Ref to TaxClass `_id` |
| priceTaxMode | `"inclusive"` \| `"exclusive"` | default from company profile, else `"inclusive"` |

### `Setting` key `company_profile`

```json
{
  "legalName": "Urban Aana",
  "tradeName": "Urban Aana",
  "gstin": "",
  "email": "",
  "phone": "",
  "addressLine1": "",
  "addressLine2": "",
  "city": "",
  "stateName": "",
  "stateCode": "",
  "pincode": "",
  "country": "India",
  "currency": "INR",
  "defaultPriceTaxMode": "inclusive"
}
```

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/tax-classes` | List (auto-seed if empty) |
| POST | `/api/admin/tax-classes` | Create |
| PUT | `/api/admin/tax-classes/{id}` | Update |
| DELETE | `/api/admin/tax-classes/{id}` | Soft-disable or delete if unused |
| GET | `/api/admin/company-profile` | Get company GST profile |
| PUT | `/api/admin/company-profile` | Upsert profile |
| Existing | product create/update | Accept new tax fields |

### Seed tax classes (on empty list)

- GST 0% (rate 0)  
- GST 5%  
- GST 12%  
- GST 18% (isDefault: true)  
- GST 28%  

### Validation

- GSTIN: 15-char Indian pattern when provided  
- HSN: 4–8 digits when provided  
- Tax class rate: 0–100  
- Only one `isDefault` tax class  

## GST helper (library, unused by checkout yet)

`apps/api/app/services/gst.py`:

- `taxable_and_tax(amount, rate, inclusive) -> (taxable, tax)`  
- `split_cgst_sgst_igst(tax, seller_state, buyer_state) -> {cgst, sgst, igst}`  
  - Same state → CGST+SGST half each  
  - Different state → full IGST  

## Admin UI

1. **Store Details** (`/admin/settings/store-details`) — live form bound to `company_profile`  
2. **Taxes** (`/admin/settings/taxes`) — tax class table CRUD + default price mode note  
3. **Product sheet** — Pricing step: HSN, tax class select, price tax mode  

Match existing admin typography (13px / 550, Inter, side sheet Cancel pattern).

## Error handling

- Invalid GSTIN/HSN → 400 with clear message  
- Delete tax class in use by products → 409  
- Missing admin auth → existing 401/403  

## Testing

- Unit: GST helper inclusive/exclusive + inter/intra state split  
- API: tax class seed, company profile round-trip, product with tax fields  

## Success criteria

- Admin can save company GSTIN and address  
- Tax classes list shows seeded rates; can add/edit  
- New/edit product persists HSN, tax class, price mode  
- Helper tests pass for 18% inclusive and exclusive cases  
