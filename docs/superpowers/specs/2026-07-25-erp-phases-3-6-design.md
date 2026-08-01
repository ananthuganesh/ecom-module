# ERP Phases 3–6 Design

Date: 2026-07-25  
Status: Implemented

## Delivered

### Phase 3 — Purchase
- Supplier CRUD  
- Purchase Order (with tax lines)  
- Goods Receipt (posts stock into warehouse via stock ledger)  
- Purchase Invoice (AP balance)

### Phase 4 — Sales GST
- Sales Invoice from order (CGST/SGST/IGST split)  
- Credit Note  
- Sales Return (optional restock)

### Phase 5 — Finance
- Party payments (customer in / supplier out)  
- Apply payments to sales/purchase invoice balances (AR/AP)

### Phase 6 — Reports + RBAC
- Reports overview KPIs  
- Roles (seeded Admin/Sales/Purchase/Warehouse/Finance)  
- Assign role to admin users  
- Audit log of ERP actions  

## API prefix
`/api/admin/erp/*`

## Admin nav
Purchase · Sales GST · Finance · Reports · Settings → Roles / Audit logs
