"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Edit3,
  Trash2,
  Gift,
  Package,
  ShoppingBag,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ChevronsUpDown,
  CirclePlus,
  Search,
  Tag,
  Truck,
  X,
} from "@/components/icons";
import {
  adminCollectionService,
  adminCouponService,
  adminProductService,
} from "@/api";
import { userErrorMessage } from "@/lib/userMessage";
import {
  KIND_CLASS,
  KIND_TITLES,
  combinationLine,
  combinationOptions,
  couponStatus,
  couponSummary,
  detailLines,
  emptyForm,
  formFromCoupon,
  payloadFromForm,
  randomCode,
  validateForm,
} from "@/lib/discountForm";
import {
  AdminHeaderButton,
  AdminListLayout,
  AdminStatusText,
} from "@/components/admin/list";
import { TicketPercent } from "@/components/admin/LocalIcons";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

const KINDS = [
  { id: "products", title: KIND_TITLES.products, description: "Discount specific products or collections of products", icon: Package },
  { id: "bxgy", title: KIND_TITLES.bxgy, description: "Discount products based on a customer's purchase", icon: Gift },
  { id: "order", title: KIND_TITLES.order, description: "Discount the total order amount", icon: ShoppingBag },
  { id: "shipping", title: KIND_TITLES.shipping, description: "Offer free shipping on an order", icon: Truck },
];

// ─────────────────────────────────────────────────────────── small controls

const fieldCls =
  "h-8 w-full rounded-lg border border-(--p-color-input-border)/50 bg-white px-3 text-[0.8125rem] text-(--p-color-text) outline-none transition-shadow placeholder:text-(--p-color-text-tertiary) focus:border-(--p-color-text) focus:shadow-[0_0_0_1px_#303030]";
const softBtn =
  "admin-btn-secondary inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-(--p-color-text) transition-colors";
const labelCls = "mb-1 block text-[0.8125rem] font-normal text-(--p-color-text)";
const helpCls = "mt-1 text-[0.75rem] text-(--p-color-text-secondary)";

