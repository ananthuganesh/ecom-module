"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { adminSettingsService, adminTaxClassService } from "@/api";

const inputClass =
  "w-full h-8 px-3 border border-border rounded-[6px] text-[13px] font-medium focus:outline-none focus:border-ring";

export default function TaxesSettingsPage() {
  const [taxSettings, setTaxSettings] = useState({
    country: "India",
    countryTaxRate: 9,
    regions: [],
    overrides: [],
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingBase, setSavingBase] = useState(false);
  const [openRegions, setOpenRegions] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ name: "", rate: "", isDefault: false, isActive: true });
  const [creating, setCreating] = useState(false);
  const [overrideDraft, setOverrideDraft] = useState({ name: "", rate: "" });
  const [showOverride, setShowOverride] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [settings, classes] = await Promise.all([
        adminSettingsService.getTaxSettings(),
        adminTaxClassService.getAll(),
      ]);
      setTaxSettings({
        country: settings.country || "India",
        countryTaxRate: Number(settings.countryTaxRate ?? 9),
        regions: Array.isArray(settings.regions) ? settings.regions : [],
        overrides: Array.isArray(settings.overrides) ? settings.overrides : [],
      });
      setRows(Array.isArray(classes) ? classes : []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load tax settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveBase = async () => {
    setSavingBase(true);
    try {
      const saved = await adminSettingsService.saveTaxSettings(taxSettings);
      setTaxSettings({
        country: saved.country || "India",
        countryTaxRate: Number(saved.countryTaxRate ?? 9),
        regions: Array.isArray(saved.regions) ? saved.regions : [],
        overrides: Array.isArray(saved.overrides) ? saved.overrides : [],
      });
      toast.success("Tax settings saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    } finally {
      setSavingBase(false);
    }
  };

  const updateRegion = (code, key, value) => {
    setTaxSettings((prev) => ({
      ...prev,
      regions: prev.regions.map((r) => (r.code === code ? { ...r, [key]: value } : r)),
    }));
  };

  const addOverride = () => {
    if (!overrideDraft.name.trim()) {
      toast.error("Override name is required");
      return;
    }
    const rate = Number(overrideDraft.rate);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      toast.error("Rate must be 0–100");
      return;
    }
    setTaxSettings((prev) => ({
      ...prev,
      overrides: [
        ...prev.overrides,
        { id: `ovr-${Date.now()}`, name: overrideDraft.name.trim(), rate },
      ],
    }));
    setOverrideDraft({ name: "", rate: "" });
    setShowOverride(false);
  };

  const removeOverride = (id) => {
    setTaxSettings((prev) => ({
      ...prev,
      overrides: prev.overrides.filter((o) => o.id !== id),
    }));
  };

  const startCreate = () => {
    setCreating(true);
    setEditingId(null);
    setDraft({ name: "", rate: "", isDefault: false, isActive: true });
  };

  const startEdit = (row) => {
    setCreating(false);
    setEditingId(row._id);
    setDraft({
      name: row.name || "",
      rate: String(row.rate ?? ""),
      isDefault: !!row.isDefault,
      isActive: row.isActive !== false,
    });
  };

  const cancel = () => {
    setCreating(false);
    setEditingId(null);
    setDraft({ name: "", rate: "", isDefault: false, isActive: true });
  };

  const saveClass = async () => {
    const payload = {
      name: draft.name.trim(),
      rate: Number(draft.rate),
      isDefault: !!draft.isDefault,
      isActive: !!draft.isActive,
    };
    if (!payload.name) {
      toast.error("Name is required");
      return;
    }
    if (Number.isNaN(payload.rate) || payload.rate < 0 || payload.rate > 100) {
      toast.error("Rate must be 0–100");
      return;
    }
    try {
      if (creating) {
        await adminTaxClassService.create(payload);
        toast.success("Tax class created");
      } else if (editingId) {
        await adminTaxClassService.update(editingId, payload);
        toast.success("Tax class updated");
      }
      cancel();
      const classes = await adminTaxClassService.getAll();
      setRows(Array.isArray(classes) ? classes : []);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Save failed";
      toast.error(typeof msg === "string" ? msg : "Save failed");
    }
  };

  const removeClass = async (id) => {
    if (!window.confirm("Delete this tax class?")) return;
    try {
      await adminTaxClassService.delete(id);
      toast.success("Tax class deleted");
      const classes = await adminTaxClassService.getAll();
      setRows(Array.isArray(classes) ? classes : []);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Delete failed";
      toast.error(typeof msg === "string" ? msg : "Delete failed");
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
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">Taxes and duties</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Base country rates, state regions, and product tax classes</p>
        </div>
        <button
          type="button"
          onClick={saveBase}
          disabled={savingBase}
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] bg-primary text-primary-foreground text-[13px] font-medium cursor-pointer disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {savingBase ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="space-y-4">
        <section className="rounded-xl border border-border bg-card p-5 text-card-foreground space-y-4">
          <div>
            <h2 className="text-[14px] font-medium text-foreground">Base taxes</h2>
            <p className="text-[13px] text-muted-foreground mt-1">Regions</p>
          </div>

          <div className="rounded-[6px] border border-border px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-foreground">{taxSettings.country}</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">Country tax rate</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                className="w-20 h-8 px-3 border border-border rounded-[6px] text-[13px] font-medium text-right focus:outline-none"
                value={taxSettings.countryTaxRate}
                onChange={(e) =>
                  setTaxSettings((prev) => ({
                    ...prev,
                    countryTaxRate: e.target.value === "" ? "" : Number(e.target.value),
                  }))
                }
              />
              <span className="text-[13px] font-medium text-muted-foreground">%</span>
            </div>
          </div>

          <div className="space-y-1">
            {taxSettings.regions.map((region) => {
              const open = !!openRegions[region.code];
              return (
                <div key={region.code} className="rounded-[6px] border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenRegions((prev) => ({ ...prev, [region.code]: !prev[region.code] }))
                    }
                    className="w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left cursor-pointer hover:bg-muted/80"
                  >
                    <span className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground">
                      {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                      {region.name}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {region.taxName || "IGST"} · {region.rate}%
                    </span>
                  </button>
                  {open ? (
                    <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-border pt-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">{region.name} tax rate</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            className={inputClass}
                            value={region.rate ?? ""}
                            onChange={(e) =>
                              updateRegion(
                                region.code,
                                "rate",
                                e.target.value === "" ? "" : Number(e.target.value)
                              )
                            }
                          />
                          <span className="text-[13px] text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">{region.name} tax name</label>
                        <input
                          className={inputClass}
                          value={region.taxName || ""}
                          onChange={(e) => updateRegion(region.code, "taxName", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">{region.name} tax type</label>
                        <select
                          className={inputClass}
                          value={region.taxType || "igst"}
                          onChange={(e) => updateRegion(region.code, "taxType", e.target.value)}
                        >
                          <option value="igst">IGST</option>
                          <option value="cgst_sgst">CGST + SGST</option>
                          <option value="exempt">Exempt</option>
                        </select>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card text-card-foreground p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-medium text-foreground">Tax rates and exemptions</h2>
              <p className="text-[13px] text-muted-foreground mt-1">Tax overrides</p>
            </div>
            <button
              type="button"
              onClick={() => setShowOverride(true)}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-foreground cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add override
            </button>
          </div>

          {showOverride ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className={inputClass}
                placeholder="Override name"
                value={overrideDraft.name}
                onChange={(e) => setOverrideDraft((d) => ({ ...d, name: e.target.value }))}
              />
              <input
                className={inputClass}
                type="number"
                min={0}
                max={100}
                step="0.01"
                placeholder="Rate %"
                value={overrideDraft.rate}
                onChange={(e) => setOverrideDraft((d) => ({ ...d, rate: e.target.value }))}
              />
              <button
                type="button"
                onClick={addOverride}
                className="h-8 px-3.5 rounded-[6px] bg-primary text-primary-foreground text-[13px] font-medium cursor-pointer"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowOverride(false)}
                className="h-8 px-3.5 rounded-[6px] border border-border text-[13px] font-medium cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : null}

          {taxSettings.overrides.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No overrides yet</p>
          ) : (
            <div className="space-y-1">
              {taxSettings.overrides.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between px-3 py-2 rounded-[6px] border border-border"
                >
                  <span className="text-[13px] font-medium text-foreground">
                    {o.name} · {o.rate}%
                  </span>
                  <button
                    type="button"
                    onClick={() => removeOverride(o.id)}
                    className="p-1.5 text-muted-foreground hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
          <div className="px-5 py-4 flex items-start justify-between gap-3 border-b border-border">
            <div>
              <h2 className="text-[14px] font-medium text-foreground">Product tax classes</h2>
              <p className="text-[13px] text-muted-foreground mt-1">GST slabs used on products and invoices</p>
            </div>
            {!creating && !editingId ? (
              <button
                type="button"
                onClick={startCreate}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] bg-primary text-primary-foreground text-[13px] font-medium cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add tax class
              </button>
            ) : null}
          </div>

          {(creating || editingId) && (
            <div className="px-5 py-4 space-y-3 border-b border-border">
              <p className="text-[13px] font-medium text-foreground">
                {creating ? "New tax class" : "Edit tax class"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  className={inputClass}
                  placeholder="Name (e.g. GST 18%)"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  placeholder="Rate %"
                  value={draft.rate}
                  onChange={(e) => setDraft((d) => ({ ...d, rate: e.target.value }))}
                />
                <label className="inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={draft.isDefault}
                    onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))}
                  />
                  Default
                </label>
                <label className="inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                  />
                  Active
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveClass}
                  className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] bg-primary text-primary-foreground text-[13px] font-medium cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Save
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] border border-border text-[13px] font-medium cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </div>
            </div>
          )}

          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-2.5 text-[13px] font-medium text-muted-foreground">Name</th>
                <th className="px-5 py-2.5 text-[13px] font-medium text-muted-foreground">Rate</th>
                <th className="px-5 py-2.5 text-[13px] font-medium text-muted-foreground">Flags</th>
                <th className="px-5 py-2.5 text-[13px] font-medium text-muted-foreground w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="border-b border-border hover:bg-muted/80">
                  <td className="px-5 py-2.5 text-[13px] font-medium text-foreground">{row.name}</td>
                  <td className="px-5 py-2.5 text-[13px] font-medium text-muted-foreground">{row.rate}%</td>
                  <td className="px-5 py-2.5 text-[13px] font-medium text-muted-foreground">
                    {row.isDefault ? "Default" : ""}
                    {row.isDefault && row.isActive === false ? " · " : ""}
                    {row.isActive === false ? "Inactive" : ""}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="p-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeClass(row._id)}
                      className="p-1.5 text-muted-foreground hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-[13px] text-muted-foreground">
                    No tax classes yet
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
