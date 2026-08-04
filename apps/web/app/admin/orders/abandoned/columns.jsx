"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { abandonedCheckoutService } from "@/api";
import { Checkbox } from "@/components/ui/checkbox";
import { AdminStatusText } from "@/components/admin/list";
import OrderItemsCell from "@/components/admin/list/OrderItemsCell";
import { formatINR } from "@/utils/formatINR";
import { formatAdminDateTime } from "@/utils/formatAdminDateTime";

export function channelFromResult(result) {
  if (!result || typeof result !== "object") return null;
  if (result.ok) return "Sent";
  if (result.skipped) return "Skipped";
  if (result.error) return "Failed";
  return null;
}

export function recoveryStatus(row) {
  if (String(row?.status || "").toLowerCase() === "converted") return "Recovered";
  return "Not Recovered";
}

export function recoveryTone(status) {
  return status === "Recovered" ? "success" : "warning";
}

export function channelTone(status) {
  const s = String(status || "").toLowerCase();
  if (s === "sent") return "success";
  if (s === "failed") return "danger";
  return "neutral";
}

export function whatsappStatus(row) {
  const fromResult = channelFromResult(row?.recoveryLastResult);
  if (fromResult) return fromResult;
  if (row?.recoverySentAt) return "Sent";
  return "Not sent";
}

export function emailStatus(row) {
  const stored = row?.emailStatus || row?.recoveryLastResult?.emailStatus;
  if (stored) {
    const s = String(stored).toLowerCase();
    if (s === "sent" || s === "ok") return "Sent";
    if (s === "failed") return "Failed";
    if (s === "skipped") return "Skipped";
  }
  if (row?.emailSentAt) return "Sent";
  return "Not sent";
}

function CheckoutCopyCell({ label, recoveryUrl, checkoutId }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = String(label || "").trim();
  const canFetch = Boolean(checkoutId);

  if (!shown) {
    return null;
  }

  if (!String(recoveryUrl || "").trim() && !canFetch) {
    return (
      <span className="block truncate text-[13px] font-medium text-foreground">
        {shown}
      </span>
    );
  }

  const copy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    try {
      setBusy(true);
      let link = String(recoveryUrl || "").trim();
      if (!link && checkoutId) {
        const res = await abandonedCheckoutService.getRecoveryLink(checkoutId);
        link = String(res?.recoveryUrl || "").trim();
      }
      if (!link) {
        toast.error("Recovery link unavailable");
        return;
      }
      const absolute =
        link.startsWith("http://") || link.startsWith("https://")
          ? link
          : `${typeof window !== "undefined" ? window.location.origin : ""}${link}`;
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      toast.success("Checkout link copied");
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Could not copy");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      disabled={busy}
      title="Copy checkout link"
      className="group flex max-w-full items-center gap-1.5 text-left outline-none disabled:opacity-60"
    >
      <span className="block min-w-0 truncate text-[13px] font-medium text-foreground group-hover:underline">
        {shown}
      </span>
      <span className="inline-flex size-4 shrink-0 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {copied ? (
          <Check className="size-3 text-[#047b5d]" aria-hidden />
        ) : (
          <Copy className="size-3 text-[#8a8a8a]" aria-hidden />
        )}
      </span>
    </button>
  );
}

function selectColumn() {
  return {
    id: "select",
    size: 40,
    minSize: 40,
    maxSize: 40,
    meta: { className: "w-10 px-2" },
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

function customerLabel(details) {
  const d = details || {};
  const name = String(d.name || "").trim();
  if (name) return name;
  const email = String(d.email || "").trim();
  if (email) return email;
  const phone = String(d.phone || "").trim();
  if (phone) return phone;
  return "Guest";
}

export function createAbandonedColumns() {
  return [
    selectColumn(),
    {
      id: "checkout",
      accessorFn: (row) => row.checkoutLabel,
      header: "Checkout",
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <CheckoutCopyCell
            label={row.original.checkoutLabel}
            recoveryUrl={row.original.recoveryUrl}
            checkoutId={
              row.original.kind === "checkout"
                ? row.original.checkoutId || row.original._id
                : null
            }
          />
        </div>
      ),
    },
    {
      id: "date",
      accessorFn: (row) => row.lastActivityAt,
      header: "Date",
      cell: ({ row }) => {
        const dateLabel = formatAdminDateTime(row.original.lastActivityAt);
        return (
          <span className="whitespace-nowrap text-[13px] font-medium text-muted-foreground">
            {dateLabel}
          </span>
        );
      },
    },
    {
      id: "customer",
      accessorFn: (row) => customerLabel(row.customerDetails),
      header: "Customer",
      cell: ({ row }) => (
        <span className="block truncate text-[13px] font-medium text-foreground">
          {customerLabel(row.original.customerDetails)}
        </span>
      ),
    },
    {
      id: "recovery",
      accessorFn: (row) => recoveryStatus(row),
      header: "Recovery",
      cell: ({ row }) => {
        const status = recoveryStatus(row.original);
        return (
          <AdminStatusText tone={recoveryTone(status)} dot solid>
            {status}
          </AdminStatusText>
        );
      },
    },
    {
      id: "email",
      accessorFn: (row) => emailStatus(row),
      header: "Email",
      cell: ({ row }) => {
        const status = emailStatus(row.original);
        return (
          <AdminStatusText tone={channelTone(status)} dot>
            {status}
          </AdminStatusText>
        );
      },
    },
    {
      id: "whatsapp",
      accessorFn: (row) => whatsappStatus(row),
      header: "WhatsApp",
      cell: ({ row }) => {
        const status = whatsappStatus(row.original);
        return (
          <AdminStatusText tone={channelTone(status)} dot>
            {status}
          </AdminStatusText>
        );
      },
    },
    {
      id: "items",
      accessorFn: (row) => (row.items || row.orderItems || []).length,
      header: "Items",
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <OrderItemsCell order={row.original} />
        </div>
      ),
    },
    {
      id: "total",
      accessorFn: (row) => Number(row.totalAmount || 0),
      header: "Total",
      cell: ({ row }) => (
        <span className="text-[13px] font-medium tabular-nums text-foreground">
          {formatINR(row.original.totalAmount || 0)}
        </span>
      ),
    },
  ];
}
