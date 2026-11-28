import AboutSection from "@/components/storefront/AboutSection";
import { canonicalUrl, getSiteUrl } from "@/lib/siteUrl";
import { jsonLdScript } from "@/lib/structuredData";
import {
  ABOUT_DESCRIPTION,
  ABOUT_OG_TITLE,
  ABOUT_TITLE,
  FOUNDERS_ALT,
  FOUNDERS_IMAGE,
  aboutJsonLd,
} from "@/lib/aboutContent";

export const metadata = {
  title: { absolute: ABOUT_TITLE },
  description: ABOUT_DESCRIPTION,
  alternates: { canonical: canonicalUrl("/about") },
  openGraph: {
    url: canonicalUrl("/about"),
    title: ABOUT_OG_TITLE,
    description: ABOUT_DESCRIPTION,
    images: [{ url: FOUNDERS_IMAGE, alt: FOUNDERS_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: ABOUT_OG_TITLE,
    description: ABOUT_DESCRIPTION,
    images: [FOUNDERS_IMAGE],
  },
};

export default function AboutPage() {
  const site = getSiteUrl();

  return (
    <main className="min-h-screen bg-white">
      {aboutJsonLd(site).map((data) => (
        <script
          key={data["@type"]}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }}
        />
      ))}
      <AboutSection />
    </main>
  );
}
