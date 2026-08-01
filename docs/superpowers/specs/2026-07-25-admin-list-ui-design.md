# Admin list UI redesign (A + B)

Date: 2026-07-25

## Goal
Match the reference Orders UI (clean table, pill filters, right insight panel, row popover, floating bulk bar), then reuse that shell across admin list pages.

## Shared primitives
- `AdminListLayout` — title row + actions, filter row, main table column, optional right insight column
- `AdminFilterPill` — rounded filter dropdown control
- `AdminStatusDot` — paid/cancelled style status with green/red text
- `AdminBulkBar` — fixed bottom bar when rows selected
- `AdminRowPopover` — dark header card for quick order preview
- Typography stays 13px / 550; page bg white; chrome `#0E1217`

## Orders (v1 full match)
Left: Orders title, Import/Export, Type/Status/Order date/All filters, selectable table columns (Order, Customer, Type, Status, Product, Total, Date).
Right: Receipt of goods (computed from orders), Orders status bars, Overview metrics, Top sellers (from line items).
Interactions: row popover, floating bulk bar (Export/Print/Duplicate/status), keep Create order + existing APIs.

## Rollout
Products, Users, Coupons, Shipment reuse `AdminListLayout` + filters + bulk bar. Insight panel only where stats exist.

## Out of scope
Perfect chart animation parity; new metrics backends; Settings form pages beyond shared header spacing.
