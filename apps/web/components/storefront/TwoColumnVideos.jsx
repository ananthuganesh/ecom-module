"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const VIDEOS = [
  {
    src: "https://images.urbanaana.com/urban-aana/video/video-1.mp4",
    alt: "Urban Aana product unboxing by Kerala influencer",
  },
  {
    src: "https://images.urbanaana.com/urban-aana/video/video-2.mp4",
    alt: "Urban Aana product unboxing by Kerala influencer",
  },
];

function VideoCell({ src, alt, active, onPlayRequest }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const playing = active;
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !src) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setArmed(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" }
    );
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !armed) return;
    if (active) {
      video.muted = false;
      const attempt = video.play();
      if (attempt?.catch) {
        attempt.catch(() => {
          video.muted = true;
          video.play()?.catch(() => undefined);
        });
      }
    } else {
      video.pause();
    }
  }, [active, armed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onEnded = () => onPlayRequest(null);
    video.addEventListener("ended", onEnded);
    return () => video.removeEventListener("ended", onEnded);
  }, [onPlayRequest]);

  const togglePlay = () => {
    setArmed(true);
    if (playing) {
      onPlayRequest(null);
    } else {
      onPlayRequest(src);
    }
  };

  return (
    <button
      ref={wrapRef}
      type="button"
      onClick={togglePlay}
      className="group relative w-full cursor-pointer overflow-hidden rounded-xl bg-black text-left lg:rounded-2xl"
      style={{ aspectRatio: "16 / 9" }}
      aria-label={playing ? `Pause ${alt}` : `Play ${alt}`}
    >
      <video
        ref={videoRef}
        src={armed ? src : undefined}
        className="absolute inset-0 h-full w-full rounded-lg object-cover lg:rounded-xl"
        playsInline
        preload="none"
        aria-hidden
      />

      <span className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/35 group-hover:opacity-100 group-focus-visible:bg-black/35 group-focus-visible:opacity-100">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-black shadow-md md:h-14 md:w-14">
          {playing ? (
            <Pause className="h-5 w-5 fill-current md:h-6 md:w-6" />
          ) : (
            <Play className="ml-0.5 h-5 w-5 fill-current md:h-6 md:w-6" />
          )}
        </span>
      </span>
    </button>
  );
}

export default function TwoColumnVideos() {
  const [activeSrc, setActiveSrc] = useState(null);

  return (
    <section className="scroll-mt-24 py-6 md:py-10">
      <header className="mb-3 w-full px-4 text-center md:mb-6 lg:px-8">
        <h2 className="title-knewave mx-auto w-full text-center text-2xl leading-none tracking-tight normal-case md:text-4xl">
          Unboxed{" "}
          <span className="title-knewave-accent">
            by Kerala&apos;s Top Influencers
          </span>
        </h2>
      </header>

      <div className="grid grid-cols-2 gap-2 px-4 md:gap-3 md:px-4 lg:gap-4 lg:px-8">
        {VIDEOS.map((video) => (
          <VideoCell
            key={video.src}
            src={video.src}
            alt={video.alt}
            active={activeSrc === video.src}
            onPlayRequest={setActiveSrc}
          />
        ))}
      </div>
    </section>
  );
}
