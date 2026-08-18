"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, MapPin } from "lucide-react";
import { toast } from "sonner";
import { adminCompanyProfileService } from "@/api";
import { useProductSaveBarStore } from "@/store/useProductSaveBarStore";
import AdminTopSheet from "@/components/admin/AdminTopSheet";
import { SettingsStore } from "@/components/admin/LocalIcons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const INDIA_STATES = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
];

const empty = {
  legalName: "",
  tradeName: "",
  gstin: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  stateName: "",
  stateCode: "",
  pincode: "",
  country: "India",
  currency: "INR",
  defaultPriceTaxMode: "inclusive",
  orderPrefix: "#",
  orderSuffix: "",
};

const FORM_KEYS = Object.keys(empty);

function normalizeForm(data) {
  const next = { ...empty, ...data };
  for (const key of FORM_KEYS) {
    next[key] = next[key] == null ? empty[key] : next[key];
  }
  return next;
}

function formSignature(form) {
  return JSON.stringify(FORM_KEYS.map((key) => form?.[key] ?? ""));
}

const inputClass =
  "w-full h-10 px-3 bg-card border border-border text-[13px] font-medium focus:outline-none focus:border-ring transition-colors rounded-[6px]";
const textareaClass =
  "w-full min-h-[88px] px-3 py-2 bg-card border border-border text-[13px] font-medium focus:outline-none focus:border-ring transition-colors rounded-[6px] resize-y";
const labelClass = "text-[13px] font-medium text-muted-foreground";

const TITLE_MAX = 70;
const DESC_MAX = 160;

function Section({ title, children }) {
  return (
    <section className="admin-surface space-y-4 rounded-xl bg-card p-5 text-card-foreground">
      <h2 className="admin-card-heading">{title}</h2>
      {children}
    </section>
  );
}

