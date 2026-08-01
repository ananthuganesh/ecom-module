"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { HyperText } from "@/components/ui/hyper-text";

const HERO_VIDEO = "/urban/hero-video.mp4";

const LATIN_SET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const MALAYALAM_SET =
  "അആഇഈഉഊഎഏഐഒഓഔകഖഗഘങചഛജഝഞടഠഡഢണതഥദധനപഫബഭമയരലവശഷസഹളഴറംാിീുൂെേൈൊോൌ്".split(
    ""
  );

const HERO_TITLES = [
  {
    text: "Urban Aana",
    characterSet: LATIN_SET,
    className:
      "font-knewave uppercase tracking-tight not-italic",
  },
  {
    text: "അർബൻ ആന",
    characterSet: MALAYALAM_SET,
    className: "font-malayalam tracking-tight",
  },
];

const HOLD_MS = 2200;

const HeroBanner = () => {
  const videoRef = useRef(null);
  const [titleIndex, setTitleIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const holdTimer = useRef(null);

  const current = HERO_TITLES[titleIndex];

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  const handleComplete = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      setTitleIndex((i) => (i + 1) % HERO_TITLES.length);
      setCycle((c) => c + 1);
    }, HOLD_MS);
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
        <HyperText
          key={`${current.text}-${cycle}`}
          as="h1"
          animateOnHover={false}
          duration={900}
          delay={120}
          characterSet={current.characterSet}
          onAnimationComplete={handleComplete}
          className={`text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl leading-none text-center text-white py-0 ${current.className}`}
        >
          {current.text}
        </HyperText>
      </div>
    </section>
  );
};

export default HeroBanner;