function Section({ title, action, children }) {
  return (
    <section className="space-y-2">
      {title ? (
        <div className="flex items-center justify-between">
          <h2 className="text-[0.875rem] font-semibold text-(--p-color-text)">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className="rounded-xl bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.07),0_0_0_1px_rgba(0,0,0,0.07)]">
        {children}
      </div>
    </section>
  );
}

function SelectBox({ value, onChange, options, label, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${fieldCls} appearance-none pr-8`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-(--p-color-text-secondary)" />
    </div>
  );
}

function NumberField({ value, onChange, prefix, suffix, label, step = "1", placeholder, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      {prefix ? (
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[0.8125rem] text-(--p-color-text-secondary)">
          {prefix}
        </span>
      ) : null}
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step={step}
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${fieldCls} ${prefix ? "pl-7" : ""} ${suffix ? "pr-8" : ""}`}
      />
      {suffix ? (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[0.8125rem] text-(--p-color-text-secondary)">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

function Radio({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-[0.8125rem] text-(--p-color-text)">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="size-4 accent-(--p-color-text)"
      />
      {children}
    </label>
  );
}

function Check({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-1 text-[0.8125rem] text-(--p-color-text)">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 rounded accent-(--p-color-text)"
      />
      <span>{children}</span>
    </label>
  );
}

// ─────────────────────────────────────────────────────────── pickers

/** Search box + Browse dialog over products or collections; selected rows listed below. */
function TargetPicker({ kind, items, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const noun = kind === "collections" ? "collections" : "products";
  const label = (item) => item.productName || item.name || "Untitled";
  const image = (item) => item.thumbnails?.[0] || item.image || item.variants?.[0]?.images?.[0] || "";
  const id = (item) => String(item._id || item.id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? items.filter((i) => `${label(i)} ${i.sku || ""}`.toLowerCase().includes(q)) : items;
    return list.slice(0, 100);
  }, [items, query]);
  const chosen = selected.map((sid) => items.find((i) => id(i) === sid) || { _id: sid, name: "Unavailable" });

  const toggle = (sid) =>
    onChange(selected.includes(sid) ? selected.filter((x) => x !== sid) : [...selected, sid]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-(--p-color-text-secondary)" />
          <input
            className={`${fieldCls} pl-8`}
            placeholder={`Search ${noun}`}
            value=""
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setQuery("");
            }}
          />
        </div>
        <button type="button" className={softBtn} onClick={() => setOpen(true)}>
          Browse
        </button>
      </div>

      {chosen.length ? (
        <ul className="divide-y divide-(--p-color-border-secondary) rounded-lg border border-(--p-color-border-secondary)">
          {chosen.map((item) => (
            <li key={id(item)} className="flex items-center gap-3 px-3 py-2">
              {kind === "products" ? (
                <span className="size-8 shrink-0 overflow-hidden rounded-md border border-(--p-color-border-secondary) bg-(--p-color-bg-surface-hover)">
                  {image(item) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image(item)} alt="" className="size-full object-cover" />
                  ) : null}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-(--p-color-text)">{label(item)}</span>
              <button
                type="button"
                aria-label={`Remove ${label(item)}`}
                onClick={() => toggle(id(item))}
                className="inline-flex size-7 items-center justify-center rounded-md text-(--p-color-text-secondary) hover:bg-(--p-color-bg-fill)"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[36rem]">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <DialogTitle className="text-[16px] font-medium text-(--p-color-text)">
              Add {noun}
            </DialogTitle>
            <DialogClose aria-label="Close" className="flex size-8 items-center justify-center rounded-full hover:bg-(--p-color-bg-fill)">
              <X className="size-4" />
            </DialogClose>
          </div>
          <div className="px-5 pb-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-(--p-color-text-secondary)" />
              <input
                autoFocus
                className={`${fieldCls} pl-8`}
                placeholder={`Search ${noun}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <ul className="max-h-[50vh] divide-y divide-(--p-color-border-secondary) overflow-y-auto border-y border-(--p-color-border-secondary)">
            {filtered.length ? (
              filtered.map((item) => {
                const sid = id(item);
                return (
                  <li key={sid}>
                    <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-(--p-color-bg-surface-hover)">
                      <input
                        type="checkbox"
                        checked={selected.includes(sid)}
                        onChange={() => toggle(sid)}
                        className="size-4 accent-(--p-color-text)"
                      />
                      {kind === "products" ? (
                        <span className="size-8 shrink-0 overflow-hidden rounded-md border border-(--p-color-border-secondary) bg-(--p-color-bg-surface-hover)">
                          {image(item) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={image(item)} alt="" className="size-full object-cover" />
                          ) : null}
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-(--p-color-text)">{label(item)}</span>
                      {kind === "collections" && item.productCount != null ? (
                        <span className="text-[0.75rem] text-(--p-color-text-secondary)">{item.productCount} products</span>
                      ) : null}
                    </label>
                  </li>
                );
              })
            ) : (
              <li className="px-5 py-6 text-center text-[0.8125rem] text-(--p-color-text-secondary)">No {noun} found</li>
            )}
          </ul>
          <div className="flex items-center justify-between px-5 py-3.5">
            <span className="text-[0.8125rem] text-(--p-color-text-secondary)">{selected.length} selected</span>
            <DialogClose className="h-8 rounded-lg bg-(--p-color-button-primary-bg) px-3 text-[0.8125rem] font-medium text-white hover:bg-(--p-color-button-primary-bg-hover)">
              Done
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomerPicker({ selected, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [known, setKnown] = useState({});
  const [searching, setSearching] = useState(false);

  // Names for customers already on the discount.
  useEffect(() => {
    const missing = selected.filter((sid) => !known[sid]);
    if (!missing.length) return;
    adminCouponService
      .customers({ ids: missing })
      .then((rows) => setKnown((prev) => ({ ...prev, ...Object.fromEntries(rows.map((r) => [r._id, r])) })))
      .catch(() => {});
  }, [selected, known]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      adminCouponService
        .customers({ q })
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const add = (row) => {
    setKnown((prev) => ({ ...prev, [row._id]: row }));
    if (!selected.includes(row._id)) onChange([...selected, row._id]);
    setQuery("");
    setResults([]);
  };
  const describe = (row) => [row.email, row.phone].filter(Boolean).join(" · ");

  return (
    <div className="mt-3 space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-(--p-color-text-secondary)" />
        <input
          className={`${fieldCls} pl-8`}
          placeholder="Search customers by name, email or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim().length >= 2 ? (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg bg-white py-1 shadow-[0_4px_16px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.08)]">
            {searching ? (
              <li className="px-3 py-2 text-[0.8125rem] text-(--p-color-text-secondary)">Searching…</li>
            ) : results.length ? (
              results.map((row) => (
                <li key={row._id}>
                  <button
                    type="button"
                    onClick={() => add(row)}
                    className="flex w-full flex-col px-3 py-2 text-left hover:bg-(--p-color-bg-surface-hover)"
                  >
                    <span className="text-[0.8125rem] text-(--p-color-text)">{row.name || "Unnamed customer"}</span>
                    <span className="text-[0.75rem] text-(--p-color-text-secondary)">{describe(row)}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-2 text-[0.8125rem] text-(--p-color-text-secondary)">No customers found</li>
            )}
          </ul>
        ) : null}
      </div>
      {selected.length ? (
        <ul className="divide-y divide-(--p-color-border-secondary) rounded-lg border border-(--p-color-border-secondary)">
          {selected.map((sid) => {
            const row = known[sid] || { _id: sid, name: "Loading…" };
            return (
              <li key={sid} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] text-(--p-color-text)">{row.name || "Unnamed customer"}</span>
                  <span className="block truncate text-[0.75rem] text-(--p-color-text-secondary)">{describe(row)}</span>
                </span>
                <button
                  type="button"
                  aria-label="Remove customer"
                  onClick={() => onChange(selected.filter((x) => x !== sid))}
                  className="inline-flex size-7 items-center justify-center rounded-md text-(--p-color-text-secondary) hover:bg-(--p-color-bg-fill)"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className={helpCls}>Guests in checkout are matched by the phone number or email on these accounts.</p>
    </div>
  );
}

function TagsInput({ tags, onChange }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const commit = () => {
    const tag = draft.trim();
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) onChange([...tags, tag]);
    setDraft("");
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-(--p-color-input-border)/50 bg-white p-1.5">
      {tags.map((t) => (
        <span key={t} className="inline-flex h-6 items-center gap-1 rounded-md bg-(--p-color-button-bg-fill) pr-1 pl-2 text-[0.75rem] font-medium text-(--p-color-text)">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      {editing ? (
        <input
          autoFocus
          value={draft}
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setEditing(false);
              setDraft("");
            }
          }}
          onBlur={() => {
            commit();
            setEditing(false);
          }}
          className="h-6 min-w-24 flex-1 bg-transparent px-1 text-[0.8125rem] outline-none"
          placeholder="Tag name"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex h-6 items-center gap-1 rounded-md bg-(--p-color-bg-fill) px-2 text-[0.75rem] font-medium text-(--p-color-text) hover:bg-(--p-color-button-bg-fill)"
        >
          <CirclePlus className="size-3.5" />
          Add tags
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── list

function createDiscountColumns({ onEdit, onDelete }) {
  return [
    {
      id: "discount",
      accessorFn: (row) => `${row.code || ""} ${row.name || ""}`,
      header: "Discount",
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="min-w-0">
            {(c.method || "code") === "automatic" ? (
              <span className="block truncate text-[13px] font-medium text-foreground">{c.name || "Automatic discount"}</span>
            ) : (
              <span className="block truncate font-mono text-[13px] font-medium text-foreground">{c.code}</span>
            )}
            <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{couponSummary(c)}</span>
          </div>
        );
      },
    },
    {
      id: "type",
      accessorFn: (row) => KIND_TITLES[row.kind || "order"],
      header: "Type",
      cell: ({ row }) => (
        <span className="block min-w-0">
          <span className="block truncate text-[13px] text-muted-foreground">
            {KIND_TITLES[row.original.kind || "order"]}
          </span>
          <span className="block truncate text-[12px] text-muted-foreground/80">
            {(row.original.method || "code") === "automatic" ? "Automatic" : "Code"}
          </span>
        </span>
      ),
    },
    {
      id: "used",
      accessorFn: (row) => Number(row.usedCount || 0),
      header: "Used",
      size: 90,
      cell: ({ row }) => (
        <span className="text-[13px] tabular-nums text-muted-foreground">
          {Number(row.original.usedCount || 0)}
          {row.original.usageLimit ? ` / ${row.original.usageLimit}` : ""}
        </span>
      ),
    },
    {
      id: "status",
      accessorFn: (row) => couponStatus(row).label,
      header: "Status",
      size: 120,
      cell: ({ row }) => {
        const s = couponStatus(row.original);
        return (
          <AdminStatusText tone={s.tone} dot>
            {s.label}
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
            className="inline-flex size-7 items-center justify-center rounded-md text-(--p-color-text-secondary) hover:bg-(--p-color-bg-fill)"
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
            className="inline-flex size-7 items-center justify-center rounded-md text-(--p-color-text-critical-accent) hover:bg-(--p-color-badge-bg-fill-critical)"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];
}

// ─────────────────────────────────────────────────────────── page

export default function AdminDiscountsPage() {
  const [coupons, setCoupons] = useState([]);
  const [products, setProducts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list"); // list | form
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const load = async () => {
    try {
      const [c, p, cols] = await Promise.all([
        adminCouponService.getAll(),
        adminProductService.getAllProducts().catch(() => []),
        adminCollectionService.getAll().catch(() => []),
      ]);
      setCoupons(Array.isArray(c) ? c : []);
      setProducts(Array.isArray(p) ? p : []);
      setCollections(Array.isArray(cols) ? cols : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
    setSuccess("");
    setView("list");
    setPickerOpen(true);
  };

  const pickKind = (kind) => {
    setForm(emptyForm(kind));
    setPickerOpen(false);
    setView("form");
  };

  const startEdit = (c) => {
    setEditingId(c._id || c.id);
    setForm(formFromCoupon(c));
    setError("");
    setSuccess("");
    setView("form");
  };

  const backToList = () => {
    setView("list");
    setEditingId(null);
    setError("");
  };

  const save = async (override = {}) => {
    const next = { ...form, ...override };
    setError("");
    setSuccess("");
    const problem = validateForm(next);
    if (problem) {
      setError(problem);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving(true);
    try {
      const payload = payloadFromForm(next);
      if (editingId) {
        await adminCouponService.update(editingId, payload);
        setSuccess("Discount saved");
      } else {
        await adminCouponService.create(payload);
        setSuccess("Discount created");
      }
      await load();
      backToList();
    } catch (err) {
      setError(userErrorMessage(err, "Couldn’t save that discount"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this discount?")) return;
    try {
      await adminCouponService.delete(id);
      await load();
      if (editingId === id) backToList();
    } catch (err) {
      setError(userErrorMessage(err, "Couldn’t delete that discount"));
    }
  };

  const columns = useMemo(
    () => createDiscountColumns({ onEdit: startEdit, onDelete: handleDelete }),
    []
  );

  const alertBanner =
    error || success ? (
      <div
        className={`mb-4 flex items-start gap-2 rounded-lg p-3 text-[13px] ${
          success ? "bg-(--p-color-bg-surface-success) text-(--p-color-text-success-secondary)" : "bg-destructive/10 text-destructive"
        }`}
      >
        {success ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
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
          rowHeightClass="h-12"
          emptyTitle="No discounts yet"
          emptyDescription="Create a code for products, orders, or Buy X get Y."
        />
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent
            showCloseButton={false}
            className="gap-0 overflow-hidden rounded-2xl p-0 text-(--p-color-text) sm:max-w-[40rem]"
          >
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
              <DialogTitle className="text-[16px] font-medium leading-6 text-(--p-color-text)">
                Select discount type
              </DialogTitle>
              <DialogClose
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-full bg-white text-(--p-color-text) shadow-[0_1px_2px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.08)] transition-colors hover:bg-(--p-color-bg-fill)"
              >
                <X className="size-4" />
              </DialogClose>
            </div>
            <ul className="divide-y divide-(--p-color-border-secondary) border-b border-(--p-color-border-secondary)">
              {KINDS.map((k) => (
                <li key={k.id}>
                  <button
                    type="button"
                    onClick={() => pickKind(k.id)}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-(--p-color-bg-surface-hover) focus-visible:bg-(--p-color-bg-surface-hover) focus-visible:outline-none"
                  >
                    <k.icon className="mt-0.5 size-4 shrink-0 self-start" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.875rem] font-medium leading-5">{k.title}</span>
                      <span className="mt-1 block text-[0.8125rem] leading-5 text-(--p-color-text-secondary)">{k.description}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-(--p-color-text-secondary)" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end px-5 py-3.5">
              <DialogClose className="h-8 rounded-lg bg-white px-3 text-[0.8125rem] font-medium text-(--p-color-text) shadow-[0_1px_2px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.08)] transition-colors hover:bg-(--p-color-bg-fill)">
                Cancel
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </AdminListLayout>
    );
  }

  // ───────────────────────────────── editor
  const f = form;
  const isBxgy = f.kind === "bxgy";
  const isProducts = f.kind === "products";
  const isShipping = f.kind === "shipping";
  const isAutomatic = f.method === "automatic";
  const targetOptions = [
    { value: "collections", label: "Specific collections" },
    { value: "products", label: "Specific products" },
  ];
  const pickerItems = (target) => (target === "collections" ? collections : products);
  const details = detailLines(f);
  const KindIcon = f.kind === "order" ? ShoppingBag : f.kind === "shipping" ? Truck : Tag;
  const heading = isAutomatic ? f.name : String(f.code || "").startsWith("AUTO-") ? "" : f.code;

  return (
    <AdminListLayout
      fill={false}
      title={editingId ? heading || "Edit discount" : "Create discount"}
      actions={
        <AdminHeaderButton
          onClick={() => {
            backToList();
            if (!editingId) setPickerOpen(true);
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </AdminHeaderButton>
      }
    >
      {alertBanner}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_17.5rem]"
      >
        <div className="min-w-0 space-y-5">
          {/* Method + code */}
          <Section title={KIND_TITLES[f.kind]}>
            <span className={labelCls}>Method</span>
            <div role="radiogroup" aria-label="Method" className="mb-3 inline-flex rounded-lg bg-(--p-color-button-bg-fill) p-0.5">
              {[
                { value: "code", label: "Discount code" },
                { value: "automatic", label: "Automatic discount" },
              ].map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={f.method === m.value}
                  onClick={() =>
                    set(
                      // New automatic discounts are featured on product pages by default.
                      !editingId && m.value === "automatic" && f.method !== "automatic"
                        ? { method: m.value, showOnProduct: true }
                        : { method: m.value }
                    )
                  }
                  className={`rounded-md px-3 py-1 text-[0.75rem] font-medium transition-colors ${
                    f.method === m.value
                      ? "bg-white text-(--p-color-text) shadow-[0_1px_0_rgba(0,0,0,0.08)]"
                      : "text-(--p-color-text-secondary) hover:text-(--p-color-text)"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {isAutomatic ? (
              <>
                <label htmlFor="discount-title" className={labelCls}>
                  Title
                </label>
                <input
                  id="discount-title"
                  className={fieldCls}
                  value={f.name}
                  maxLength={60}
                  onChange={(e) => set({ name: e.target.value })}
                />
                <p className={helpCls}>Customers will see this in their cart and at checkout.</p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <label htmlFor="discount-code" className={labelCls}>
                    Discount code
                  </label>
                  <button
                    type="button"
                    onClick={() => set({ code: randomCode() })}
                    className="mb-1 text-[0.8125rem] text-(--p-color-text-link) hover:underline"
                  >
                    Generate random code
                  </button>
                </div>
                <input
                  id="discount-code"
                  className={`${fieldCls} font-mono uppercase`}
                  value={String(f.code || "").startsWith("AUTO-") ? "" : f.code}
                  maxLength={40}
                  onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s+/g, "") })}
                />
                <p className={helpCls}>Customers must enter this code at checkout.</p>
              </>
            )}
          </Section>

          {/* Discount value */}
          {isShipping ? (
            <>
              <Section title="Countries">
                <Radio checked onChange={() => {}}>
                  India
                </Radio>
                <p className={helpCls}>The store ships within India only.</p>
              </Section>
              <Section title="Shipping rates">
                <Check
                  checked={!!f.limitShippingRate}
                  onChange={(v) => set({ limitShippingRate: v })}
                >
                  Exclude shipping rates over a certain amount
                </Check>
                {f.limitShippingRate ? (
                  <NumberField
                    label="Highest shipping rate covered"
                    className="ml-6 w-40"
                    prefix="₹"
                    step="0.01"
                    value={f.maxShippingRate}
                    onChange={(v) => set({ maxShippingRate: v })}
                  />
                ) : null}
              </Section>
            </>
          ) : !isBxgy ? (
            <Section title="Discount value">
              <div className="flex gap-2">
                <SelectBox
                  label="Discount type"
                  className="flex-1"
                  value={f.discountType}
                  onChange={(v) => set({ discountType: v })}
                  options={[
                    { value: "percentage", label: "Percentage" },
                    { value: "fixed", label: "Fixed amount" },
                  ]}
                />
                <NumberField
                  label="Discount value"
                  className="w-40"
                  step="0.01"
                  value={f.discountValue}
                  onChange={(v) => set({ discountValue: v })}
                  prefix={f.discountType === "fixed" ? "₹" : null}
                  suffix={f.discountType === "percentage" ? "%" : null}
                />
              </div>
              {f.discountType === "percentage" ? (
                <div className="mt-3">
                  <Check checked={!!f.limitMaxDiscount} onChange={(v) => set({ limitMaxDiscount: v })}>
                    Set a maximum discount amount
                    <span className="block text-[0.75rem] text-(--p-color-text-secondary)">
                      The discount stops at this amount per order, whatever the cart total.
                    </span>
                  </Check>
                  {f.limitMaxDiscount ? (
                    <NumberField
                      label="Maximum discount amount"
                      className="ml-6 w-40"
                      prefix="₹"
                      step="0.01"
                      value={f.maxDiscount}
                      onChange={(v) => set({ maxDiscount: v })}
                    />
                  ) : null}
                </div>
              ) : null}
              {isProducts ? (
                <div className="mt-3 space-y-2">
                  <div>
                    <span className={labelCls}>Applies to</span>
                    <SelectBox
                      label="Applies to"
                      value={f.appliesTo}
                      onChange={(v) => set({ appliesTo: v })}
                      options={targetOptions}
                    />
                  </div>
                  <TargetPicker
                    kind={f.appliesTo}
                    items={pickerItems(f.appliesTo)}
                    selected={f.appliesTo === "collections" ? f.collectionIds : f.productIds}
                    onChange={(ids) => set(f.appliesTo === "collections" ? { collectionIds: ids } : { productIds: ids })}
                  />
                  {f.discountType === "fixed" ? (
                    <Check checked={!!f.oncePerOrder} onChange={(v) => set({ oncePerOrder: v })}>
                      Only apply discount once per order
                      <span className="block text-[0.75rem] text-(--p-color-text-secondary)">
                        If not selected, the amount will be taken off each eligible item in an order.
                      </span>
                    </Check>
                  ) : null}
                </div>
              ) : null}
            </Section>
          ) : (
            <Section title="Discount value">
              <h3 className="mb-1 text-[0.8125rem] font-semibold text-(--p-color-text)">Customer buys</h3>
              <Radio checked={f.buyRequirement === "quantity"} onChange={() => set({ buyRequirement: "quantity" })}>
                Minimum quantity of items
              </Radio>
              <Radio checked={f.buyRequirement === "amount"} onChange={() => set({ buyRequirement: "amount" })}>
                Minimum purchase amount
              </Radio>
              <div className="mt-2 grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <div>
                  <span className={labelCls}>{f.buyRequirement === "amount" ? "Amount" : "Quantity"}</span>
                  {f.buyRequirement === "amount" ? (
                    <NumberField label="Amount" prefix="₹" step="0.01" value={f.buyAmount} onChange={(v) => set({ buyAmount: v })} />
                  ) : (
                    <NumberField label="Quantity" value={f.buyQuantity} onChange={(v) => set({ buyQuantity: v })} />
                  )}
                </div>
                <div>
                  <span className={labelCls}>Any items from</span>
                  <SelectBox
                    label="Customer buys items from"
                    value={f.buyAppliesTo}
                    onChange={(v) => set({ buyAppliesTo: v })}
                    options={[...targetOptions].reverse()}
                  />
                </div>
              </div>
              <div className="mt-2">
                <TargetPicker
                  kind={f.buyAppliesTo}
                  items={pickerItems(f.buyAppliesTo)}
                  selected={f.buyAppliesTo === "collections" ? f.buyCollectionIds : f.buyProductIds}
                  onChange={(ids) => set(f.buyAppliesTo === "collections" ? { buyCollectionIds: ids } : { buyProductIds: ids })}
                />
              </div>

              <div className="my-4 border-t border-(--p-color-border-secondary)" />

              <h3 className="mb-1 text-[0.8125rem] font-semibold text-(--p-color-text)">Customer gets</h3>
              <p className="mb-2 text-[0.8125rem] text-(--p-color-text-secondary)">
                Customers must add the quantity of items specified below to their cart.
              </p>
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <div>
                  <span className={labelCls}>Quantity</span>
                  <NumberField label="Customer gets quantity" value={f.getQuantity} onChange={(v) => set({ getQuantity: v })} />
                </div>
                <div>
                  <span className={labelCls}>Any items from</span>
                  <SelectBox
                    label="Customer gets items from"
                    value={f.getAppliesTo}
                    onChange={(v) => set({ getAppliesTo: v })}
                    options={[...targetOptions].reverse()}
                  />
                </div>
              </div>
              <div className="mt-2">
                <TargetPicker
                  kind={f.getAppliesTo}
                  items={pickerItems(f.getAppliesTo)}
                  selected={f.getAppliesTo === "collections" ? f.getCollectionIds : f.getProductIds}
                  onChange={(ids) => set(f.getAppliesTo === "collections" ? { getCollectionIds: ids } : { getProductIds: ids })}
                />
              </div>

              <h3 className="mt-4 mb-1 text-[0.8125rem] font-semibold text-(--p-color-text)">At a discounted value</h3>
              <Radio checked={f.getValueType === "percentage"} onChange={() => set({ getValueType: "percentage" })}>
                Percentage
              </Radio>
              {f.getValueType === "percentage" ? (
                <NumberField
                  label="Percentage off"
                  className="ml-6 w-40"
                  suffix="%"
                  value={f.getDiscountPercent}
                  onChange={(v) => set({ getDiscountPercent: v })}
                />
              ) : null}
              <Radio checked={f.getValueType === "amount"} onChange={() => set({ getValueType: "amount" })}>
                Amount off each
              </Radio>
              {f.getValueType === "amount" ? (
                <NumberField
                  label="Amount off each"
                  className="ml-6 w-40"
                  prefix="₹"
                  step="0.01"
                  value={f.getAmountOff}
                  onChange={(v) => set({ getAmountOff: v })}
                />
              ) : null}
              <Radio checked={f.getValueType === "free"} onChange={() => set({ getValueType: "free" })}>
                Free
              </Radio>

              <div className="mt-3">
                <Check checked={!!f.limitUsesPerOrder} onChange={(v) => set({ limitUsesPerOrder: v })}>
                  Set a maximum number of uses per order
                </Check>
                {f.limitUsesPerOrder ? (
                  <NumberField
                    label="Maximum uses per order"
                    className="ml-6 w-40"
                    value={f.maxUsesPerOrder}
                    onChange={(v) => set({ maxUsesPerOrder: v })}
                  />
                ) : null}
              </div>
            </Section>
          )}

          {/* Eligibility */}
          <Section title="Eligibility">
            <SelectBox
              label="Eligibility"
              value={f.eligibility}
              onChange={(v) => set({ eligibility: v })}
              options={[
                { value: "all", label: "All customers" },
                { value: "customers", label: "Specific customers" },
              ]}
            />
            {f.eligibility === "customers" ? (
              <CustomerPicker selected={f.customerIds} onChange={(ids) => set({ customerIds: ids })} />
            ) : null}
          </Section>

          {/* Minimum purchase requirements */}
          {!isBxgy ? (
            <Section title="Minimum purchase requirements">
              <Radio checked={f.minRequirement === "none"} onChange={() => set({ minRequirement: "none" })}>
                No minimum requirements
              </Radio>
              <Radio checked={f.minRequirement === "amount"} onChange={() => set({ minRequirement: "amount" })}>
                Minimum purchase amount (₹)
              </Radio>
              {f.minRequirement === "amount" ? (
                <div className="ml-6">
                  <NumberField
                    label="Minimum purchase amount"
                    className="w-40"
                    prefix="₹"
                    step="0.01"
                    value={f.minOrderAmount}
                    onChange={(v) => set({ minOrderAmount: v })}
                  />
                  {isProducts ? <p className={helpCls}>Applies only to selected {f.appliesTo}.</p> : null}
                </div>
              ) : null}
              <Radio checked={f.minRequirement === "quantity"} onChange={() => set({ minRequirement: "quantity" })}>
                Minimum quantity of items
              </Radio>
              {f.minRequirement === "quantity" ? (
                <div className="ml-6">
                  <NumberField
                    label="Minimum quantity of items"
                    className="w-40"
                    value={f.minQuantity}
                    onChange={(v) => set({ minQuantity: v })}
                  />
                  {isProducts ? <p className={helpCls}>Applies only to selected {f.appliesTo}.</p> : null}
                </div>
              ) : null}
            </Section>
          ) : null}

          {/* Maximum discount uses (Shopify has none for automatic discounts) */}
          {!isAutomatic ? (
          <Section title="Maximum discount uses">
            <Check checked={!!f.limitTotal} onChange={(v) => set({ limitTotal: v })}>
              Limit number of times this discount can be used in total
            </Check>
            {f.limitTotal ? (
              <NumberField
                label="Total uses"
                className="mb-1 ml-6 w-40"
                value={f.usageLimit}
                onChange={(v) => set({ usageLimit: v })}
              />
            ) : null}
            <Check checked={!!f.oncePerCustomer} onChange={(v) => set({ oncePerCustomer: v })}>
              Limit to one use per customer
            </Check>
          </Section>
          ) : null}

          {/* Combinations */}
          <Section title="Combinations">
            <p className="mb-1 text-[0.8125rem] text-(--p-color-text)">{KIND_TITLES[f.kind]} can be combined with:</p>
            {combinationOptions(f.kind).map((o) => (
              <Check key={o.key} checked={!!f[o.key]} onChange={(v) => set({ [o.key]: v })}>
                {o.label}
              </Check>
            ))}
            <p className={helpCls}>
              {combinationLine(f) === "Can't combine with other discounts"
                ? "This discount won't combine with other product, order, or shipping discounts in the customer's cart."
                : "Both discounts must allow the combination. When they can't combine, the customer gets the one that saves more."}
            </p>
          </Section>

          {/* Schedule */}
          <Section title="Schedule">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <span className={labelCls}>Start date</span>
                <input
                  type="date"
                  aria-label="Start date"
                  className={`${fieldCls} w-40`}
                  value={f.startDate}
                  onChange={(e) => set({ startDate: e.target.value })}
                />
              </div>
              <div>
                <span className={labelCls}>Start time (IST)</span>
                <input
                  type="time"
                  aria-label="Start time"
                  className={`${fieldCls} w-32`}
                  value={f.startTime}
                  onChange={(e) => set({ startTime: e.target.value })}
                />
              </div>
              {!f.hasEnd ? (
                <button type="button" className={softBtn} onClick={() => set({ hasEnd: true })}>
                  <Plus className="size-3.5" />
                  Set end date
                </button>
              ) : null}
            </div>
            {f.hasEnd ? (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div>
                  <span className={labelCls}>End date</span>
                  <input
                    type="date"
                    aria-label="End date"
                    className={`${fieldCls} w-40`}
                    value={f.endDate}
                    min={f.startDate}
                    onChange={(e) => set({ endDate: e.target.value })}
                  />
                </div>
                <div>
                  <span className={labelCls}>End time (IST)</span>
                  <input
                    type="time"
                    aria-label="End time"
                    className={`${fieldCls} w-32`}
                    value={f.endTime}
                    onChange={(e) => set({ endTime: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className={softBtn}
                  onClick={() => set({ hasEnd: false, endDate: "", endTime: "" })}
                >
                  Remove end date
                </button>
              </div>
            ) : null}
          </Section>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-(--p-color-border) pt-4">
            <div className="flex gap-2">
              {editingId ? (
                <>
                  <AdminHeaderButton
                    disabled={saving}
                    onClick={() => save({ status: f.status === "active" ? "inactive" : "active" })}
                  >
                    {f.status === "active" ? "Deactivate discount" : "Activate discount"}
                  </AdminHeaderButton>
                  <button
                    type="button"
                    onClick={() => handleDelete(editingId)}
                    className="inline-flex h-8 items-center rounded-lg px-3 text-[0.8125rem] font-medium text-(--p-color-text-critical-accent) hover:bg-(--p-color-badge-bg-fill-critical)"
                  >
                    Delete discount
                  </button>
                </>
              ) : null}
            </div>
            <div className="flex gap-2">
              <AdminHeaderButton onClick={backToList}>Discard</AdminHeaderButton>
              <AdminHeaderButton type="submit" variant="primary" disabled={saving}>
                {saving ? "Saving…" : "Save discount"}
              </AdminHeaderButton>
            </div>
          </div>
        </div>

        {/* Sidebar summary */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.07),0_0_0_1px_rgba(0,0,0,0.07)]">
            <p className="font-mono text-[0.875rem] font-semibold text-(--p-color-text)">
              {isAutomatic ? (
                <span className="font-sans">{f.name || "No title yet"}</span>
              ) : heading ? (
                heading
              ) : (
                <span className="font-sans">No discount code yet</span>
              )}
            </p>
            <p className="text-[0.75rem] text-(--p-color-text-secondary)">{isAutomatic ? "Automatic discount" : "Code"}</p>

            <div className="my-3 border-t border-(--p-color-border-secondary)" />
            <p className="mb-1 text-[0.8125rem] font-semibold text-(--p-color-text)">Type</p>
            <p className="text-[0.8125rem] text-(--p-color-text)">{KIND_TITLES[f.kind]}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[0.8125rem] text-(--p-color-text)">
              <KindIcon className="size-3.5" />
              {KIND_CLASS[f.kind]}
            </p>

            <div className="my-3 border-t border-(--p-color-border-secondary)" />
            <p className="mb-1 text-[0.8125rem] font-semibold text-(--p-color-text)">Details</p>
            <ul className="list-disc space-y-1 pl-4 text-[0.8125rem] text-(--p-color-text)">
              {details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            <div className="my-3 border-t border-(--p-color-border-secondary)" />
            <p className="mb-1 text-[0.8125rem] font-semibold text-(--p-color-text)">Sales channel access</p>
            <Check checked={!!f.showOnProduct} onChange={(v) => set({ showOnProduct: v })}>
              Allow discount to be featured on selected channels
              <span className="block text-[0.75rem] text-(--p-color-text-secondary)">
                {isAutomatic
                  ? "Shows this discount under “Active offers” on the product pages it applies to."
                  : "Lists the code under “Active offers” on the product pages it applies to."}
              </span>
            </Check>
            {f.showOnProduct ? (
              <input
                className={`${fieldCls} mt-1`}
                maxLength={20}
                value={f.badge}
                onChange={(e) => set({ badge: e.target.value })}
                placeholder="Badge (optional), e.g. Most popular"
              />
            ) : null}

            <div className="my-3 border-t border-(--p-color-border-secondary)" />
            <p className="mb-1 text-[0.8125rem] font-semibold text-(--p-color-text)">Tags</p>
            <TagsInput tags={f.tags} onChange={(tags) => set({ tags })} />
          </div>
        </aside>
      </form>
    </AdminListLayout>
  );
}
