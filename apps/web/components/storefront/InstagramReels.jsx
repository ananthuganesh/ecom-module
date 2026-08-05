"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { reelsService } from "@/api";
import {
  DEFAULT_STOREFRONT_REELS,
  normalizeStorefrontReels,
} from "@/utils/storefrontReels";

function playMuted(video) {
  if (!video) return;
  video.muted = true;
  video.playsInline = true;
  const attempt = video.play();
  if (attempt?.catch) attempt.catch(() => undefined);
}

function ReelCard({ videoUrl, altText }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video || !videoUrl) return;

    video.src = videoUrl;
    video.load();

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.2) {
          playMuted(video);
        } else {
          video.pause();
        }
      },
      { threshold: [0, 0.2, 0.5, 1] }
    );

    observer.observe(container);
    playMuted(video);

    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [videoUrl]);

  return (
    <div
      ref={containerRef}
      className="group relative block w-[calc((100vw-2rem-0.5rem)/2)] shrink-0 overflow-hidden rounded-xl bg-white sm:w-[calc((100vw-3rem-1.5rem)/4)] md:w-[calc((100vw-5rem)/5)] lg:w-[calc((100vw-8rem)/5)] lg:rounded-2xl"
      aria-label={altText || "Product showcase"}
    >
      <div
        className="relative w-full overflow-hidden rounded-lg bg-black lg:rounded-xl"
        style={{ aspectRatio: "2 / 3" }}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          aria-label={altText || "Product showcase"}
        />
      </div>
    </div>
  );
}

/** Repeat items until one half of the strip is wide enough for a seamless loop. */
function buildTrackItems(reels, minCount = 12) {
  if (!reels.length) return [];
  const target = Math.max(minCount, reels.length);
  const items = [];
  let i = 0;
  while (items.length < target) {
    const reel = reels[i % reels.length];
    if (reel?.videoUrl) items.push(reel);
    i += 1;
    if (i > reels.length * 50) break;
  }
  return items;
}

function MarqueeHalf({ items, copy }) {
  return (
    <div
      className="flex shrink-0 gap-2 pr-2 md:gap-3 md:pr-3 lg:gap-4 lg:pr-4"
      aria-hidden={copy > 0 ? true : undefined}
    >
      {items.map((reel, index) => (
        <ReelCard
          key={`${copy}-${reel.id}-${index}`}
          videoUrl={reel.videoUrl}
          altText={reel.altText}
        />
      ))}
    </div>
  );
}

export default function InstagramReels() {
  const [reels, setReels] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    reelsService
      .list()
      .then((data) => {
        if (cancelled) return;
        const next = normalizeStorefrontReels(data);
        setReels(next.length ? next : DEFAULT_STOREFRONT_REELS);
      })
      .catch(() => {
        if (!cancelled) setReels(DEFAULT_STOREFRONT_REELS);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const trackItems = useMemo(() => buildTrackItems(reels, 12), [reels]);

  if (!loaded && reels.length === 0) {
    return (
      <section className="scroll-mt-24 py-6 md:py-10">
        <header className="mb-3 w-full px-2 text-center md:mb-6 md:px-4 lg:px-8">
          <h2 className="title-knewave mx-auto w-full text-center text-2xl leading-none tracking-tight normal-case md:text-4xl">
            Product <span className="title-knewave-accent">Showcase</span>
          </h2>
        </header>
        <div className="grid grid-cols-2 gap-2 px-2 sm:grid-cols-4 md:grid-cols-5 md:gap-3 md:px-4 lg:gap-4 lg:px-8">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`animate-pulse rounded-xl bg-gray-100 lg:rounded-2xl ${
                i > 1 ? "hidden sm:block" : ""
              } ${i > 3 ? "sm:hidden md:block" : ""}`}
              style={{ aspectRatio: "2 / 3" }}
            />
          ))}
        </div>
      </section>
    );
  }

  if (!trackItems.length) return null;

  return (
    <section className="scroll-mt-24 py-6 md:py-10">
      <header className="mb-3 w-full px-2 text-center md:mb-6 md:px-4 lg:px-8">
        <h2 className="title-knewave mx-auto w-full text-center text-2xl leading-none tracking-tight normal-case md:text-4xl">
          Product <span className="title-knewave-accent">Showcase</span>
        </h2>
      </header>

      <div className="ua-reels-strip relative w-full overflow-hidden px-2 md:px-4 lg:px-8">
        <div className="ua-reels-marquee flex w-max">
          <MarqueeHalf items={trackItems} copy={0} />
          <MarqueeHalf items={trackItems} copy={1} />
        </div>
      </div>

      <style>{`
        @keyframes ua-reels-marquee {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
        .ua-reels-marquee {
          animation: ua-reels-marquee 35s linear infinite;
          will-change: transform;
        }
        .ua-reels-strip:hover .ua-reels-marquee {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .ua-reels-marquee { animation: none; }
        }
      `}</style>
    </section>
  );
}
