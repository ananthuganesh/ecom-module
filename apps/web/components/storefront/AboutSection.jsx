"use client";

import Image from "next/image";
import Link from "next/link";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import FaqSection from "@/components/storefront/FaqSection";
import PhotoStrip from "@/components/storefront/PhotoStrip";
import ParallaxImage from "@/components/storefront/ParallaxImage";
import {
  ABOUT_FAQ,
  FOUNDER_PROFILES,
  SHOP_WITH_CONFIDENCE,
  initials,
} from "@/lib/aboutContent";

// Optimized WebP copies of the About shoot (public/images/about).
const HERO_IMAGE = "/images/about/about-hero.webp";
const WHO_IMAGE = "/images/about/about-who-we-are.webp";
const NAME_IMAGE = "/images/about/about-the-name.webp";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-10% 0px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const H2 =
  "title-knewave text-2xl leading-none tracking-tight normal-case md:text-4xl";
const BODY = "space-y-4 text-[15px] leading-relaxed text-gray-600 md:text-base";
const Accent = () => <div className="h-1 w-12 bg-brand-red" />;

const WHAT_WE_MAKE = [
  ["Oversized fit", "relaxed, comfortable, true to street style."],
  [
    "Culture-first design",
    "Kerala's stories and symbols, reimagined in a minimal way.",
  ],
  ["Everyday quality", "soft cotton tees with a refined feel."],
  [
    "Made for the bold",
    "for people who want clothes that say something without shouting.",
  ],
];

const BTN_PRIMARY =
  "inline-flex items-center justify-center rounded-lg bg-[#171717] px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-black";

