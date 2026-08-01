# Orders Data Table Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Admin Orders, Draft Orders, and Abandoned carts list tables from `AdminDataTable` to the shared TanStack/shadcn `DataTable` with page-local column defs and TanStack row selection for bulk actions.

**Architecture:** Extend `components/ui/data-table.jsx` with `getRowId`, controlled `rowSelection`, `onRowClick`, and optional `getRowClassName`. Add `columns.jsx` factories beside each page. Keep `AdminListLayout` + existing toolbars/filters; swap only the table shell. Dashboard `DataTable` usage stays backward-compatible.

**Tech Stack:** Next.js 16, React 19, `@tanstack/react-table` v8, existing `@/components/ui/data-table`, `@/components/ui/checkbox`, `AdminStatusText`, `OrderItemsCell`.

**Spec:** `docs/superpowers/specs/2026-07-29-orders-data-table-design.md`

## Global Constraints

- Do not migrate products/customers/collections/inventory/transfers lists.
- Do not replace `AdminListLayout` or change API fetch contracts.
- Do not add column-visibility toggles or Tasks-demo page-size chrome.
- Keep existing filter/search/date toolbar UX (pass via `toolbar`; do not use DataTable `searchKey`).
- Prefer JSX; match dashboard DataTable visual density (`h-10` rows).
- No automated frontend unit test runner in `apps/web` — verify with `npm run lint` + manual browser checks.
- Commit after each completed task.

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/components/ui/data-table.jsx` | Shared table; add selection/row-click APIs |
| `apps/web/app/admin/orders/columns.jsx` | Order + shipment-scope column defs |
| `apps/web/app/admin/orders/page.js` | Wire DataTable + controlled selection |
| `apps/web/app/admin/orders/drafts/columns.jsx` | Draft column defs + complete action |
| `apps/web/app/admin/orders/drafts/page.js` | Wire DataTable + selection |
| `apps/web/app/admin/orders/abandoned/columns.jsx` | Abandoned column defs |
| `apps/web/app/admin/orders/abandoned/page.js` | Wire DataTable + `rowKey` selection |

---

### Task 1: Extend shared `DataTable` APIs

**Files:**
- Modify: `apps/web/components/ui/data-table.jsx`

**Interfaces:**
- Consumes: existing TanStack `useReactTable` setup
- Produces: props `getRowId?: (row: TData) => string`, `rowSelection?: Record<string, boolean>`, `onRowSelectionChange?: (updater) => void`, `onRowClick?: (row: TData) => void`, `getRowClassName?: (row: TData) => string | undefined`

- [ ] **Step 1: Update `DataTable` props and table state**

Replace the component signature and `useReactTable` setup so controlled selection and row ids work. Keep uncontrolled selection as default when `rowSelection` is omitted.

```jsx
export function DataTable({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Filter...",
  pageSize = 10,
  loading = false,
  emptyTitle = "No results",
  emptyDescription = "Try adjusting your filters.",
  className,
  toolbar,
  showFooter = true,
  getRowId,
  rowSelection: rowSelectionProp,
  onRowSelectionChange,
  onRowClick,
  getRowClassName,
}) {
  const [sorting, setSorting] = useState([]);
  const [columnFilters, setColumnFilters] = useState([]);
  const [uncontrolledSelection, setUncontrolledSelection] = useState({});

  const isSelectionControlled = rowSelectionProp !== undefined;
  const rowSelection = isSelectionControlled ? rowSelectionProp : uncontrolledSelection;
  const setRowSelection = onRowSelectionChange || setUncontrolledSelection;

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      rowSelection,
    },
    ...(getRowId ? { getRowId: (row) => getRowId(row) } : {}),
    enableRowSelection: true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize },
    },
  });
```

- [ ] **Step 2: Wire `onRowClick` and `getRowClassName` on `TableRow`**

In the body map over rows:

```jsx
<TableRow
  key={row.id}
  className={cn("h-10", getRowClassName?.(row.original), onRowClick && "cursor-pointer")}
  data-state={row.getIsSelected() && "selected"}
  onClick={
    onRowClick
      ? () => onRowClick(row.original)
      : undefined
  }
  onKeyDown={
    onRowClick
      ? (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onRowClick(row.original);
          }
        }
      : undefined
  }
  tabIndex={onRowClick ? 0 : undefined}
  role={onRowClick ? "link" : undefined}
