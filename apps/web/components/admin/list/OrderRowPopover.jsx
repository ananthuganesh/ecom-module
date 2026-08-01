"use client";

import Link from "next/link";
import { ExternalLink, X, Download, Copy, Printer } from "lucide-react";
import SafeImage from "@/components/SafeImage";
import { formatOrderNumber, adminOrderHref } from "@/utils/formatOrderNumber";
import { formatINR } from "@/utils/formatINR";

export default function OrderRowPopover({ order, onClose, anchorRect }) {
  if (!order) return null;

  const customer = order.customerId || {};
  const name = customer.name || customer.email || "Customer";
  const email = customer.email || "—";
  const phone = customer.phone || order.shippingAddress?.phone || "—";
  const items = order.items || [];
  const total = Number(order.finalPrice ?? order.total ?? 0);
  const orderLabel = formatOrderNumber(order) || "—";

  return (
    <div
      className="fixed z-[80] w-[320px] bg-card border border-border rounded-xl overflow-hidden"
      style={{
        top: Math.min((anchorRect?.top || 120) + 8, window.innerHeight - 420),
        left: Math.min((anchorRect?.left || 240), window.innerWidth - 340),
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium">Order {orderLabel}</span>
          <Link
            href={adminOrderHref(order)}
            className="text-muted-foreground hover:text-primary-foreground"
            title="Open order"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-primary-foreground cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-border">
        <p className="text-[13px] font-medium text-foreground">{name}</p>
        <p className="text-[13px] text-muted-foreground mt-0.5">{email}</p>
        <p className="text-[13px] text-muted-foreground mt-0.5">{phone}</p>
      </div>

      <div className="px-4 pt-3">
        <p className="text-[13px] font-medium text-foreground mb-2">Order items</p>
        <div className="space-y-3 max-h-48 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No items</p>
          ) : (
            items.map((item, idx) => {
              const product = item.productId || {};
              const thumb =
                product?.thumbnails?.[0] ||
                product?.variants?.[0]?.images?.[0] ||
                "/placeholder.png";
              const title = product.productName || product.name || item.name || "Item";
              const price = Number(item.price ?? product.sellingPrice ?? 0);
              return (
                <div key={idx} className="flex gap-2.5">
                  <div className="relative w-9 h-9 rounded bg-muted overflow-hidden shrink-0">
                    <SafeImage src={thumb} alt="" fill className="object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground line-clamp-2">{title}</p>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                      {item.quantity || 1} × {formatINR(price)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="px-4 py-3 flex items-center justify-between border-t border-border mt-3">
        <span className="text-[13px] font-medium text-muted-foreground">Total:</span>
        <span className="text-[13px] font-medium text-foreground">{formatINR(total)}</span>
      </div>

      <div className="px-2 pb-2 flex items-center gap-1 border-t border-border pt-2">
        <button type="button" className="flex-1 h-8 inline-flex items-center justify-center gap-1 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-lg cursor-pointer">
          <Download className="w-3.5 h-3.5" /> Export
        </button>
        <button type="button" className="flex-1 h-8 inline-flex items-center justify-center gap-1 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-lg cursor-pointer">
          <Copy className="w-3.5 h-3.5" /> Duplicate
        </button>
        <button type="button" className="flex-1 h-8 inline-flex items-center justify-center gap-1 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-lg cursor-pointer">
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
      </div>
    </div>
  );
}