/** About page — copy from "Urban Aana: About Us Page (SEO Copy)". */
const AboutSection = () => {
  return (
    <div className="w-full bg-white text-[#222222] font-[family-name:var(--font-archivo-narrow)]">
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <Image
          src={HERO_IMAGE}
          alt=""
          fill
          preload
          fetchPriority="high"
          sizes="100vw"
          className="object-cover object-[center_12%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30" />
        {/* Phones: same 1080×1620 shape as the homepage mobile hero (height = 1.5 × width), never shorter than the text. */}
        <div className="relative z-10 mx-auto flex min-h-[150vw] max-w-[1280px] flex-col justify-end px-6 pb-10 pt-16 md:min-h-[460px] md:px-10 md:pt-24 md:pb-16">
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="title-knewave max-w-3xl text-3xl leading-tight tracking-tight normal-case !text-white md:text-5xl"
          >
            Urban Aana:{" "}
            <span className="title-knewave-accent">
              Kerala-Inspired Streetwear
            </span>{" "}
            from Thiruvananthapuram
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-5 max-w-2xl space-y-3 text-white/90"
          >
            <p className="text-lg font-semibold md:text-xl">
              Where Style Meets Strength.
            </p>
            <p className="text-base leading-relaxed text-white/80 md:text-lg">
              Urban Aana is a Kerala streetwear brand, born in
              Thiruvananthapuram. We turn Kerala&apos;s culture and everyday
              life into minimal oversized tees for people who wear their
              identity with pride.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Who we are — text left, photo right (fills its half) */}
      <section className="grid grid-cols-1 lg:grid-cols-2">
        <motion.div
          {...fadeUp}
          className="order-2 flex items-center px-6 py-16 md:px-10 lg:order-1 lg:px-16 lg:py-24"
        >
          <div className="max-w-xl space-y-5">
            <h2 className={H2}>
              Who We <span className="title-knewave-accent">Are</span>
            </h2>
            <Accent />
            <div className={BODY}>
              <p>
                Urban Aana is a Kerala streetwear brand built by three friends
                from Thiruvananthapuram: Vipin VS, Amal V and Akarsh U. We
                started with one belief: clothing is more than fashion. It is a
                way to express who you are and to tell a story.
              </p>
              <p>
                Every design draws from the spirit of Kerala and the energy of
                modern urban culture, then strips it down to clean, minimal
                streetwear that is easy to wear and hard to ignore.
              </p>
            </div>
          </div>
        </motion.div>
        <ParallaxImage
          src={WHO_IMAGE}
          alt="Urban Aana oversized tees worn in front of a Kerala temple"
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="order-1 aspect-[4/5] w-full lg:order-2 lg:aspect-auto lg:min-h-[640px]"
        />
      </section>

      {/* The name — photo left (fills its half), text right */}
      <section className="grid grid-cols-1 lg:grid-cols-2">
        <ParallaxImage
          src={NAME_IMAGE}
          alt="Urban Aana oversized tee worn at a Kerala market with banana stalks"
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="aspect-[4/5] w-full lg:aspect-auto lg:min-h-[640px]"
        />
        <motion.div
          {...fadeUp}
          className="flex items-center px-6 py-16 md:px-10 lg:px-16 lg:py-24"
        >
          <div className="max-w-xl space-y-5">
            <h2 className={H2}>
              The Name: Urban +{" "}
              <span className="title-knewave-accent">Aana</span>
            </h2>
            <Accent />
            <div className={BODY}>
              <p>
                <strong className="text-[#222222]">Urban</strong> stands for
                modern street fashion and lifestyle.{" "}
                <strong className="text-[#222222]">Aana</strong>, the Malayalam
                word for elephant, stands for strength, tradition and pride.
              </p>
              <p>
                Put together, they carry our tagline:{" "}
                <strong className="text-[#222222]">
                  Where Style Meets Strength.
                </strong>
              </p>
              <p>
                The elephant is Kerala&apos;s own symbol, from temple festivals
                to everyday life. We took it to the street.
              </p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Founders — centred story, then one card per founder */}
      <section id="founders" className="scroll-mt-24 bg-[#f6f6f4]">
        <div className="mx-auto max-w-[1280px] px-6 py-16 md:px-10 md:py-24">
          <motion.div
            {...fadeUp}
            className="mx-auto max-w-2xl space-y-5 text-center"
          >
            <h2 className={H2}>
              Meet the <span className="title-knewave-accent">Founders</span>
            </h2>
            <div className="mx-auto h-1 w-12 bg-brand-red" />
            <div className={BODY}>
              <p>
                We are three guys from Thiruvananthapuram who grew up with
                Kerala&apos;s festivals, food, film and streets, and wanted to
                see that culture on the clothes we wear. We could not find
                streetwear that spoke for us, so we built it.
              </p>
            </div>
          </motion.div>

          <ul className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3">
            {FOUNDER_PROFILES.map((founder) => (
              <motion.li key={founder.name} {...fadeUp} className="text-center">
                <div className="relative mx-auto aspect-[4/5] w-full max-w-[280px] overflow-hidden rounded-xl bg-[#e9e9e5]">
                  {founder.photo ? (
                    <Image
                      src={founder.photo}
                      alt={`${founder.name}, co-founder of Urban Aana`}
                      fill
                      loading="lazy"
                      sizes="(max-width: 640px) 100vw, 280px"
                      className="object-cover object-center"
                    />
                  ) : (
                    // Placeholder until the founder's photo is added (lib/aboutContent.js).
                    <span
                      aria-hidden
                      className="absolute inset-0 flex items-center justify-center text-4xl font-semibold tracking-wide text-gray-400"
                    >
                      {initials(founder.name)}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-[16px] font-semibold text-[#222222]">
                  {founder.name}
                </p>
                <p className="text-[13px] text-gray-500">Co-founder</p>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>

      {/* What we make */}
      <section className="mx-auto max-w-[1280px] px-6 py-16 md:px-10 md:py-24">
        <motion.div {...fadeUp} className="max-w-2xl space-y-5">
          <h2 className={H2}>
            What We <span className="title-knewave-accent">Make</span>
          </h2>
          <Accent />
          <p className="text-[15px] leading-relaxed text-gray-600 md:text-base">
            Minimal{" "}
            <Link
              href="/all-products"
              className="font-medium text-[#222222] underline underline-offset-4 hover:text-brand-red"
            >
              oversized Kerala t-shirts
            </Link>{" "}
            inspired by Kerala culture. Clean design, relaxed fit and a refined
            feel, made for everyday streetwear across India.
          </p>
        </motion.div>
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WHAT_WE_MAKE.map(([title, text]) => (
            <li
              key={title}
              className="rounded-xl border border-gray-200 bg-white p-5 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-gray-300 hover:shadow-[0_10px_24px_-12px_rgba(0,0,0,0.18)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <p className="text-[15px] font-semibold text-[#222222]">
                {title}
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-gray-600">
                {text}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Mission */}
      <section className="bg-[#121212]" style={{ color: "rgb(243, 241, 236)" }}>
        <motion.div
          {...fadeUp}
          className="mx-auto max-w-[860px] px-6 py-16 text-center md:px-10 md:py-24"
        >
          <h2 className={`${H2} !text-[rgb(243,241,236)]`}>
            Our <span className="title-knewave-accent">Mission</span>
          </h2>
          <div className="mx-auto mt-4 h-1 w-12 bg-brand-red" />
          <p className="mt-6 text-base leading-relaxed text-[rgb(243,241,236)]/80 md:text-lg">
            To create quality, culturally inspired streetwear that blends
            comfort, creativity and individuality.
          </p>
        </motion.div>
      </section>

      {/* Shop with confidence */}
      <section className="bg-[#f6f6f4]">
        <motion.div
          {...fadeUp}
          className="mx-auto max-w-[860px] space-y-5 px-6 py-14 md:px-10 md:py-20"
        >
          <h2 className={H2}>
            Shop with <span className="title-knewave-accent">Confidence</span>
          </h2>
          <Accent />
          <p className="text-[15px] leading-relaxed text-gray-600 md:text-base">
            {SHOP_WITH_CONFIDENCE}
          </p>
          <p className="text-[15px] text-gray-600 md:text-base">
            Read our{" "}
            <Link
              href="/return-refund"
              className="font-medium text-[#222222] underline underline-offset-4 hover:text-brand-red"
            >
              Returns &amp; Shipping policy
            </Link>{" "}
            or{" "}
            <Link
              href="/contact"
              className="font-medium text-[#222222] underline underline-offset-4 hover:text-brand-red"
            >
              contact us
            </Link>
            .
          </p>
        </motion.div>
      </section>

      {/* Community + CTA */}
      <section className="mx-auto max-w-[860px] px-6 py-16 text-center md:px-10 md:py-24">
        <motion.div {...fadeUp} className="space-y-5">
          <h2 className={H2}>
            Join the Urban Aana{" "}
            <span className="title-knewave-accent">Community</span>
          </h2>
          <div className="mx-auto h-1 w-12 bg-brand-red" />
          <p className="text-[15px] leading-relaxed text-gray-600 md:text-base">
            From Thiruvananthapuram to the rest of India, Urban Aana is for
            everyone who carries Kerala with pride. Explore the collection,
            follow us on{" "}
            <a
              href="https://www.instagram.com/urbanaana.in"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#222222] underline underline-offset-4 hover:text-brand-red"
            >
              Instagram @urbanaana.in
            </a>{" "}
            and wear the story.
          </p>
          <div className="pt-2">
            <Link href="/all-products" className={BTN_PRIMARY}>
              Shop Urban Aana Tees
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Community photos — full width, edge to edge (shared with the homepage) */}
      <PhotoStrip />

      {/* FAQ — same component and design as the homepage FAQ */}
      <FaqSection
        divider={false}
        items={ABOUT_FAQ.map(({ q, a }, i) => ({
          id: `about-${i}`,
          question: q,
          answer: a,
        }))}
      />
    </div>
  );
};

export default AboutSection;
