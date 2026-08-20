"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { Toaster } from "@/components/ui/sonner";
import "@/app/storefront.css";

export default function StorefrontShell({ children }) {
  const pathname = usePathname();

  const skipLink = (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[300] focus:rounded-md focus:bg-black focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
    >
      Skip to main content
    </a>
  );

  if (pathname?.startsWith("/admin")) {
    return <>{children}</>;
  }

  // Dedicated checkout chrome (no store nav/footer)
  if (pathname?.startsWith("/checkout")) {
    return (
      <div className="storefront-root min-h-screen bg-white text-black">
        {skipLink}
        <main id="main-content">{children}</main>
        <Toaster position="top-center" theme="light" />
      </div>
    );
  }

  return (
    <div className="storefront-root flex flex-col min-h-screen bg-white text-black">
      {skipLink}
      <Suspense fallback={null}>
        <Navbar />
      </Suspense>
      <main id="main-content" className="flex-grow">
        {children}
      </main>
      <Footer />
      <Toaster position="top-center" theme="light" />
    </div>
  );
}
