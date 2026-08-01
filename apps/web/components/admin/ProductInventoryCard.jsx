"use client";

import { useEffect, useMemo, useState } from "react";
import { adminWarehouseService } from "@/api";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function trim(value) {
  return String(value || "").trim();
}

function warehouseLabel(w) {
  if (!w) return "Store default";
  const name = trim(w.name || w.title);
  const address = trim(
    [w.addressLine1, w.city, w.pincode].filter(Boolean).join(", ")
  );
  if (address) return address;
  return name || "Store default";
}

export default function ProductInventoryCard({ form, setForm }) {
  const [locationLabel, setLocationLabel] = useState("Store default");

  const variants = form?.variants || [];
  const primaryIndex = 0;
  const primary = variants[primaryIndex] || {};

  const available = useMemo(
    () => variants.reduce((sum, v) => sum + (Number(v.quantity) || 0), 0),
    [variants]
  );

  const multiVariant = variants.length > 1;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await adminWarehouseService.getAll();
        const list = Array.isArray(rows) ? rows : rows?.items || [];
        const first = list.find((w) => w?.isDefault) || list[0];
        if (!cancelled) setLocationLabel(warehouseLabel(first));
      } catch {
        if (!cancelled) setLocationLabel("Store default");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    <Card className="admin-surface gap-0 rounded-[0.75rem] border-0 bg-white py-0 shadow-none ring-0">
      <CardContent className="flex flex-col gap-3 p-4">
        <CardTitle className="admin-card-heading m-0">Inventory</CardTitle>

        <div className="overflow-hidden rounded-xl border border-[#e3e3e3]">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#ebebeb] bg-[#fafafa] text-[12px] font-medium text-[#616161]">
                <th className="px-3 py-2 font-medium">Locations</th>
                <th className="w-28 px-3 py-2 text-right font-medium">
                  Available
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-2.5 text-[13px] text-[#303030]">
                  {locationLabel}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {multiVariant ? (
                    <span className="text-[13px] text-[#303030]">
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
                      className="ml-auto h-8 w-[4.5rem] border-[#e3e3e3] bg-white text-right"
                    />
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {multiVariant ? (
          <p className="text-[12px] text-[#8a8a8a]">
            Stock for optioned products is managed per variant below.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
