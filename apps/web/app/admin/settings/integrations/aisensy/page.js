"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { adminAisensyService } from "@/api";
import { Switch } from "@/components/ui/switch";
import { useProductSaveBarStore } from "@/store/useProductSaveBarStore";

const EVENT_ROWS = [
  {
    key: "abandoned",
    label: "Abandoned cart",
    description: "Name, amount, item count, cart link",
  },
  {
    key: "orderPlaced",
    label: "Order placed",
    description: "Name, order number, amount",
  },
  {
    key: "orderPaid",
    label: "Order paid",
    description: "Name, order number, amount",
  },
  {
    key: "orderShipped",
    label: "Order shipped",
    description: "Name, order number, AWB",
  },
  {
    key: "orderDelivered",
    label: "Order delivered",
    description: "Name, order number",
  },
];

const emptyCampaigns = () =>
  Object.fromEntries(EVENT_ROWS.map((r) => [r.key, ""]));
const emptyEnabled = () =>
  Object.fromEntries(EVENT_ROWS.map((r) => [r.key, true]));

function editableSlice(data) {
  return {
    siteUrl: data.siteUrl || "",
    abandonedMinutes: data.abandonedMinutes ?? 15,
    messagingEnabled: data.messagingEnabled !== false,
    campaigns: { ...emptyCampaigns(), ...(data.campaigns || {}) },
    enabled: { ...emptyEnabled(), ...(data.enabled || {}) },
  };
}

function isDirty(current, snapshot) {
  if (!snapshot) return false;
  return EVENT_ROWS.some(
    (row) =>
      !!current.enabled?.[row.key] !== !!snapshot.enabled?.[row.key] ||
      String(current.campaigns?.[row.key] || "") !== String(snapshot.campaigns?.[row.key] || "")
  );
}

