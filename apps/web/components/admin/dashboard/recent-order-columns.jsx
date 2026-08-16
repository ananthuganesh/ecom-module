"use client";

import Link from "next/link";
import { formatOrderNumber, adminOrderHref } from "@/utils/formatOrderNumber";
import { Button } from "@/components/ui/button";
import OrderItemsCell from "@/components/admin/list/OrderItemsCell";

function formatINR(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
}

function customerLabel(order) {
  return (
    order.shippingAddress?.name ||
    order.customerId?.name ||
    order.customerId?.email ||
    ""
  );
}

export const recentOrderColumns = [
  {
    id: "order",
    accessorFn: (row) => formatOrderNumber(row) || row._id,
    header: "Order",
    size: 92,
    cell: ({ row }) => {
      const order = row.original;
      return (
        <Button
          variant="link"
          size="sm"
          className="h-8 max-w-full truncate px-0"
          render={<Link href={adminOrderHref(order)} />}
          nativeButton={false}
        >
          {formatOrderNumber(order) || "Order"}
        </Button>
      );
    },
  },
  {
    id: "customer",
    accessorFn: (row) => customerLabel(row),
    header: "Customer",
    cell: ({ row }) => (
      <div className="flex h-8 min-w-0 items-center">
        <span className="truncate">{customerLabel(row.original)}</span>
      </div>
    ),
  },
  {
    id: "items",
    accessorFn: (row) => (row.items || row.orderItems || []).length,
    header: "Items",
    size: 80,
    cell: ({ row }) => (
      <div className="flex h-8 items-center">
        <OrderItemsCell order={row.original} />
      </div>
    ),
  },
  {
    id: "total",
    accessorFn: (row) => Number(row.finalPrice) || 0,
    header: () => <div className="text-right">Total</div>,
    size: 80,
    cell: ({ row }) => (
      <div className="flex h-8 items-center justify-end font-medium tabular-nums">
        ₹{formatINR(row.original.finalPrice)}
      </div>
    ),
  },
];
