"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { resolveBannerLink } from "@/lib/bannerLink";
import { getSiteUrl } from "@/lib/siteUrl";
import { HERO_DESKTOP_MEDIA, heroUsesMobileArt } from "@/lib/heroArtDirection";
import { HERO_SLIDES } from "./heroSlides";

const AUTO_MS = 6000;
const RING_R = 8.5;
const RING_C = 2 * Math.PI * RING_R;
const IMAGE_COMMON = { fill: true, sizes: "100vw", quality: 80 };

/**
 * One slide's artwork. With mobile art it renders a <picture> so phones only
 * ever download the portrait file and desktops only the landscape one.
 */
function HeroSlideImage({ slide, portrait, alt = "", first = false }) {
  const eager = first ? { loading: "eager", fetchPriority: "high" } : {};
  if (portrait && slide.mobileSrc) {
    const {
      props: { srcSet: desktop },
    } = getImageProps({ ...IMAGE_COMMON, alt, src: slide.src });
    const {
      props: { srcSet: mobile, ...rest },
    } = getImageProps({ ...IMAGE_COMMON, ...eager, alt, src: slide.mobileSrc });
    return (
      <picture>
        <source media={HERO_DESKTOP_MEDIA} srcSet={desktop} sizes={IMAGE_COMMON.sizes} />
        {/* eslint-disable-next-line jsx-a11y/alt-text -- alt comes from getImageProps */}
        <img {...rest} srcSet={mobile} className="object-cover object-center" />
      </picture>
    );
  }
  return (
    <Image {...IMAGE_COMMON} {...eager} src={slide.src} alt={alt} className="object-cover object-center" />
  );
}

/** `slides` comes from Store Theme -> Banner; the shipped set is the fallback. */
const HeroBanner = ({ slides }) => {
  const heroSlides = slides?.length ? slides : HERO_SLIDES;
  // `prev` is the page being wiped over; null until the first change so the
  // opening slide appears without an animation.
  const [{ page, dir, prev }, setNav] = useState({ page: 0, dir: 1, prev: null });
  const wrap = (p) => ((p % heroSlides.length) + heroSlides.length) % heroSlides.length;
  const idx = wrap(page);
  const slide = heroSlides[idx];
  const prevSlide = prev === null ? null : heroSlides[wrap(prev)];
  const link = resolveBannerLink(slide.href, { siteUrl: getSiteUrl() });
  // Desktop 1920 × 800; phones 1080 × 1620 once every slide has mobile art.
  const portrait = heroUsesMobileArt(heroSlides);

  const paginate = useCallback((newDir) => {
    setNav((s) => ({ page: s.page + newDir, dir: newDir, prev: s.page }));
  }, []);

  const goTo = (i) => {
    if (i === idx) return;
    setNav((s) => ({ page: i, dir: i > idx ? 1 : -1, prev: s.page }));
  };

  useEffect(() => {
    const t = setInterval(() => paginate(1), AUTO_MS);
    return () => clearInterval(t);
  }, [paginate, page]);

  return (
    <section
      data-home-hero
      className={`relative m-0 w-full overflow-hidden bg-black p-0 ${
        portrait ? "aspect-[1080/1620]" : "aspect-[1920/800]"
      } md:aspect-[1920/800] md:max-h-[82vh]`}
    >
      {/* Warm the upcoming slide so the wipe never reveals an unloaded image. */}
      {heroSlides.length > 1 ? (
        <div className="pointer-events-none absolute inset-0 opacity-0" aria-hidden>
          <HeroSlideImage slide={heroSlides[wrap(page + 1)]} portrait={portrait} />
        </div>
      ) : null}

      {prevSlide && prevSlide.src !== slide.src ? (
        <div key={`prev-${prev}`} className="absolute inset-0" aria-hidden>
          <HeroSlideImage slide={prevSlide} portrait={portrait} />
        </div>
      ) : null}

      <div
        key={page}
        className={`absolute inset-0 ${
          prev === null ? "" : dir > 0 ? "hero-wipe-next" : "hero-wipe-prev"
        }`}
      >
        {/* The first slide is preloaded from app/page.js. */}
        <HeroSlideImage slide={slide} portrait={portrait} alt={slide.alt} first={idx === 0} />
      </div>

      <div className="absolute inset-0 z-[1] bg-black/20 md:bg-black/25" aria-hidden />

      {/* Above the tint so the whole slide is tappable, below the dots (z-20)
          so switching slides still works. */}
      {link ? (
        link.external ? (
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={slide.alt || "Open banner link"}
            className="absolute inset-0 z-[2]"
          />
        ) : (
          <Link
            href={link.href}
            aria-label={slide.alt || "Open banner link"}
            className="absolute inset-0 z-[2]"
          />
        )
      ) : null}

      <h1 className="sr-only">Urban Aana</h1>

      <div className="absolute bottom-0 left-1/2 z-20 flex -translate-x-1/2 md:bottom-2">
        {heroSlides.map((item, i) => {
          const active = i === idx;
          return (
            <button
              key={item.src}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={active}
              onClick={() => goTo(i)}
              className="relative flex h-8 w-8 items-center justify-center md:h-10 md:w-7"
            >
              {active ? (
                // Keyed on `page` so the ring restarts with each slide's timer.
                <svg
                  key={page}
                  viewBox="0 0 20 20"
                  className="absolute h-5 w-5 -rotate-90"
                  aria-hidden
                >
                  <circle cx="10" cy="10" r={RING_R} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
                  <circle
                    cx="10"
                    cy="10"
                    r={RING_R}
                    fill="none"
                    stroke="#fff"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeDasharray={RING_C}
                    className="hero-dot-progress"
                    style={{ "--ring-c": RING_C, animationDuration: `${AUTO_MS}ms` }}
                  />
                </svg>
              ) : null}
              <span
                className={`block h-2.5 w-2.5 rounded-full transition-colors duration-300 ${
                  active ? "bg-white" : "bg-white/45"
                }`}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default HeroBanner;
