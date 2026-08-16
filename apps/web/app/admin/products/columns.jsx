"use client";

import { Eye } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AdminStatusText } from "@/components/admin/list";
import SafeImage from "@/components/SafeImage";

export function productStatus(p) {
  if (p.status) return p.status;
  const stock = p.totalStock ?? p.countInStock ?? 0;
  if (stock <= 0) return "out_of_stock";
  return "active";
}

export function categoryId(value) {
  if (!value) return "";
  if (typeof value === "object") return String(value._id || value.id || "");
  return String(value);
}

export function resolveCategoryName(categories, value) {
  if (!value) return "";
  if (typeof value === "object") {
    const named = String(value.name || value.title || "").trim();
    if (named) return named;
  }
  const id = categoryId(value);
  if (!id) return "";
  const match = (categories || []).find((c) => categoryId(c) === id);
  if (match) return String(match?.name || match?.title || "").trim();
  // Fixed catalog strings (e.g. "T-Shirt") are stored directly
  return id;
}

export function storefrontHref(product) {
  if (product?.slug) return `/products/${product.slug}`;
  if (product?._id) return `/product/${product._id}`;
  return "/all-products";
}

function statusTone(status) {
  if (status === "active") return "success";
  if (status === "draft") return "neutral";
  return "warning";
}

function statusLabel(status) {
  if (status === "out_of_stock") return "Out of stock";
  return String(status || "").charAt(0).toUpperCase() + String(status || "").slice(1);
}

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

export function createProductColumns({ categories = [] } = {}) {
  return [
    selectColumn(),
    {
      id: "product",
      size: 280,
      meta: { className: "w-[280px]" },
      accessorFn: (row) => row.productName || row.name || "",
      header: "Product",
      cell: ({ row }) => {
        const p = row.original;
        const src =
          p.thumbnails?.[0] || p.variants?.[0]?.images?.[0] || p.images?.[0];
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded border border-border bg-muted">
              <SafeImage
                src={src}
                alt={p.productName || p.name || ""}
                fill
                className="object-cover"
              />
            </div>
            <span className="block truncate text-[13px] font-medium text-foreground">
              {p.productName || p.name || ""}
            </span>
          </div>
        );
      },
    },
    {
      id: "status",
      size: 128,
      meta: { className: "w-[128px]" },
      accessorFn: (row) => productStatus(row),
      header: "Status",
      cell: ({ row }) => {
        const status = productStatus(row.original);
        if (status === "active") {
          return (
            <AdminStatusText
              tone="success"
              className="bg-[#95FFB9] text-[#004D41] hover:bg-[#95FFB9] [&_svg]:text-[#004D41] [&_svg]:opacity-100"
            >
              {statusLabel(status)}
            </AdminStatusText>
          );
        }
        return (
          <AdminStatusText tone={statusTone(status)}>
            {statusLabel(status)}
          </AdminStatusText>
        );
      },
    },
    {
      id: "inventory",
      size: 96,
      meta: { className: "w-24" },
      accessorFn: (row) => Number(row.totalStock ?? row.countInStock ?? 0),
      header: "Inventory",
      cell: ({ row }) => (
        <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
          {row.original.totalStock ?? row.original.countInStock ?? 0}
        </span>
      ),
    },
    {
      id: "category",
      size: 140,
      meta: { className: "w-[140px]" },
      accessorFn: (row) => resolveCategoryName(categories, row.category),
      header: "Category",
      cell: ({ row }) => (
        <span className="block truncate text-[13px] font-medium text-muted-foreground">
          {resolveCategoryName(categories, row.original.category) || ""}
        </span>
      ),
    },
    {
      id: "type",
      size: 140,
      meta: { className: "w-[140px]" },
      accessorFn: (row) =>
        resolveCategoryName(categories, row.type || row.subcategory),
      header: "Product type",
      cell: ({ row }) => (
        <span className="block truncate text-[13px] font-medium text-muted-foreground">
          {resolveCategoryName(
            categories,
            row.original.type || row.original.subcategory
          ) || ""}
        </span>
      ),
    },
    {
      id: "actions",
      size: 48,
      meta: { className: "w-12" },
      enableSorting: false,
      enableHiding: false,
      header: "",
      cell: ({ row }) => (
        <div
          className="flex justify-end"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <a
            href={storefrontHref(row.original)}
            target="_blank"
            rel="noreferrer"
            aria-label="View on store"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Eye className="h-3.5 w-3.5" />
          </a>
        </div>
      ),
    },
  ];
}
