import { getSiteUrl } from "@/lib/siteUrl";

export default function robots() {
  const site = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/checkout",
          "/api/",
          "/account/",
          "/cart/recover",
          "/sentry-example-page",
          "/test-route",
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
