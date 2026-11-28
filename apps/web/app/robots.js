import { getSiteUrl } from "@/lib/siteUrl";

/** Ecommerce robots: index catalog + content; keep session/checkout/admin out. */
export default function robots() {
  const site = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/_next/static/"],
        disallow: [
          "/admin",
          "/admin/",
          "/checkout",
          "/cart",
          "/wishlist",
          "/account",
          "/account/",
          "/login",
          "/order/",
          "/api/",
          "/all-products?",
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
