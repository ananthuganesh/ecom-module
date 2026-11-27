import { preload } from "react-dom";
import dynamic from "next/dynamic";
import { getImageProps } from "next/image";
import HeroBanner from "@/components/storefront/HeroBanner";
import ProductCarousel from "@/components/storefront/ProductCarousel";
import { HERO_LCP_SRC } from "@/components/storefront/heroSlides";
import { fetchHeroSlides } from "@/lib/fetchHeroSlides";
import { HERO_DESKTOP_MEDIA, HERO_MOBILE_MEDIA, heroUsesMobileArt } from "@/lib/heroArtDirection";
import { fetchStoreProducts } from "@/lib/fetchProducts";
import { filterInStock } from "@/lib/productStock";
import { canonicalUrl } from "@/lib/siteUrl";
import { buildOrganizationJsonLd, jsonLdScript } from "@/lib/structuredData";

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

/**
 * Preload the first slide exactly as HeroBanner renders it (optimized srcset,
 * not the raw file), split by breakpoint when phones get their own art.
 */
function preloadFirstHeroSlide(slides) {
  const first = slides[0] || { src: HERO_LCP_SRC };
  const portrait = heroUsesMobileArt(slides);
  const hint = (src, media) => {
    const { props } = getImageProps({ src, alt: "", fill: true, sizes: "100vw", quality: 80 });
    preload(props.src, {
      as: "image",
      fetchPriority: "high",
      imageSrcSet: props.srcSet,
      imageSizes: props.sizes,
      ...(media ? { media } : {}),
    });
  };
  if (portrait) {
    hint(first.src, HERO_DESKTOP_MEDIA);
    hint(first.mobileSrc, HERO_MOBILE_MEDIA);
  } else {
    hint(first.src);
  }
}

const HOME_SECTION_SIZE = 12;
const HOME_COLLECTIONS = [
  { slug: "new-arrivals", first: "New", accent: "Arrivals", listId: "home-new-arrivals", listName: "New Arrivals" },
  { slug: "best-sellers", first: "Best", accent: "Sellers", listId: "home-best-sellers", listName: "Best Sellers" },
];

/** A homepage product row backed by a collection, with a link to the full page. */
function HomeCollectionSection({ section, products }) {
  // Hidden until the collection has something to show (e.g. no sales yet).
  if (!products.length) return null;
  return (
    <section id={section.slug} className="scroll-mt-24 py-6 md:py-10">
      <ProductCarousel
        products={products}
        listId={section.listId}
        listName={section.listName}
        viewAllHref={`/collections/${section.slug}`}
        titleFirst={section.first}
        titleAccent={section.accent}
      />
    </section>
  );
}

export default async function Home() {
  const heroSlides = await fetchHeroSlides();
  preloadFirstHeroSlide(heroSlides);

  // Automatic collections (services/collection_rules.py), already ranked.
  // Over-fetch: sold-out products are hidden and the API has no stock filter.
  const [newArrivals, bestSellers] = await Promise.all(
    HOME_COLLECTIONS.map(async ({ slug }) =>
      filterInStock(await fetchStoreProducts({ collection: slug, pageSize: HOME_SECTION_SIZE * 3 })).slice(
        0,
        HOME_SECTION_SIZE
      )
    )
  );

  return (
    <div className="w-full bg-white font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(buildOrganizationJsonLd()) }}
      />
      <HeroBanner slides={heroSlides} />

      <HomeCollectionSection section={HOME_COLLECTIONS[0]} products={newArrivals} />
      <HomeCollectionSection section={HOME_COLLECTIONS[1]} products={bestSellers} />

      <InstagramReels />
      <TwoColumnImages />
      <TwoColumnVideos />
      <WhyUrbanAana />
      <FaqSection />
    </div>
  );
}
