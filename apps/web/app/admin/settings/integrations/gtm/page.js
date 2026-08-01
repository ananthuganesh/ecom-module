"use client";

import { useEffect, useState } from "react";
import {
  Tag,
  CheckCircle2,
  Info,
  AlertCircle,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { adminGtmService } from "@/api";

export default function GTMPage() {
  const [gtmId, setGtmId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminGtmService.getSettings();
        setGtmId(data?.gtmId || "");
        setEnabled(!!data?.enabled);
        if (!data?.enabled) {
          setStatus({
            type: "info",
            message: "Not active. Set GTM_ID (and optionally GTM_ENABLED=true) on the API server, then restart.",
          });
        }
      } catch {
        setStatus({ type: "error", message: "Failed to load GTM status" });
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
        <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">Google Tag Manager</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Configured via server environment. Meta Pixel is set up inside GTM — not hardcoded here.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="space-y-5 rounded-2xl border border-border bg-card p-6">
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-muted-foreground">GTM Container ID</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <Tag size={14} />
                </div>
                <input
                  type="text"
                  readOnly
                  value={gtmId || "—"}
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
              {enabled ? "Injected on storefront (env)" : "Disabled / not configured"}
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
              Env vars: <code className="text-muted-foreground">GTM_ID</code>,{" "}
              <code className="text-muted-foreground">GTM_ENABLED</code>
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
              <li>Store pushes DataLayer events: view_item, add_to_cart, begin_checkout, purchase</li>
              <li>In GTM, map custom events → Meta Pixel (Facebook community template)</li>
              <li>Debug with GTM Preview + Meta Test Events</li>
            </ul>
            <a
              href="https://tagmanager.google.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline mt-2"
            >
              Open GTM
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
