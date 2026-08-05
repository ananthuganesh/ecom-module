import HeroBanner from "@/components/storefront/HeroBanner";
import ProductGrid from "@/components/storefront/ProductGrid";
import InstagramReels from "@/components/storefront/InstagramReels";
import TwoColumnImages from "@/components/storefront/TwoColumnImages";
import TwoColumnVideos from "@/components/storefront/TwoColumnVideos";
import WhyUrbanAana from "@/components/storefront/WhyUrbanAana";
import { getCatalogConfig } from "@/lib/catalogConfig";
import { fetchStoreProducts } from "@/lib/fetchProducts";

// Route segment cache floor (Next requires a static literal).
// Per-request fetch TTL is STORE_CATALOG_REVALIDATE.
export const revalidate = 60;

export default async function Home() {
  const { homePageSize, cardPriorityCount } = getCatalogConfig();
  const products = await fetchStoreProducts({
    pageSize: homePageSize,
    sort: "newest",
  });

  return (
    <div className="w-full bg-white font-sans">
      <HeroBanner />

      <section
        id="latest-drops"
        className="scroll-mt-24 px-2 py-6 md:px-4 md:py-10 lg:px-8"
      >
        <header className="mb-3 w-full text-center md:mb-6">
          <h2 className="title-knewave mx-auto w-full text-center text-2xl leading-none tracking-tight normal-case md:text-4xl">
            Latest <span className="title-knewave-accent">Drops</span>
          </h2>
        </header>
        <ProductGrid products={products} priorityCount={cardPriorityCount} />
      </section>

      <InstagramReels />
      <TwoColumnImages />
      <TwoColumnVideos />
      <WhyUrbanAana />
    </div>
  );
}
