import { preload } from "react-dom";
import { canonicalUrl } from "@/lib/siteUrl";

export const metadata = {
  title: "Contact",
  description:
    "Contact Urban Aana — email info@urbanaana.com or call +91 62384 82408 for order and product support.",
  alternates: { canonical: canonicalUrl("/contact") },
  openGraph: { url: canonicalUrl("/contact") },
};

export default function ContactLayout({ children }) {
  preload("/images/44.webp", { as: "image", fetchPriority: "high" });
  return children;
}
