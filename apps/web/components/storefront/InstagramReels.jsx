"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { reelsService } from "@/api";
import {
  DEFAULT_STOREFRONT_REELS,
  normalizeStorefrontReels,
} from "@/utils/storefrontReels";

function playMuted(video) {
  if (!video?.src) return;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.loop = true;
  if (video.ended) video.currentTime = 0;
  if (!video.paused && !video.ended) return;
  const attempt = video.play();
  if (attempt?.catch) attempt.catch(() => undefined);
}

function cardIsOnScreen(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return (
    rect.right > 8 &&
    rect.left < window.innerWidth - 8 &&
    rect.bottom > 0 &&
    rect.top < window.innerHeight
  );
}

function ReelCard({ videoUrl, altText, stripActive }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const lastTimeRef = useRef(0);
  const stuckTicksRef = useRef(0);
  const [activeSrc, setActiveSrc] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeSrc) return;

    const resume = () => playMuted(video);
    const restart = () => {
      try {
        video.currentTime = 0;
      } catch {
        /* ignore seek errors on detached media */
      }
      playMuted(video);
    };

    video.addEventListener("canplay", resume);
    video.addEventListener("loadeddata", resume);
    video.addEventListener("ended", restart);
    video.addEventListener("stalled", resume);
    return () => {
      video.removeEventListener("canplay", resume);
      video.removeEventListener("loadeddata", resume);
      video.removeEventListener("ended", restart);
      video.removeEventListener("stalled", resume);
    };
  }, [activeSrc]);

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video || !videoUrl) return;

    if (!stripActive) {
      video.pause();
      return undefined;
    }

    const sync = () => {
      if (document.hidden || !cardIsOnScreen(container)) {
        stuckTicksRef.current = 0;
        if (!video.paused) video.pause();
        return;
      }
      setActiveSrc((current) => current || videoUrl);

      if (!video.paused && !video.ended) {
        const t = video.currentTime || 0;
        if (t === lastTimeRef.current) {
          stuckTicksRef.current += 1;
          if (stuckTicksRef.current >= 8) {
            stuckTicksRef.current = 0;
            const nearEnd = video.duration && t >= video.duration - 0.25;
            try {
              video.currentTime = nearEnd ? 0 : t;
            } catch {
              /* ignore */
            }
            video.pause();
            playMuted(video);
          }
        } else {
          stuckTicksRef.current = 0;
          lastTimeRef.current = t;
        }
        return;
      }

      playMuted(video);
    };

    sync();
    const id = window.setInterval(sync, 250);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
      video.pause();
    };
  }, [stripActive, videoUrl]);

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
          src={activeSrc || undefined}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={altText || "Product showcase"}
        />
      </div>
    </div>
  );
}

/** Repeat items until one half of the strip is wide enough for a seamless loop. */
function buildTrackItems(reels, minCount = 6) {
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

function MarqueeHalf({ items, copy, stripActive }) {
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
          stripActive={stripActive}
        />
      ))}
    </div>
  );
}

export default function InstagramReels() {
  const [reels, setReels] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [stripActive, setStripActive] = useState(false);
  const stripRef = useRef(null);

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

  const trackItems = useMemo(() => buildTrackItems(reels, Math.max(reels.length, 5)), [reels]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setStripActive(entry.isIntersecting),
      { rootMargin: "160px 0px", threshold: 0 }
    );
    observer.observe(strip);
    return () => observer.disconnect();
  }, [trackItems.length]);

  if (!loaded && reels.length === 0) {
    return (
      <section className="scroll-mt-24 py-6 md:py-10">
        <header className="mb-3 w-full px-4 text-center md:mb-6 lg:px-8">
          <h2 className="title-knewave mx-auto w-full text-center text-2xl leading-none tracking-tight normal-case md:text-4xl">
            Product <span className="title-knewave-accent">Showcase</span>
          </h2>
        </header>
        <div className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-4 md:grid-cols-5 md:gap-3 md:px-4 lg:gap-4 lg:px-8">
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
      <header className="mb-3 w-full px-4 text-center md:mb-6 lg:px-8">
        <h2 className="title-knewave mx-auto w-full text-center text-2xl leading-none tracking-tight normal-case md:text-4xl">
          Product <span className="title-knewave-accent">Showcase</span>
        </h2>
      </header>

      <div
        ref={stripRef}
        className="ua-reels-strip relative w-full overflow-hidden px-4 lg:px-8"
      >
        <div className="ua-reels-marquee flex w-max">
          <MarqueeHalf items={trackItems} copy={0} stripActive={stripActive} />
          <MarqueeHalf items={trackItems} copy={1} stripActive={stripActive} />
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
