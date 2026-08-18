"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";

const WhyUrbanAana = dynamic(() => import("@/components/storefront/WhyUrbanAana"));

const HERO_IMAGE = "/urban/about-1.webp";
const WHO_IMAGE = "/images/founders.webp";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-10% 0px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const AboutSection = () => {
  return (
    <div className="w-full bg-white text-[#222222] font-[family-name:var(--font-lato)]">
      {/* Hero */}
      <section className="relative isolate min-h-[72vh] overflow-hidden md:min-h-[78vh]">
        <Image
          src={HERO_IMAGE}
          alt="Urban Aana"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/25" />
        <div className="relative z-10 mx-auto flex min-h-[72vh] max-w-[1280px] flex-col justify-end px-6 pb-14 pt-28 md:min-h-[78vh] md:px-10 md:pb-20">
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="title-knewave text-2xl leading-none tracking-tight normal-case !text-white md:text-4xl"
          >
            About <span className="title-knewave-accent">Us</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-5 max-w-xl text-base leading-relaxed text-white/85 md:text-lg"
          >
            Redefining street culture through authentic design and uncompromising
            quality
          </motion.p>
        </div>
      </section>

      {/* Who we are — two column */}
      <section className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-10 px-6 py-16 md:gap-14 md:px-10 md:py-24 lg:grid-cols-2">
        <motion.div {...fadeUp} className="space-y-5">
          <h2 className="title-knewave text-2xl leading-none tracking-tight normal-case md:text-4xl">
            Who we <span className="title-knewave-accent">are</span>
          </h2>
          <div className="h-1 w-12 bg-brand-red" />
          <div className="space-y-4 text-[15px] leading-relaxed text-gray-600 md:text-base">
            <p>
              Welcome to{" "}
              <span className="font-bold text-[#222222]">URBAN AANA</span> a
              premium streetwear brand inspired by the spirit of Kerala and the
              energy of modern urban culture.
            </p>
            <p>
              The name itself represents our identity:{" "}
              <span className="font-bold text-[#222222]">URBAN</span> reflects
              modern street fashion and lifestyle, while{" "}
              <span className="font-bold text-[#222222]">AANA</span> (elephant)
              symbolizes strength, tradition, and pride.
            </p>
            <p>
              At Urban Aana, we believe clothing is more than fashion — it is a
              way to express identity and tell stories. Our designs are inspired
              by Kerala&apos;s culture and everyday life, transformed into
              minimal streetwear for the bold.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative aspect-[1024/877] w-full overflow-hidden rounded-xl bg-[#f9f9f5] lg:rounded-2xl"
        >
          <Image
            src={WHO_IMAGE}
            alt="Meet the founders of Urban Aana"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain object-center"
          />
        </motion.div>
      </section>

      {/* Mission */}
      <section className="bg-[#222222]" style={{ color: "rgb(243, 241, 236)" }}>
        <motion.div
          {...fadeUp}
          className="mx-auto max-w-[860px] px-6 py-16 text-center md:px-10 md:py-24"
        >
          <h2 className="title-knewave text-2xl leading-none tracking-tight normal-case !text-[rgb(243,241,236)] md:text-4xl">
            Our <span className="title-knewave-accent">Mission</span>
          </h2>
          <div className="mx-auto mt-4 h-1 w-12 bg-brand-red" />
          <p className="mt-6 text-base leading-relaxed text-[rgb(243,241,236)]/80 md:text-lg">
            To create premium, culturally inspired streetwear that blends
            comfort, creativity, and individuality.
          </p>
        </motion.div>
      </section>

      {/* Trust */}
      <WhyUrbanAana
        title={
          <>
            The <span className="title-knewave-accent">Trust</span>
          </>
        }
      />
    </div>
  );
};

export default AboutSection;
