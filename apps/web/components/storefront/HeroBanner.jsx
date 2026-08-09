"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";

const HERO_SLIDES = [
  { src: "/banner/hero-image-01.png", alt: "Urban Aana hero 1" },
  { src: "/banner/hero-image-02.png", alt: "Urban Aana hero 2" },
  { src: "/banner/hero-image-03.png", alt: "Urban Aana hero 3" },
  { src: "/banner/hero-image-04.png", alt: "Urban Aana hero 4" },
];

const AUTO_MS = 5000;

const slideVariants = {
  enter: (dir) => ({ opacity: 0, scale: 1.04, x: dir > 0 ? 24 : -24 }),
  center: {
    opacity: 1,
    scale: 1,
    x: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
  exit: (dir) => ({
    opacity: 0,
    scale: 1.02,
    x: dir > 0 ? -24 : 24,
    transition: { duration: 0.45, ease: [0.4, 0, 1, 1] },
  }),
};

const HeroBanner = () => {
  const [[page, dir], setPage] = useState([0, 1]);
  const idx =
    ((page % HERO_SLIDES.length) + HERO_SLIDES.length) % HERO_SLIDES.length;

  const paginate = useCallback((newDir) => {
    setPage(([p]) => [p + newDir, newDir]);
  }, []);

  useEffect(() => {
    const t = setInterval(() => paginate(1), AUTO_MS);
    return () => clearInterval(t);
  }, [paginate, page]);

  return (
    <section
      data-home-hero
      className="relative m-0 w-full overflow-hidden bg-black p-0 aspect-[4320/1650] md:max-h-[82vh]"
    >
      <AnimatePresence initial={false} custom={dir} mode="popLayout">
        <motion.div
          key={page}
          custom={dir}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          className="absolute inset-0"
        >
          <Image
            src={HERO_SLIDES[idx].src}
            alt={HERO_SLIDES[idx].alt}
            fill
            priority={idx === 0}
            sizes="100vw"
            className="object-cover object-center"
          />
        </motion.div>
      </AnimatePresence>

      <div className="absolute inset-0 z-[1] bg-black/20 md:bg-black/25" aria-hidden />

      <h1 className="sr-only">Urban Aana</h1>

      <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-2 md:bottom-8">
        {HERO_SLIDES.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === idx}
            onClick={() => setPage([i, i > idx ? 1 : -1])}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === idx ? "w-7 bg-white" : "w-1.5 bg-white/45 hover:bg-white/70"
            }`}
          />
        ))}
      </div>
    </section>
  );
};

export default HeroBanner;
