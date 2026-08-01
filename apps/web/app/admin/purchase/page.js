"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminErpService, adminProductService, adminWarehouseService } from "@/api";
import { ErpPage, ErpTable } from "@/components/admin/ErpUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function PurchasePage() {
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    supplierId: "",
    warehouseId: "",
    productId: "",
    quantity: 1,
    unitPrice: 0,
    taxRate: 18,
  });

  const load = async () => {
    try {
      const [pos, sup, prods, wh] = await Promise.all([
        adminErpService.purchaseOrders.list(),
        adminErpService.suppliers.list(),
        adminProductService.getProducts(),
        adminWarehouseService.getAll(),
      ]);
      setRows(pos || []);
      setSuppliers(sup || []);
      setProducts(prods || []);
      setWarehouses(wh || []);
    } catch {
      toast.error("Failed to load purchase orders");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    const product = products.find((p) => p._id === form.productId);
    try {
      await adminErpService.purchaseOrders.create({
        supplierId: form.supplierId,
        warehouseId: form.warehouseId || undefined,
        items: [
          {
            productId: form.productId,
            productName: product?.productName || product?.name,
            quantity: Number(form.quantity),
            unitPrice: Number(form.unitPrice),
            taxRate: Number(form.taxRate),
            hsnCode: product?.hsnCode,
          },
        ],
      });
      toast.success("PO created");
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Create failed");
    }
  };

  return (
    <ErpPage
      title="Purchase"
      subtitle="Order stock from suppliers"
      actions={<Button type="button" onClick={() => setOpen(true)}>New PO</Button>}
    >
      {open && (
        <form onSubmit={save} className="rounded-xl border border-border bg-card text-card-foreground p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <Select value={form.supplierId} onValueChange={(supplierId) => setForm({ ...form, supplierId })}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Supplier" /></SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={form.warehouseId || "__none__"} onValueChange={(warehouseId) => setForm({ ...form, warehouseId: warehouseId === "__none__" ? "" : warehouseId })}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Warehouse (optional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Warehouse (optional)</SelectItem>
              {warehouses.map((w) => <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={form.productId} onValueChange={(productId) => setForm({ ...form, productId })}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Product" /></SelectTrigger>
            <SelectContent>
              {products.map((p) => <SelectItem key={p._id} value={p._id}>{p.productName || p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="Qty" />
          <Input type="number" min={0} step="0.01" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} placeholder="Unit price" />
          <Input type="number" min={0} value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} placeholder="Tax %" />
          <div className="flex gap-2 col-span-full">
            <Button type="submit" disabled={!form.supplierId || !form.productId}>Create</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      )}
      <ErpTable
        headers={["Number", "Supplier", "Status", "Total", "Date"]}
        rows={rows.map((r) => (
          <tr key={r._id} className="border-b border-border">
            <td className="px-4 py-2 text-[13px] font-medium">{r.number}</td>
            <td className="px-4 py-2 text-[13px] font-medium text-muted-foreground">{suppliers.find((s) => s._id === r.supplierId)?.name || r.supplierId}</td>
            <td className="px-4 py-2 text-[13px] font-medium text-muted-foreground">{r.status}</td>
            <td className="px-4 py-2 text-[13px] font-medium">₹{Number(r.grandTotal || 0).toLocaleString()}</td>
            <td className="px-4 py-2 text-[13px] font-medium text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""}</td>
          </tr>
        ))}
      />
    </ErpPage>
  );
}
