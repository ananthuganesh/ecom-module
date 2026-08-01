import "./globals.css";
import { Inter, Geist, Lato, Archivo_Black, Noto_Sans_Malayalam } from "next/font/google";
import { DEFAULT_GTM_ID } from "@/components/GtmSnippet";
import GtmClient from "@/components/GtmClient";
import AttributionCapture from "@/components/AttributionCapture";
import StorefrontShell from "@/components/storefront/StorefrontShell";

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
const lato = Lato({
  weight: ["400", "700", "900"],
  subsets: ["latin"],
  variable: "--font-lato",
  display: "swap",
});

const archivoBlack = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-archivo-black",
  display: "swap",
});

const notoMalayalam = Noto_Sans_Malayalam({
  weight: ["700", "800", "900"],
  subsets: ["malayalam"],
  variable: "--font-malayalam",
  display: "swap",
});

export const metadata = {
  title: "URBAN AANA | Premium Streetwear",
  description: "Official online store for the URBAN AANA tribe.",
};

function resolveGtmId() {
  const enabled =
    process.env.NEXT_PUBLIC_GTM_ENABLED !== "false" &&
    process.env.GTM_ENABLED !== "false";
  if (!enabled) return "";
  return (
    (process.env.NEXT_PUBLIC_GTM_ID || process.env.GTM_ID || DEFAULT_GTM_ID).trim() ||
    DEFAULT_GTM_ID
  );
}

export default function RootLayout({ children }) {
  const gtmId = resolveGtmId();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${geistHeading.variable} ${lato.variable} ${archivoBlack.variable} ${notoMalayalam.variable}`}
    >
      <head>
        <link rel="preload" href="/banner.webp" as="image" />
        <link
          rel="preload"
          href="/banner-mobile.webp"
          as="image"
          media="(max-width: 767px)"
        />
      </head>
      <body className="font-sans" suppressHydrationWarning>
        <GtmClient gtmId={gtmId} />
        <AttributionCapture />
        <StorefrontShell>{children}</StorefrontShell>
      </body>
    </html>
  );
}
