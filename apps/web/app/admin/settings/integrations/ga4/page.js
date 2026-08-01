"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Info,
  AlertCircle,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { adminGa4Service } from "@/api";

export default function Ga4SettingsPage() {
  const [propertyId, setPropertyId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminGa4Service.getSettings();
        setPropertyId(data?.propertyId || "");
        setEnabled(!!data?.enabled);
        setHasCredentials(!!data?.hasCredentials);
        if (!data?.enabled) {
          setStatus({
            type: "info",
            message:
              "Not active. Set GA4_PROPERTY_ID and GA4_CREDENTIALS_JSON (or GA4_CREDENTIALS_FILE) on the API server, then restart. Grant the service account Viewer on the GA4 property.",
          });
        }
      } catch {
        setStatus({ type: "error", message: "Failed to load Google Analytics status" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[320px] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">Google Analytics</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Data API credentials via server environment. Powers the traffic section on Analytics.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="space-y-5 rounded-2xl border border-border bg-card p-6">
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-muted-foreground">GA4 Property ID</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <BarChart3 size={14} />
                </div>
                <input
                  type="text"
                  readOnly
                  value={propertyId || "—"}
                  className="w-full pl-10 p-3 bg-secondary/50 border border-border text-sm text-muted-foreground rounded-lg"
                />
              </div>
            </div>

            <div
              className={`flex items-center gap-2 text-[13px] font-medium ${
                enabled ? "text-emerald-700" : "text-muted-foreground"
              }`}
            >
              {enabled ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {enabled
                ? "Connected — reports available on Analytics"
                : hasCredentials
                  ? "Credentials present but property ID missing / disabled"
                  : "Disabled / not configured"}
            </div>

            {status.message && (
              <div
                className={`p-4 flex items-start gap-3 rounded-lg text-[13px] ${
                  status.type === "error"
                    ? "bg-red-50 text-red-700"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {status.type === "error" ? (
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                ) : (
                  <Info size={16} className="mt-0.5 shrink-0" />
                )}
                <span>{status.message}</span>
              </div>
            )}

            <p className="text-[12px] text-muted-foreground font-medium">
              Env vars: <code className="text-muted-foreground">GA4_PROPERTY_ID</code>,{" "}
              <code className="text-muted-foreground">GA4_CREDENTIALS_JSON</code>,{" "}
              <code className="text-muted-foreground">GA4_CREDENTIALS_FILE</code>,{" "}
              <code className="text-muted-foreground">GA4_ENABLED</code>
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-muted border border-border p-5 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <Info size={14} />
              How it works
            </div>
            <ul className="text-[12px] text-muted-foreground space-y-1.5 list-disc pl-4">
              <li>Create a GCP service account with Analytics Data API enabled</li>
              <li>Add the service account email as Viewer on the GA4 property</li>
              <li>Put the JSON key in GA4_CREDENTIALS_JSON or a file path</li>
              <li>Sales numbers still come from store orders — GA is traffic only</li>
            </ul>
            <a
              href="https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline mt-2"
            >
              Data API quickstart
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
