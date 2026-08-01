"use client";

import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";

export default function Topbar() {
    return (
        <header className="h-16 bg-primary px-6 flex items-center z-50 sticky top-0 shrink-0 border-b border-primary-foreground/10">
            <div className="flex items-center w-64 shrink-0">
                <Link href="/admin/dashboard" className="inline-flex items-center gap-2.5 min-w-0" aria-label="Admin Panel by Brid Network LLP">
                    <BrandLogo href={null} height={24} />
                    <span className="h-5 w-px bg-primary-foreground/25 shrink-0" aria-hidden />
                    <span className="min-w-0 flex flex-col gap-0.5">
                        <span className="text-[13px] leading-none font-medium text-primary-foreground/90 tracking-normal truncate">
                            Admin Panel
                        </span>
                        <span className="text-[10px] leading-none font-medium text-primary-foreground/45 tracking-normal truncate lowercase">
                            by Brid Network LLP
                        </span>
                    </span>
                </Link>
            </div>
        </header>
    );
}
