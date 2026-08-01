"use client";

import { Image as ImageIcon } from "lucide-react";
import SafeImage from "@/components/SafeImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ProductViewModal({ isOpen, onClose, product }) {
  if (!product) return null;

  const mainThumb = product.thumbnails?.[0] || product.variants?.[0]?.images?.[0] || product.images?.[0] || null;
  const variants = Array.isArray(product.variants) ? product.variants : [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="border-b border-border bg-muted/30 px-5 py-4">
          <DialogTitle>Product details</DialogTitle>
          <DialogDescription>{product.productId || "No product ID"}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-6 overflow-y-auto p-5">
          <div className="grid gap-6 md:grid-cols-3">
            <section className="space-y-2 md:col-span-2">
              <h3 className="text-xs font-medium text-muted-foreground">General</h3>
              <p className="text-sm font-medium text-foreground">{product.productName || product.name}</p>
              {product.product && <p className="text-xs text-muted-foreground">{product.product}</p>}
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">Category: {typeof product.category === "object" ? product.category?.name : product.category}</Badge>
                {product.type && <Badge variant="secondary">Type: {typeof product.type === "object" ? product.type?.name : product.type}</Badge>}
                {product.brand && <Badge variant="outline">Brand: {product.brand}</Badge>}
              </div>
              {product.description && <p className="pt-1 text-xs leading-relaxed text-muted-foreground">{product.description}</p>}
            </section>
            <section className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">Pricing</h3>
              <p className="text-sm font-medium text-foreground">₹{Number(product.pricing?.sellingPrice ?? 0).toFixed(2)}</p>
              {product.pricing?.mrp != null && Number(product.pricing.mrp) > 0 && (
                <p className="text-xs text-muted-foreground">MRP: ₹{Number(product.pricing.mrp).toFixed(2)}</p>
              )}
              <p className="text-xs text-muted-foreground">Cost: ₹{Number(product.pricing?.buyingPrice ?? 0).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Total stock: {product.totalStock ?? 0}</p>
              <Badge variant="secondary">{product.status}</Badge>
            </section>
          </div>
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">Preview</h3>
            <div className="flex items-start gap-3">
              <ImageFrame src={mainThumb} alt="Main thumbnail" className="h-36 w-28" />
              {product.thumbnails?.slice(1).map((thumbnail, index) => <ImageFrame key={thumbnail || index} src={thumbnail} alt="Thumbnail" className="h-20 w-16" />)}
            </div>
          </section>
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">Variants</h3>
            {variants.length === 0 ? <p className="text-xs text-muted-foreground">No variants configured.</p> : variants.map((variant) => (
              <div key={variant._id || variant.color} className="flex flex-col justify-between gap-3 rounded-md border border-border bg-muted/30 p-3 md:flex-row md:items-center">
                <div className="text-xs"><p className="font-medium text-foreground">Color: {variant.color}</p><p className="text-muted-foreground">Qty: {variant.quantity}{variant.sku && ` · SKU: ${variant.sku}`}</p></div>
                <div className="flex gap-2 overflow-x-auto">{(variant.images || []).map((image, index) => <ImageFrame key={image || index} src={image} alt="Variant" className="h-16 w-14 shrink-0" />)}</div>
              </div>
            ))}
          </section>
        </div>
        <div className="flex justify-end border-t border-border bg-muted/30 px-5 py-3">
          <Button type="button" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImageFrame({ src, alt, className }) {
  return <div className={`relative flex items-center justify-center overflow-hidden rounded-md border border-border bg-muted ${className}`}>{src ? <SafeImage src={src} alt={alt} fill className="object-cover" /> : <ImageIcon className="size-5 text-muted-foreground" />}</div>;
}

