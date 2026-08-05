"use client";

import Link from "next/link";
import {
  ArrowIcon,
  PackageIcon,
  ReturnIcon,
  SecureIcon,
  TruckIcon,
} from "@/components/icons/storeIcons";

const trustItems = [
  {
    num: "1",
    Icon: PackageIcon,
    title: "Premium fabric",
    text: "High-grade heavy GSM cotton built to last.",
  },
  {
    num: "2",
    Icon: TruckIcon,
    title: "Fast delivery",
    text: "Express shipping across India.",
  },
  {
    num: "3",
    Icon: ReturnIcon,
    title: "Easy exchange",
    text: "Hassle-free returns when you need them.",
  },
  {
    num: "4",
    Icon: SecureIcon,
    title: "Secure pay",
    text: "100% safe checkout every time.",
  },
];

export default function WhyUrbanAana({ className = "" }) {
  return (
    <section className={`w-full bg-[#ffffff] text-[#222222] ${className}`.trim()}>
      <div className="mx-auto flex max-w-7xl flex-col items-center px-6 py-14 md:py-20">
        <h2 className="title-knewave mx-auto w-full text-center text-2xl leading-none tracking-tight normal-case md:text-4xl">
          Why <span className="title-knewave-accent">Urban Aana</span>
        </h2>

        <div className="mt-14 grid w-full grid-cols-1 gap-10 sm:grid-cols-2 xl:grid-cols-4">
          {trustItems.map((item) => {
            const Icon = item.Icon;
            return (
              <div
                key={item.num}
                className="flex w-full flex-row items-center text-center xl:flex-col"
              >
                <div className="mb-0 flex shrink-0 items-center justify-center xl:mb-6">
                  <div className="relative flex h-16 w-16 rotate-[-3deg] items-center justify-center bg-[#DF1721] 2xl:h-20 2xl:w-20">
                    <Icon size={28} className="text-white" style={{ color: "#ffffff" }} />
                    <span className="trust-num absolute -bottom-8 -left-4 text-[28pt] font-black italic leading-none md:text-[48pt] 2xl:-left-6">
                      {item.num}
                    </span>
                  </div>
                </div>
                <p className="ml-5 mt-0 text-left leading-snug xl:ml-0 xl:mt-8 xl:text-center">
                  <span className="block text-[13pt] font-bold text-[#222222] md:text-[15pt]">
                    {item.title}
                  </span>
                  <span className="mt-1 block text-[11px] font-medium text-gray-500 md:text-[13px]">
                    {item.text}
                  </span>
                </p>
              </div>
            );
          })}
        </div>

        <Link
          href="/all-products"
          className="group mt-14 inline-flex rotate-[-2deg] items-center gap-2 border-2 border-[#222222] bg-[#222222] px-5 py-2 text-[14pt] font-bold text-[#F9F9F5] transition-colors hover:border-brand-red hover:bg-brand-red md:text-[18pt]"
        >
          Shop the drops
          <ArrowIcon size={18} className="transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </section>
  );
}
