"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { AdminStatusText } from "@/components/admin/list";
import OrderItemsCell from "@/components/admin/list/OrderItemsCell";
import { formatOrderNumber } from "@/utils/formatOrderNumber";
import { formatINR } from "@/utils/formatINR";
import { formatAdminDateTime } from "@/utils/formatAdminDateTime";
import { displayCustomerName } from "@/utils/displayCustomerName";

const STATUS_LABELS = {
  // Order status — package / fulfillment wording
  "order placed": "Unfulfilled",
  shipped: "Packed",
  "out for delivery": "Out for delivery",
  delivered: "Delivered",
  "return requested": "Return requested",
  returned: "Returned",
  cancelled: "Cancelled",
  // Shipping status (Shipment pages)
  "Awaiting Shipment": "Awaiting",
  "Ready To Ship": "Ready to ship",
  "In Transit": "In transit",
  "Out for Delivery": "Out for delivery",
  Delivered: "Delivered",
  Cancelled: "Cancelled",
  Returned: "Returned",
  "Shipping Sync Failed": "Failed",
  "Payment Pending": "Payment pending",
};

/**
 * Single source for list + detail fulfillment badge.
 * No AWB ⇒ Unfulfilled (stale "Awaiting Shipment" from import is ignored).
 * With AWB ⇒ DTDC shippingStatus label; honor isDelivered / order status when ship field is empty.
 */
export function resolveFulfillmentDisplay(order) {
  const awb = String(order?.awbCode || order?.awb || "").trim();
  const ship = String(order?.shippingStatus || "").trim();
  const shipKey = ship.toLowerCase();
  const orderStatus = String(order?.status || "").trim().toLowerCase();
  const delivered =
    Boolean(order?.isDelivered) ||
    orderStatus === "delivered" ||
    shipKey === "delivered" ||
    shipKey.includes("delivered");

  if (orderStatus === "cancelled" || shipKey === "cancelled") {
    return {
      key: "Cancelled",
      label: "Cancelled",
      tone: "danger",
    };
  }

  if (delivered) {
    return {
      key: "Delivered",
      label: "Delivered",
      tone: "success",
    };
  }

  if (!awb) {
    if (shipKey === "payment pending") {
      return {
        key: "Payment Pending",
        label: "Payment pending",
        tone: "warning",
      };
    }
    return {
      key: "Unfulfilled",
      label: "Unfulfilled",
      tone: "caution",
    };
  }

  const label = STATUS_LABELS[ship] || ship || "Awaiting";
  return {
    key: ship || "Awaiting Shipment",
    label,
    tone: shippingTone(ship || "Awaiting Shipment"),
  };
}

export function orderHasAwb(order) {
  return Boolean(String(order?.awbCode || order?.awb || "").trim());
}

/** Same gate as the order page: book DTDC (Mark as fulfilled) only when still Unfulfilled. */
export function canFulfillOrder(order) {
  return resolveFulfillmentDisplay(order).key === "Unfulfilled" && !orderHasAwb(order);
}

/** Invoice and shipping label print after a consignment exists. */
export function canPrintOrderInvoice(order) {
  return orderHasAwb(order);
}

export function canPrintOrderLabel(order) {
  return orderHasAwb(order);
}

/** Fulfillment / shipping status → pill tone (pastel palette). */
function shippingTone(status) {
  const s = String(status || "").trim().toLowerCase();

  if (!s || s === "—" || s === "-" || s === "unfulfilled") return "caution";

  if (s === "delivered" || s.includes("delivered")) return "success";

  if (
    s === "cancelled" ||
    s.includes("cancel") ||
    s.includes("fail") ||
    s === "returned"
  ) {
    return "danger";
  }

  if (s === "in transit" || s === "shipped" || s.includes("transit")) {
    return "warning";
  }

  if (s === "out for delivery" || s.includes("out for delivery")) {
    return "info";
  }

  if (
    s === "ready to ship" ||
    s === "awaiting shipment" ||
    s.includes("awaiting") ||
    s.includes("ready")
  ) {
    return "neutral";
  }

  if (
    s === "payment pending" ||
    s === "order placed" ||
    s === "return requested" ||
    s.includes("pending") ||
    s.includes("return")
  ) {
    return "warning";
  }

  return "neutral";
}

