"use client";

import { useEffect, useRef, useState } from "react";
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
    // Kick playback immediately for cards already in view.
    playMuted(video);

    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [videoUrl]);

  return (
    <div
      ref={containerRef}
      className="group relative block w-[calc((100vw-1.5rem)/2)] shrink-0 overflow-hidden rounded-xl border-[0.5px] border-[#c9cbcc] bg-white md:w-[calc((100vw-3.5rem)/3)] lg:w-[calc((100vw-7rem)/4)] lg:rounded-2xl"
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

  if (!loaded && reels.length === 0) {
    return (
      <section className="scroll-mt-24 py-6 md:py-10">
        <header className="mb-3 w-full px-2 text-center md:mb-6 md:px-4 lg:px-8">
          <h2 className="title-knewave mx-auto w-full text-center text-3xl leading-none tracking-tight normal-case md:text-4xl">
            Product <span className="title-knewave-accent">Showcase</span>
          </h2>
        </header>
        <div className="grid grid-cols-2 gap-2 px-2 md:grid-cols-3 md:gap-3 md:px-4 lg:grid-cols-4 lg:gap-4 lg:px-8">
          {[0, 1, 2, 3].map((i) => (
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

  const marqueeItems = [...reels, ...reels];

  return (
    <section className="scroll-mt-24 py-6 md:py-10">
      <header className="mb-3 w-full px-2 text-center md:mb-6 md:px-4 lg:px-8">
        <h2 className="title-knewave mx-auto w-full text-center text-3xl leading-none tracking-tight normal-case md:text-4xl">
          Product <span className="title-knewave-accent">Showcase</span>
        </h2>
      </header>

      <div className="ua-reels-marquee-mask relative overflow-hidden px-2 md:px-4 lg:px-8">
        <div className="ua-reels-marquee flex w-max gap-2 md:gap-3 lg:gap-4">
          {marqueeItems.map((reel, index) => (
            <ReelCard
              key={`${reel.id}-${index}`}
              videoUrl={reel.videoUrl}
              altText={reel.altText}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes ua-reels-marquee {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
        .ua-reels-marquee {
          animation: ua-reels-marquee 40s linear infinite;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .ua-reels-marquee { animation: none; }
        }
      `}</style>
    </section>
  );
}
