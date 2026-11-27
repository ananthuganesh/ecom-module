"use client";

import React from "react";
import { FOOTER_ID } from "./WhatsAppButton";
import Link from "next/link";
import Image from "next/image";
import {
  STORE_EMAIL,
  STORE_PHONE,
  STORE_PHONE_TEL,
  whatsappChatUrl,
} from "@/lib/storeContact";

const FOOTER_INK = "rgb(243, 241, 236)";
const FOOTER_BG = "#121212";
const FOOTER_LINK =
  "footer-link relative inline-block w-fit text-[15px] leading-6 font-normal antialiased text-white transition-colors duration-300 hover:text-gray-400";
const FOOTER_HEADING =
  "inline-block w-fit -ml-2 bg-brand-red px-2 py-1 text-[14px] font-semibold leading-[14px] tracking-[1.4px] uppercase text-white";

const PAYMENT_ICONS = [
  { src: "/payment-icons/visa.png", label: "Visa" },
  { src: "/payment-icons/mastercard.png", label: "Mastercard" },
  { src: "/payment-icons/googlepay.png", label: "Google Pay" },
  { src: "/payment-icons/applepay.png", label: "Apple Pay" },
  { src: "/payment-icons/amazonpay.png", label: "Amazon Pay" },
];


const SOCIAL_LINKS = [
  { href: "https://www.instagram.com/urbanaana.in", icon: "/social/instagram.png", label: "Instagram" },
  { href: "https://www.facebook.com/share/18vF3ZB3BJ/", icon: "/social/facebook.png", label: "Facebook" },
  { href: whatsappChatUrl(), icon: "/social/whatsapp.png", label: "WhatsApp" },
];

