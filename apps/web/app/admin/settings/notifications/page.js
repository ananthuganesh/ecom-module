"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Save } from "lucide-react";
import { adminSettingsService } from "@/api";

export default function NotificationsPage() {
  const [preferences, setPreferences] = useState({
    adminNewOrderAlert: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    adminSettingsService
      .getNotificationPrefs()
      .then((data) =>
        setPreferences({
          adminNewOrderAlert: data?.adminNewOrderAlert !== false,
        })
      )
      .catch(() => setMessage("Could not load notification preferences."))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const saved = await adminSettingsService.saveNotificationPrefs(preferences);
      setPreferences({
        adminNewOrderAlert: saved?.adminNewOrderAlert !== false,
      });
      setMessage("Notification preferences saved.");
    } catch {
      setMessage("Could not save notification preferences.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
          Notifications
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Customer order emails always send. WhatsApp is controlled under AiSensy.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 p-3 border-b border-border text-xs">
            <div>
              <p className="text-muted-foreground font-medium">Customer order emails</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                Always on — placed, paid, shipped, delivered, abandoned cart (via Resend)
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
              Always on
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 p-3 border-b border-border text-xs">
            <div>
              <p className="text-muted-foreground font-medium">Customer WhatsApp</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                Enable/disable per event in AiSensy settings
              </p>
            </div>
            <Link
              href="/admin/settings/integrations/aisensy"
              className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-primary hover:underline"
            >
              AiSensy
              <ExternalLink size={12} />
            </Link>
          </div>

          <div className="flex items-center justify-between p-3 border-b border-border text-xs">
            <span className="text-muted-foreground font-medium">
              New order email to staff (info inbox)
            </span>
            <input
              type="checkbox"
              checked={!!preferences.adminNewOrderAlert}
              disabled={loading || saving}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  adminNewOrderAlert: e.target.checked,
                })
              }
              className="w-4 h-4 text-accent border-input focus:ring-accent rounded cursor-pointer disabled:cursor-not-allowed"
            />
          </div>
        </div>
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground" role="status">
            {message}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={loading || saving}
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-[13px] font-medium px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Save size={15} />
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
