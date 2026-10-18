"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { AdminStatusText } from "@/components/admin/list";
import SafeImage from "@/components/SafeImage";

const ACTIVE_PILL =
  "bg-[#95FFB9] text-[#004D41] hover:bg-[#95FFB9] [&_svg]:text-[#004D41] [&_svg]:opacity-100";

function selectColumn() {
  return {
    id: "select",
    size: 40,
    meta: { className: "w-10" },
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

function Thumb({ src, alt }) {
  return (
    <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded border border-border bg-muted">
      {src ? <SafeImage src={src} alt={alt} fill className="object-cover" sizes="28px" /> : null}
    </div>
  );
}

function ProductStatus({ status }) {
  const value = String(status || "active").toLowerCase();
  const label = value.charAt(0).toUpperCase() + value.slice(1);
  if (value === "active") {
    return (
      <AdminStatusText tone="success" className={ACTIVE_PILL}>
        {label}
      </AdminStatusText>
    );
  }
  return <AdminStatusText tone={value === "draft" ? "neutral" : "warning"}>{label}</AdminStatusText>;
}

export function createCollectionColumns() {
  return [
    selectColumn(),
    {
      id: "collection",
      size: 280,
      meta: { className: "w-[280px]" },
      accessorFn: (row) => row.name || "",
      header: "Collection",
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Thumb src={row.original.image} alt={row.original.name} />
          <span className="block truncate text-[13px] font-medium text-foreground">
            {row.original.name}
          </span>
        </div>
      ),
    },
    {
      id: "products",
      size: 110,
      meta: { className: "w-[110px]" },
      accessorFn: (row) => Number(row.productCount || 0),
      header: "Products",
      cell: ({ row }) => (
        <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
          {row.original.productCount || 0}
        </span>
      ),
    },
    {
      id: "status",
      size: 128,
      meta: { className: "w-[128px]" },
      accessorFn: (row) => (row.isActive ? "active" : "hidden"),
      header: "Status",
      cell: ({ row }) =>
        row.original.isActive ? (
          <AdminStatusText tone="success" className={ACTIVE_PILL}>
            Active
          </AdminStatusText>
        ) : (
          <AdminStatusText tone="neutral">Hidden</AdminStatusText>
        ),
    },
    {
      id: "url",
      size: 240,
      meta: { className: "w-[240px]" },
      accessorFn: (row) => row.slug || "",
      header: "Storefront URL",
      cell: ({ row }) => (
        <span className="block truncate text-[13px] font-medium text-muted-foreground">
          /collections/{row.original.slug}
        </span>
      ),
    },
  ];
}

/** Rows are the collection API's product summaries ({ name, image, status, price }). */
export function createMemberColumns() {
  return [
    selectColumn(),
    {
      id: "product",
      size: 320,
      meta: { className: "w-[320px]" },
      accessorFn: (row) => row.name || "",
      header: "Product",
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Thumb src={row.original.image} alt={row.original.name} />
          <span className="block truncate text-[13px] font-medium text-foreground">
            {row.original.name || "Untitled product"}
          </span>
        </div>
      ),
    },
    {
      id: "status",
      size: 128,
      meta: { className: "w-[128px]" },
      accessorFn: (row) => row.status || "active",
      header: "Status",
      cell: ({ row }) => <ProductStatus status={row.original.status} />,
    },
    {
      id: "price",
      size: 110,
      meta: { className: "w-[110px]" },
      accessorFn: (row) => Number(row.price || 0),
      header: "Price",
      cell: ({ row }) => (
        <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
          {row.original.price != null
            ? `₹${Number(row.original.price).toLocaleString("en-IN")}`
            : ""}
        </span>
      ),
    },
  ];
}
