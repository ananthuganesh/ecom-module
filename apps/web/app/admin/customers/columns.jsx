"use client";

import { Bell, BellOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AdminStatusText } from "@/components/admin/list";
import { displayCustomerName } from "@/utils/displayCustomerName";
import { formatINR } from "@/utils/formatINR";

export function isCustomer(record) {
  return !record?.isAdmin && !record?.roleId;
}

export function customerName(customer) {
  return displayCustomerName(customer, "");
}

function customerAddress(customer) {
  const list = Array.isArray(customer.addresses) ? customer.addresses : [];
  return list.find((a) => a.isDefault) || list[0] || null;
}

export function customerPhone(customer) {
  const top = String(customer.phone || "").trim();
  if (top) return top;
  const a = customerAddress(customer);
  return String(a?.phone || a?.contact || a?.mobile || "").trim();
}

function customerLocation(customer) {
  const a = customerAddress(customer);
  if (!a) return "";
  const parts = [a.city, a.state].map((x) => String(x || "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

function customerPostal(customer) {
  const a = customerAddress(customer);
  if (!a) return "";
  return String(a.pincode || a.postalCode || a.zipCode || a.zipcode || "").trim();
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function selectColumn() {
  return {
    id: "select",
    size: 44,
    meta: { className: "w-11 min-w-11 max-w-11 px-3" },
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

function CellText({ children, soft = false, className = "" }) {
  const empty = children == null || children === "";
  return (
    <span
      className={[
        "block truncate text-[13px] font-medium",
        soft ? "text-muted-foreground" : "text-foreground",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {empty ? null : children}
    </span>
  );
}

export function createCustomerColumns() {
  return [
    selectColumn(),
    {
      id: "name",
      size: 168,
      meta: { className: "w-[168px] min-w-[168px] px-3" },
      accessorFn: (row) => customerName(row),
      header: "Name",
      cell: ({ row }) => <CellText>{customerName(row.original)}</CellText>,
    },
    {
      id: "email",
      size: 260,
      meta: { className: "w-[260px] min-w-[260px] px-3" },
      accessorFn: (row) => row.email || "",
      header: "Email",
      cell: ({ row }) => <CellText soft>{row.original.email}</CellText>,
    },
    {
      id: "phone",
      size: 128,
      meta: { className: "w-[128px] min-w-[128px] px-3" },
      accessorFn: (row) => customerPhone(row),
      header: "Phone",
      cell: ({ row }) => <CellText soft>{customerPhone(row.original)}</CellText>,
    },
    {
      id: "location",
      size: 180,
      meta: { className: "w-[180px] min-w-[180px] px-3" },
      accessorFn: (row) => customerLocation(row),
      header: "Location",
      cell: ({ row }) => (
        <CellText soft>{customerLocation(row.original)}</CellText>
      ),
    },
    {
      id: "postal",
      size: 108,
      meta: { className: "w-[108px] min-w-[108px] px-3" },
      accessorFn: (row) => customerPostal(row),
      header: "Postal code",
      cell: ({ row }) => (
        <CellText soft>{customerPostal(row.original)}</CellText>
      ),
    },
    {
      id: "orders",
      size: 80,
      meta: { className: "w-20 min-w-20 px-3" },
      accessorFn: (row) => Number(row.ordersCount || 0),
      header: "Orders",
      cell: ({ row }) => (
        <CellText soft className="tabular-nums">
          {Number(row.original.ordersCount || 0)}
        </CellText>
      ),
    },
    {
      id: "spent",
      size: 124,
      meta: { className: "w-[124px] min-w-[124px] px-3" },
      accessorFn: (row) => Number(row.amountSpent || 0),
      header: "Amount spent",
      cell: ({ row }) => (
        <CellText soft className="tabular-nums">
          {formatINR(row.original.amountSpent || 0)}
        </CellText>
      ),
    },
    {
      id: "optin",
      size: 132,
      meta: { className: "w-[132px] min-w-[132px] px-3" },
      accessorFn: (row) =>
        Boolean(row.emailSubscribed || row.whatsappSubscribed),
      header: "Opt-in",
      enableSorting: false,
      cell: ({ row }) => {
        const on = Boolean(
          row.original.emailSubscribed || row.original.whatsappSubscribed
        );
        return (
          <AdminStatusText tone={on ? "success" : "neutral"} icon={on ? Bell : BellOff}>
            {on ? "Subscribed" : "Unsubscribed"}
          </AdminStatusText>
        );
      },
    },
    {
      id: "added",
      size: 112,
      meta: { className: "w-[112px] min-w-[112px] px-3" },
      accessorFn: (row) => row.createdAt || "",
      header: "Added",
      cell: ({ row }) => (
        <CellText soft>{formatDate(row.original.createdAt)}</CellText>
      ),
    },
    {
      id: "updated",
      size: 112,
      meta: { className: "w-[112px] min-w-[112px] px-3" },
      accessorFn: (row) => row.updatedAt || "",
      header: "Updated",
      cell: ({ row }) => (
        <CellText soft>{formatDate(row.original.updatedAt)}</CellText>
      ),
    },
  ];
}
