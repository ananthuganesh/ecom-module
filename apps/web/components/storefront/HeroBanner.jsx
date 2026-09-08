"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { HERO_SLIDES } from "./heroSlides";

const AUTO_MS = 10000;

/** `slides` comes from Store Theme -> Banner; the shipped set is the fallback. */
const HeroBanner = ({ slides }) => {
  const heroSlides = slides?.length ? slides : HERO_SLIDES;
  const [[page], setPage] = useState([0, 1]);
  const idx =
    ((page % heroSlides.length) + heroSlides.length) % heroSlides.length;
  const slide = heroSlides[idx];

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
      <Image
        key={slide.src}
        src={slide.src}
        alt={slide.alt}
        fill
        priority={idx === 0}
        fetchPriority={idx === 0 ? "high" : "auto"}
        quality={80}
        sizes="100vw"
        className="object-cover object-center"
      />

      <div className="absolute inset-0 z-[1] bg-black/20 md:bg-black/25" aria-hidden />

      <h1 className="sr-only">Urban Aana</h1>

      <div className="absolute bottom-1 left-1/2 z-20 flex -translate-x-1/2 md:bottom-8">
        {heroSlides.map((item, i) => (
          <button
            key={item.src}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === idx}
            onClick={() => setPage([i, i > idx ? 1 : -1])}
            className="flex h-11 w-11 items-center justify-center md:h-8 md:w-8"
          >
            <span
              className={`block h-1.5 rounded-full transition-all duration-300 ${
                i === idx ? "w-7 bg-white" : "w-1.5 bg-white/45"
              }`}
            />
          </button>
        ))}
      </div>
    </section>
  );
};

export default HeroBanner;
