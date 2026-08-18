import { preload } from "react-dom";
import AboutSection from "@/components/storefront/AboutSection";
import { canonicalUrl } from "@/lib/siteUrl";

export const metadata = {
  title: "About Us",
  description:
    "Urban Aana — redefining street culture through authentic design and uncompromising quality. Premium streetwear inspired by Kerala and modern urban culture.",
  alternates: { canonical: canonicalUrl("/about") },
  openGraph: { url: canonicalUrl("/about") },
};

export default function AboutPage() {
  preload("/urban/about-1.webp", { as: "image", fetchPriority: "high" });

  return (
    <main className="min-h-screen bg-white">
      <AboutSection />
    </main>
  );
}
