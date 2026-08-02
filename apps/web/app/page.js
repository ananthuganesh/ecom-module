import HeroBanner from "@/components/storefront/HeroBanner";
import ProductGrid from "@/components/storefront/ProductGrid";
import InstagramReels from "@/components/storefront/InstagramReels";
import TwoColumnImages from "@/components/storefront/TwoColumnImages";
import AboutSection from "@/components/storefront/AboutSection";

export default function Home() {
  return (
    <div className="w-full bg-white font-sans">
      <HeroBanner />

      <section
        id="latest-drops"
        className="py-6 md:py-10 px-2 md:px-4 lg:px-8 scroll-mt-24"
      >
        <header className="mb-3 w-full text-center md:mb-6">
          <h2 className="title-knewave mx-auto w-full text-center text-3xl leading-none tracking-tight normal-case md:text-4xl">
            Latest <span className="title-knewave-accent">Drops</span>
          </h2>
        </header>
        <ProductGrid />
      </section>

      <InstagramReels />
      <TwoColumnImages />
      <AboutSection />
    </div>
  );
}
