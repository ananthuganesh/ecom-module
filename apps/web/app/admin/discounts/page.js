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
} from "@/api";
import { userErrorMessage } from "@/lib/userMessage";
import {
  AdminHeaderButton,
  AdminListLayout,
  AdminStatusText,
} from "@/components/admin/list";
import { TicketPercent } from "@/components/admin/LocalIcons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Spinner } from "@/components/ui/spinner";

const KINDS = [
  {
    id: "products",
    title: "Amount off products",
    description: "Discount specific products",
    icon: Package,
  },
  {
    id: "bxgy",
    title: "Buy X get Y",
    description: "Discount specific products",
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

function createDiscountColumns({ onEdit, onDelete }) {
  return [
    {
      id: "discount",
      accessorFn: (row) => `${row.name || ""} ${row.code || ""}`,
      header: "Discount",
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-foreground">
              {c.name || ""}
            </span>
            <span className="mt-0.5 block truncate font-mono text-[12px] text-muted-foreground">
              {c.code}
            </span>
          </div>
        );
      },
    },
    {
      id: "type",
      accessorFn: (row) => kindLabel(row.kind || "order"),
      header: "Type",
      cell: ({ row }) => (
        <span className="block truncate text-[13px] text-muted-foreground">
          {kindLabel(row.original.kind || "order")}
        </span>
      ),
    },
    {
      id: "value",
      accessorFn: (row) => summaryOf(row),
      header: "Value",
      cell: ({ row }) => (
        <span className="block truncate text-[13px] text-muted-foreground">
          {summaryOf(row.original)}
        </span>
      ),
    },
    {
      id: "status",
      accessorFn: (row) => row.status || "active",
      header: "Status",
      size: 120,
      cell: ({ row }) => {
        const active = (row.original.status || "active") === "active";
        return (
          <AdminStatusText tone={active ? "success" : "neutral"} dot>
            {active ? "Active" : "Inactive"}
          </AdminStatusText>
        );
      },
    },
    {
      id: "actions",
      header: "",
      size: 88,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            title="Edit"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(row.original);
            }}
            className="inline-flex size-7 items-center justify-center rounded-md text-[#616161] hover:bg-[#f1f1f1]"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(row.original._id || row.original.id);
            }}
            className="inline-flex size-7 items-center justify-center rounded-md text-[#c70a24] hover:bg-[#fbe9e7]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];
}

export default function AdminDiscountsPage() {
  const [coupons, setCoupons] = useState([]);
  const [products, setProducts] = useState([]);
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
      const [c, p] = await Promise.all([
        adminCouponService.getAll(),
        adminProductService.getAllProducts().catch(() => []),
      ]);
      setCoupons(Array.isArray(c) ? c : []);
      setProducts(Array.isArray(p) ? p : []);
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

    if (form.kind === "products" && !form.productIds.length) {
      setError("Select at least one product.");
      return;
    }

    if (form.kind === "bxgy" && !(form.buyProductIds.length || form.productIds.length)) {
      setError("Select buy products for Buy X get Y.");
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
      setError(userErrorMessage(err, "Couldn’t save that discount"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this discount?")) return;
    try {
      await adminCouponService.delete(id);
      await load();
    } catch (err) {
      setError(userErrorMessage(err, "Couldn’t delete that discount"));
    }
  };

  const columns = useMemo(
    () =>
      createDiscountColumns({
        onEdit: startEdit,
        onDelete: handleDelete,
      }),
    []
  );

  const alertBanner =
    error || success ? (
      <div
        className={`mb-4 flex items-start gap-2 rounded-lg p-3 text-[13px] ${
          success ? "bg-emerald-50 text-emerald-700" : "bg-destructive/10 text-destructive"
        }`}
      >
        {success ? (
          <CheckCircle2 size={16} className="mt-0.5" />
        ) : (
          <AlertCircle size={16} className="mt-0.5" />
        )}
        <span>{success || error}</span>
      </div>
    ) : null;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  if (view === "list") {
    return (
      <AdminListLayout
          fill={false}
          title="Discounts"
          icon={TicketPercent}
          actions={
            <AdminHeaderButton variant="primary" onClick={startCreate}>
              <Plus className="h-3.5 w-3.5" />
              Create discount
            </AdminHeaderButton>
          }
        >
          {alertBanner}
          <DataTable
            columns={columns}
            data={coupons}
            getRowId={(row) => row._id || row.id}
            onRowClick={startEdit}
            showToolbar={false}
            showColumnsMenu={false}
            showFooter={false}
            pageSize={50}
            rowHeightClass="h-10"
            emptyTitle="No discounts yet"
            emptyDescription="Create a code for products, orders, or Buy X get Y."
          />
        </AdminListLayout>
    );
  }

  return (
    <>
      {view === "pick" && (
        <AdminListLayout
          fill={false}
          title="Select discount type"
          description="Choose how this discount applies at checkout"
          actions={
            <AdminHeaderButton onClick={() => setView("list")}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </AdminHeaderButton>
          }
        >
          {alertBanner}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => pickKind(k.id)}
                className="text-left"
              >
                <Card className="@container/card h-full transition-colors hover:bg-muted/30">
                  <CardHeader>
                    <div className="mb-1 flex size-8 items-center justify-center rounded-lg bg-primary/5 text-[#303030]">
                      <k.icon className="h-[18px] w-[18px]" />
                    </div>
                    <CardTitle>{k.title}</CardTitle>
                    <CardDescription>{k.description}</CardDescription>
                  </CardHeader>
                </Card>
              </button>
            ))}
          </div>
        </AdminListLayout>
      )}

      {view === "form" && (
        <AdminListLayout
          fill={false}
          title={editingId ? "Edit discount" : "Create discount"}
          description={kindLabel(form.kind)}
          actions={
            <AdminHeaderButton
              onClick={() => (editingId ? setView("list") : setView("pick"))}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </AdminHeaderButton>
          }
        >
          {alertBanner}
          <form onSubmit={handleSubmit} className="space-y-4">
          <Card className="@container/card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-3.5 w-3.5" />
                {kindLabel(form.kind)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">

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
          </CardContent>
          </Card>

          {(form.kind === "products" || form.kind === "bxgy") && (
            <Card className="@container/card">
              <CardHeader>
                <CardTitle>
                  {form.kind === "bxgy" ? "Customer buys" : "Applies to"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">

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
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            <AdminHeaderButton
              type="submit"
              variant="primary"
              disabled={saving}
            >
              {saving ? "Saving…" : editingId ? "Save discount" : "Create discount"}
            </AdminHeaderButton>
            <AdminHeaderButton onClick={() => setView("list")}>
              Cancel
            </AdminHeaderButton>
          </div>
          </form>
        </AdminListLayout>
      )}
    </>
  );
}
