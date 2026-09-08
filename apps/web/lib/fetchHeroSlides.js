import { getInternalApiBase } from "@/lib/siteUrl";
import { HERO_SLIDES } from "@/components/storefront/heroSlides";

/**
 * Homepage hero slides, managed under Store Theme → Banner.
 *
 * Fetched server-side so the first slide can be preloaded for LCP and the hero
 * renders on first paint. Falls back to the slides that ship with the app, so
 * an API blip never leaves the homepage with an empty hero.
 */
export async function fetchHeroSlides({ revalidate = 300 } = {}) {
  try {
    const res = await fetch(`${getInternalApiBase()}/api/store-theme/banners`, {
      next: { revalidate, tags: ["store-theme"] },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return HERO_SLIDES;
    const data = await res.json();
    const slides = (data?.heroSlides || [])
      .map((s) => ({
        src: s.url,
        alt: s.alt || "",
        href: s.href || null,
      }))
      .filter((s) => s.src);
    return slides.length ? slides : HERO_SLIDES;
  } catch (err) {
    console.error("fetchHeroSlides failed", err);
    return HERO_SLIDES;
  }
}
