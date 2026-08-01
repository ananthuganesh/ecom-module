"use client";

import { Instagram } from "lucide-react";
import { useEffect, useRef } from "react";

const REELS = [
  {
    id: "reel-1",
    videoUrl: "https://images.urbanaana.com/urban-aana/reels/reel-1.mp4",
    instagramUrl: "https://www.instagram.com/reel/DZpH3I5zHhG/",
  },
  {
    id: "reel-2",
    videoUrl: "https://images.urbanaana.com/urban-aana/reels/reel-2.mp4",
    instagramUrl: "https://www.instagram.com/reel/DZmkorVTpo6/",
  },
  {
    id: "reel-3",
    videoUrl: "https://images.urbanaana.com/urban-aana/reels/reel-3.mp4",
    instagramUrl: "https://www.instagram.com/reel/DZj_Ohlz1MO/",
  },
  {
    id: "reel-4",
    videoUrl: "https://images.urbanaana.com/urban-aana/reels/reel-4.mp4",
    instagramUrl: "https://www.instagram.com/p/DZwhemdTEO_/",
  },
  {
    id: "reel-5",
    videoUrl: "https://images.urbanaana.com/urban-aana/reels/reel-5.mp4",
    instagramUrl: "https://www.instagram.com/p/DaR85YJTCxh/",
  },
];

function ReelCard({ videoUrl, instagramUrl }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <a
      ref={containerRef}
      href={instagramUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex-shrink-0 w-[200px] sm:w-[240px] md:w-[280px] snap-center"
    >
      <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-black shadow-lg ring-1 ring-black/10 transition-transform duration-300 group-hover:scale-[1.02] group-hover:shadow-xl">
        <video
          ref={videoRef}
          src={videoUrl}
          className="h-full w-full object-cover"
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
        <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 text-white">
          <Instagram size={16} className="flex-shrink-0" />
          <span className="text-[12px] font-bold uppercase tracking-widest">
            Watch on Instagram
          </span>
        </div>
      </div>
    </a>
  );
}

export default function InstagramReels() {
  return (
    <section className="py-6 md:py-10 px-2 md:px-4 lg:px-8">
      <header className="mb-6 md:mb-10 text-center space-y-2">
        <h2 className="title-knewave text-2xl md:text-4xl uppercase leading-none tracking-tight">
          STREET <span className="title-knewave-accent">REELS</span>
        </h2>
        <div className="h-1 w-16 bg-black mx-auto" />
        <p className="text-xs md:text-sm text-gray-500 uppercase tracking-widest font-semibold">
          @urbanaana.in on Instagram
        </p>
      </header>

      <div className="flex gap-4 md:gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide justify-start md:justify-center">
        {REELS.map((reel) => (
          <ReelCard
            key={reel.id}
            videoUrl={reel.videoUrl}
            instagramUrl={reel.instagramUrl}
          />
        ))}
      </div>
    </section>
  );
}
