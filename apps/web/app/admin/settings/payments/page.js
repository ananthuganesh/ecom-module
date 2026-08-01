"use client";

import { useEffect, useState } from "react";
import { CreditCard, Save } from "lucide-react";
import { adminSettingsService } from "@/api";

export default function PaymentMethodsPage() {
    const [methods, setMethods] = useState({ razorpay: true });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        adminSettingsService.getPaymentMethods()
            .then((data) => setMethods({ razorpay: data?.razorpay !== false }))
            .catch(() => setMessage("Could not load payment methods."))
            .finally(() => setLoading(false));
    }, []);

    const save = async () => {
        setSaving(true);
        setMessage("");
        try {
            setMethods(await adminSettingsService.savePaymentMethods(methods));
            setMessage("Payment methods saved.");
        } catch {
            setMessage("Could not save payment methods.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="w-full">
            <div className="mb-8">
                <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">Payment Methods</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">Toggle Razorpay online payments for checkout</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground space-y-6">
                <div className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/20 transition-all">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/5 text-foreground rounded-lg">
                            <CreditCard size={18} />
                        </div>
                        <div>
                            <h3 className="text-xs font-medium text-primary">Razorpay Payments</h3>
                            <p className="text-[13px] text-muted-foreground font-medium">Process credit/debit cards, net banking, UPI, and wallets.</p>
                        </div>
                    </div>
                    <input
                        type="checkbox"
                        checked={methods.razorpay}
                        disabled={loading || saving}
                        onChange={(event) => setMethods({ razorpay: event.target.checked })}
                        className="w-4 h-4 text-accent border-input focus:ring-accent rounded cursor-pointer disabled:cursor-not-allowed"
                    />
                </div>
                <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-muted-foreground" role="status">{message}</p>
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