>
```

Leave header/toolbar/footer logic unchanged. Do not break dashboard calls that omit the new props.

- [ ] **Step 3: Verify dashboard still type-checks via lint**

Run:

```bash
cd apps/web && npx eslint components/ui/data-table.jsx app/admin/dashboard/page.js
```

Expected: no new errors from the DataTable changes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ui/data-table.jsx
git commit -m "$(cat <<'EOF'
feat: extend DataTable with selection and row click APIs

EOF
)"
```

---

### Task 2: Orders columns module

**Files:**
- Create: `apps/web/app/admin/orders/columns.jsx`

**Interfaces:**
- Consumes: `formatOrderNumber`, `formatINR`, `OrderItemsCell`, `AdminStatusText`, `Checkbox`, lucide `CheckCircle2`
- Produces: `createOrderColumns({ isShipmentScope })` → `ColumnDef[]`; exports helpers used only by columns (`shippingTone`, `isMutedFulfillmentRow`, `paymentTone`, `paymentIcon`, `paymentLabel`, `attributionTag`, `STATUS_LABELS` subset needed for cells)

- [ ] **Step 1: Create select column helper + status helpers**

Move display helpers from `page.js` into `columns.jsx` (copy the functions currently defined at the top of `page.js`: `shippingTone`, `isMutedFulfillmentRow`, `attributionTag`, `paymentLabel`, `paymentTone`, `paymentIcon`, and the `STATUS_LABELS` map). Keep `ORDER_STATUSES` / `DTDC_SHIPPING_STATUSES` on the page if only filters need them — or import labels from columns if shared.

```jsx
"use client";

import { CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AdminStatusText } from "@/components/admin/list";
import OrderItemsCell from "@/components/admin/list/OrderItemsCell";
import { formatOrderNumber } from "@/utils/formatOrderNumber";
import { formatINR } from "@/utils/formatINR";

function selectColumn() {
  return {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
  };
}
```

If Base UI `Checkbox` rejects `"indeterminate"` as `checked`, use:

```jsx
checked={table.getIsAllPageRowsSelected()}
// and set indeterminate via data attribute or leave as boolean-only select-all
```

- [ ] **Step 2: Implement `createOrderColumns({ isShipmentScope })`**

Default columns (when `!isShipmentScope`): select, order #, date, customer, total, payment, fulfillment, items, tag.

Shipment columns: select, order #, customer, AWB, courier, ship status, total, date.

Customer name accessor must match page logic:

```jsx
function customerName(order) {
  return (
    order.shippingAddress?.name ||
    order.customerId?.name ||
    order.customerId?.email ||
    "—"
  );
}
```

Example fulfillment cell:

```jsx
{
  id: "fulfillment",
  accessorFn: (row) => row.shippingStatus || "—",
  header: "Fulfillment",
  cell: ({ row }) => {
    const shipStatus = row.original.shippingStatus || "—";
    return (
      <AdminStatusText
        tone={shippingTone(shipStatus === "—" ? "Unfulfilled" : shipStatus)}
      >
        {shipStatus === "—"
          ? "Unfulfilled"
          : STATUS_LABELS[shipStatus] || shipStatus}
      </AdminStatusText>
    );
  },
}
```

Export:

```jsx
export function createOrderColumns({ isShipmentScope = false } = {}) {
  if (isShipmentScope) {
    return [selectColumn(), /* shipment cols */];
  }
  return [selectColumn(), /* default cols */];
}

export { isMutedFulfillmentRow };
```

- [ ] **Step 3: Lint the new file**

```bash
cd apps/web && npx eslint app/admin/orders/columns.jsx
```

Expected: clean (or only pre-existing project noise).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/admin/orders/columns.jsx
git commit -m "$(cat <<'EOF'
feat: add TanStack column defs for admin orders

