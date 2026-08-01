# Orders Data Table Migration Design

**Date:** 2026-07-29  
**Status:** Approved for planning  
**Scope:** Admin Orders, Draft Orders, and Abandoned carts list tables

## Goal

Replace the custom `AdminDataTable` (headers + manual `<tr>` children) on three admin list pages with the shared shadcn/TanStack `DataTable` pattern already used on the admin dashboard — column defs + `<DataTable columns={...} data={...} />`.

## Non-goals

- Migrating other admin lists (products, customers, collections, inventory, transfers)
- Changing API contracts or server-side pagination
- Adding column visibility toggles or advanced Tasks-demo pagination chrome
- Replacing `AdminListLayout` or existing page-level filter UX

## Decisions

| Topic | Choice |
|-------|--------|
| Feature depth | Match dashboard: reuse `@/components/ui/data-table` |
| File layout | Page-local `columns.jsx` next to each page |
| Row selection | TanStack row selection as source of truth for bulk actions |
| Search / filters | Keep existing page toolbars; do not use DataTable `searchKey` |
| Pagination | Client-side via existing DataTable (default page size 10) |

## Architecture

```
AdminListLayout (title, bulk actions, Create)
  └── DataTable
        ├── toolbar: AdminViewMenu + Search + AdminDateRangeButton
        ├── columns from ./columns.jsx (factory when actions needed)
        └── data: already-filtered page arrays
```

| Page | Columns module | Row id |
|------|----------------|--------|
| `app/admin/orders/page.js` | `app/admin/orders/columns.jsx` | `order._id` |
| `app/admin/orders/drafts/page.js` | `app/admin/orders/drafts/columns.jsx` | `order._id` |
| `app/admin/orders/abandoned/page.js` | `app/admin/orders/abandoned/columns.jsx` | existing `rowKey(item)` |

`AdminDataTable` remains for other admin pages until a later migration.

## DataTable API extensions

Extend `components/ui/data-table.jsx` in a backward-compatible way:

| Prop | Purpose |
|------|---------|
| `getRowId` | Stable row ids for selection (required for bulk actions) |
| `rowSelection` / `onRowSelectionChange` | Controlled selection when pages need selected originals |
| `onRowClick` | Navigate to order detail or open abandoned drawer; checkbox cells stop propagation |
| `toolbar` | Unchanged — host existing filter chrome |
| `loading` / `emptyTitle` / `emptyDescription` | Unchanged — replace custom empty blocks |

Dashboard usage must keep working with no required new props.

## Column parity

### Orders (`createOrderColumns({ isShipmentScope })`)

**Default scope:** select · order # · date · customer · total · payment · fulfillment · items · channel  

**Shipment scope:** select · order # · customer · AWB · courier · shipping status · total · date  

Preserve muted fulfillment row styling via cell classNames / row meta where feasible. Keep `OrderItemsCell`, `AdminStatusText`, payment/shipping tone helpers (move helpers into columns module or keep as page imports used by the factory).

### Drafts (`createDraftOrderColumns({ completingId, onCompleteDraft })`)

select · draft # · date · customer · total · status (Draft) · items · “Mark as order”

### Abandoned (`createAbandonedColumns()`)

select · checkout id · date · customer · recovery · email · WhatsApp · total  

Row click opens existing detail drawer; selection key must match `rowKey`.

## Selection → bulk UI

1. Pages pass `getRowId` and listen to `onRowSelectionChange`.
2. Derive selected row originals with `Object.keys(rowSelection)` + data lookup (or expose selected rows from a thin callback).
3. Title still shows `N selected` when selection is non-empty; bulk action buttons keep current behavior (print, status update, complete draft, etc.).
4. When filtered data changes, drop selection entries whose ids are no longer present.

## Data flow

Unchanged fetch/filter logic on each page:

1. Load data from existing services.
2. Client-filter with current view / search / date presets.
3. Pass `filtered*` into `DataTable`.
4. Column cells format display only; mutations stay in page handlers passed into column factories.

## Error handling & loading

- Prefer DataTable `loading` skeletons over full-page spinners where straightforward.
- Empty states use DataTable empty props with the same copy as today (“No orders found”, “No draft orders yet”, “No abandoned carts found”).
- Toast / API error handling stays in page load and action handlers.

## Testing

- Manual: load each of the three pages; verify columns, filters, row click, checkbox select-all, bulk title, and draft “Mark as order”.
- Smoke: dashboard tables still render (no regression from DataTable API changes).
- No new automated test suite required unless existing tests break.

## Out of scope follow-ups

- Extract shared order cell helpers if duplication becomes painful.
- Migrate remaining `AdminDataTable` consumers to TanStack.
- Server-side / manual pagination when lists grow large.
