"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminSettingsService } from "@/api";
import { Switch } from "@/components/ui/switch";

const MAGIC_ENDPOINTS = [
  { label: "URL for shipping info", path: "/api/payments/magic/shipping-info" },
  { label: "URL for get promotions", path: "/api/payments/magic/promotions" },
  { label: "URL for apply promotions", path: "/api/payments/magic/apply-promotion" },
];

function EndpointRow({ label, url }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        <p className="mt-0.5 truncate font-mono text-[12px] text-muted-foreground">{url}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-md border border-border px-2.5 py-1 text-[12px] font-medium hover:bg-muted"
      >
        Copy
      </button>
    </div>
  );
}

export default function PaymentSettingsPage() {
  const [methods, setMethods] = useState(null);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    adminSettingsService
      .getPaymentMethods()
      .then(setMethods)
      .catch(() => toast.error("Could not load payment settings."));
  }, []);

  const toggleMagic = async (checked) => {
    setSaving(true);
    try {
      const saved = await adminSettingsService.savePaymentMethods({ razorpayMagic: checked });
      setMethods(saved);
      toast.success(checked ? "Magic Checkout is on" : "Magic Checkout is off");
    } catch {
      toast.error("Could not save payment settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
          Payment
        </h1>
      </div>

      {!methods ? (
        <div className="h-48 animate-pulse rounded-xl border border-border bg-muted/40" />
      ) : (
        <div className="space-y-4">
          <div className="admin-surface space-y-4 rounded-xl bg-card p-5 text-card-foreground">
            <h2 className="admin-card-heading">Razorpay Magic Checkout</h2>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground">Use Magic Checkout</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Shoppers enter only their email on the checkout page. Razorpay&rsquo;s popup
                  collects the phone number, saved address, discount code and payment. Turn off
                  to go back to the standard checkout form.
                </p>
              </div>
              <Switch
                checked={!!methods.razorpayMagic}
                disabled={saving || methods.razorpay === false}
                onCheckedChange={(checked) => toggleMagic(!!checked)}
                aria-label="Use Magic Checkout"
              />
            </div>
            {methods.razorpay === false && (
              <p className="text-[12px] text-muted-foreground">
                Online payments are turned off, so Magic Checkout is unavailable.
              </p>
            )}
          </div>

          <div className="admin-surface space-y-3 rounded-xl bg-card p-5 text-card-foreground">
            <h2 className="admin-card-heading">Razorpay Dashboard setup</h2>
            <p className="text-[12px] text-muted-foreground">
              In Razorpay: Magic Checkout → Platform Setup → Custom E-Commerce Platform. Paste
              these under Coupon Settings and Shipping Setup (Shipping Service type: API). Set them
              up in both Test and Live mode.
            </p>
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {MAGIC_ENDPOINTS.map((e) => (
                <EndpointRow key={e.path} label={e.label} url={`${origin}${e.path}`} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
