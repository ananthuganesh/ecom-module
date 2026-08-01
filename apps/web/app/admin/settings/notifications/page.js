"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { adminSettingsService } from "@/api";

export default function NotificationsPage() {
    const [preferences, setPreferences] = useState({
        customerOrderWhatsapp: true,
        customerOrderEmail: true,
        adminNewOrderAlert: true,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        adminSettingsService.getNotificationPrefs()
            .then(setPreferences)
            .catch(() => setMessage("Could not load notification preferences."))
            .finally(() => setLoading(false));
    }, []);

    const save = async () => {
        setSaving(true);
        setMessage("");
        try {
            setPreferences(await adminSettingsService.saveNotificationPrefs(preferences));
            setMessage("Notification preferences saved.");
        } catch {
            setMessage("Could not save notification preferences.");
        } finally {
            setSaving(false);
        }
    };

    const toggle = (name) => (event) => {
        setPreferences({ ...preferences, [name]: event.target.checked });
    };

    return (
        <div className="w-full">
            <div className="mb-8">
                <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">Notifications</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">Toggle admin/customer notification triggers</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground space-y-6">
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 border-b border-border text-xs">
                        <span className="text-muted-foreground font-medium">Order Placed Email to Customers</span>
                        <input
                            type="checkbox"
                            checked={preferences.customerOrderEmail}
                            disabled={loading || saving}
                            onChange={toggle("customerOrderEmail")}
                            className="w-4 h-4 text-accent border-input focus:ring-accent rounded cursor-pointer disabled:cursor-not-allowed"
                        />
                    </div>
                    <div className="flex items-center justify-between p-3 border-b border-border text-xs">
                        <span className="text-muted-foreground font-medium">Order WhatsApp to Customers</span>
                        <input
                            type="checkbox"
                            checked={preferences.customerOrderWhatsapp}
                            disabled={loading || saving}
                            onChange={toggle("customerOrderWhatsapp")}
                            className="w-4 h-4 text-accent border-input focus:ring-accent rounded cursor-pointer disabled:cursor-not-allowed"
                        />
                    </div>
                    <div className="flex items-center justify-between p-3 border-b border-border text-xs">
                        <span className="text-muted-foreground font-medium">New order email to staff (info inbox)</span>
                        <input
                            type="checkbox"
                            checked={preferences.adminNewOrderAlert}
                            disabled={loading || saving}
                            onChange={toggle("adminNewOrderAlert")}
                            className="w-4 h-4 text-accent border-input focus:ring-accent rounded cursor-pointer disabled:cursor-not-allowed"
                        />
                    </div>
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
