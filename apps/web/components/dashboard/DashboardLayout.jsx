"use client";

import {
  MenuIcon
} from "@/components/icons/storeIcons";
import { useEffect, useState } from "react";
import DashboardSidebar from "./DashboardSidebar";
import { motion } from "framer-motion";

export default function DashboardLayout({ children, title }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    useEffect(() => {
        if (isSidebarOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isSidebarOpen]);

    return (
        <div className="min-h-screen bg-[#fcfcfc] flex flex-col">
            <div className="lg:hidden bg-white border-b border-gray-100 px-6 py-3 flex items-center sticky top-14 z-40">
                <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="flex items-center space-x-3 text-primary hover:text-accent transition-colors"
                >
                    <MenuIcon className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
                        {title || "Profile MenuIcon"}
                    </span>
                </button>
            </div>

            <section className="py-6 lg:py-12 flex-1">
                <div className="container mx-auto px-4 lg:px-6 max-w-7xl">
                    <div className="flex flex-col lg:flex-row gap-6 lg:gap-12">
                        <div className="lg:w-72 lg:shrink-0">
                            <DashboardSidebar
                                isOpen={isSidebarOpen}
                                setIsOpen={setIsSidebarOpen}
                            />
                        </div>

                        <div className="flex-1 min-w-0">
                            {title && (
                                <h1 className="hidden lg:block font-vina text-3xl lg:text-5xl uppercase tracking-tight mb-6 lg:mb-10 text-black">
                                    {title}
                                </h1>
                            )}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
                            >
                                {children}
                            </motion.div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
