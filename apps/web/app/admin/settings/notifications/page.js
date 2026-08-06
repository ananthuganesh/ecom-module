"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { adminSettingsService } from "@/api";
import { Switch } from "@/components/ui/switch";
import { useProductSaveBarStore } from "@/store/useProductSaveBarStore";

const CUSTOMER_EMAIL_EVENTS = [
  {
    key: "emailOrderConfirmation",
    label: "Order confirmation",
    description: "When an order is paid online (Razorpay)",
  },
  {
    key: "emailOrderShipped",
    label: "Order shipped",
    description: "When the order ships",
  },
  {
    key: "emailOrderDelivered",
    label: "Order delivered",
    description: "When delivery is complete",
  },
  {
    key: "emailOrderCancelled",
    label: "Order cancelled",
    description: "When an admin cancels an order",
  },
  {
    key: "emailAbandonedCart",
    label: "Abandoned cart",
    description: "Recovery email for incomplete checkouts",
  },
];

const ADMIN_EMAIL_EVENTS = [
  {
    key: "adminNewOrderAlert",
    label: "New order",
    description: "Alert to the store inbox on new orders",
  },
];

const ALL_EVENTS = [...CUSTOMER_EMAIL_EVENTS, ...ADMIN_EMAIL_EVENTS];
const DEFAULT_PREFS = Object.fromEntries(ALL_EVENTS.map((e) => [e.key, true]));

function normalizePrefs(data) {
  return {
    ...DEFAULT_PREFS,
    ...Object.fromEntries(
      ALL_EVENTS.map((e) => [e.key, data?.[e.key] !== false])
    ),
  };
}

function EmailEventsCard({ title, description, events, preferences, loading, saving, onToggle }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground space-y-6">
      <div>
        <h2 className="text-[13px] font-medium text-foreground">{title}</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
        {events.map((event) => (
          <div
            key={event.key}
            className="flex items-center justify-between gap-4 bg-card px-4 py-3.5"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground">{event.label}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{event.description}</p>
            </div>
            <Switch
              checked={!!preferences[event.key]}
              disabled={loading || saving}
              onCheckedChange={(checked) => onToggle(event.key, !!checked)}
              aria-label={event.label}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const [preferences, setPreferences] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const showSaveBar = useProductSaveBarStore((s) => s.show);
  const hideSaveBar = useProductSaveBarStore((s) => s.hide);
  const setSaveBarSaving = useProductSaveBarStore((s) => s.setSaving);
  const saveHandlerRef = useRef(null);
  const discardHandlerRef = useRef(null);

  const dirty = useMemo(() => {
    if (!snapshot || !preferences) return false;
    return ALL_EVENTS.some((e) => preferences[e.key] !== snapshot[e.key]);
  }, [preferences, snapshot]);

  useEffect(() => {
    adminSettingsService
      .getNotificationPrefs()
      .then((data) => {
        const next = normalizePrefs(data);
        setPreferences(next);
        setSnapshot(next);
      })
      .catch(() => toast.error("Could not load notification preferences."))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const saved = normalizePrefs(
        await adminSettingsService.saveNotificationPrefs(preferences)
      );
      setPreferences(saved);
      setSnapshot(saved);
      toast.success("Email notification preferences saved");
    } catch {
      toast.error("Could not save notification preferences.");
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (!snapshot) return;
    setPreferences({ ...snapshot });
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

  const onToggle = (key, checked) => {
    setPreferences((prev) => ({
      ...(prev || DEFAULT_PREFS),
      [key]: checked,
    }));
  };

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
          Notifications
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Toggle email alerts per event. WhatsApp is managed under AiSensy.
        </p>
      </div>

      {loading || !preferences ? (
        <div className="space-y-6">
          <div className="h-48 animate-pulse rounded-xl border border-border bg-muted/40" />
          <div className="h-28 animate-pulse rounded-xl border border-border bg-muted/40" />
        </div>
      ) : (
        <div className="space-y-6">
          <EmailEventsCard
            title="Email to Customer"
            description="Customer emails for order and cart events"
            events={CUSTOMER_EMAIL_EVENTS}
            preferences={preferences}
            loading={loading}
            saving={saving}
            onToggle={onToggle}
          />
          <EmailEventsCard
            title="Email to Admin"
            description="Internal alerts for the store team"
            events={ADMIN_EMAIL_EVENTS}
            preferences={preferences}
            loading={loading}
            saving={saving}
            onToggle={onToggle}
          />
        </div>
      )}
    </div>
  );
}