function ImageField({ label, hint, preview, dark, wide, onPick, onClear }) {
  const inputRef = useRef(null);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className={labelClass}>{label}</label>
        {preview ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[12px] font-[550] text-[#005bd3] hover:underline"
          >
            Remove
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex w-full items-center justify-center overflow-hidden rounded-[6px] border border-dashed border-[#c9cccf]",
          wide ? "h-36" : "h-28",
          dark ? "bg-[#1a1a1a] hover:bg-[#222]" : "bg-[#fafafa] hover:bg-[#f7f7f7]"
        )}
      >
        {preview ? (
          <img src={preview} alt="" className="max-h-full max-w-[90%] object-contain" />
        ) : (
          <span className={cn("text-[13px]", dark ? "text-[#b0b0b0]" : "text-muted-foreground")}>
            Upload
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
      {hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function GeneralSettingsPage() {
  const [form, setForm] = useState(empty);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openSheet, setOpenSheet] = useState(null);
  const [brand, setBrand] = useState({
    logo: "",
    logoDark: "",
    favicon: "",
    ogImage: "",
    metaTitle: "",
    metaDescription: "",
  });

  const showSaveBar = useProductSaveBarStore((s) => s.show);
  const hideSaveBar = useProductSaveBarStore((s) => s.hide);
  const setSaveBarSaving = useProductSaveBarStore((s) => s.setSaving);
  const saveHandlerRef = useRef(null);
  const discardHandlerRef = useRef(null);

  const dirty = useMemo(() => {
    if (!snapshot) return false;
    return formSignature(form) !== formSignature(snapshot);
  }, [form, snapshot]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await adminCompanyProfileService.get();
        if (!mounted) return;
        const next = normalizeForm(data);
        setForm(next);
        setSnapshot(next);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load store settings");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const setBrandImage = (key, file) => {
    setBrand((prev) => {
      if (typeof prev[key] === "string" && prev[key].startsWith("blob:")) {
        URL.revokeObjectURL(prev[key]);
      }
      return { ...prev, [key]: file ? URL.createObjectURL(file) : "" };
    });
  };

  const onStateChange = (code) => {
    const match = INDIA_STATES.find((s) => s.code === code);
    setForm((prev) => ({
      ...prev,
      stateCode: code,
      stateName: match?.name || prev.stateName,
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = normalizeForm(await adminCompanyProfileService.save(form));
      setForm(saved);
      setSnapshot(saved);
      toast.success("Settings saved");
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || "Save failed";
      toast.error(typeof msg === "string" ? msg : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (!snapshot) return;
    setForm({ ...snapshot });
  };

  saveHandlerRef.current = () => {
    void save();
  };
  discardHandlerRef.current = () => {
    discard();
  };

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return undefined;
    const onDocumentClick = (event) => {
      const anchor = event.target?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      if (/^https?:\/\//i.test(href) && !href.startsWith(window.location.origin)) {
        return;
      }
      const url = new URL(href, window.location.origin);
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      if (!window.confirm("You have unsaved changes. Leave without saving?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) {
      hideSaveBar();
      return undefined;
    }
    showSaveBar({
      saving,
      onSave: () => saveHandlerRef.current?.(),
      onDiscard: () => discardHandlerRef.current?.(),
    });
    return () => hideSaveBar();
  }, [dirty, saving, hideSaveBar, showSaveBar]);

  useEffect(() => {
    setSaveBarSaving(saving);
  }, [saving, setSaveBarSaving]);

  const storeName = form.tradeName || form.legalName || "My Store";
  const contactLine = [form.email, form.phone].filter(Boolean).join(" · ") || "Add email and phone";
  const addressLine = [
    form.addressLine1,
    form.addressLine2,
    [form.city, form.pincode].filter(Boolean).join(" "),
    [form.stateName, form.country].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
          General
        </h1>
      </div>

      <div className="space-y-4">
        <section className="admin-surface rounded-xl bg-card p-5 text-card-foreground">
          <h2 className="admin-card-heading">
            Store contact details
          </h2>
          <div className="mt-4 overflow-hidden rounded-lg border border-[#ebebeb]">
            <button
              type="button"
              onClick={() => setOpenSheet("contact")}
              className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-[#f7f7f7]"
            >
              <SettingsStore className="mt-0.5 size-5 shrink-0 text-[#4a4a4a]" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-[550] leading-5 text-[#303030]">
                  {storeName}
                </span>
                <span className="mt-0.5 block text-[13px] font-[450] leading-5 text-[#616161]">
                  {contactLine}
                </span>
              </span>
              <ChevronRight className="mt-1 size-4 shrink-0 text-[#8a8a8a]" aria-hidden />
            </button>
            <div className="border-t border-[#ebebeb]" />
            <button
              type="button"
              onClick={() => setOpenSheet("address")}
              className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-[#f7f7f7]"
            >
              <MapPin className="mt-0.5 size-5 shrink-0 text-[#4a4a4a]" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-[550] leading-5 text-[#303030]">
                  Store address
                </span>
                <span className="mt-0.5 block text-[13px] font-[450] leading-5 text-[#616161]">
                  {addressLine || "Add your store address"}
                </span>
              </span>
              <ChevronRight className="mt-1 size-4 shrink-0 text-[#8a8a8a]" aria-hidden />
            </button>
          </div>
        </section>

        <Section title="Brand">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ImageField
              label="Logo"
              hint="PNG or SVG, light backgrounds"
              preview={brand.logo}
              onPick={(file) => setBrandImage("logo", file)}
              onClear={() => setBrandImage("logo", null)}
            />
            <ImageField
              label="Logo dark"
              hint="PNG or SVG, dark backgrounds"
              dark
              preview={brand.logoDark}
              onPick={(file) => setBrandImage("logoDark", file)}
              onClear={() => setBrandImage("logoDark", null)}
            />
            <ImageField
              label="Favicon"
              hint="Square PNG, 32×32 or 512×512"
              preview={brand.favicon}
              onPick={(file) => setBrandImage("favicon", file)}
              onClear={() => setBrandImage("favicon", null)}
            />
          </div>
          <ImageField
            label="OG image"
            hint="1200×630 recommended"
            wide
            preview={brand.ogImage}
            onPick={(file) => setBrandImage("ogImage", file)}
            onClear={() => setBrandImage("ogImage", null)}
          />
        </Section>

        <Section title="Search engine listing">
          <div className="space-y-1.5">
            <label className={labelClass}>Meta title</label>
            <input
              className={inputClass}
              value={brand.metaTitle}
              maxLength={TITLE_MAX}
              onChange={(e) => setBrand((prev) => ({ ...prev, metaTitle: e.target.value }))}
              placeholder={storeName}
              disabled={saving}
            />
            <p className="flex justify-between text-[12px] text-muted-foreground">
              <span>Recommended: 50–60 characters</span>
              <span className="tabular-nums">
                {brand.metaTitle.length}/{TITLE_MAX}
              </span>
            </p>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Meta description</label>
            <textarea
              className={textareaClass}
              value={brand.metaDescription}
              maxLength={DESC_MAX}
              onChange={(e) =>
                setBrand((prev) => ({ ...prev, metaDescription: e.target.value }))
              }
              placeholder="Short description for search and social"
              disabled={saving}
            />
            <p className="flex justify-between text-[12px] text-muted-foreground">
              <span>Recommended: 150–160 characters</span>
              <span className="tabular-nums">
                {brand.metaDescription.length}/{DESC_MAX}
              </span>
            </p>
          </div>
        </Section>

        <Section title="Order ID format">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className={labelClass}>Prefix</label>
              <input
                className={inputClass}
                value={form.orderPrefix}
                onChange={(e) => setField("orderPrefix", e.target.value)}
                placeholder="#"
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Suffix</label>
              <input
                className={inputClass}
                value={form.orderSuffix}
                onChange={(e) => setField("orderSuffix", e.target.value)}
                placeholder="Optional"
                disabled={saving}
              />
            </div>
          </div>
          <p className="text-[13px] text-muted-foreground">
            Preview:{" "}
            <span className="font-medium text-foreground">
              {form.orderPrefix || ""}
              1001
              {form.orderSuffix || ""}
            </span>
          </p>
        </Section>
      </div>

      <AdminTopSheet
        open={openSheet === "contact"}
        onClose={() => setOpenSheet(null)}
        footer={
          <Button
            type="button"
            size="lg"
            onClick={() => setOpenSheet(null)}
            className="h-8"
          >
            Done
          </Button>
        }
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-medium text-foreground">Store contact details</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className={labelClass}>Store name</label>
            <input
              className={inputClass}
              value={form.tradeName}
              onChange={(e) => setField("tradeName", e.target.value)}
              placeholder="My Store"
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Email</label>
            <input
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Phone</label>
            <input
              className={inputClass}
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Legal name</label>
            <input
              className={inputClass}
              value={form.legalName}
              onChange={(e) => setField("legalName", e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>GSTIN</label>
            <input
              className={inputClass}
              value={form.gstin}
              onChange={(e) => setField("gstin", e.target.value.toUpperCase())}
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
              disabled={saving}
            />
          </div>
        </div>
      </AdminTopSheet>

      <AdminTopSheet
        open={openSheet === "address"}
        onClose={() => setOpenSheet(null)}
        footer={
          <Button
            type="button"
            size="lg"
            onClick={() => setOpenSheet(null)}
            className="h-8"
          >
            Done
          </Button>
        }
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-medium text-foreground">Store address</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className={labelClass}>Address line 1</label>
            <input
              className={inputClass}
              value={form.addressLine1}
              onChange={(e) => setField("addressLine1", e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className={labelClass}>Address line 2</label>
            <input
              className={inputClass}
              value={form.addressLine2}
              onChange={(e) => setField("addressLine2", e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>City</label>
            <input
              className={inputClass}
              value={form.city}
              onChange={(e) => setField("city", e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Pincode</label>
            <input
              className={inputClass}
              value={form.pincode}
              onChange={(e) => setField("pincode", e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>State</label>
            <select
              className={inputClass}
              value={form.stateCode}
              onChange={(e) => onStateChange(e.target.value)}
              disabled={saving}
            >
              <option value="">Select state</option>
              {INDIA_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Country</label>
            <input
              className={inputClass}
              value={form.country}
              onChange={(e) => setField("country", e.target.value)}
              disabled={saving}
            />
          </div>
        </div>
      </AdminTopSheet>
    </div>
  );
}
