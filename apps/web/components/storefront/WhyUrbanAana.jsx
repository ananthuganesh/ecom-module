"use client";

import Image from "next/image";

const BADGES = [
  {
    src: "/badge/premium-quality.png",
    alt: "Premium quality",
  },
  {
    src: "/badge/great-customer-service.png",
    alt: "Great customer service",
  },
  {
    src: "/badge/secure-payment.png",
    alt: "100% secure payment",
  },
  {
    src: "/badge/fast-free-shipping.png",
    alt: "Fast and free shipping",
  },
];

export default function WhyUrbanAana({ className = "" }) {
  return (
    <section className={`w-full bg-[#ffffff] text-[#222222] ${className}`.trim()}>
      <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-14 md:px-6 md:py-20 lg:px-8">
        <h2 className="title-knewave mx-auto w-full text-center text-2xl leading-none tracking-tight normal-case md:text-4xl">
          Why <span className="title-knewave-accent">Urban Aana</span>
        </h2>

        <div className="mt-10 grid w-full grid-cols-4 gap-2 sm:mt-12 sm:gap-4 md:mt-14 md:gap-6">
          {BADGES.map((badge) => (
            <div
              key={badge.src}
              className="relative mx-auto aspect-square w-full max-w-[7.5rem] sm:max-w-[9rem] md:max-w-[11rem]"
            >
              <Image
                src={badge.src}
                alt={badge.alt}
                fill
                className="object-contain"
                sizes="(max-width: 640px) 25vw, 176px"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
