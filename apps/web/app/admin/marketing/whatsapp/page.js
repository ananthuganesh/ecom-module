"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageCircle,
} from "lucide-react";
import { adminAisensyService } from "@/api";

const EVENT_LABELS = {
  abandoned: "Abandoned cart",
  orderPlaced: "Order placed",
  orderPaid: "Order paid",
  orderShipped: "Order shipped",
  orderDelivered: "Order delivered",
};

export default function WhatsAppMarketing() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminAisensyService.getSettings();
        setSettings(data);
      } catch {
        setSettings(null);
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

  const campaigns = settings?.campaigns || {};
  const enabled = settings?.enabled || {};
  const connected = !!settings?.isConnected;

  return (
    <div className="w-full">
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">WhatsApp</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Templates and Live API campaigns live in AiSensy. Urban Aana maps store events and sends them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/settings/integrations/aisensy"
            className="bg-primary hover:bg-primary/90 text-primary-foreground text-[13px] font-medium px-4 py-2.5 rounded-lg inline-flex items-center gap-2 transition-colors"
          >
            <MessageCircle size={14} />
            AiSensy settings
          </Link>
          <a
            href="https://app.aisensy.com"
            target="_blank"
            rel="noreferrer"
            className="border border-border hover:bg-muted text-[13px] font-medium px-4 py-2.5 rounded-lg inline-flex items-center gap-2 transition-colors"
          >
            Open AiSensy
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 mb-6 flex items-start gap-3">
        {connected ? (
          <CheckCircle2 size={18} className="text-emerald-500 mt-0.5 shrink-0" />
        ) : (
          <AlertCircle size={18} className="text-amber-500 mt-0.5 shrink-0" />
        )}
        <div>
          <p className="text-[13px] font-medium text-foreground">
            {connected ? "AiSensy connected" : "AiSensy not connected"}
          </p>
          <p className="text-[12px] text-muted-foreground mt-1">
            {connected
              ? "Mapped events send automatically. Abandoned carts with a phone get WhatsApp after the idle delay (default 15 min)."
              : "Set AISENSY_API_KEY in the API env, then map Live campaign names under Settings → AiSensy."}
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border text-[13px] font-medium text-muted-foreground bg-muted/30">
              <th className="p-4">Store event</th>
              <th className="p-4">AiSensy campaign</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 text-xs">
            {Object.keys(EVENT_LABELS).map((key) => {
              const name = campaigns[key];
              const on = enabled[key] !== false;
              return (
                <tr key={key} className="hover:bg-muted/50 transition-colors">
                  <td className="p-4 font-medium text-primary">{EVENT_LABELS[key]}</td>
                  <td className="p-4 font-mono text-muted-foreground">{name || ""}</td>
                  <td className="p-4">
                    {!connected ? (
                      <span className="text-amber-600">Not connected</span>
                    ) : !name ? (
                      <span className="text-muted-foreground">Not mapped</span>
                    ) : on ? (
                      <span className="text-emerald-600">Enabled</span>
                    ) : (
                      <span className="text-muted-foreground">Disabled</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
