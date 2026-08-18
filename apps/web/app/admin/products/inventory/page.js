"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminStockService } from "@/api";
import {
  AdminListLayout,
  AdminMetricRow,
  AdminViewMenu,
  AdminHeaderButton,
} from "@/components/admin/list";
import { Package } from "@/components/admin/LocalIcons";
import { DataTable } from "@/components/ui/data-table";
import { createInventoryColumns } from "./columns";

function rowKey(row) {
  return `${row.productId}-${row.warehouseId}-${row.variantSku || ""}`;
}

export default function ProductsInventoryPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusTab, setStatusTab] = useState("all");
  const [rowSelection, setRowSelection] = useState({});
  const [adjustRow, setAdjustRow] = useState(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  const fetchStock = useCallback(async () => {
    try {
      const data = await adminStockService.list();
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      toast.error(
        error.response?.status === 401
          ? "Admin login required"
          : "Failed to load inventory"
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  const metrics = useMemo(() => {
    const totalUnits = rows.reduce(
      (sum, row) => sum + Number(row.quantity || 0),
      0
    );
    const lowStock = rows.filter((row) => {
      const qty = Number(row.quantity || 0);
      const threshold = Number(row.threshold ?? 10);
      return qty > 0 && qty <= threshold;
    }).length;
    const outOfStock = rows.filter(
      (row) => Number(row.quantity || 0) <= 0
    ).length;
    const productIds = new Set(rows.map((row) => row.productId).filter(Boolean));
    return {
      totalUnits,
      lowStock,
      outOfStock,
      products: productIds.size,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const qty = Number(row.quantity || 0);
      const threshold = Number(row.threshold ?? 10);
      if (statusTab === "low" && !(qty > 0 && qty <= threshold)) return false;
      if (statusTab === "out" && qty > 0) return false;
      if (!q) return true;
      const name = String(row.productName || "").toLowerCase();
      const sku = String(row.variantSku || "").toLowerCase();
      return name.includes(q) || sku.includes(q);
    });
  }, [rows, searchTerm, statusTab]);

  useEffect(() => {
    const ids = new Set(filtered.map((row) => rowKey(row)));
    setRowSelection((prev) => {
      let changed = false;
      const next = {};
      for (const [key, value] of Object.entries(prev)) {
        if (value && ids.has(key)) next[key] = true;
        else if (value) changed = true;
      }
      return changed || Object.keys(next).length !== Object.keys(prev).length
        ? next
        : prev;
    });
  }, [filtered]);

  const openAdjust = useCallback((row) => {
    setAdjustRow({ ...row, _key: rowKey(row) });
    setAdjustQty(String(row.quantity ?? 0));
    setAdjustReason("");
  }, []);

  const closeAdjust = () => {
    setAdjustRow(null);
    setAdjustQty("");
    setAdjustReason("");
  };

  const saveAdjust = async () => {
    if (!adjustRow) return;
    const quantity = Number(adjustQty);
    if (
      !Number.isFinite(quantity) ||
      quantity < 0 ||
      !Number.isInteger(quantity)
    ) {
      toast.error("Enter a whole number quantity (0 or more)");
      return;
    }
    setSaving(true);
    try {
      await adminStockService.adjust({
        productId: adjustRow.productId,
        warehouseId: adjustRow.warehouseId,
        variantSku: adjustRow.variantSku || "",
        quantity,
        reason: adjustReason.trim() || "Stock adjustment",
      });
      toast.success("Stock updated");
      closeAdjust();
      setLoading(true);
      await fetchStock();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to adjust stock");
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo(() => createInventoryColumns(), []);

  return (
    <>
      <AdminListLayout
        fill={false}
        title="Inventory"
        icon={Package}
        description="Warehouse stock by SKU at Main Warehouse. Each row is one size. Click a row to adjust on-hand units — this is what orders sell from. Change photos, prices, or size options on the product page."
        metrics={
          <AdminMetricRow
            items={[
              {
                value: metrics.totalUnits.toLocaleString(),
                label: "Total units on hand",
                tone: "blue",
              },
              {
                value: metrics.lowStock.toLocaleString(),
                label: "Low stock rows",
                tone: "amber",
              },
              {
                value: metrics.outOfStock.toLocaleString(),
                label: "Out of stock rows",
                tone: "rose",
              },
              {
                value: metrics.products.toLocaleString(),
                label: "Products tracked",
                tone: "violet",
              },
            ]}
          />
        }
      >
        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          getRowId={(row) => rowKey(row)}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          onRowClick={openAdjust}
          showSelectionCount={false}
          infiniteScroll
          rowHeightClass="h-14"
          emptyTitle="No inventory rows found"
          emptyDescription="Each product SKU gets a row here once it is tracked in the warehouse. Search by product name or SKU."
          pageSize={25}
          toolbar={
            selectedIds.length > 0 ? (
              <>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">
                    {selectedIds.length} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setRowSelection({})}
                    className="text-[13px] font-[550] text-[#005bd3] hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </>
            ) : (
              <>
                <AdminViewMenu
                  value={statusTab}
                  onChange={setStatusTab}
                  options={[
                    { value: "all", label: "All" },
                    { value: "low", label: "Low stock" },
                    { value: "out", label: "Out of stock" },
                  ]}
                />
                <form
                  className="relative min-w-0 flex-1"
                  onSubmit={(e) => e.preventDefault()}
                >
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search product or SKU"
                    className="h-8 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-[13px] font-normal text-foreground placeholder-gray-400 focus:border-border focus:outline-none"
                  />
                </form>
              </>
            )
          }
        />
      </AdminListLayout>

      {adjustRow ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={closeAdjust}
          />
          <div className="relative bg-card w-full max-w-md rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-[16px] font-medium text-foreground">
                Adjust stock
              </h2>
              <p className="text-[13px] font-[500] text-muted-foreground mt-0.5 truncate">
                {adjustRow.productName || "Product"}
                {adjustRow.variantSku ? ` · ${adjustRow.variantSku}` : ""}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                Sets physical units at Main Warehouse. Available for sale is on
                hand minus committed (open orders).
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">
                  On hand
                </label>
                <p className="text-[12px] text-muted-foreground">
                  Physical units at this location.
                </p>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-[500] text-foreground focus:outline-none focus:border-border"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Stock adjustment"
                  className="w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-[500] text-foreground placeholder-gray-400 focus:outline-none focus:border-border"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
              <AdminHeaderButton onClick={closeAdjust} disabled={saving}>
                Cancel
              </AdminHeaderButton>
              <AdminHeaderButton
                variant="primary"
                onClick={saveAdjust}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : null}
                Save
              </AdminHeaderButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
