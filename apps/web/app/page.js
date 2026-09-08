import { preload } from "react-dom";
import dynamic from "next/dynamic";
import HeroBanner from "@/components/storefront/HeroBanner";
import ProductGrid from "@/components/storefront/ProductGrid";
import { HERO_LCP_SRC } from "@/components/storefront/heroSlides";
import { fetchHeroSlides } from "@/lib/fetchHeroSlides";
import { getCatalogConfig } from "@/lib/catalogConfig";
import { fetchStoreProducts } from "@/lib/fetchProducts";
import { filterInStock } from "@/lib/productStock";
import { canonicalUrl } from "@/lib/siteUrl";

const InstagramReels = dynamic(() => import("@/components/storefront/InstagramReels"));
const TwoColumnImages = dynamic(() => import("@/components/storefront/TwoColumnImages"));
const TwoColumnVideos = dynamic(() => import("@/components/storefront/TwoColumnVideos"));
const WhyUrbanAana = dynamic(() => import("@/components/storefront/WhyUrbanAana"));
const FaqSection = dynamic(() => import("@/components/storefront/FaqSection"));

export const metadata = {
  alternates: { canonical: canonicalUrl("/") },
  openGraph: { url: canonicalUrl("/") },
};

// Route segment cache floor (Next requires a static literal).
// Per-request fetch TTL is STORE_CATALOG_REVALIDATE.
export const revalidate = 60;

export default async function Home() {
  const heroSlides = await fetchHeroSlides();
  // Preload whichever slide actually renders first, not the shipped default.
  preload(heroSlides[0]?.src || HERO_LCP_SRC, {
    as: "image",
    fetchPriority: "high",
  });

  const { homePageSize } = getCatalogConfig();
  // Over-fetch: sold-out drops are hidden below, and the API has no stock
  // filter, so asking for exactly homePageSize would leave gaps in the grid.
  const fetched = await fetchStoreProducts({
    pageSize: Math.min(100, homePageSize * 3),
    sort: "newest",
  });
  const products = filterInStock(fetched).slice(0, homePageSize);

  return (
    <div className="w-full bg-white font-sans">
      <HeroBanner slides={heroSlides} />

      <section
        id="latest-drops"
        className="scroll-mt-24 px-4 py-6 md:px-4 md:py-10 lg:px-8"
      >
        <header className="mb-3 w-full text-center md:mb-6">
          <h2 className="title-knewave mx-auto w-full text-center text-2xl leading-none tracking-tight normal-case md:text-4xl">
            Latest <span className="title-knewave-accent">Drops</span>
          </h2>
        </header>
        <ProductGrid products={products} priorityCount={0} />
      </section>

      <InstagramReels />
      <TwoColumnImages />
      <TwoColumnVideos />
      <WhyUrbanAana />
      <FaqSection />
    </div>
  );
}
