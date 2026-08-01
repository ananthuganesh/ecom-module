"use client";

import { MessageSquare, PhoneCall } from "lucide-react";
import Link from "next/link";

const CHANNELS = [
    {
        name: "SMS Marketing",
        description: "Promotional and transactional SMS.",
        href: null,
        icon: MessageSquare,
        status: "Coming soon",
    },
    {
        name: "WhatsApp Notifications",
        description: "Automate cart abandonment reminders and catalog alerts.",
        href: "/admin/marketing/whatsapp",
        icon: PhoneCall,
        status: "Active",
    },
];

export default function MarketingDashboard() {
    return (
        <div className="w-full">
            <div className="mb-8">
                <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">Marketing Dashboard</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">Manage and track promotion channels</p>
            </div>

            <h2 className="text-xs font-medium text-muted-foreground mb-4">Channels</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {CHANNELS.map((channel) => {
                    const isComingSoon = channel.status === "Coming soon";
                    return (
                        <div
                            key={channel.name}
                            className="flex flex-col justify-between rounded-2xl border border-border bg-muted/50 p-6"
                        >
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-2.5 bg-primary/5 text-foreground rounded-lg">
                                        <channel.icon size={18} />
                                    </div>
                                    <span
                                        className={`text-[13px] font-medium px-2 py-0.5 rounded ${
                                            isComingSoon
                                                ? "bg-amber-50 text-amber-700"
                                                : "bg-emerald-50 text-emerald-600"
                                        }`}
                                    >
                                        {channel.status}
                                    </span>
                                </div>
                                <h3 className="text-sm font-medium text-primary mb-1">{channel.name}</h3>
                                <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                                    {channel.description}
                                </p>
                            </div>
                            <div className="border-t border-border pt-4 flex items-center justify-end mt-auto">
                                {channel.href ? (
                                    <Link
                                        href={channel.href}
                                        className="text-[13px] font-medium text-foreground hover:underline"
                                    >
                                        Manage →
                                    </Link>
                                ) : (
                                    <span className="text-[13px] font-medium text-amber-700">Coming soon</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
