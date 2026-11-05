"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function ProductInventoryCard({ form, setForm }) {
  const variants = useMemo(() => form?.variants || [], [form?.variants]);
  const primaryIndex = 0;
  const primary = variants[primaryIndex] || {};

  const available = useMemo(
    () => variants.reduce((sum, v) => sum + (Number(v.quantity) || 0), 0),
    [variants]
  );

  const multiVariant = variants.length > 1;

  const setAvailable = (raw) => {
    if (multiVariant) return;
    const quantity = raw === "" ? "" : Math.max(0, Number(raw) || 0);
    setForm((prev) => {
      const list = Array.isArray(prev.variants) ? [...prev.variants] : [];
      if (!list.length) {
        list.push({ quantity: 0, sku: "", barcode: "" });
      }
      list[primaryIndex] = { ...list[primaryIndex], quantity };
      return { ...prev, variants: list };
    });
  };

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Inventory</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">

        <div className="overflow-hidden rounded-xl border border-(--p-color-border)">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-(--p-color-border-secondary) bg-(--p-color-bg-surface-secondary) text-[12px] font-medium text-(--p-color-text-secondary)">
                <th className="px-3 py-2 font-medium">Locations</th>
                <th className="w-28 px-3 py-2 text-right font-medium">
                  Available
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-2.5 text-[13px] text-(--p-color-text)">
                  Main Warehouse
                </td>
                <td className="px-3 py-2.5 text-right">
                  {multiVariant ? (
                    <span className="text-[13px] text-(--p-color-text)">
                      {available}
                    </span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      value={
                        primary.quantity === "" || primary.quantity == null
                          ? ""
                          : primary.quantity
                      }
                      onChange={(e) => setAvailable(e.target.value)}
                      className="ml-auto h-8 w-[4.5rem] border-(--p-color-border) bg-white text-right"
                    />
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