EOF
)"
```

---

### Task 3: Wire Orders page to `DataTable`

**Files:**
- Modify: `apps/web/app/admin/orders/page.js`

**Interfaces:**
- Consumes: `createOrderColumns`, `isMutedFulfillmentRow` from `./columns`; `DataTable` from `@/components/ui/data-table`
- Produces: page with `rowSelection` state; `selectedOrderIds = Object.keys(rowSelection).filter((id) => rowSelection[id])`; bulk actions use `selectedOrderIds` instead of `selectedOrders`

- [ ] **Step 1: Swap imports and selection state**

Remove `AdminDataTable` import; add:

```jsx
import { DataTable } from "@/components/ui/data-table";
import { createOrderColumns, isMutedFulfillmentRow } from "./columns";
```

Replace:

```jsx
const [selectedOrders, setSelectedOrders] = useState([]);
```

with:

```jsx
const [rowSelection, setRowSelection] = useState({});
```

Derive:

```jsx
const selectedOrderIds = useMemo(
  () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
  [rowSelection]
);
```

Replace every `selectedOrders` reference in bulk handlers / title with `selectedOrderIds`. Remove `toggleSelectOrder`, `toggleSelectAll`, and the `headers` array.

- [ ] **Step 2: Prune selection when filtered data changes**

```jsx
useEffect(() => {
  const ids = new Set(filteredOrders.map((o) => o._id));
  setRowSelection((prev) => {
    let changed = false;
    const next = {};
    for (const [key, value] of Object.entries(prev)) {
      if (value && ids.has(key)) next[key] = true;
      else if (value) changed = true;
    }
    return changed || Object.keys(next).length !== Object.keys(prev).length
      ? next
      : prev;
  });
}, [filteredOrders]);
```

- [ ] **Step 3: Memoize columns and render `DataTable`**

```jsx
const columns = useMemo(
  () => createOrderColumns({ isShipmentScope }),
  [isShipmentScope]
);

// Inside AdminListLayout children — replace AdminDataTable block:
<DataTable
  columns={columns}
  data={filteredOrders}
  loading={loading}
  getRowId={(row) => row._id}
  rowSelection={rowSelection}
  onRowSelectionChange={setRowSelection}
  onRowClick={(order) => router.push(adminOrderHref(order))}
  getRowClassName={(order) =>
    isMutedFulfillmentRow(order.shippingStatus || "—")
      ? "bg-muted text-muted-foreground"
      : undefined
  }
  emptyTitle={isShipmentScope ? "No DTDC shipments found" : "No orders found"}
  emptyDescription="Try adjusting your filters."
  pageSize={25}
  toolbar={
    <>
      {/* keep existing AdminViewMenu + search form + AdminDateRangeButton */}
    </>
  }
/>
```

Remove the early full-page loading return so `loading` skeletons show inside the table (per spec). Keep `CreateOrderModal` unchanged.

- [ ] **Step 4: Manual verify + lint**

```bash
cd apps/web && npx eslint app/admin/orders/page.js app/admin/orders/columns.jsx
```

Manual: `/admin/orders` — columns match old list; row click opens detail; select rows updates title to `N selected`; bulk status/print still fire with selected ids. If shipments route shares this page, verify shipment columns when `isShipmentScope`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/admin/orders/page.js apps/web/app/admin/orders/columns.jsx
git commit -m "$(cat <<'EOF'
feat: migrate admin orders list to TanStack DataTable

EOF
)"
```

---

### Task 4: Draft Orders columns + page

**Files:**
- Create: `apps/web/app/admin/orders/drafts/columns.jsx`
- Modify: `apps/web/app/admin/orders/drafts/page.js`

**Interfaces:**
- Consumes: `createDraftOrderColumns({ completingId, onCompleteDraft })`
- Produces: DataTable wired with `getRowId={(r) => r._id}` and controlled selection

- [ ] **Step 1: Create `drafts/columns.jsx`**

