"use client";

import React, { useEffect, useRef, useState } from "react";

const HERO_VIDEO_DESKTOP = "/urban/hero-video.mp4";
const HERO_VIDEO_MOBILE =
  "https://images.urbanaana.com/urban-aana/app/reels/Keralathinayi-reel-66df43a2.mp4";
const SKIP_TAIL_SECONDS = 3;

const HeroBanner = () => {
  const videoRef = useRef(null);
  const [src, setSrc] = useState(HERO_VIDEO_DESKTOP);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => {
      setSrc(mq.matches ? HERO_VIDEO_MOBILE : HERO_VIDEO_DESKTOP);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    video.src = src;
    video.load();
    video.play().catch(() => undefined);

    const onTimeUpdate = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= SKIP_TAIL_SECONDS) return;
      if (video.currentTime >= duration - SKIP_TAIL_SECONDS) {
        video.currentTime = 0;
        video.play().catch(() => undefined);
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [src]);

  return (
    <section
      data-home-hero
      className="relative m-0 max-h-[92dvh] w-full overflow-hidden bg-black p-0 aspect-[9/16] md:aspect-[16/8.5] md:max-h-[82vh]"
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        playsInline
        preload="metadata"
      />
      <div className="absolute inset-0 z-[1] bg-black/50" aria-hidden />

      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4">
        <h1 className="py-0 text-center font-knewave text-5xl leading-none tracking-tight text-white uppercase not-italic sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl">
          Urban Aana
        </h1>
      </div>
    </section>
  );
};

export default HeroBanner;
