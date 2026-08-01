"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Edit3,
  Trash2,
  Tag,
  Percent,
  ShoppingBag,
  Gift,
  Package,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import {
  adminCouponService,
  adminProductService,
  adminCollectionService,
} from "@/api";

const KINDS = [
  {
    id: "products",
    title: "Amount off products",
    description: "Discount specific products or collections of products",
    icon: Package,
  },
  {
    id: "bxgy",
    title: "Buy X get Y",
    description: "Discount specific products or collections of products",
    icon: Gift,
  },
  {
    id: "order",
    title: "Amount off order",
    description: "Discount the total order amount",
    icon: ShoppingBag,
  },
];

const emptyForm = (kind = "order") => ({
  name: "",
  code: "",
  kind,
  discountType: "percentage",
  discountValue: "",
  minOrderAmount: "0",
  maxDiscount: "",
  usageLimit: "",
  expiryDate: "",
  status: "active",
  productIds: [],
  collectionIds: [],
  buyQuantity: "1",
  getQuantity: "1",
  getDiscountPercent: "100",
  buyProductIds: [],
  getProductIds: [],
});

function kindLabel(kind) {
  return KINDS.find((k) => k.id === kind)?.title || "Discount";
}

function summaryOf(c) {
  if ((c.kind || "order") === "bxgy") {
    const pct = Number(c.getDiscountPercent ?? 100);
    return `Buy ${c.buyQuantity || 1} get ${c.getQuantity || 1} ${pct >= 100 ? "FREE" : `${pct}% off`}`;
  }
  const val =
    c.discountType === "percentage"
      ? `${c.discountValue}% off`
      : `₹${c.discountValue} off`;
  if ((c.kind || "order") === "products") return `${val} · products`;
  return `${val} · order`;
}

