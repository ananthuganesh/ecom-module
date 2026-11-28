/**
 * About page copy (from "Urban Aana: About Us Page (SEO Copy)"). Only
 * confirmed facts — the doc's bracketed placeholders are left out until
 * they're confirmed. Shared by the page and its FAQPage structured data.
 */
import { STORE_EMAIL, STORE_PHONE } from "./storeContact.js";

export const ABOUT_TITLE = "Urban Aana: Kerala-Inspired Streetwear from Thiruvananthapuram";
export const ABOUT_DESCRIPTION =
  "Urban Aana is a Kerala streetwear brand from Thiruvananthapuram. Minimal oversized tees inspired by Kerala culture. Meet the founders.";
export const ABOUT_OG_TITLE = "Urban Aana: Where Style Meets Strength";
export const FOUNDERS = ["Vipin VS", "Amal V", "Akarsh U"];

/**
 * Founder cards on /about. To add a photo, drop a portrait (4:5, WebP, under
 * 150 KB) in apps/web/public/images/founders/ and set `photo` to its path,
 * e.g. "/images/founders/vipin-vs.webp". Until then the card shows initials.
 */
export const FOUNDER_PROFILES = [
  { name: "Vipin VS", photo: "/images/founders/vipin-vs.webp" },
  { name: "Amal V", photo: "/images/founders/amal-v.webp" },
  { name: "Akarsh U", photo: "/images/founders/akarsh-u.webp" },
];

/** "Vipin VS" → "VV", "Amal V" → "AV". */
export function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
export const FOUNDERS_IMAGE = "/images/urban-aana-founders-thiruvananthapuram.webp";
export const FOUNDERS_ALT = "Urban Aana founders Vipin VS, Amal V and Akarsh U, Thiruvananthapuram";

export const ABOUT_FAQ = [
  {
    q: "What is Urban Aana?",
    a: "Urban Aana is a Kerala streetwear brand from Thiruvananthapuram, known for minimal oversized t-shirts inspired by Kerala culture.",
  },
  {
    q: "What does Urban Aana mean?",
    a: "Urban stands for modern street fashion and lifestyle. Aana is the Malayalam word for elephant and stands for strength, tradition and pride.",
  },
  {
    q: "Who founded Urban Aana?",
    a: "Urban Aana was founded by Vipin VS, Amal V and Akarsh U, three friends from Thiruvananthapuram.",
  },
  { q: "Where is Urban Aana based?", a: "Thiruvananthapuram, Kerala, India." },
  {
    q: "Does Urban Aana deliver across India?",
    a: "Yes. Urban Aana delivers across India. Delivery typically takes 3–6 business days depending on your PIN code. See our Returns & Shipping policy for returns.",
  },
];

export const SHOP_WITH_CONFIDENCE = `Order Urban Aana tees online at urbanaana.com with secure Razorpay checkout and delivery across India. Delivery typically takes 3–6 business days depending on your PIN code. Questions? Write to us at ${STORE_EMAIL} or WhatsApp ${STORE_PHONE}.`;

/** Organization + FAQPage JSON-LD for /about. */
export function aboutJsonLd(siteUrl) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Urban Aana",
      url: siteUrl,
      slogan: "Where Style Meets Strength",
      description:
        "Kerala streetwear brand from Thiruvananthapuram making minimal oversized tees inspired by Kerala culture.",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Thiruvananthapuram",
        addressRegion: "Kerala",
        addressCountry: "IN",
      },
      founder: FOUNDERS.map((name) => ({ "@type": "Person", name })),
      sameAs: ["https://www.instagram.com/urbanaana.in"],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: ABOUT_FAQ.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];
}
