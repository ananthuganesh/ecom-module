"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

const IMAGES = [
  { src: "/images/44.jpg", alt: "Urban Aana campaign" },
  { src: "/images/47.jpg", alt: "Urban Aana campaign" },
];

function ParallaxImage({ src, alt, speed = 0.22 }) {
  const frameRef = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => {
    const frame = frameRef.current;
    const image = imageRef.current;
    if (!frame || !image) return;

    let ticking = false;

    const update = () => {
      ticking = false;
      const rect = frame.getBoundingClientRect();
      const viewH = window.innerHeight || 1;
      // 0 when frame center is at viewport center
      const progress = (rect.top + rect.height / 2 - viewH / 2) / viewH;
      const shift = progress * speed * -100;
      image.style.transform = `translate3d(0, ${shift}%, 0) scale(1.18)`;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [speed]);

  return (
    <div
      ref={frameRef}
      className="relative w-full overflow-hidden bg-[#e8e8e8]"
      style={{ aspectRatio: "1 / 1" }}
    >
      <div
        ref={imageRef}
        className="absolute inset-x-0 -top-[12%] h-[124%] w-full will-change-transform"
        style={{ transform: "translate3d(0, 0, 0) scale(1.18)" }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="50vw"
          className="object-cover"
          priority={false}
        />
      </div>
    </div>
  );
}

export default function TwoColumnImages() {
  return (
    <section className="relative w-full scroll-mt-24">
      <div className="grid grid-cols-2 gap-0">
        {IMAGES.map((image, index) => (
          <ParallaxImage
            key={image.src}
            src={image.src}
            alt={image.alt}
            speed={index === 0 ? 0.2 : 0.28}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4">
        <div className="flex flex-col items-center text-center">
          <h2 className="font-malayalam text-5xl font-bold leading-none tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl">
            കേരളത്തിനായി
          </h2>
          <p className="-mt-1 text-sm font-medium leading-none tracking-[0.08em] text-white/90 drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)] sm:-mt-1.5 sm:text-base md:text-lg">
            (Keralathinayi)
          </p>
        </div>
      </div>
    </section>
  );
}
