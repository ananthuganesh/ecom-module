"use client";

import { useEffect, useState } from "react";
import SafeImage from "@/components/SafeImage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STATUSES, sanitizePriceInput } from "@/utils/productForm";

export default function BulkEditProductsModal({ isOpen, onClose, products, onSave }) {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Group rows by product for rowSpan display (Product col = Header 1, Color/SKU = Header 2/2', rest = Header 3)
  const productGroups = (() => {
    const byId = {};
    (rows || []).forEach((row, index) => {
      const key = row.mongoId || row.productId;
      if (!byId[key]) byId[key] = { product: row, variants: [] };
      byId[key].variants.push({ ...row, rowIndex: index });
    });
    return Object.values(byId);
  })();

  useEffect(() => {
    if (!isOpen) return;
    const nextRows = [];
    (products || []).forEach((p) => {
      const productFallbackImage =
        (p.thumbnails && p.thumbnails[0]) ||
        (p.variants && p.variants[0]?.images?.[0]) ||
        (Array.isArray(p.images) && p.images[0]) ||
        null;
      const variants = Array.isArray(p.variants) && p.variants.length > 0 ? p.variants : [{ color: "", quantity: 0, sku: "", images: [] }];
      variants.forEach((v, idx) => {
        const raw = v?.images;
        const variantImages = Array.isArray(raw)
          ? raw.map((u) => (u != null ? String(u).trim() : "")).filter(Boolean)
          : raw != null && raw !== "" ? [String(raw).trim()] : [];
        const mainImage = variantImages[0] || productFallbackImage;
        nextRows.push({
          productId: p.productId,
          mongoId: p._id,
          productName: p.productName || p.name || "",
          mainImage,
          variantImages,
          status: p.status || "draft",
          buyingPrice: Number(p.pricing?.buyingPrice ?? 0),
          sellingPrice: Number(p.pricing?.sellingPrice ?? 0),
          mrp: p.pricing?.mrp != null ? Number(p.pricing.mrp) : "",
          variantIndex: idx,
          color: v.color || "",
          quantity: Number(v.quantity ?? 0),
          sku: v.sku || "",
        });
      });
    });
    setRows(nextRows);
    setError("");
    setSaving(false);
  }, [isOpen, products]);

  const updateRowField = (idx, field, value) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        return { ...row, [field]: value };
      })
    );
  };

  const updateProductField = (productId, field, value) => {
    setRows((prev) =>
      prev.map((row) => (row.productId === productId ? { ...row, [field]: value } : row))
    );
  };

  const handleSave = async () => {
    setError("");
    try {
      const grouped = {};
      for (const row of rows) {
        if (!row.productId) {
          throw new Error("Missing productId in bulk edit data.");
        }
        if (!grouped[row.productId]) {
          grouped[row.productId] = {
            productId: row.productId,
            pricing: {
              buyingPrice: row.buyingPrice,
              sellingPrice: row.sellingPrice,
              mrp: row.mrp === "" ? undefined : row.mrp,
            },
            status: row.status,
            variants: [],
          };
        }
        grouped[row.productId].variants.push({
          color: row.color,
          quantity: row.quantity,
          sku: row.sku,
        });
      }
      const payload = { products: Object.values(grouped) };
      await onSave(payload);
    } catch (err) {
      setError(err.message || "Failed to prepare bulk update.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={!saving}
        className="flex max-h-[calc(100dvh-2rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="border-b border-border bg-muted/50 px-4 py-3">
          <DialogTitle>Bulk Edit Products</DialogTitle>
          <DialogDescription>
            {rows.length} variant{rows.length === 1 ? "" : "s"} selected
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead className="border-r border-border bg-muted">Product</TableHead>
                <TableHead className="border-r border-border bg-muted">Image</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead colSpan={5} className="border-l border-border">
                  Edit (per variant / product)
                </TableHead>
              </TableRow>
              <TableRow>
                <TableHead className="border-r border-border" />
                <TableHead className="border-r border-border" />
                <TableHead />
                <TableHead />
                <TableHead>Quantity</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Selling</TableHead>
                <TableHead>MRP</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productGroups.map((group, gIdx) => {
                const { product, variants } = group;
                const rowSpan = variants.length;
                return variants.map((row, vIdx) => (
                  <TableRow
                    key={`${product.mongoId}-${row.variantIndex}-${gIdx}-${vIdx}`}
                    className={vIdx > 0 ? "bg-muted/40" : ""}
                  >
                    {vIdx === 0 && (
                      <TableCell
                        rowSpan={rowSpan}
                        className="min-w-[120px] border-r border-border align-top font-medium"
                      >
                        <span className="block truncate">{product.productName}</span>
                      </TableCell>
                    )}
                    <TableCell className="border-r border-border align-top">
                      <div className="relative h-12 w-10">
                        <SafeImage
                          src={row.mainImage}
                          alt={row.color ? `Variant ${row.color}` : ""}
                          fill
                          className="rounded border border-border bg-muted object-cover"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.color}</TableCell>
                    <TableCell className="text-muted-foreground">{row.sku || ""}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        className="w-20"
                        value={row.quantity}
                        onChange={(e) =>
                          updateRowField(row.rowIndex, "quantity", Number(e.target.value) || 0)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className="w-24"
                        value={row.buyingPrice}
                        onChange={(e) =>
                          updateProductField(
                            row.productId,
                            "buyingPrice",
                            sanitizePriceInput(e.target.value)
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className="w-24"
                        value={row.sellingPrice}
                        onChange={(e) =>
                          updateProductField(
                            row.productId,
                            "sellingPrice",
                            sanitizePriceInput(e.target.value)
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className="w-24"
                        value={row.mrp}
                        onChange={(e) =>
                          updateProductField(
                            row.productId,
                            "mrp",
                            sanitizePriceInput(e.target.value)
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.status}
                        onValueChange={(value) =>
                          updateProductField(row.productId, "status", value)
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ));
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="border-t border-border bg-muted/50 px-4 py-3 sm:justify-between">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            className="min-w-35"
            onClick={() => {
              setSaving(true);
              handleSave();
            }}
            disabled={saving}
          >
            {saving ? <Spinner /> : null}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

