# ERP Foundation Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Ship India-GST foundation: company profile, tax classes, product HSN/tax mode, GST helpers — UI + backend.

**Architecture:** Extend Beanie models + admin FastAPI routes; wire Store Details / Taxes pages and ProductModal; seed default GST rates.

**Tech Stack:** FastAPI, Beanie/MongoDB, Next.js admin, existing axios admin client.

## Global Constraints

- India GST only; single GSTIN  
- Tax class + HSN on product  
- Default price mode inclusive  
- No invoices/barcodes/warehouses in this plan  

---

### Task 1: TaxClass model + Product tax fields + GST helper

**Files:**
- Modify: `apps/api/app/documents/__init__.py`
- Create: `apps/api/app/services/gst.py`
- Create: `apps/api/tests/test_gst.py`

- [ ] Add `TaxClass` document and register in `ALL_DOCUMENTS`
- [ ] Add `hsnCode`, `taxClassId`, `priceTaxMode` on `Product`
- [ ] Implement `taxable_and_tax` and `split_cgst_sgst_igst`
- [ ] Add unit tests; run `pytest apps/api/tests/test_gst.py -v`

---

### Task 2: Admin APIs — tax-classes + company-profile

**Files:**
- Modify: `apps/api/app/routers/admin.py`

- [ ] CRUD `/api/admin/tax-classes` with seed-on-empty
- [ ] GET/PUT `/api/admin/company-profile` via `Setting` key `company_profile`
- [ ] GSTIN/HSN validation helpers

---

### Task 3: Web API client

**Files:**
- Modify: `apps/web/api/endpoints/admin.js`
- Create: `apps/web/api/services/admin/taxClassService.js`
- Create: `apps/web/api/services/admin/companyProfileService.js`
- Modify: `apps/web/api/services/admin/index.js`
- Modify: `apps/web/api/services/index.js`
- Modify: `apps/web/api/index.js` (if needed)

---

### Task 4: Admin UI — Store Details + Taxes

**Files:**
- Modify: `apps/web/app/admin/settings/store-details/page.js`
- Modify: `apps/web/app/admin/settings/taxes/page.js`

---

### Task 5: ProductModal tax fields

**Files:**
- Modify: `apps/web/components/admin/ProductModal.jsx`

- [ ] Load tax classes; Pricing step: HSN, tax class, price mode
- [ ] Persist on create/update payload

---

### Task 6: Verify

- [ ] Hit health + tax-classes + company-profile with admin token or via UI
- [ ] Confirm products save tax fields
