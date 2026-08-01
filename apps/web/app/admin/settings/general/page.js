"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { adminCompanyProfileService } from "@/api";
import { useProductSaveBarStore } from "@/store/useProductSaveBarStore";

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
const labelClass = "text-[13px] font-medium text-muted-foreground";

function Section({ title, description, children }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 text-card-foreground space-y-4">
      <div>
        <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function GeneralSettingsPage() {
  const [form, setForm] = useState(empty);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
        <p className="mt-0.5 text-sm text-muted-foreground">
          Store identity, contact details, and order numbering
        </p>
      </div>

      <div className="space-y-4">
        <Section
          title="Order ID format"
          description="Used on orders, customer pages, and order emails."
        >
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

        <Section title="Store contact details">
          <div className="mb-1 rounded-[6px] border border-border bg-muted/80 px-4 py-3">
            <p className="text-[13px] font-medium text-foreground">{storeName}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{contactLine}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Leave blank for simple order invoices. Enter GSTIN to enable GST tax invoices
                (CGST/SGST/IGST) on every order.
              </p>
            </div>
          </div>
        </Section>

        <Section title="Store address">
          <div className="mb-1 rounded-[6px] border border-border bg-muted/80 px-4 py-3">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {addressLine || "Add your store address"}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        </Section>
      </div>
    </div>
  );
}
