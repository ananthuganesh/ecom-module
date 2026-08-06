"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  STORE_EMAIL,
  STORE_PHONE,
  STORE_PHONE_TEL,
} from "@/lib/storeContact";

const FOOTER_INK = "rgb(243, 241, 236)";
const FOOTER_BG = "#222222";
const FOOTER_LINK =
  "footer-link relative inline-block w-fit text-[13px] font-medium opacity-90 transition-colors duration-300 hover:text-gray-400";
const FOOTER_HEADING =
  "inline-block w-fit -ml-2 bg-brand-red px-2 py-1 text-[12px] font-bold uppercase tracking-[0.2em]";

const InstagramIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const FacebookIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

const Footer = () => {
  return (
    <footer className="w-full" style={{ color: FOOTER_INK, backgroundColor: FOOTER_BG }}>
      <div className="max-w-[1640px] mx-auto px-5 sm:px-8 lg:px-12 pt-14 pb-10">
        <div className="grid grid-cols-1 gap-y-10 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-[2fr_1fr_1fr_1fr] lg:gap-x-12">
          <div className="flex flex-col gap-5 sm:col-span-2 lg:col-span-1">
            <Link href="/" className="inline-block w-fit">
              <Image
                src="/brand/logo-dark.png"
                alt="URBAN AANA"
                width={140}
                height={50}
                className="object-contain h-10 w-auto"
                priority={false}
              />
            </Link>

            <p className="text-sm font-medium opacity-80">Where Style Meets Strength</p>

            <div className="flex flex-col gap-1 text-[13px] opacity-80">
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
              <button
                onClick={() => window.open("https://www.instagram.com/urbanaana.in", "_blank", "noopener,noreferrer")}
                className="w-9 h-9 rounded-full border flex items-center justify-center transition-all duration-200 hover:border-brand-red hover:text-brand-red"
                style={{ borderColor: "rgba(243, 241, 236, 0.25)", color: FOOTER_INK }}
                aria-label="Instagram"
              >
                <InstagramIcon />
              </button>
              <a
                href="https://www.facebook.com/share/18vF3ZB3BJ/"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full border flex items-center justify-center transition-all duration-200 hover:border-brand-red hover:text-brand-red"
                style={{ borderColor: "rgba(243, 241, 236, 0.25)", color: FOOTER_INK }}
                aria-label="Facebook"
              >
                <FacebookIcon />
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <p className={FOOTER_HEADING} style={{ color: FOOTER_INK }}>
              Collection
            </p>
            <ul className="flex flex-col gap-3">
              <li>
                <Link href="/all-products" className={FOOTER_LINK}>
                  All Products
                </Link>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <p className={FOOTER_HEADING} style={{ color: FOOTER_INK }}>
              About
            </p>
            <ul className="flex flex-col gap-3">
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
            <p className={FOOTER_HEADING} style={{ color: FOOTER_INK }}>
              Policies
            </p>
            <ul className="flex flex-col gap-3">
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
          </div>
        </div>
      </div>

      <div className="max-w-[1640px] mx-auto px-5 sm:px-8 lg:px-12">
        <div className="border-t" style={{ borderColor: "rgba(243, 241, 236, 0.15)" }} />
      </div>

      <div className="max-w-[1640px] mx-auto px-5 sm:px-8 lg:px-12 py-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-[12px] tracking-wide opacity-80 text-left">
            © {new Date().getFullYear()} Urban Aana. All rights reserved.
          </p>
          <p className="text-[12px] tracking-wide opacity-80 text-left sm:text-right">
            Design &amp; Development by{" "}
            <a
              href="https://www.bridnetwork.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-brand-red transition-colors"
            >
              Brid Network LLP
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
                  className="footer-marquee-text font-knewave px-8 text-[clamp(3rem,12vw,8rem)] font-normal italic leading-none tracking-tight block normal-case"
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
            font-family: var(--font-archivo-black), "Archivo Black", sans-serif;
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
