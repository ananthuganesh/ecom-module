/**
 * Site-wide schema.org JSON-LD: the store organisation, the website, and breadcrumbs.
 * Product markup lives in productJsonLd.js.
 */
import { absoluteUrl, getSiteUrl } from "./siteUrl.js";
import { STORE_EMAIL, STORE_LEGAL_NAME, STORE_PHONE_TEL } from "./storeContact.js";
import {
  HANDLING_DAYS,
  RETURN_WINDOW_DAYS,
  SHIPPING_COUNTRY,
  SHIPPING_RATE_INR,
  STORE_SOCIAL_PROFILES,
  TRANSIT_DAYS,
} from "./storePolicy.js";

export function organizationId() {
  return `${getSiteUrl()}/#organization`;
}

/** Serialise for a <script type="application/ld+json">; `<` can't close the tag. */
export function jsonLdScript(data) {
  if (!data) return "";
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function categorySlug(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function merchantReturnPolicy() {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: SHIPPING_COUNTRY,
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: RETURN_WINDOW_DAYS,
    returnMethod: "https://schema.org/ReturnByMail",
    // The store books the return pickup; the original delivery charge is not refunded.
    returnFees: "https://schema.org/FreeReturn",
    merchantReturnLink: absoluteUrl("/return-refund"),
  };
}

export function offerShippingDetails() {
  return {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      value: SHIPPING_RATE_INR,
      currency: "INR",
    },
    shippingDestination: {
      "@type": "DefinedRegion",
      addressCountry: SHIPPING_COUNTRY,
    },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: {
        "@type": "QuantitativeValue",
        minValue: HANDLING_DAYS.min,
        maxValue: HANDLING_DAYS.max,
        unitCode: "DAY",
      },
      transitTime: {
        "@type": "QuantitativeValue",
        minValue: TRANSIT_DAYS.min,
        maxValue: TRANSIT_DAYS.max,
        unitCode: "DAY",
      },
    },
  };
}

/** Homepage: who runs the store, how to reach them, and the store-wide policies. */
export function buildOrganizationJsonLd() {
  const site = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "OnlineStore",
        "@id": organizationId(),
        name: STORE_LEGAL_NAME,
        url: site,
        logo: absoluteUrl("/urban/logo.png"),
        image: absoluteUrl("/banner/hero-image-01.webp"),
        email: STORE_EMAIL,
        telephone: STORE_PHONE_TEL,
        sameAs: STORE_SOCIAL_PROFILES,
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: STORE_EMAIL,
          telephone: STORE_PHONE_TEL,
          areaServed: SHIPPING_COUNTRY,
          availableLanguage: ["en", "ml"],
        },
        hasMerchantReturnPolicy: merchantReturnPolicy(),
      },
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        name: STORE_LEGAL_NAME,
        url: site,
        inLanguage: "en-IN",
        publisher: { "@id": organizationId() },
      },
    ],
  };
}

/** crumbs: [{ name, path }] from Home down to the current page. */
export function buildBreadcrumbJsonLd(crumbs) {
  const items = (crumbs || []).filter((c) => c && c.name && c.path);
  if (items.length < 2) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}