const Footer = () => {
  return (
    <footer id={FOOTER_ID} className="w-full font-[family-name:var(--font-archivo-narrow)]" style={{ color: FOOTER_INK, backgroundColor: FOOTER_BG }}>
      <div className="w-full px-4 lg:px-8 pt-14 pb-10">
        <div className="grid grid-cols-1 gap-y-10 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-[repeat(4,max-content)] lg:justify-start lg:gap-x-20 xl:gap-x-28">
          <div className="flex flex-col gap-5 sm:col-span-2 lg:col-span-1">
            <Link href="/" className="inline-block w-fit">
              <Image
                src="/brand/logo-dark.png"
                alt="URBAN AANA"
                width={140}
                height={50}
                className="object-contain h-14 w-auto"
                priority={false}
              />
            </Link>

            <p className="text-[15px] leading-6 font-normal antialiased text-white">Where Style Meets Strength</p>

            <div className="flex flex-col gap-1 text-[15px] leading-6 font-normal antialiased text-white">
              <a
                href={`mailto:${STORE_EMAIL}`}
                className="w-fit transition-colors hover:text-brand-red hover:opacity-100"
              >
                Email: {STORE_EMAIL}
              </a>
              <a
                href={`tel:${STORE_PHONE_TEL}`}
                className="w-fit transition-colors hover:text-brand-red hover:opacity-100"
              >
                Phone: {STORE_PHONE}
              </a>
            </div>

            <div className="flex items-center gap-4">
              {SOCIAL_LINKS.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full border border-white/25 flex items-center justify-center transition-all duration-200 hover:border-brand-red hover:bg-brand-red"
                  aria-label={item.label}
                  title={item.label}
                >
                  <Image src={item.icon} alt="" width={18} height={18} className="h-[18px] w-[18px]" />
                </a>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <p className={FOOTER_HEADING}>
              Collection
            </p>
            <ul className="flex flex-col gap-2">
              <li>
                <Link href="/all-products" className={FOOTER_LINK}>
                  All Products
                </Link>
              </li>
              <li>
                <Link href="/collections/new-arrivals" className={FOOTER_LINK}>
                  New Arrivals
                </Link>
              </li>
              <li>
                <Link href="/collections/best-sellers" className={FOOTER_LINK}>
                  Best Sellers
                </Link>
              </li>
              <li>
                <Link href="/collections/t-shirt" className={FOOTER_LINK}>
                  Oversized T-Shirt
                </Link>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <p className={FOOTER_HEADING}>
              About
            </p>
            <ul className="flex flex-col gap-2">
              <li>
                <Link href="/about" className={FOOTER_LINK}>
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/account" className={FOOTER_LINK}>
                  My Account
                </Link>
              </li>
              <li>
                <Link href="/contact" className={FOOTER_LINK}>
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <p className={FOOTER_HEADING}>
              Policies
            </p>
            <ul className="flex flex-col gap-2">
              <li>
                <Link href="/privacy-policy" className={FOOTER_LINK}>
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms-and-conditions" className={FOOTER_LINK}>
                  Terms and Condition
                </Link>
              </li>
              <li>
                <Link href="/return-refund" className={FOOTER_LINK}>
                  Returns &amp; Shipping
                </Link>
              </li>
            </ul>
            <ul className="mt-2 flex flex-wrap items-center gap-2" aria-label="Payment methods we accept">
              {PAYMENT_ICONS.map((icon) => (
                <li key={icon.src}>
                  <Image
                    src={icon.src}
                    alt={icon.label}
                    title={icon.label}
                    width={35}
                    height={24}
                    className="h-6 w-[35px]"
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="w-full px-4 lg:px-8">
        <div className="border-t" style={{ borderColor: "rgba(243, 241, 236, 0.15)" }} />
      </div>

      <div className="w-full px-4 lg:px-8 py-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-[15px] leading-6 font-normal antialiased text-[#cecece] text-left">
            © {new Date().getFullYear()} Urban Aana. All rights reserved.
          </p>
          <p className="text-[13px] leading-[21px] font-normal antialiased text-[#cecece] text-left sm:text-right">
            Designed &amp; developed by{" "}
            <a
              href="https://www.bridnetwork.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline hover:text-brand-red transition-colors"
            >
              BRID NETWORK LLP
            </a>
          </p>
        </div>
      </div>

      <div
        className="footer-marquee-edge w-full overflow-hidden select-none pt-6 md:pt-8 pb-0"
        aria-hidden="true"
      >
        <div className="footer-marquee-shift flex w-max items-end">
          {[0, 1].map((copy) => (
            <div
              key={copy}
              className="footer-marquee flex shrink-0 items-end whitespace-nowrap"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={`${copy}-${i}`}
                  className="footer-marquee-text px-8 text-[clamp(3rem,12vw,8rem)] font-normal leading-none tracking-tight block uppercase"
                >
                  Urban Aana
                </span>
              ))}
            </div>
          ))}
        </div>
        <style>{`
          @keyframes footer-marquee {
            0% { transform: translateX(0); }
            100% { transform: translateX(-100%); }
          }
          .footer-marquee-edge {
            line-height: 0;
          }
          .footer-marquee-shift {
            /* Drop text so ~10% of letter height is clipped at the bottom edge */
            transform: translateY(10%);
          }
          .footer-marquee {
            animation: footer-marquee 40s linear infinite;
            will-change: transform;
          }
          .footer-marquee-text {
            font-family: var(--font-archivo-narrow), "Archivo Narrow", sans-serif;
            color: ${FOOTER_BG};
            -webkit-text-stroke: 3px ${FOOTER_INK};
            paint-order: stroke fill;
            text-shadow: 4px 4px 0 ${FOOTER_INK};
          }
          @media (max-width: 768px) {
            .footer-marquee-text {
              -webkit-text-stroke-width: 2px;
              text-shadow: 3px 3px 0 ${FOOTER_INK};
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .footer-marquee { animation: none; }
          }
          .footer-link::after {
            content: "";
            position: absolute;
            left: 0;
            bottom: -2px;
            width: 100%;
            height: 1px;
            background: currentColor;
            transform: scaleX(0);
            transform-origin: left center;
            transition: transform 0.3s ease;
          }
          .footer-link:hover::after {
            transform: scaleX(1);
          }
        `}</style>
      </div>
    </footer>
  );
};

export default Footer;
