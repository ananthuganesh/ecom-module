"use client";

import { useState } from "react";
import Link from "next/link";
import { CaretIcon } from "@/components/icons/storeIcons";

const FAQ_ITEMS = [
  {
    id: "shipping",
    question: "How long does delivery take?",
    answer:
      "Orders are usually dispatched quickly after payment. Delivery typically takes 3–6 business days depending on your PIN code and courier serviceability across India.",
  },
  {
    id: "returns",
    question: "What is your return and exchange policy?",
    answer: (
      <>
        Easy returns and exchanges are available on eligible products within the
        return window, as long as items are unused and in original condition with
        tags.{" "}
        <Link
          href="/return-refund"
          className="font-medium text-[#DF1721] hover:underline"
        >
          View full returns & shipping policy
        </Link>
        .
      </>
    ),
  },
  {
    id: "sizing",
    question: "How do I find my size?",
    answer:
      "Use the size guide on each product page for chest, length, and shoulder measurements. Our oversized tees are designed for a relaxed fit — if you prefer a closer fit, size down.",
  },
  {
    id: "payment",
    question: "Is payment secure?",
    answer:
      "Yes. Checkout is processed through trusted payment partners. We only accept prepaid orders, and your payment details are never stored on our servers.",
  },
  {
    id: "wash",
    question: "How should I wash my Urban Aana tee?",
    answer:
      "Machine wash cold with similar colours, use mild detergent, avoid bleach, hang dry in shade, and warm iron inside out if needed. Do not tumble dry or dry clean.",
  },
  {
    id: "track",
    question: "How can I track my order?",
    answer: (
      <>
        Once your order is fulfilled, you’ll receive tracking details by email
        and WhatsApp (if opted in). You can also check status anytime under{" "}
        <Link
          href="/account/orders"
          className="font-medium text-[#DF1721] hover:underline"
        >
          My Orders
        </Link>
        .
      </>
    ),
  },
];

export default function FaqSection({ className = "" }) {
  const [openId, setOpenId] = useState(FAQ_ITEMS[0]?.id || null);

  return (
    <section
      className={`w-full border-t border-gray-100 bg-white text-[#222222] ${className}`.trim()}
    >
      <div className="mx-auto max-w-3xl px-4 py-14 md:px-6 md:py-20 lg:px-8">
        <h2 className="title-knewave mx-auto w-full text-center text-2xl leading-none tracking-tight normal-case md:text-4xl">
          Frequently asked <span className="title-knewave-accent">questions</span>
        </h2>

        <div className="mt-10 md:mt-12">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openId === item.id;
            const isLast = index === FAQ_ITEMS.length - 1;
            return (
              <div
                key={item.id}
                className={isLast ? "" : "border-b border-gray-200"}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => {
                    if (!isOpen) setOpenId(item.id);
                  }}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left"
                >
                  <span className="text-[14px] font-semibold leading-snug text-[#222222] md:text-[15px]">
                    {item.question}
                  </span>
                  <CaretIcon
                    className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform duration-300 ease-out ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                    isOpen
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="pb-4 text-[13px] leading-relaxed text-gray-600 md:text-[14px]">
                      {item.answer}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
