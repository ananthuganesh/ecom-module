"use client";

import { LogOut, MapPin, Settings, ShieldCheck } from "lucide-react";
import {
  AccountIcon,
  BagIcon,
  CloseIcon,
  StoreIcon
} from "@/components/icons/storeIcons";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuthStore } from "@/store/useAuthStore";

const SIDEBAR_LINKS = [
    { name: "Overview", href: "/profile", icon: StoreIcon },
    { name: "My Orders", href: "/profile/orders", icon: BagIcon },
    { name: "Saved Addresses", href: "/profile/addresses", icon: MapPin },
    { name: "Account Settings", href: "/profile/settings", icon: Settings },
    { name: "Security", href: "/profile/security", icon: ShieldCheck },
];

export default function DashboardSidebar({ isOpen, setIsOpen }) {
    const pathname = usePathname();
    const router = useRouter();
    const { logout, userInfo } = useAuthStore();

    const handleLogout = () => {
        logout();
        router.push("/");
    };

    return (
        <>
            {/* Backdrop for Mobile */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1010] lg:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar Content */}
            <aside className={`
                fixed inset-y-0 left-0 z-[1011] w-72 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:shadow-sm lg:z-0 border-r border-gray-100
                ${isOpen ? "translate-x-0" : "-translate-x-full"}
            `}>
                {/* Close Button Mobile */}
                <button 
                    onClick={() => setIsOpen(false)}
                    className="lg:hidden absolute top-4 right-4 p-2 text-gray-400 hover:text-primary"
                >
                    <CloseIcon className="w-5 h-5" />
                </button>

                {/* User Header */}
                <div className="p-8 border-b border-gray-50 flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mb-4">
                        <AccountIcon className="w-10 h-10 text-primary" />
                    </div>
                    <h2 className="text-lg font-bold uppercase tracking-widest text-primary mb-1">
                        {userInfo?.name || "User"}
                    </h2>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest truncate w-full">
                        {userInfo?.email}
                    </p>
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-4 overflow-y-auto">
                    {SIDEBAR_LINKS.map((link) => {
                        const Icon = link.icon;
                        const isActive = pathname === link.href;
                        return (
                            <Link
                                key={link.name}
                                href={link.href}
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center space-x-4 px-8 py-4 transition-all border-l-2 ${
                                    isActive 
                                        ? "bg-gray-50 border-accent text-primary" 
                                        : "border-transparent text-gray-400 hover:text-primary hover:bg-gray-50/50"
                                }`}
                            >
                                <Icon className={`w-4 h-4 ${isActive ? "text-accent" : "text-gray-400"}`} />
                                <span className="text-[10px] uppercase tracking-[0.2em] font-bold">
                                    {link.name}
                                </span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-gray-50 space-y-2 bg-gray-50/30">
                    <Link
                        href="/"
                        className="w-full flex items-center space-x-4 px-4 py-4 text-primary hover:bg-gray-50 transition-colors uppercase tracking-[0.2em] font-bold text-[10px]"
                    >
                        <StoreIcon className="w-4 h-4 text-gray-400 rotate-180" />
                        <span>Home</span>
                    </Link>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center space-x-4 px-4 py-4 text-red-500 hover:bg-red-50 transition-colors uppercase tracking-[0.2em] font-bold text-[10px]"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>
        </>
    );
}