export default function AdminDiscountsPage() {
  const [coupons, setCoupons] = useState([]);
  const [products, setProducts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list"); // list | pick | form
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [productSearch, setProductSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [c, p, col] = await Promise.all([
        adminCouponService.getAll(),
        adminProductService.getAllProducts().catch(() => []),
        adminCollectionService.getCollections().catch(() => []),
      ]);
      setCoupons(Array.isArray(c) ? c : []);
      setProducts(Array.isArray(p) ? p : []);
      setCollections(Array.isArray(col) ? col : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 40);
    return products
      .filter((p) =>
        `${p.productName || p.name || ""} ${p.sku || ""}`.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [products, productSearch]);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
    setSuccess("");
    setView("pick");
  };

  const pickKind = (kind) => {
    setForm(emptyForm(kind));
    setView("form");
  };

  const startEdit = (c) => {
    setEditingId(c._id || c.id);
    setForm({
      name: c.name || "",
      code: c.code || "",
      kind: c.kind || "order",
      discountType: c.discountType || "percentage",
      discountValue: String(c.discountValue ?? ""),
      minOrderAmount: String(c.minOrderAmount ?? 0),
      maxDiscount: c.maxDiscount != null ? String(c.maxDiscount) : "",
      usageLimit: c.usageLimit != null ? String(c.usageLimit) : "",
      expiryDate: c.expiryDate ? String(c.expiryDate).slice(0, 10) : "",
      status: c.status || "active",
      productIds: c.productIds || [],
      collectionIds: c.collectionIds || [],
      buyQuantity: String(c.buyQuantity ?? 1),
      getQuantity: String(c.getQuantity ?? 1),
      getDiscountPercent: String(c.getDiscountPercent ?? 100),
      buyProductIds: c.buyProductIds || [],
      getProductIds: c.getProductIds || [],
    });
    setError("");
    setSuccess("");
    setView("form");
  };

  const toggleId = (key, id) => {
    setForm((prev) => {
      const set = new Set(prev[key] || []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...prev, [key]: [...set] };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.name?.trim() || !form.code?.trim() || !form.expiryDate) {
      setError("Name, code, and expiry date are required.");
      return;
    }

    if (form.kind !== "bxgy") {
      const val = Number(form.discountValue);
      if (!val || val <= 0) {
        setError("Enter a valid discount value.");
        return;
      }
      if (form.discountType === "percentage" && val > 100) {
        setError("Percentage must be 1–100.");
        return;
      }
    }

    if (form.kind === "products" && !form.productIds.length && !form.collectionIds.length) {
      setError("Select at least one product or collection.");
      return;
    }

    if (form.kind === "bxgy" && !(form.buyProductIds.length || form.productIds.length || form.collectionIds.length)) {
      setError("Select buy products or collections for Buy X get Y.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      kind: form.kind,
      discountType: form.kind === "bxgy" ? "percentage" : form.discountType,
      discountValue: form.kind === "bxgy" ? Number(form.getDiscountPercent || 100) : Number(form.discountValue),
      minOrderAmount: Number(form.minOrderAmount || 0),
      maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      expiryDate: form.expiryDate,
      status: form.status,
      productIds: form.kind === "products" ? form.productIds : [],
      collectionIds: form.collectionIds || [],
      buyQuantity: Number(form.buyQuantity || 1),
      getQuantity: Number(form.getQuantity || 1),
      getDiscountPercent: Number(form.getDiscountPercent || 100),
      buyProductIds: form.kind === "bxgy" ? (form.buyProductIds.length ? form.buyProductIds : form.productIds) : [],
      getProductIds: form.kind === "bxgy" ? form.getProductIds : [],
    };

    setSaving(true);
    try {
      if (editingId) {
        await adminCouponService.update(editingId, payload);
        setSuccess("Discount updated");
      } else {
        await adminCouponService.create(payload);
        setSuccess("Discount created");
      }
      await load();
      setView("list");
      setEditingId(null);
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.message || "Failed to save discount";
      setError(typeof msg === "string" ? msg : "Failed to save discount");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this discount?")) return;
    try {
      await adminCouponService.delete(id);
      await load();
    } catch {
      setError("Failed to delete");
    }
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">Discounts</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Create codes for products, orders, or Buy X get Y</p>
        </div>
        {view === "list" && (
          <button
            type="button"
            onClick={startCreate}
            className="bg-primary hover:bg-primary/90 text-primary-foreground text-[13px] font-medium px-4 py-2.5 rounded-lg inline-flex items-center gap-2"
          >
            <Plus size={14} />
            Create discount
          </button>
        )}
      </div>

      {(error || success) && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-2xl p-3 text-[13px] ${
            success ? "bg-emerald-50 text-emerald-700" : "bg-destructive/10 text-destructive"
          }`}
        >
          {success ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span>{success || error}</span>
        </div>
      )}

      {view === "pick" && (
        <div>
          <button
            type="button"
            onClick={() => setView("list")}
            className="text-[13px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 mb-6"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <h2 className="text-sm font-medium text-foreground mb-1">Select discount type</h2>
          <p className="text-[13px] text-muted-foreground mb-6">Choose how this discount applies at checkout</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => pickKind(k.id)}
                className="text-left bg-card border border-border rounded-2xl p-6 hover:border-primary transition-colors"
              >
                <div className="p-2.5 bg-primary/5 text-foreground rounded-lg w-fit mb-4">
                  <k.icon size={18} />
                </div>
                <h3 className="text-sm font-medium text-primary mb-1">{k.title}</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{k.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {view === "form" && (
        <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
          <button
            type="button"
            onClick={() => (editingId ? setView("list") : setView("pick"))}
            className="text-[13px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
          >
            <ArrowLeft size={14} /> Back
          </button>

          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
              <Tag size={14} />
              {kindLabel(form.kind)}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-muted-foreground">Title</label>
                <input
                  className="w-full h-10 px-3 border border-border rounded-lg text-[13px] focus:outline-none focus:border-ring"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Summer sale"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-muted-foreground">Discount code</label>
                <input
                  className="w-full h-10 px-3 border border-border rounded-lg text-[13px] font-mono uppercase focus:outline-none focus:border-ring"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="SUMMER20"
                  required
                />
              </div>
            </div>

            {form.kind !== "bxgy" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-muted-foreground">Value type</label>
                  <select
                    className="w-full h-10 px-3 border border-border rounded-lg text-[13px] bg-card"
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed amount (₹)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-muted-foreground">
                    {form.discountType === "percentage" ? "Percentage" : "Amount (₹)"}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full h-10 px-3 border border-border rounded-lg text-[13px] focus:outline-none focus:border-ring"
                      value={form.discountValue}
                      onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                      required
                    />
                    <Percent size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
                  </div>
                </div>
                {form.discountType === "percentage" && (
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-muted-foreground">Max discount (₹)</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full h-10 px-3 border border-border rounded-lg text-[13px]"
                      value={form.maxDiscount}
                      onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                )}
              </div>
            )}

            {form.kind === "bxgy" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-muted-foreground">Customer buys</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full h-10 px-3 border border-border rounded-lg text-[13px]"
                    value={form.buyQuantity}
                    onChange={(e) => setForm({ ...form, buyQuantity: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-muted-foreground">Customer gets</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full h-10 px-3 border border-border rounded-lg text-[13px]"
                    value={form.getQuantity}
                    onChange={(e) => setForm({ ...form, getQuantity: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-muted-foreground">Get discount %</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="w-full h-10 px-3 border border-border rounded-lg text-[13px]"
                    value={form.getDiscountPercent}
                    onChange={(e) => setForm({ ...form, getDiscountPercent: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">100 = free item</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-muted-foreground">Min order (₹)</label>
                <input
                  type="number"
                  min="0"
                  className="w-full h-10 px-3 border border-border rounded-lg text-[13px]"
                  value={form.minOrderAmount}
                  onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-muted-foreground">Usage limit</label>
                <input
                  type="number"
                  min="0"
                  className="w-full h-10 px-3 border border-border rounded-lg text-[13px]"
                  value={form.usageLimit}
                  onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-muted-foreground">Expiry</label>
                <input
                  type="date"
                  className="w-full h-10 px-3 border border-border rounded-lg text-[13px]"
                  value={form.expiryDate}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">Status</label>
              <select
                className="w-full max-w-xs h-10 px-3 border border-border rounded-lg text-[13px] bg-card"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {(form.kind === "products" || form.kind === "bxgy") && (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
              <h3 className="text-sm font-medium text-foreground">
                {form.kind === "bxgy" ? "Customer buys" : "Applies to"}
              </h3>

              {collections.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[13px] font-medium text-muted-foreground">Collections</p>
                  <div className="flex flex-wrap gap-2">
                    {collections.map((col) => {
                      const id = String(col._id || col.id);
                      const on = (form.collectionIds || []).includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleId("collectionIds", id)}
                          className={`px-3 py-1.5 rounded-lg text-[13px] font-medium border ${
                            on
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card text-muted-foreground border-border"
                          }`}
                        >
                          {col.title || col.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[13px] font-medium text-muted-foreground">Products</p>
                <input
                  className="w-full h-10 px-3 border border-border rounded-lg text-[13px]"
                  placeholder="Search products…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                <div className="max-h-56 overflow-y-auto border border-border rounded-xl divide-y divide-gray-50">
                  {filteredProducts.map((p) => {
                    const id = String(p._id || p.id);
                    const key = form.kind === "bxgy" ? "buyProductIds" : "productIds";
                    const on = (form[key] || []).includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleId(key, id)}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted"
                      >
                        <span className="text-[13px] font-medium text-foreground truncate">
                          {p.productName || p.name}
                        </span>
                        <span
                          className={`text-[12px] font-medium ${on ? "text-emerald-600" : "text-muted-foreground/50"}`}
                        >
                          {on ? "Selected" : "Select"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {(form.kind === "products" ? form.productIds : form.buyProductIds).length > 0 && (
                  <p className="text-[12px] text-muted-foreground">
                    {(form.kind === "products" ? form.productIds : form.buyProductIds).length} product(s)
                    selected
                  </p>
                )}
              </div>

              {form.kind === "bxgy" && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-[13px] font-medium text-muted-foreground">
                    Customer gets (optional — defaults to buy products)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(form.getProductIds || []).map((id) => {
                      const p = products.find((x) => String(x._id || x.id) === id);
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted text-[12px] font-medium"
                        >
                          {p?.productName || p?.name || id.slice(-6)}
                          <button type="button" onClick={() => toggleId("getProductIds", id)}>
                            <X size={12} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  <div className="max-h-40 overflow-y-auto border border-border rounded-xl divide-y divide-gray-50">
                    {filteredProducts.slice(0, 20).map((p) => {
                      const id = String(p._id || p.id);
                      const on = (form.getProductIds || []).includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleId("getProductIds", id)}
                          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted"
                        >
                          <span className="text-[13px] truncate">{p.productName || p.name}</span>
                          <span className={`text-[12px] ${on ? "text-emerald-600" : "text-muted-foreground/50"}`}>
                            {on ? "Selected" : "Select"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-[13px] font-medium px-5 py-2.5 rounded-lg"
            >
              {saving ? "Saving…" : editingId ? "Save discount" : "Create discount"}
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className="border border-border text-[13px] font-medium px-5 py-2.5 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {view === "list" && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {coupons.length === 0 ? (
            <div className="p-12 text-center">
              <Tag className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-[13px] font-medium text-muted-foreground">No discounts yet</p>
              <button
                type="button"
                onClick={startCreate}
                className="mt-4 text-[13px] font-medium text-foreground hover:underline"
              >
                Create your first discount
              </button>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="p-4">Discount</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Value</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {coupons.map((c) => (
                  <tr key={c._id || c.id} className="hover:bg-muted/50">
                    <td className="p-4">
                      <p className="text-[13px] font-medium text-foreground">{c.name || ""}</p>
                      <p className="text-[12px] font-mono text-muted-foreground mt-0.5">{c.code}</p>
                    </td>
                    <td className="p-4 text-[13px] text-muted-foreground">{kindLabel(c.kind || "order")}</td>
                    <td className="p-4 text-[13px] text-muted-foreground">{summaryOf(c)}</td>
                    <td className="p-4">
                      <span
                        className={`text-[12px] font-medium px-2 py-0.5 rounded ${
                          c.status === "active"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {c.status || "active"}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(c)}
                          className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c._id || c.id)}
                          className="p-2 rounded-lg hover:bg-red-50 text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
