"use client";

import { useEffect, useMemo, useState } from "react";
import { Package, Search, ArrowLeftRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  adminStockService,
  adminWarehouseService,
  adminProductService,
} from "@/api";
import {
  AdminListLayout,
  AdminDataTable,
  AdminHeaderButton,
  AdminStatusText,
} from "@/components/admin/list";

export default function PurchaseTransfersPage() {
  const [movements, setMovements] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    productId: "",
    fromWarehouseId: "",
    toWarehouseId: "",
    quantity: 1,
    reason: "",
  });

  const load = async () => {
    try {
      const [moves, wh, prods] = await Promise.all([
        adminStockService.movements({ limit: 200 }),
        adminWarehouseService.getAll(),
        adminProductService.getProducts(),
      ]);
      const transferMoves = (Array.isArray(moves) ? moves : []).filter((m) =>
        String(m.type || "").toLowerCase().includes("transfer")
      );
      setMovements(transferMoves);
      setWarehouses(Array.isArray(wh) ? wh : []);
      setProducts(
        Array.isArray(prods) ? prods : Array.isArray(prods?.products) ? prods.products : []
      );
    } catch (error) {
      console.error(error);
      toast.error("Failed to load transfers");
      setMovements([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return movements;
    return movements.filter((m) => {
      const name = String(m.productName || "").toLowerCase();
      const wh = String(m.warehouseName || "").toLowerCase();
      const sku = String(m.variantSku || "").toLowerCase();
      const reason = String(m.reason || "").toLowerCase();
      return (
        name.includes(q) ||
        wh.includes(q) ||
        sku.includes(q) ||
        reason.includes(q)
      );
    });
  }, [movements, searchTerm]);

  const save = async (e) => {
    e.preventDefault();
    if (!form.productId || !form.fromWarehouseId || !form.toWarehouseId) {
      toast.error("Product and both warehouses are required");
      return;
    }
    if (form.fromWarehouseId === form.toWarehouseId) {
      toast.error("Source and destination must differ");
      return;
    }
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast.error("Enter a positive whole-number quantity");
      return;
    }
    setSaving(true);
    try {
      await adminStockService.transfer({
        productId: form.productId,
        fromWarehouseId: form.fromWarehouseId,
        toWarehouseId: form.toWarehouseId,
        quantity,
        reason: form.reason.trim() || "Warehouse transfer",
      });
      toast.success("Transfer completed");
      setOpen(false);
      setForm({
        productId: "",
        fromWarehouseId: "",
        toWarehouseId: "",
        quantity: 1,
        reason: "",
      });
      setLoading(true);
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Transfer failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading && movements.length === 0) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <AdminListLayout
        title="Transfers"
        actions={
          <AdminHeaderButton variant="primary" onClick={() => setOpen(true)}>
            <ArrowLeftRight className="w-3.5 h-3.5" />
            New transfer
          </AdminHeaderButton>
        }
      >
        <AdminDataTable
          toolbar={
            <div className="relative w-full max-w-[220px] shrink-0 ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search transfers"
                className="w-full h-8 pl-9 pr-3 rounded-lg border border-border bg-card text-[13px] font-normal text-foreground placeholder-gray-400 focus:outline-none focus:border-border"
              />
            </div>
          }
          headers={[
            { label: "Date", className: "w-[140px]" },
            { label: "Product", className: "w-[220px]" },
            { label: "Warehouse", className: "w-[160px]" },
            { label: "Qty", className: "w-[90px]" },
            { label: "Type", className: "w-[120px]" },
            { label: "Reason", className: "w-[200px]" },
          ]}
          empty={
            filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Package className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-[13px] font-medium text-muted-foreground">No transfers yet</p>
              </div>
            ) : null
          }
        >
          {filtered.map((m) => {
            const ink = "text-foreground";
            const inkSoft = "text-muted-foreground";
            const wt = "font-[500]";
            const dateLabel = m.createdAt
              ? new Date(m.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "";
            return (
              <tr key={m._id} className="bg-card hover:bg-muted transition-colors">
                <td className="h-8 px-3 py-0 border-b border-border align-middle">
                  <span className={`text-[13px] ${wt} whitespace-nowrap ${inkSoft}`}>
                    {dateLabel}
                  </span>
                </td>
                <td className="h-8 px-3 py-0 border-b border-border align-middle">
                  <span className={`block text-[13px] ${wt} truncate ${ink}`}>
                    {m.productName || "Product"}
                  </span>
                </td>
                <td className="h-8 px-3 py-0 border-b border-border align-middle">
                  <span className={`text-[13px] ${wt} ${inkSoft}`}>
                    {m.warehouseName || ""}
                  </span>
                </td>
                <td className="h-8 px-3 py-0 border-b border-border align-middle">
                  <span className={`text-[13px] ${wt} ${ink}`}>{m.quantity}</span>
                </td>
                <td className="h-8 px-3 py-0 border-b border-border align-middle">
                  <AdminStatusText tone="info">{m.type || "transfer"}</AdminStatusText>
                </td>
                <td className="h-8 px-3 py-0 border-b border-border align-middle">
                  <span className={`block text-[13px] ${wt} truncate ${inkSoft}`}>
                    {m.reason || ""}
                  </span>
                </td>
              </tr>
            );
          })}
        </AdminDataTable>
      </AdminListLayout>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => !saving && setOpen(false)}
          />
          <form
            onSubmit={save}
            className="relative bg-card w-full max-w-lg rounded-xl border border-border overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-[16px] font-medium text-foreground">New transfer</h2>
              <p className="text-[13px] font-[500] text-muted-foreground mt-0.5">
                Move stock between warehouses
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <select
                required
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
                className="w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-[500] text-foreground focus:outline-none"
              >
                <option value="">Product</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.productName || p.name}
                  </option>
                ))}
              </select>
              <select
                required
                value={form.fromWarehouseId}
                onChange={(e) => setForm({ ...form, fromWarehouseId: e.target.value })}
                className="w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-[500] text-foreground focus:outline-none"
              >
                <option value="">From warehouse</option>
                {warehouses.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <select
                required
                value={form.toWarehouseId}
                onChange={(e) => setForm({ ...form, toWarehouseId: e.target.value })}
                className="w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-[500] text-foreground focus:outline-none"
              >
                <option value="">To warehouse</option>
                {warehouses.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                step={1}
                required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                placeholder="Quantity"
                className="w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-[500] text-foreground focus:outline-none"
              />
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Reason (optional)"
                className="w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-[500] text-foreground placeholder-gray-400 focus:outline-none"
              />
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
              <AdminHeaderButton type="button" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </AdminHeaderButton>
              <AdminHeaderButton variant="primary" type="submit" disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Transfer
              </AdminHeaderButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
