"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  Key,
  Loader2,
  MessageCircle,
  RefreshCw,
  Save,
  ExternalLink,
} from "lucide-react";
import { adminAisensyService } from "@/api";
import { Switch } from "@/components/ui/switch";

const EVENT_ROWS = [
  {
    key: "abandoned",
    label: "Abandoned cart",
    hint: "Template params: name, amount, item count, cart link",
  },
  {
    key: "orderPlaced",
    label: "Order placed",
    hint: "Template params: name, order number, amount",
  },
  {
    key: "orderPaid",
    label: "Order paid",
    hint: "Template params: name, order number, amount",
  },
  {
    key: "orderShipped",
    label: "Order shipped",
    hint: "Template params: name, order number, AWB",
  },
  {
    key: "orderDelivered",
    label: "Order delivered",
    hint: "Template params: name, order number",
  },
];

const emptyCampaigns = () =>
  Object.fromEntries(EVENT_ROWS.map((r) => [r.key, ""]));
const emptyEnabled = () =>
  Object.fromEntries(EVENT_ROWS.map((r) => [r.key, true]));

export default function AisensySettingsPage() {
  const [settings, setSettings] = useState({
    siteUrl: "",
    abandonedMinutes: 15,
    messagingEnabled: true,
    campaigns: emptyCampaigns(),
    enabled: emptyEnabled(),
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const data = await adminAisensyService.getSettings();
      setSettings((prev) => ({
        ...prev,
        ...data,
        messagingEnabled: data.messagingEnabled !== false,
        campaigns: { ...emptyCampaigns(), ...(data.campaigns || {}) },
        enabled: { ...emptyEnabled(), ...(data.enabled || {}) },
      }));
      if (!data?.isConnected) {
        setStatus({
          type: "info",
          message:
            "Not connected. Set AISENSY_PROJECT_ID + AISENSY_PROJECT_API_KEY (preferred) or AISENSY_API_KEY on the API server, then restart.",
        });
      }
    } catch (error) {
      console.error(error);
      setStatus({ type: "error", message: "Failed to load AiSensy settings" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus({ type: "", message: "" });
    try {
      const data = await adminAisensyService.saveSettings({
        siteUrl: settings.siteUrl,
        abandonedMinutes: settings.abandonedMinutes,
        messagingEnabled: settings.messagingEnabled,
        campaigns: settings.campaigns,
        enabled: settings.enabled,
      });
      setSettings((prev) => ({
        ...prev,
        ...data,
        messagingEnabled: data.messagingEnabled !== false,
        campaigns: { ...emptyCampaigns(), ...(data.campaigns || {}) },
        enabled: { ...emptyEnabled(), ...(data.enabled || {}) },
      }));
      setStatus({ type: "success", message: "AiSensy preferences saved" });
    } catch (error) {
      const msg =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        "Failed to save AiSensy settings";
      setStatus({ type: "error", message: typeof msg === "string" ? msg : "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setStatus({ type: "", message: "" });
    try {
      const data = await adminAisensyService.syncCustomers();
      setSettings((prev) => ({
        ...prev,
        ...data,
      }));
      setStatus({
        type: "success",
        message: `Synced ${data.imported || 0} contacts${data.errors ? ` · ${data.errors} failed` : ""}`,
      });
    } catch (error) {
      const msg =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        "Contact sync failed";
      setStatus({ type: "error", message: typeof msg === "string" ? msg : "Contact sync failed" });
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncCatalog = async () => {
    setSyncingCatalog(true);
    setStatus({ type: "", message: "" });
    try {
      const data = await adminAisensyService.syncCatalog();
      setSettings((prev) => ({
        ...prev,
        ...data,
      }));
      setStatus({
        type: data.ok === false ? "error" : "success",
        message:
          data.ok === false
            ? data.error || data.lastCatalogError || "Catalog sync finished with errors"
            : `Catalog synced · ${data.created || 0} items${
                data.failed ? ` · ${data.failed} failed` : ""
              }`,
      });
    } catch (error) {
      const msg =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        "Catalog sync failed";
      setStatus({ type: "error", message: typeof msg === "string" ? msg : "Catalog sync failed" });
    } finally {
      setSyncingCatalog(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  const messagingOn = !!settings.messagingEnabled;

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
          AiSensy
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Toggle WhatsApp messaging on/off. Map each store event to a Live campaign name.
          Customer emails always send separately via Resend.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
            <div
              className={`p-3 border flex items-center gap-2 rounded-lg ${
                settings.isConnected
                  ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                  : "bg-amber-50 border-amber-100 text-amber-600"
              }`}
            >
              {settings.isConnected ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span className="text-xs font-medium">
                {settings.isConnected
                  ? `Connected via env${
                      settings.projectConfigured
                        ? " · Project API"
                        : settings.hasProjectApiKey
                          ? " · project key (add AISENSY_PROJECT_ID)"
                          : ""
                    }`
                  : "Not Connected"}
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground font-medium flex items-start gap-2">
              <Key size={14} className="mt-0.5 shrink-0" />
              <span>
                Env vars: <code className="text-muted-foreground">AISENSY_PROJECT_ID</code>,{" "}
                <code className="text-muted-foreground">AISENSY_PROJECT_API_KEY</code>
                {" · "}
                optional legacy <code className="text-muted-foreground">AISENSY_API_KEY</code>
              </span>
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <form onSubmit={handleSave} className="space-y-6">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/30 p-4">
                <div>
                  <p className="text-[13px] font-medium text-foreground">WhatsApp messaging</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    Master switch — disables all campaign sends when off
                  </p>
                </div>
                <Switch
                  checked={messagingOn}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, messagingEnabled: !!checked })
                  }
                  aria-label="Enable AiSensy WhatsApp messaging"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-medium text-muted-foreground">
                  Store URL (abandoned recovery links)
                </label>
                <input
                  type="url"
                  value={settings.siteUrl || ""}
                  onChange={(e) => setSettings({ ...settings, siteUrl: e.target.value })}
                  placeholder="https://yourstore.com"
                  className="w-full p-3 bg-secondary/50 border border-border text-sm focus:outline-none focus:border-accent transition-colors rounded-lg"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-medium text-muted-foreground">
                  Auto-send abandoned WhatsApp after (minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={settings.abandonedMinutes ?? 15}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      abandonedMinutes: Number(e.target.value) || 15,
                    })
                  }
                  className="w-full max-w-[160px] p-3 bg-secondary/50 border border-border text-sm focus:outline-none focus:border-accent transition-colors rounded-lg"
                />
                <p className="text-[12px] text-muted-foreground">
                  Customers idle on checkout with a phone number get one WhatsApp after this delay
                  (default 15). Email still sends when Resend is configured.
                </p>
              </div>

              <div className={`space-y-3 ${messagingOn ? "" : "opacity-50 pointer-events-none"}`}>
                <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  <MessageCircle size={14} />
                  Event toggles → Live campaign name
                </div>
                <div className="border border-border divide-y divide-border/60 rounded-lg overflow-hidden">
                  {EVENT_ROWS.map((row) => (
                    <div key={row.key} className="p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-medium text-foreground">{row.label}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{row.hint}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            {settings.enabled?.[row.key] ? "On" : "Off"}
                          </span>
                          <Switch
                            checked={!!settings.enabled?.[row.key]}
                            onCheckedChange={(checked) =>
                              setSettings({
                                ...settings,
                                enabled: { ...settings.enabled, [row.key]: !!checked },
                              })
                            }
                            aria-label={`Enable ${row.label} WhatsApp`}
                          />
                        </div>
                      </div>
                      <input
                        type="text"
                        value={settings.campaigns?.[row.key] || ""}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            campaigns: { ...settings.campaigns, [row.key]: e.target.value },
                          })
                        }
                        placeholder="Exact AiSensy campaign name"
                        disabled={!settings.enabled?.[row.key]}
                        className="w-full p-2.5 bg-secondary/50 border border-border text-sm focus:outline-none focus:border-accent transition-colors rounded-lg disabled:opacity-50"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-[13px] font-medium px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save preferences
                </button>
                {settings.isConnected && (
                  <>
                    <button
                      type="button"
                      onClick={handleSync}
                      disabled={syncing || syncingCatalog || !settings.projectConfigured}
                      className="border border-border hover:bg-muted disabled:opacity-50 text-[13px] font-medium px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors"
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
                      className="border border-border hover:bg-muted disabled:opacity-50 text-[13px] font-medium px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors"
                      title={
                        settings.projectConfigured
                          ? "Push active products (per variant) to AiSensy catalog"
                          : "Set AISENSY_PROJECT_ID and AISENSY_PROJECT_API_KEY to enable catalog sync"
                      }
                    >
                      {syncingCatalog ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      Sync catalog
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>

          {status.message && (
            <div
              className={`flex items-start gap-2 rounded-lg p-3 text-[13px] ${
                status.type === "success"
                  ? "bg-emerald-50 text-emerald-700"
                  : status.type === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {status.type === "success" ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              ) : status.type === "error" ? (
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
              ) : (
                <Info size={16} className="mt-0.5 shrink-0" />
              )}
              <span>{status.message}</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-card border border-border p-5 space-y-3 rounded-2xl">
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              {settings.isConnected ? (
                <CheckCircle2 size={16} className="text-emerald-500" />
              ) : (
                <AlertCircle size={16} className="text-amber-500" />
              )}
              {settings.isConnected ? "Connected (env)" : "Not connected"}
            </div>
            <p className="text-[12px] text-muted-foreground">
              Messaging: {messagingOn ? "Enabled" : "Disabled"}
            </p>
            {settings.lastSyncedAt && (
              <p className="text-[12px] text-muted-foreground">
                Last contact sync: {new Date(settings.lastSyncedAt).toLocaleString()}
                {settings.lastSyncCount != null ? ` · ${settings.lastSyncCount} contacts` : ""}
              </p>
            )}
            {settings.lastCatalogSyncedAt && (
              <p className="text-[12px] text-muted-foreground">
                Last catalog sync: {new Date(settings.lastCatalogSyncedAt).toLocaleString()}
                {settings.lastCatalogSyncCount != null
                  ? ` · ${settings.lastCatalogSyncCount} items`
                  : ""}
                {settings.catalogId ? ` · catalog ${settings.catalogId}` : ""}
              </p>
            )}
            {settings.lastCatalogError && (
              <p className="text-[12px] text-red-500">Catalog: {settings.lastCatalogError}</p>
            )}
            {settings.lastError && (
              <p className="text-[12px] text-red-500">Last send error: {settings.lastError}</p>
            )}
            <Link
              href="/admin/marketing/whatsapp"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
            >
              Marketing → WhatsApp
              <ExternalLink size={12} />
            </Link>
          </div>

          <div className="bg-muted border border-border p-5 space-y-2 rounded-2xl">
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <Info size={14} />
              How it works
            </div>
            <ul className="text-[12px] text-muted-foreground space-y-1.5 list-disc pl-4">
              <li>
                Set <code className="text-muted-foreground">AISENSY_PROJECT_ID</code> +{" "}
                <code className="text-muted-foreground">AISENSY_PROJECT_API_KEY</code> in the API{" "}
                <code className="text-muted-foreground">.env</code> and restart
              </li>
              <li>Use the master toggle to pause all WhatsApp sends</li>
              <li>Toggle each event and paste the exact Live campaign name</li>
              <li>Emails (placed / paid / shipped / delivered) always send via Resend</li>
              <li>Use Sync catalog to push one WhatsApp catalog item per product variant</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
