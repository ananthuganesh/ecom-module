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
      className="group relative block w-[calc((100vw-3rem)/5)] shrink-0 overflow-hidden rounded-xl bg-white md:w-[calc((100vw-5rem)/5)] lg:w-[calc((100vw-8rem)/5)] lg:rounded-2xl"
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

/** Repeat items until the track is wide enough for a seamless loop. */
function buildTrackItems(reels, minCount = 10) {
  if (!reels.length) return [];
  const items = [];
  let i = 0;
  while (items.length < minCount) {
    items.push(reels[i % reels.length]);
    i += 1;
  }
  return items;
}

function MarqueeTrack({ items, copy }) {
  return (
    <div className="ua-reels-marquee flex shrink-0 gap-2 pr-2 md:gap-3 md:pr-3 lg:gap-4 lg:pr-4">
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

  const trackItems = useMemo(() => buildTrackItems(reels, 10), [reels]);

  if (!loaded && reels.length === 0) {
    return (
      <section className="scroll-mt-24 py-6 md:py-10">
        <header className="mb-3 w-full px-2 text-center md:mb-6 md:px-4 lg:px-8">
          <h2 className="title-knewave mx-auto w-full text-center text-3xl leading-none tracking-tight normal-case md:text-4xl">
            Product <span className="title-knewave-accent">Showcase</span>
          </h2>
        </header>
        <div className="grid grid-cols-5 gap-2 px-2 md:gap-3 md:px-4 lg:gap-4 lg:px-8">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl bg-gray-100 lg:rounded-2xl"
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
        <h2 className="title-knewave mx-auto w-full text-center text-3xl leading-none tracking-tight normal-case md:text-4xl">
          Product <span className="title-knewave-accent">Showcase</span>
        </h2>
      </header>

      <div className="relative w-full overflow-hidden px-2 md:px-4 lg:px-8">
        <div className="flex w-max">
          <MarqueeTrack items={trackItems} copy={0} />
          <MarqueeTrack items={trackItems} copy={1} />
        </div>
      </div>

      <style>{`
        @keyframes ua-reels-marquee {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-100%, 0, 0); }
        }
        .ua-reels-marquee {
          animation: ua-reels-marquee 35s linear infinite;
          will-change: transform;
        }
        .ua-reels-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>
    </section>
  );
}
