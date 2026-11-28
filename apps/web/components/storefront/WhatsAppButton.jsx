"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { WhatsappIcon } from "@hugeicons/core-free-icons";
import { whatsappChatUrl } from "@/lib/storeContact";

export const FOOTER_ID = "site-footer";

/** Floating support button that appears only while the footer is on screen. */
export default function WhatsAppButton() {
  const pathname = usePathname() || "";
  const [visible, setVisible] = useState(false);
  // Product pages have a sticky add-to-cart bar on mobile; sit above it.
  const raised = pathname.startsWith("/product/");

  useEffect(() => {
    const footer = document.getElementById(FOOTER_ID);
    if (!footer || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(footer);
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <a
      href={whatsappChatUrl()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      title="Chat with us on WhatsApp"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 transition-all duration-300 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366] lg:right-6 lg:bottom-6 ${
        raised ? "bottom-24" : "bottom-[max(1rem,env(safe-area-inset-bottom))]"
      } ${visible ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-4"}`}
    >
      <HugeiconsIcon icon={WhatsappIcon} size={28} aria-hidden />
    </a>
  );
}
