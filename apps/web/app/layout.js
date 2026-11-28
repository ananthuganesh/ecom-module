import "./globals.css";
import { Inter, Geist, Archivo_Narrow, Noto_Sans_Malayalam } from "next/font/google";
import GtmClient from "@/components/GtmClient";
import MetaPixel from "@/components/MetaPixel";
import ClarityClient from "@/components/ClarityClient";
import { metaPixelBootstrap, normalizeMetaPixelId } from "@/lib/metaPixel";
import TrackingUser from "@/components/TrackingUser";
import CustomerSessionSync from "@/components/CustomerSessionSync";
import AttributionCapture from "@/components/AttributionCapture";
import StorefrontShell from "@/components/storefront/StorefrontShell";
import { HERO_OG_IMAGE } from "@/components/storefront/heroSlides";

/* Preset b3ZNhPpghM: Inter (sans) + Geist (heading) */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistHeading = Geist({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

/* Storefront-only fonts */
const archivoNarrow = Archivo_Narrow({
  subsets: ["latin"],
  variable: "--font-archivo-narrow",
  display: "swap",
});

const notoMalayalam = Noto_Sans_Malayalam({
  weight: ["700", "800", "900"],
  subsets: ["malayalam"],
  variable: "--font-malayalam",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(
    (process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.PUBLIC_WEB_URL ||
      "https://urbanaana.com").replace(/\/$/, "")
  ),
    title: {
      default: "URBAN AANA | Premium Streetwear",
      template: "%s | Urban Aana",
    },
    description: "Official online store for the URBAN AANA tribe. Premium streetwear shipped across India.",
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "Urban Aana",
    title: "URBAN AANA | Premium Streetwear",
    description: "Official online store for the URBAN AANA tribe.",
    images: [HERO_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "URBAN AANA | Premium Streetwear",
    description: "Official online store for the URBAN AANA tribe.",
    images: [HERO_OG_IMAGE.url],
  },
};

function resolveGtmId() {
  const enabled =
    process.env.NEXT_PUBLIC_GTM_ENABLED !== "false" &&
    process.env.GTM_ENABLED !== "false";
  if (!enabled) return "";
  // Require explicit env — do not fall back to a hardcoded container id.
  return (process.env.NEXT_PUBLIC_GTM_ID || process.env.GTM_ID || "").trim();
}

export default function RootLayout({ children }) {
  const gtmId = resolveGtmId();
  // Same id the API sends Conversions API events to. The pixel must not also
  // be loaded by a GTM tag, or every event is counted twice.
  // Microsoft Clarity. Baked in at build (storefront pages are prerendered).
  const clarityId = process.env.NEXT_PUBLIC_CLARITY_ID || process.env.CLARITY_PROJECT_ID || "";
  const metaPixelId = normalizeMetaPixelId(
    process.env.NEXT_PUBLIC_META_PIXEL_ID || process.env.META_PIXEL_ID
  );

  return (
    <html
      lang="en-IN"
      suppressHydrationWarning
      className={`${inter.variable} ${geistHeading.variable} ${archivoNarrow.variable} ${notoMalayalam.variable}`}
    >
      <head>
        <link rel="icon" href="/urban/favicon.png" />
        <link rel="preconnect" href="https://images.urbanaana.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://images.urbanaana.com" />
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        {metaPixelId ? (
          <script
            id="meta-pixel-bootstrap"
            dangerouslySetInnerHTML={{ __html: metaPixelBootstrap(metaPixelId) }}
          />
        ) : null}
      </head>
      <body className="font-sans" suppressHydrationWarning>
        <GtmClient gtmId={gtmId} />
        <MetaPixel pixelId={metaPixelId} />
        <ClarityClient projectId={clarityId} />
        <TrackingUser />
        <CustomerSessionSync />
        <AttributionCapture />
        <StorefrontShell>{children}</StorefrontShell>
      </body>
    </html>
  );
}
