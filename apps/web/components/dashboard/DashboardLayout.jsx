"use client";

import { MenuIcon } from "@/components/icons/storeIcons";
import { useEffect, useState } from "react";
import DashboardSidebar from "./DashboardSidebar";
import { motion } from "framer-motion";

export default function DashboardLayout({ children, title, eyebrow = "Your account" }) {
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
    <div className="min-h-screen bg-[#F9F9F5]">
      <div className="sticky top-14 z-40 flex items-center border-b border-black bg-white px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          className="flex items-center gap-3 text-black transition-colors hover:text-[#DF1721]"
        >
          <MenuIcon className="h-5 w-5" />
          <span className="text-[12px] font-bold uppercase tracking-[0.16em]">
            {title || "Account"}
          </span>
        </button>
      </div>

      <section className="container-site py-8 pb-20 md:py-14">
        <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
          <div className="lg:w-72 lg:shrink-0">
            <DashboardSidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
          </div>

          <div className="min-w-0 flex-1">
            {title ? (
              <header className="mb-8 hidden border-b-2 border-black pb-6 lg:block">
                <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#DF1721]">
                  {eyebrow}
                </p>
                <h1 className="mt-2 font-vina text-5xl uppercase leading-none tracking-tight text-black xl:text-6xl">
                  {title}
                </h1>
              </header>
            ) : null}

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28 }}
            >
              {children}
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}
