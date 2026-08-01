"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import Footer from "./Footer";
import "@/app/storefront.css";

export default function StorefrontShell({ children }) {
  const pathname = usePathname();

  if (pathname?.startsWith("/admin")) {
    return <>{children}</>;
  }

  // Dedicated checkout chrome (no store nav/footer)
  if (pathname?.startsWith("/checkout")) {
    return (
      <div className="storefront-root min-h-screen bg-white text-black selection:bg-brand-red selection:text-white">
        {children}
      </div>
    );
  }

  return (
    <div className="storefront-root flex flex-col min-h-screen bg-white text-black selection:bg-brand-red selection:text-white">
      <Navbar />
      <main className="flex-grow">{children}</main>
      <Footer />
    </div>
  );
}
