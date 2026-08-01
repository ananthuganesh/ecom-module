import HeroBanner from "@/components/storefront/HeroBanner";
import ProductGrid from "@/components/storefront/ProductGrid";
import InstagramReels from "@/components/storefront/InstagramReels";
import AboutSection from "@/components/storefront/AboutSection";

export default function Home() {
  return (
    <div className="w-full bg-white font-sans">
      <HeroBanner />

      <section
        id="latest-drops"
        className="py-6 md:py-10 px-2 md:px-4 lg:px-8 scroll-mt-24"
      >
        <header className="mb-3 md:mb-6 text-left">
          <h2 className="title-knewave text-3xl md:text-4xl normal-case leading-none tracking-tight">
            Latest <span className="title-knewave-accent">Drops</span>
          </h2>
        </header>
        <ProductGrid />
      </section>

      <InstagramReels />
      <AboutSection />
    </div>
  );
}
