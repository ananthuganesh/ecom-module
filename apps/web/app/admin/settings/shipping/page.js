"use client";

import { useEffect, useState } from "react";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { adminSettingsService } from "@/api";

function Section({ title, action, children }) {
  return (
    <section className="admin-surface space-y-4 rounded-xl bg-card p-5 text-card-foreground">
      <div className="flex items-start justify-between gap-3">
        <h2 className="admin-card-heading">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function ShippingSettingsPage() {
  const [profiles, setProfiles] = useState([]);
  const [preserved, setPreserved] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await adminSettingsService.getShippingSettings();
        if (!mounted) return;
        setProfiles(Array.isArray(data.profiles) ? data.profiles : []);
        setPreserved({
          estimatedDeliveryEnabled: !!data.estimatedDeliveryEnabled,
          packages: Array.isArray(data.packages) ? data.packages : [],
        });
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
      const saved = await adminSettingsService.saveShippingSettings({
        ...preserved,
        profiles,
      });
      setProfiles(Array.isArray(saved.profiles) ? saved.profiles : []);
      setPreserved({
        estimatedDeliveryEnabled: !!saved.estimatedDeliveryEnabled,
        packages: Array.isArray(saved.packages) ? saved.packages : [],
      });
      toast.success("Shipping settings saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const addProfile = () => {
    setProfiles((prev) => [
      ...prev,
      {
        id: `profile-${Date.now()}`,
        name: "Custom profile",
        isDefault: false,
        appliesTo: "selected_products",
        zones: [{ name: "India", countries: ["India"], rate: 49, rateType: "flat" }],
      },
    ]);
  };

  const updateProfileName = (id, name) => {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
            Shipping
          </h1>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[6px] bg-primary px-3.5 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <Section
        title="Shipping profiles"
        action={
          <button
            type="button"
            onClick={addProfile}
            className="inline-flex cursor-pointer items-center gap-1 text-[13px] font-medium text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Add custom profile
          </button>
        }
      >
        <p className="text-[12px] text-muted-foreground">
          {profiles.length} profile{profiles.length === 1 ? "" : "s"}
        </p>
        <div className="space-y-2">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex flex-col justify-between gap-2 rounded-[6px] border border-border px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <input
                  className="w-full border-0 bg-transparent p-0 text-[13px] font-medium text-foreground focus:outline-none"
                  value={profile.name || ""}
                  onChange={(e) => updateProfileName(profile.id, e.target.value)}
                />
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {profile.isDefault ? "Store default · " : ""}
                  {profile.appliesTo === "all_products" ? "All products" : "Selected products"}
                  {" · "}
                  {(profile.zones || []).length} zone
                  {(profile.zones || []).length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="shrink-0 text-[12px] text-muted-foreground">
                {(profile.zones || [])
                  .map((z) => `${z.name}: ₹${Number(z.rate || 0)}`)
                  .join(" · ") || "No zones"}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