export default function AisensySettingsPage() {
  const [settings, setSettings] = useState({
    ...editableSlice({}),
    isConnected: false,
    hasApiKey: false,
    hasProjectApiKey: false,
    hasProjectId: false,
    projectConfigured: false,
    catalogId: "",
    lastSyncedAt: null,
    lastSyncCount: null,
    lastCatalogSyncedAt: null,
    lastCatalogSyncCount: null,
    lastCatalogError: null,
    lastError: null,
  });
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);

  const showSaveBar = useProductSaveBarStore((s) => s.show);
  const hideSaveBar = useProductSaveBarStore((s) => s.hide);
  const setSaveBarSaving = useProductSaveBarStore((s) => s.setSaving);
  const saveHandlerRef = useRef(null);
  const discardHandlerRef = useRef(null);

  const dirty = useMemo(() => isDirty(settings, snapshot), [settings, snapshot]);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminAisensyService.getSettings();
        setSettings((prev) => ({
          ...prev,
          ...data,
          ...editableSlice(data),
        }));
        setSnapshot(editableSlice(data));
      } catch {
        toast.error("Failed to load AiSensy settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const data = await adminAisensyService.saveSettings({
        siteUrl: settings.siteUrl,
        abandonedMinutes: settings.abandonedMinutes,
        messagingEnabled: settings.messagingEnabled,
        campaigns: settings.campaigns,
        enabled: settings.enabled,
      });
      const next = {
        ...settings,
        ...data,
        ...editableSlice(data),
      };
      setSettings(next);
      setSnapshot(editableSlice(next));
      toast.success("AiSensy preferences saved");
    } catch (error) {
      const msg =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        "Failed to save AiSensy settings";
      toast.error(typeof msg === "string" ? msg : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (!snapshot) return;
    setSettings((prev) => ({
      ...prev,
      ...editableSlice(snapshot),
    }));
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

  const handleSync = async () => {
    setSyncing(true);
    try {
      const data = await adminAisensyService.syncCustomers();
      setSettings((prev) => ({ ...prev, ...data }));
      toast.success(
        `Synced ${data.imported || 0} contacts${data.errors ? ` · ${data.errors} failed` : ""}`
      );
    } catch (error) {
      const msg =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        "Contact sync failed";
      toast.error(typeof msg === "string" ? msg : "Contact sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncCatalog = async () => {
    setSyncingCatalog(true);
    try {
      const data = await adminAisensyService.syncCatalog();
      setSettings((prev) => ({ ...prev, ...data }));
      if (data.ok === false) {
        toast.error(data.error || data.lastCatalogError || "Catalogue sync finished with errors");
      } else {
        toast.success(
          `Catalogue synced · ${data.created || 0} created${
            data.updated ? ` · ${data.updated} existing` : ""
          }${data.failed ? ` · ${data.failed} failed` : ""}`
        );
      }
    } catch (error) {
      const msg =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        "Catalogue sync failed";
      toast.error(typeof msg === "string" ? msg : "Catalogue sync failed");
    } finally {
      setSyncingCatalog(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
          Whatsapp API
        </h1>
      </div>

      <div className="space-y-4">
        <div className="admin-surface space-y-4 rounded-xl bg-card p-5 text-card-foreground">
          <h2 className="admin-card-heading">WhatsApp to Customer</h2>

          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {EVENT_ROWS.map((row) => (
              <div key={row.key} className="space-y-3 bg-card px-4 py-3.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground">{row.label}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{row.description}</p>
                  </div>
                  <Switch
                    checked={!!settings.enabled?.[row.key]}
                    disabled={saving}
                    onCheckedChange={(checked) =>
                      setSettings((prev) => ({
                        ...prev,
                        enabled: { ...prev.enabled, [row.key]: !!checked },
                      }))
                    }
                    aria-label={`Enable ${row.label} WhatsApp`}
                  />
                </div>
                <input
                  type="text"
                  value={settings.campaigns?.[row.key] || ""}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      campaigns: { ...prev.campaigns, [row.key]: e.target.value },
                    }))
                  }
                  placeholder="Exact AiSensy campaign name"
                  disabled={saving || !settings.enabled?.[row.key]}
                  className="h-9 w-full rounded-lg border-0 bg-zinc-100 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="admin-surface space-y-4 rounded-xl bg-card p-5 text-card-foreground">
          <h2 className="admin-card-heading">Sync</h2>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing || syncingCatalog || !settings.projectConfigured}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-50"
              title={
                settings.projectConfigured
                  ? "Sync customers"
                  : "Set AISENSY_PROJECT_ID and AISENSY_PROJECT_API_KEY to enable sync"
              }
            >
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Sync customers
            </button>
            <button
              type="button"
              onClick={handleSyncCatalog}
              disabled={syncingCatalog || syncing || !settings.projectConfigured}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-50"
              title={
                settings.projectConfigured
                  ? "Push active products (per variant) to AiSensy catalogue"
                  : "Set AISENSY_PROJECT_ID and AISENSY_PROJECT_API_KEY to enable catalogue sync"
              }
            >
              {syncingCatalog ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Sync catalogue
            </button>
          </div>

          <div className="space-y-1 text-[12px] text-muted-foreground">
            {settings.lastSyncedAt ? (
              <p>
                Last contact sync: {new Date(settings.lastSyncedAt).toLocaleString()}
                {settings.lastSyncCount != null ? ` · ${settings.lastSyncCount} contacts` : ""}
              </p>
            ) : null}
            {settings.lastCatalogSyncedAt ? (
              <p>
                Last catalogue sync: {new Date(settings.lastCatalogSyncedAt).toLocaleString()}
                {settings.lastCatalogSyncCount != null
                  ? ` · ${settings.lastCatalogSyncCount} items`
                  : ""}
                {settings.catalogId ? ` · catalogue ${settings.catalogId}` : ""}
              </p>
            ) : null}
            {settings.lastCatalogError ? (
              <p className="text-destructive">Catalogue: {settings.lastCatalogError}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
