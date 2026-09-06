"use client";

import Link from "next/link";
import { AdminStatusText } from "@/components/admin/list";
import { Checkbox } from "@/components/ui/checkbox";
import { formatINR } from "@/utils/formatINR";
import { formatOrderNumber, adminOrderHref } from "@/utils/formatOrderNumber";
import { ADMIN_TIME_ZONE } from "@/utils/formatAdminDateTime";

export const RETURN_STATUS_LABELS = {
  requested: "Pending",
  approved: "Approved",
  picked_up: "Picked up",
  received: "Received",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Same tone vocabulary the fulfillment badges use, so returns read as one family. */
export const RETURN_STATUS_TONES = {
  requested: "review",
  approved: "info",
  picked_up: "info",
  received: "success",
  rejected: "neutral",
  cancelled: "neutral",
};

export function returnStatusDisplay(row) {
  const status = String(row?.status || "requested").toLowerCase();
  return {
    label: RETURN_STATUS_LABELS[status] || status,
    tone: RETURN_STATUS_TONES[status] || "neutral",
  };
}

/** Rows that need nothing from the admin sit back visually. */
export function isMutedReturnRow(row) {
  return ["received", "rejected", "cancelled"].includes(
    String(row?.status || "").toLowerCase()
  );
}

function shortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: ADMIN_TIME_ZONE,
  });
}

function meta({ widthClass, sticky }) {
  return {
    ...(widthClass ? { className: widthClass } : {}),
    ...(sticky ? { sticky } : {}),
  };
}

function selectColumn({ widthClass = "w-10", size = 40, sticky } = {}) {
  return {
    id: "select",
    size,
    meta: {
      className: widthClass,
      ...(sticky ? { sticky } : {}),
    },
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
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

function numberColumn({ widthClass, size, sticky } = {}) {
  return {
    id: "number",
    size,
    meta: meta({ widthClass, sticky }),
    accessorFn: (row) => row.number || "",
    header: "Return",
    cell: ({ row }) => (
      <span className="block truncate font-mono text-[13px] font-[550] text-foreground">
        {row.original.number}
      </span>
    ),
  };
}

function orderColumn({ widthClass, size } = {}) {
  return {
    id: "order",
    size,
    meta: meta({ widthClass }),
    accessorFn: (row) => row.orderNumber || "",
    header: "Order",
    cell: ({ row }) => {
      const { orderId, orderNumber } = row.original;
      return (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Link
            href={adminOrderHref({ _id: orderId, orderNumber })}
            className="block truncate text-[13px] text-[#005bd3] hover:underline"
          >
            {formatOrderNumber({ orderNumber }) || orderNumber || "—"}
          </Link>
        </div>
      );
    },
  };
}

function customerColumn({ widthClass, size } = {}) {
  return {
    id: "customer",
    size,
    meta: meta({ widthClass }),
    accessorFn: (row) => row.customerName || "",
    header: "Customer",
    cell: ({ row }) => (
      <span className="block truncate text-[13px] text-foreground">
        {row.original.customerName || "—"}
      </span>
    ),
  };
}

function itemsColumn({ widthClass, size } = {}) {
  return {
    id: "items",
    size,
    meta: meta({ widthClass }),
    accessorFn: (row) => row.itemCount || 0,
    header: "Items",
    cell: ({ row }) => {
      const items = row.original.items || [];
      const first = items[0];
      const extra = items.length - 1;
      return (
        <span className="block truncate text-[13px] text-muted-foreground">
          {first ? `${first.quantity} × ${first.productName}` : "—"}
          {extra > 0 ? ` +${extra}` : ""}
        </span>
      );
    },
  };
}

function reasonColumn({ widthClass, size } = {}) {
  return {
    id: "reason",
    size,
    meta: meta({ widthClass }),
    accessorFn: (row) => row.reason || "",
    header: "Reason",
    cell: ({ row }) => (
      <span className="block truncate text-[13px] text-muted-foreground">
        {row.original.reason || "—"}
      </span>
    ),
  };
}

function refundColumn({ widthClass, size } = {}) {
  return {
    id: "refund",
    size,
    meta: meta({ widthClass }),
    accessorFn: (row) => Number(row.refundAmount || 0),
    header: "Refund due",
    cell: ({ row }) => (
      <span className="block truncate text-[13px] tabular-nums text-foreground">
        {formatINR(row.original.refundAmount || 0)}
      </span>
    ),
  };
}

function statusColumn({ widthClass, size } = {}) {
  return {
    id: "status",
    size,
    meta: meta({ widthClass }),
    accessorFn: (row) => row.status || "",
    header: "Status",
    cell: ({ row }) => {
      const display = returnStatusDisplay(row.original);
      return (
        <AdminStatusText tone={display.tone} dot solid>
          {display.label}
        </AdminStatusText>
      );
    },
  };
}

function pickupColumn({ widthClass, size } = {}) {
  return {
    id: "pickup",
    size,
    meta: meta({ widthClass }),
    accessorFn: (row) => row.awb || "",
    header: "Pickup",
    cell: ({ row }) => {
      const { awb, pickupServiceable } = row.original;
      if (awb) {
        return (
          <span className="block truncate font-mono text-[13px] text-foreground">{awb}</span>
        );
      }
      if (pickupServiceable === false) {
        return (
          <AdminStatusText tone="warning">Collect manually</AdminStatusText>
        );
      }
      return <span className="text-[13px] text-muted-foreground">—</span>;
    },
  };
}

function requestedColumn({ widthClass, size } = {}) {
  return {
    id: "requested",
    size,
    meta: meta({ widthClass }),
    accessorFn: (row) => row.requestedAt || row.createdAt || "",
    header: "Requested",
    cell: ({ row }) => (
      <span className="block truncate text-[13px] text-muted-foreground">
        {shortDate(row.original.requestedAt || row.original.createdAt)}
      </span>
    ),
  };
}

export function createReturnColumns() {
  const stickyLead = { sticky: "left" };
  return [
    selectColumn({ widthClass: "w-10", size: 40, ...stickyLead }),
    numberColumn({ widthClass: "w-[150px]", size: 150, ...stickyLead }),
    orderColumn({ widthClass: "w-[112px]", size: 112 }),
    customerColumn({ widthClass: "w-[150px]", size: 150 }),
    itemsColumn({ widthClass: "w-[190px]", size: 190 }),
    reasonColumn({ widthClass: "w-[150px]", size: 150 }),
    refundColumn({ widthClass: "w-[110px]", size: 110 }),
    statusColumn({ widthClass: "w-[120px]", size: 120 }),
    pickupColumn({ widthClass: "w-[140px]", size: 140 }),
    requestedColumn({ widthClass: "w-[110px]", size: 110 }),
  ];
}