```jsx
"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { AdminStatusText } from "@/components/admin/list";
import OrderItemsCell from "@/components/admin/list/OrderItemsCell";
import { formatOrderNumber } from "@/utils/formatOrderNumber";
import { formatINR } from "@/utils/formatINR";
import { displayCustomerName } from "@/utils/displayCustomerName";

function selectColumn() {
  return {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
  };
}

export function createDraftOrderColumns({ completingId, onCompleteDraft }) {
  return [
    selectColumn(),
    {
      id: "draft",
      accessorFn: (row) => formatOrderNumber(row) || row._id,
      header: "Draft",
      cell: ({ row }) => (
        <span className="text-[13px] font-medium text-foreground">
          {formatOrderNumber(row.original)}
        </span>
      ),
    },
    {
      id: "date",
      accessorFn: (row) => row.updatedAt || row.createdAt,
      header: "Date",
      cell: ({ row }) => {
        const iso = row.original.updatedAt || row.original.createdAt;
        const dateLabel = iso
          ? new Date(iso).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "—";
        return (
          <span className="whitespace-nowrap text-[13px] font-medium text-muted-foreground">
            {dateLabel}
          </span>
        );
      },
    },
    {
      id: "customer",
      accessorFn: (row) => displayCustomerName(row, "—"),
      header: "Customer",
      cell: ({ row }) => (
        <span className="block truncate text-[13px] font-medium text-foreground">
          {displayCustomerName(row.original, "—")}
        </span>
      ),
    },
    {
      id: "total",
      accessorFn: (row) => Number(row.finalPrice || row.total || 0),
      header: "Total",
      cell: ({ row }) => (
        <span className="text-[13px] font-medium text-foreground">
          {formatINR(row.original.finalPrice || row.original.total || 0)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: () => <AdminStatusText tone="neutral">Draft</AdminStatusText>,
    },
    {
      id: "items",
      header: "Items",
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <OrderItemsCell order={row.original} />
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="text-right" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            disabled={completingId === row.original._id}
            onClick={() => onCompleteDraft(row.original._id)}
            className="cursor-pointer text-[13px] font-medium text-foreground hover:underline disabled:opacity-50"
          >
            {completingId === row.original._id ? "Converting…" : "Mark as order"}
          </button>
        </div>
      ),
    },
  ];
}
```

- [ ] **Step 2: Wire `drafts/page.js`**

- Import `DataTable` + `createDraftOrderColumns`.
- Replace `selected` array with `rowSelection` object; derive `selectedIds`.
- Remove `headers`, `toggleSelect`, `toggleSelectAll`, `AdminDataTable`.
- Memoize columns with `completingId` / `completeDraft`.
- Render:

```jsx
<DataTable
  columns={columns}
  data={filtered}
  loading={loading}
  getRowId={(row) => row._id}
  rowSelection={rowSelection}
  onRowSelectionChange={setRowSelection}
  onRowClick={(order) => router.push(adminOrderHref(order))}
  emptyTitle="No draft orders yet"
  emptyDescription="Create a draft to get started."
  pageSize={25}
  toolbar={/* existing view/search/date */}
/>
```

- Title: `selectedIds.length > 0 ? \`${selectedIds.length} selected\` : "Draft Orders"`.
- Prune selection when `filtered` changes (same pattern as orders).
- Remove full-page spinner; pass `loading` to DataTable.

- [ ] **Step 3: Lint + manual check**

```bash
cd apps/web && npx eslint app/admin/orders/drafts/page.js app/admin/orders/drafts/columns.jsx
```

Manual: `/admin/orders/drafts` — Mark as order works; row click navigates; selection updates title.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/admin/orders/drafts/page.js apps/web/app/admin/orders/drafts/columns.jsx
git commit -m "$(cat <<'EOF'
feat: migrate draft orders list to TanStack DataTable

EOF
)"
```

---

### Task 5: Abandoned carts columns + page

**Files:**
- Create: `apps/web/app/admin/orders/abandoned/columns.jsx`
- Modify: `apps/web/app/admin/orders/abandoned/page.js`

**Interfaces:**
- Consumes: `createAbandonedColumns()`; page keeps `rowKey`, `openRow`, recovery/email/whatsapp helpers either moved into columns or passed as pure functions exported from columns
- Produces: DataTable with `getRowId={(row) => rowKey(row)}`

- [ ] **Step 1: Create `abandoned/columns.jsx`**

Move `recoveryStatus`, `recoveryTone`, `channelTone`, `whatsappStatus`, `emailStatus`, `channelFromResult` into columns (they are display-only). Keep `mapOrderToRow` / `mapCheckoutToRow` / `formatCheckoutId` on the page (data shaping).

Columns: select, checkout id (`checkoutLabel`), date (`lastActivityAt`), customer, recovery, email, WhatsApp, total — matching current headers/cells.

```jsx
export function createAbandonedColumns() {
  return [
    selectColumn(), // same pattern as drafts
    {
      id: "checkout",
      accessorFn: (row) => row.checkoutLabel,
      header: "Checkout",
      cell: ({ row }) => (
        <span className="font-mono text-[13px] font-medium text-foreground">
          {row.original.checkoutLabel}
        </span>
      ),
    },
    // date, customer, recovery, email, whatsapp, total …
  ];
}
```

- [ ] **Step 2: Wire `abandoned/page.js`**

```jsx
import { DataTable } from "@/components/ui/data-table";
import { createAbandonedColumns } from "./columns";

