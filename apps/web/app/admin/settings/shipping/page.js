"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminSettingsService } from "@/api";

const inputClass =
  "w-full h-8 px-3 bg-card border border-border text-[13px] font-medium focus:outline-none focus:border-ring rounded-[6px]";

function Section({ title, description, action, children }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 text-card-foreground space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
          {description ? <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function ShippingSettingsPage() {
  const [form, setForm] = useState({
    estimatedDeliveryEnabled: false,
    codFee: 0,
    profiles: [],
    packages: [],
    carrierAccounts: [],
  });
  const [dtdc, setDtdc] = useState({
    apiKey: "",
    customerCode: "",
    serviceTypeId: "B2C PRIORITY",
    loadType: "NON-DOCUMENT",
    useOrderIdAsReference: false,
    hasApiKey: false,
    isConnected: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingDtdc, setSavingDtdc] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [data, dtdcData] = await Promise.all([
          adminSettingsService.getShippingSettings(),
          adminSettingsService.getDtdcSettings().catch(() => null),
        ]);
        if (!mounted) return;
        setForm({
          estimatedDeliveryEnabled: !!data.estimatedDeliveryEnabled,
          codFee: Number(data.codFee || 0),
          profiles: Array.isArray(data.profiles) ? data.profiles : [],
          packages: Array.isArray(data.packages) ? data.packages : [],
          carrierAccounts: Array.isArray(data.carrierAccounts) ? data.carrierAccounts : [],
        });
        if (dtdcData) {
          setDtdc((prev) => ({ ...prev, ...dtdcData, apiKey: "" }));
        }
      } catch (err) {
        console.error(err);
        toast.error("Failed to load shipping settings");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await adminSettingsService.saveShippingSettings(form);
      setForm({
        estimatedDeliveryEnabled: !!saved.estimatedDeliveryEnabled,
        codFee: Number(saved.codFee || 0),
        profiles: Array.isArray(saved.profiles) ? saved.profiles : [],
        packages: Array.isArray(saved.packages) ? saved.packages : [],
        carrierAccounts: Array.isArray(saved.carrierAccounts) ? saved.carrierAccounts : [],
      });
      toast.success("Shipping settings saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveDtdc = async () => {
    setSavingDtdc(true);
    try {
      const saved = await adminSettingsService.saveDtdcSettings({
        apiKey: dtdc.apiKey,
        customerCode: dtdc.customerCode,
        serviceTypeId: "B2C PRIORITY",
        loadType: dtdc.loadType,
        useOrderIdAsReference: dtdc.useOrderIdAsReference,
      });
      setDtdc((prev) => ({ ...prev, ...saved, apiKey: "" }));
      toast.success("DTDC settings saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save DTDC settings");
    } finally {
      setSavingDtdc(false);
    }
  };

  const addProfile = () => {
    setForm((prev) => ({
      ...prev,
      profiles: [
        ...prev.profiles,
        {
          id: `profile-${Date.now()}`,
          name: "Custom profile",
          isDefault: false,
          appliesTo: "selected_products",
          zones: [{ name: "India", countries: ["India"], rate: 49, rateType: "flat" }],
        },
      ],
    }));
  };

  const addPackage = () => {
    setForm((prev) => ({
      ...prev,
      packages: [
        ...prev.packages,
        {
          id: `box-${Date.now()}`,
          name: "New box",
          lengthCm: 30,
          widthCm: 20,
          heightCm: 10,
          weightKg: 0.5,
        },
      ],
    }));
  };

  const updatePackage = (id, key, value) => {
    setForm((prev) => ({
      ...prev,
      packages: prev.packages.map((p) => (p.id === id ? { ...p, [key]: value } : p)),
    }));
  };

  const removePackage = (id) => {
    setForm((prev) => ({ ...prev, packages: prev.packages.filter((p) => p.id !== id) }));
  };

  const updateProfileName = (id, name) => {
    setForm((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) => (p.id === id ? { ...p, name } : p)),
    }));
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
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">Shipping and delivery</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Manage where you ship, rates, packages, and carriers</p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] bg-primary text-primary-foreground text-[13px] font-medium cursor-pointer disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="space-y-4">
        <Section
          title="Shipping profiles"
          description="Manage where you ship and rates for products"
          action={
            <button
              type="button"
              onClick={addProfile}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-foreground cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add custom profile
            </button>
          }
        >
          <p className="text-[12px] text-muted-foreground">{form.profiles.length} profile{form.profiles.length === 1 ? "" : "s"}</p>
          <div className="space-y-2">
            {form.profiles.map((profile) => (
              <div
                key={profile.id}
                className="rounded-[6px] border border-border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <input
                    className="text-[13px] font-medium text-foreground bg-transparent border-0 p-0 focus:outline-none w-full"
                    value={profile.name || ""}
                    onChange={(e) => updateProfileName(profile.id, e.target.value)}
                  />
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {profile.isDefault ? "Store default · " : ""}
                    {profile.appliesTo === "all_products" ? "All products" : "Selected products"}
                    {" · "}
                    {(profile.zones || []).length} zone{(profile.zones || []).length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="text-[12px] text-muted-foreground shrink-0">
                  {(profile.zones || [])
                    .map((z) => `${z.name}: ₹${Number(z.rate || 0)}`)
                    .join(" · ") || "No zones"}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Estimated delivery dates"
          description="Show when orders are expected to arrive"
        >
          <label className="inline-flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              role="switch"
              aria-checked={form.estimatedDeliveryEnabled}
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  estimatedDeliveryEnabled: !prev.estimatedDeliveryEnabled,
                }))
              }
              className={`relative h-6 w-11 rounded-full transition-colors ${
                form.estimatedDeliveryEnabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-card transition-transform ${
                  form.estimatedDeliveryEnabled ? "translate-x-5" : ""
                }`}
              />
            </button>
            <span className="text-[13px] font-medium text-foreground">
              {form.estimatedDeliveryEnabled ? "On" : "Off"}
            </span>
          </label>
        </Section>

        <Section
          title="Packages"
          description="Set package sizes to get accurate shipping rates"
          action={
            <button
              type="button"
              onClick={addPackage}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-foreground cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add package
            </button>
          }
        >
          <p className="text-[12px] text-muted-foreground">
            {form.packages.length} box{form.packages.length === 1 ? "" : "es"}
          </p>
          <div className="space-y-3">
            {form.packages.map((pkg) => (
              <div key={pkg.id} className="rounded-[6px] border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    value={pkg.name || ""}
                    onChange={(e) => updatePackage(pkg.id, "name", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removePackage(pkg.id)}
                    className="p-2 text-muted-foreground hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    ["lengthCm", "L (cm)"],
                    ["widthCm", "W (cm)"],
                    ["heightCm", "H (cm)"],
                    ["weightKg", "Weight (kg)"],
                  ].map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={inputClass}
                        value={pkg[key] ?? ""}
                        onChange={(e) =>
                          updatePackage(pkg.id, key, e.target.value === "" ? "" : Number(e.target.value))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="DTDC (Shipsy)"
          description="API credentials for create, track, label, and cancel. Pickup address comes from company profile + default warehouse."
          action={
            <button
              type="button"
              onClick={saveDtdc}
              disabled={savingDtdc}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] bg-primary text-primary-foreground text-[13px] font-medium cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {savingDtdc ? "Saving…" : "Save DTDC"}
            </button>
          }
        >
          <p className="text-[12px] text-muted-foreground">
            {dtdc.isConnected ? "Connected" : "Not connected"}
            {dtdc.hasApiKey ? " · API key stored" : ""}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] font-medium text-muted-foreground">API key</label>
              <input
                type="password"
                className={inputClass}
                placeholder={dtdc.hasApiKey ? "•••••••• (leave blank to keep)" : "Customer API key"}
                value={dtdc.apiKey}
                onChange={(e) => setDtdc((prev) => ({ ...prev, apiKey: e.target.value }))}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Customer code</label>
              <input
                className={inputClass}
                value={dtdc.customerCode}
                onChange={(e) => setDtdc((prev) => ({ ...prev, customerCode: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] font-medium text-muted-foreground">Service type fallback</label>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Bookings try <span className="font-medium text-foreground">B2C PRIORITY</span> first,
                then <span className="font-medium text-foreground">B2C SMART EXPRESS</span> if Priority
                is not available for the pincode pair. The winning type is saved on the order.
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Load type</label>
              <select
                className={inputClass}
                value={dtdc.loadType}
                onChange={(e) => setDtdc((prev) => ({ ...prev, loadType: e.target.value }))}
              >
                <option value="NON-DOCUMENT">NON-DOCUMENT</option>
                <option value="DOCUMENT">DOCUMENT</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-[13px] font-medium text-foreground sm:col-span-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!dtdc.useOrderIdAsReference}
                onChange={(e) =>
                  setDtdc((prev) => ({ ...prev, useOrderIdAsReference: e.target.checked }))
                }
              />
              Use order ID as DTDC reference number
            </label>
          </div>
        </Section>

        <Section
          title="Carrier notes"
          description="Shiprocket auto-create is disabled. Create consignments from the order page."
        >
          <p className="text-[13px] text-muted-foreground">
            After payment, orders are marked Awaiting Shipment until you create a DTDC consignment.
          </p>
        </Section>
      </div>
    </div>
  );
}
