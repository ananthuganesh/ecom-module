"use client";

import React, { useEffect, useRef } from "react";

const HERO_VIDEO = "/urban/hero-video.mp4";

const HeroBanner = () => {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => undefined);
  }, []);

  return (
    <section
      data-home-hero
      className="relative w-full aspect-[16/8.5] max-h-[82vh] bg-black m-0 p-0 overflow-hidden"
    >
      <video
        ref={videoRef}
        src={HERO_VIDEO}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
      />
      <div className="absolute inset-0 bg-black/50 z-[1]" aria-hidden />

      <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none px-4">
        <h1 className="font-knewave uppercase tracking-tight not-italic text-3xl sm:text-5xl md:text-7xl lg:text-8xl xl:text-9xl leading-none text-center text-white py-0">
          Urban Aana
        </h1>
      </div>
    </section>
  );
};

export default HeroBanner;