const columns = useMemo(() => createAbandonedColumns(), []);
const [rowSelection, setRowSelection] = useState({});
const selectedIds = useMemo(
  () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
  [rowSelection]
);

// prune against filtered.map(rowKey)

<DataTable
  columns={columns}
  data={filtered}
  loading={loading}
  getRowId={(row) => rowKey(row)}
  rowSelection={rowSelection}
  onRowSelectionChange={setRowSelection}
  onRowClick={(item) => openRow(item)}
  emptyTitle="No abandoned carts found"
  emptyDescription="Try adjusting your filters."
  pageSize={25}
  toolbar={/* existing */}
/>
```

Keep the detail drawer (`selected` state for checkout detail) unchanged — do not confuse drawer `selected` with `rowSelection`. Rename drawer state if clarity helps (e.g. `detailRow`) in the same task.

Remove `headers`, `toggleSelect`, `toggleSelectAll`, `AdminDataTable`, full-page spinner.

- [ ] **Step 3: Lint + manual check**

```bash
cd apps/web && npx eslint app/admin/orders/abandoned/page.js app/admin/orders/abandoned/columns.jsx
```

Manual: `/admin/orders/abandoned` — filters work; checkout row opens drawer; order-kind row navigates; multi-select updates title.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/admin/orders/abandoned/page.js apps/web/app/admin/orders/abandoned/columns.jsx
git commit -m "$(cat <<'EOF'
feat: migrate abandoned carts list to TanStack DataTable

EOF
)"
```

---

### Task 6: Regression smoke

**Files:**
- Verify only (no required code changes): `apps/web/app/admin/dashboard/page.js`, three order list pages

- [ ] **Step 1: Lint all touched files**

```bash
cd apps/web && npx eslint \
  components/ui/data-table.jsx \
  app/admin/dashboard/page.js \
  app/admin/orders/page.js \
  app/admin/orders/columns.jsx \
  app/admin/orders/drafts/page.js \
  app/admin/orders/drafts/columns.jsx \
  app/admin/orders/abandoned/page.js \
  app/admin/orders/abandoned/columns.jsx
```

Expected: no errors introduced by this migration.

- [ ] **Step 2: Manual checklist**

- [ ] `/admin/dashboard` — Recent Orders + Best Selling still render
- [ ] `/admin/orders` — table, filters, selection, bulk actions, row navigation
- [ ] `/admin/orders/drafts` — Mark as order, selection, navigation
- [ ] `/admin/orders/abandoned` — drawer + navigation + selection
- [ ] Products/customers pages still use `AdminDataTable` (untouched)

- [ ] **Step 3: Final commit only if Step 2 found fixes**

If fixes were needed, commit them:

```bash
git add -A apps/web/components/ui/data-table.jsx apps/web/app/admin/orders
git commit -m "$(cat <<'EOF'
fix: polish orders DataTable migration after smoke checks

EOF
)"
```

If no fixes, skip commit.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Extend DataTable (`getRowId`, selection, `onRowClick`) | Task 1 (`getRowClassName` included for muted rows) |
| Page-local columns for orders | Task 2 |
| Wire orders page; bulk via TanStack selection | Task 3 |
| Drafts columns + page | Task 4 |
| Abandoned columns + page + `rowKey` | Task 5 |
| Keep toolbars / AdminListLayout | Tasks 3–5 |
| Dashboard backward compatible | Tasks 1 + 6 |
| Manual verification | Tasks 3–6 |
| No other AdminDataTable migrations | Explicit non-goal |

## Placeholder / consistency notes

- Selection shape is always `Record<string, boolean>` (TanStack default).
- Selected ids = `Object.keys(rowSelection).filter((id) => rowSelection[id])`.
- Abandoned `getRowId` must equal `` `${item.kind}-${item._id}` ``.
- Drawer state on abandoned page must remain separate from `rowSelection`.