/** After Unfulfilled/Awaiting/Ready, row is deprioritized (grey text). */
export function isMutedFulfillmentRow(order) {
  if (!order || typeof order !== "object") {
    const s = String(order || "").trim().toLowerCase();
    if (!s || s === "—" || s === "unfulfilled") return false;
    if (s.includes("awaiting") || s.includes("ready")) return false;
    return true;
  }
  const key = resolveFulfillmentDisplay(order).key.toLowerCase();
  if (key === "unfulfilled" || key === "payment pending") return false;
  if (key.includes("awaiting") || key.includes("ready")) return false;
  return true;
}

function attributionTag(order) {
  const touch = order?.attribution?.lastTouch || order?.attribution?.firstTouch || {};
  return channelDisplayName(touch.source);
}

function channelDisplayName(source) {
  const raw = String(source || "").trim();
  const s = raw.toLowerCase();
  if (!s || ["direct", "(direct)", "none", "n/a", "(none)"].includes(s)) return "Direct";
  if (s === "ig" || s.includes("instagram")) return "Instagram";
  if (s === "fb" || s === "meta" || s.includes("facebook") || s.includes("fbclid")) {
    return "Facebook";
  }
  if (s.includes("whatsapp") || s === "wa") return "WhatsApp";
  if (s.includes("youtube") || s === "yt") return "YouTube";
  if (s.includes("google") || s === "gclid") return "Google";
  if (s.includes("tiktok")) return "TikTok";
  if (s.includes("pinterest")) return "Pinterest";
  if (s.includes("linkedin")) return "LinkedIn";
  if (s === "x" || s.includes("twitter")) return "X";
  return raw.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function paymentLabel(status) {
  const s = String(status || "pending").toLowerCase();
  if (s === "paid") return "Paid";
  if (s === "refunded") return "Refunded";
  if (s === "partially_refunded") return "Partial refund";
  return status || "Pending";
}

function paymentTone(status) {
  const s = String(status || "pending").toLowerCase();
  if (s === "paid") return "success";
  if (s === "refunded" || s === "partially_refunded") return "review";
  if (s === "failed" || s === "cancelled") return "danger";
  return "warning";
}

function customerName(order) {
  return displayCustomerName(order, "");
}

function formatOrderDate(order) {
  return formatAdminDateTime(order.createdAt);
}

function orderCellMeta(order) {
  const muted = isMutedFulfillmentRow(order);
  return {
    muted,
    ink: muted ? "text-muted-foreground" : "text-foreground",
    wt: muted ? "font-normal" : "font-[500]",
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

function orderNumberColumn({ widthClass, size, sticky } = {}) {
  return {
    id: "order",
    size,
    meta: {
      ...(widthClass ? { className: widthClass } : {}),
      ...(sticky ? { sticky } : {}),
    },
    accessorFn: (row) => formatOrderNumber(row) || row._id,
    header: "Order",
    cell: ({ row }) => {
      const order = row.original;
      const { ink, wt } = orderCellMeta(order);
      return (
        <span className={`block truncate text-[13px] ${wt} ${ink}`}>
          {formatOrderNumber(order)}
        </span>
      );
    },
  };
}

function dateColumn({ widthClass, size, sticky } = {}) {
  return {
    id: "date",
    size,
    meta: {
      ...(widthClass ? { className: widthClass } : {}),
      ...(sticky ? { sticky } : {}),
    },
    accessorFn: (row) => row.createdAt || "",
    header: "Date",
    cell: ({ row }) => {
      const order = row.original;
      const { wt } = orderCellMeta(order);
      return (
        <span className={`block truncate text-[13px] ${wt} whitespace-nowrap text-muted-foreground`}>
          {formatOrderDate(order)}
        </span>
      );
    },
  };
}

function customerColumn({ widthClass, size, sticky } = {}) {
  return {
    id: "customer",
    size,
    meta: {
      ...(widthClass ? { className: widthClass } : {}),
      ...(sticky ? { sticky } : {}),
    },
    accessorFn: (row) => customerName(row),
    header: "Customer",
    cell: ({ row }) => {
      const order = row.original;
      const { ink, wt } = orderCellMeta(order);
      return (
        <span className={`block truncate text-[13px] ${wt} ${ink}`}>
          {customerName(order)}
        </span>
      );
    },
  };
}

function orderLocation(order) {
  const ship = order?.shippingAddress || {};
  const parts = [ship.city, ship.state]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

function locationColumn({ widthClass, size } = {}) {
  return {
    id: "location",
    size,
    meta: widthClass ? { className: widthClass } : undefined,
    accessorFn: (row) => orderLocation(row),
    header: "Location",
    cell: ({ row }) => {
      const order = row.original;
      const { ink, wt } = orderCellMeta(order);
      return (
        <span className={`block truncate text-[13px] ${wt} ${ink}`}>
          {orderLocation(order)}
        </span>
      );
    },
  };
}

function totalColumn({ widthClass = "w-[100px]", size = 100 } = {}) {
  return {
    id: "total",
    size,
    meta: { className: widthClass },
    accessorFn: (row) => Number(row.finalPrice ?? row.total ?? 0),
    header: "Total",
    cell: ({ row }) => {
      const order = row.original;
      const { ink, wt } = orderCellMeta(order);
      return (
        <span className={`text-[13px] tabular-nums ${wt} ${ink}`}>
          {formatINR(order.finalPrice ?? order.total ?? 0)}
        </span>
      );
    },
  };
}

function dtdcEstColumn({ widthClass, size } = {}) {
  return {
    id: "dtdcEst",
    size,
    meta: widthClass ? { className: widthClass } : undefined,
    accessorFn: (row) => {
      if (row.dtdcEstCost != null && row.dtdcEstCost !== "") {
        return Number(row.dtdcEstCost);
      }
      return estimateDtdcSurfaceCost(row).amount ?? -1;
    },
    header: "EST Cost",
    cell: ({ row }) => {
      const order = row.original;
      const { ink, wt } = orderCellMeta(order);
      const amount =
        order.dtdcEstCost != null && order.dtdcEstCost !== ""
          ? Number(order.dtdcEstCost)
          : estimateDtdcSurfaceCost(order).amount;
      return (
        <span className={`block truncate text-[13px] tabular-nums ${wt} ${ink}`}>
          {amount == null || Number.isNaN(amount) ? "" : formatINR(amount)}
        </span>
      );
    },
  };
}

function paymentColumn({ widthClass = "w-[124px]", size = 124 } = {}) {
  return {
    id: "payment",
    size,
    meta: { className: widthClass },
    accessorFn: (row) =>
      row.paymentStatus || row.transactionDetails?.paymentStatus || "pending",
    header: "Payment",
    cell: ({ row }) => {
      const order = row.original;
      const payStatus =
        order.paymentStatus || order.transactionDetails?.paymentStatus || "pending";
      return (
        <AdminStatusText tone={paymentTone(payStatus)} dot>
          {paymentLabel(payStatus)}
        </AdminStatusText>
      );
    },
  };
}

function fulfillmentColumn({ widthClass = "w-[148px]", size = 148 } = {}) {
  return {
    id: "fulfillment",
    size,
    meta: { className: widthClass },
    accessorFn: (row) => resolveFulfillmentDisplay(row).key,
    header: "Fulfilment",
    cell: ({ row }) => {
      const display = resolveFulfillmentDisplay(row.original);
      return (
        <AdminStatusText tone={display.tone} dot solid>
          {display.label}
        </AdminStatusText>
      );
    },
  };
}

function itemsColumn({ widthClass = "w-[88px]", size = 88 } = {}) {
  return {
    id: "items",
    size,
    meta: { className: widthClass },
    accessorFn: (row) => (row.items || row.orderItems || []).length,
    header: "Items",
    cell: ({ row }) => {
      const order = row.original;
      const muted = isMutedFulfillmentRow(order);
      return (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <OrderItemsCell order={order} muted={muted} />
        </div>
      );
    },
  };
}

function tagColumn({ widthClass = "w-[120px]", size = 120 } = {}) {
  return {
    id: "tag",
    size,
    meta: { className: widthClass },
    accessorFn: (row) => attributionTag(row),
    header: "Tag",
    cell: ({ row }) => {
      const tag = attributionTag(row.original);
      return (
        <span className="inline-flex h-6 max-w-full items-center truncate rounded-[0.5rem] bg-black/[0.06] px-2 text-[0.75rem] font-[550] leading-4 text-[#616161]">
          {tag}
        </span>
      );
    },
  };
}

function awbColumn({ widthClass, size } = {}) {
  return {
    id: "awb",
    size,
    meta: widthClass ? { className: widthClass } : undefined,
    accessorFn: (row) => row.awbCode || row.awb || "",
    header: "AWB / Ref",
    cell: ({ row }) => {
      const order = row.original;
      const { ink, wt } = orderCellMeta(order);
      const awb = order.awbCode || order.awb || "";
      return <span className={`block truncate text-[13px] ${wt} ${ink}`}>{awb}</span>;
    },
  };
}

function courierColumn({ widthClass, size } = {}) {
  return {
    id: "courier",
    size,
    meta: widthClass ? { className: widthClass } : undefined,
    accessorFn: (row) => row.courierName || row.courier || "DTDC",
    header: "Courier",
    cell: ({ row }) => {
      const order = row.original;
      const { wt } = orderCellMeta(order);
      return (
        <span className={`block truncate text-[13px] ${wt} text-muted-foreground`}>
          {order.courierName || order.courier || "DTDC"}
        </span>
      );
    },
  };
}

function shipStatusColumn({ widthClass, size } = {}) {
  return {
    id: "shipStatus",
    size,
    meta: widthClass ? { className: widthClass } : undefined,
    accessorFn: (row) => row.shippingStatus || resolveFulfillmentDisplay(row).label,
    header: "Ship status",
    cell: ({ row }) => {
      const display = resolveFulfillmentDisplay(row.original);
      return (
        <AdminStatusText tone={display.tone} dot solid>
          {display.label}
        </AdminStatusText>
      );
    },
  };
}

export function createOrderColumns({ isShipmentScope = false } = {}) {
  const stickyLead = { sticky: "left" };

  if (isShipmentScope) {
    return [
      selectColumn({ widthClass: "w-10", size: 40, ...stickyLead }),
      orderNumberColumn({ widthClass: "w-[120px]", size: 120, ...stickyLead }),
      dateColumn({ widthClass: "w-[120px]", size: 120 }),
      customerColumn({ widthClass: "w-[140px]", size: 140 }),
      locationColumn({ widthClass: "w-[160px]", size: 160 }),
      shipStatusColumn({ widthClass: "w-[130px]", size: 130 }),
      dtdcEstColumn({ widthClass: "w-[100px]", size: 100 }),
      awbColumn({ widthClass: "w-[140px]", size: 140 }),
      courierColumn({ widthClass: "w-[100px]", size: 100 }),
    ];
  }

  return [
    selectColumn({ widthClass: "w-10", size: 40, ...stickyLead }),
    orderNumberColumn({ widthClass: "w-[112px]", size: 112, ...stickyLead }),
    dateColumn({ widthClass: "w-[148px]", size: 148 }),
    customerColumn({ widthClass: "w-[168px]", size: 168 }),
    locationColumn({ widthClass: "w-[168px]", size: 168 }),
    totalColumn({ widthClass: "w-[100px]", size: 100 }),
    paymentColumn({ widthClass: "w-[124px]", size: 124 }),
    fulfillmentColumn({ widthClass: "w-[148px]", size: 148 }),
    itemsColumn({ widthClass: "w-[88px]", size: 88 }),
    tagColumn({ widthClass: "w-[120px]", size: 120 }),
  ];
}

export {
  shippingTone,
  paymentTone,
  paymentLabel,
  attributionTag,
  channelDisplayName,
  STATUS_LABELS,
};
