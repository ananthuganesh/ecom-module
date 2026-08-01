"use client";

import { useState, useEffect } from "react";
import { adminRazorpayService } from "@/api";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  Save,
  Key,
} from "lucide-react";

export default function RazorpaySettingsPage() {
  const [settings, setSettings] = useState({
    keyIdMasked: "",
    environment: "test",
    publicApiBaseUrl: "",
    isConnected: false,
    hasSecret: false,
    hasWebhookSecret: false,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await adminRazorpayService.getSettings();
      setSettings((prev) => ({ ...prev, ...data }));
      if (!data?.isConnected) {
        setStatus({
          type: "info",
          message:
            "Not connected. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET on the API server, then restart.",
        });
      }
    } catch (error) {
      console.error("Error fetching Razorpay settings:", error);
      setStatus({ type: "error", message: "Failed to load settings" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus({ type: "", message: "" });

    try {
      const data = await adminRazorpayService.saveSettings({
        publicApiBaseUrl: settings.publicApiBaseUrl,
      });
      setSettings((prev) => ({ ...prev, ...data }));
      setStatus({ type: "success", message: "Settings saved" });
    } catch (error) {
      const msg =
        error.response?.data?.message ||
        error.response?.data?.detail ||
        "Failed to save settings";
      setStatus({
        type: "error",
        message: typeof msg === "string" ? msg : "Failed to save settings",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">Payment Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Razorpay keys come from the API environment. Configure webhook URL in the Razorpay dashboard.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-5 rounded-2xl border border-border bg-card p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-muted-foreground">Key ID (from env)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                    <Key size={14} />
                  </div>
                  <input
                    type="text"
                    readOnly
                    value={settings.keyIdMasked || "—"}
                    className="w-full pl-10 p-3 bg-secondary/50 border border-border text-sm text-muted-foreground rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-medium text-muted-foreground">Status</label>
                <div
                  className={`p-3 border flex items-center gap-2 rounded-lg ${
                    settings.isConnected
                      ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                      : "bg-amber-50 border-amber-100 text-amber-600"
                  }`}
                >
                  {settings.isConnected ? (
                    <>
                      <CheckCircle2 size={16} />
                      <span className="text-xs font-medium">
                        Connected via env ({settings.environment})
                        {settings.hasWebhookSecret ? " · webhook set" : ""}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={16} />
                      <span className="text-xs font-medium">Not Connected</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <p className="text-[12px] text-muted-foreground font-medium">
              Env vars: <code className="text-muted-foreground">RAZORPAY_KEY_ID</code>,{" "}
              <code className="text-muted-foreground">RAZORPAY_KEY_SECRET</code>,{" "}
              <code className="text-muted-foreground">RAZORPAY_WEBHOOK_SECRET</code>
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-muted-foreground">Public API base URL</label>
                <input
                  type="url"
                  placeholder="https://api.yourstore.com"
                  value={settings.publicApiBaseUrl || ""}
                  onChange={(e) => setSettings({ ...settings, publicApiBaseUrl: e.target.value })}
                  className="w-full p-3 bg-secondary/50 border border-border text-sm focus:outline-none focus:border-accent transition-colors rounded-lg"
                />
                <p className="text-[12px] text-muted-foreground">
                  Optional override for webhook and callback URLs. Falls back to PUBLIC_API_URL / NEXT_PUBLIC_API_URL.
                </p>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-[13px] font-medium px-4 py-2.5 rounded-lg flex items-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save preferences
              </button>
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
                <CheckCircle2 size={16} className="mt-0.5" />
              ) : status.type === "error" ? (
                <AlertCircle size={16} className="mt-0.5" />
              ) : (
                <Info size={16} className="mt-0.5" />
              )}
              <span>{status.message}</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-muted border border-border p-5 space-y-2 rounded-2xl">
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <Info size={14} />
              Setup notes
            </div>
            <ul className="text-[12px] text-muted-foreground space-y-1.5 list-disc pl-4">
              <li>Set Razorpay keys in the API <code className="text-muted-foreground">.env</code> and restart</li>
              <li>Point webhooks to <code className="text-muted-foreground">/api/payments/webhook</code></li>
              <li>Subscribe to <code className="text-muted-foreground">payment.captured</code> at minimum</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
