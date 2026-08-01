"use client";

import { ChevronDown } from "lucide-react";
import SafeImage from "@/components/SafeImage";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function normalizeItems(order) {
  if (Array.isArray(order?.orderItems) && order.orderItems.length) {
    return order.orderItems.map((it) => ({
      name: it.name || "Product",
      image: it.image || "/placeholder.png",
      qty: Number(it.qty ?? it.quantity ?? 1),
      color: it.color || "",
      size: it.size || "",
    }));
  }
  return (order?.items || []).map((it) => {
    const product = typeof it.productId === "object" && it.productId ? it.productId : {};
    const image =
      product?.thumbnails?.[0] ||
      product?.variants?.[0]?.images?.[0] ||
      it.image ||
      "/placeholder.png";
    return {
      name: product.productName || product.name || it.name || "Product",
      image,
      qty: Number(it.quantity ?? it.qty ?? 1),
      color: it.color || "",
      size: it.size || "",
    };
  });
}

function variantLabel(item) {
  const size = (item.size || "").trim();
  return size || "Default";
}

export default function OrderItemsCell({ order, muted = false }) {
  const items = normalizeItems(order);
  const count =
    items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0) || items.length;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/30",
          muted
            ? "font-normal text-muted-foreground"
            : "font-medium text-foreground"
        )}
      >
        <span>
          {count} {count === 1 ? "item" : "items"}
        </span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-[280px] gap-0 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        {items.length === 0 ? (
          <p className="px-2 py-3 text-[13px] text-muted-foreground">No items</p>
        ) : (
          <div className="max-h-[220px] space-y-1 overflow-y-auto">
            {items.map((item, idx) => (
              <div
                key={`${item.name}-${idx}`}
                className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-muted"
              >
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                  <SafeImage src={item.image} alt="" fill className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] font-normal text-foreground">
                    {item.name}
                  </p>
                  <p className="mt-0.5 text-[12px] font-normal text-muted-foreground">
                    {variantLabel(item)}
                    {item.qty > 1 ? ` · Qty ${item.qty}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
