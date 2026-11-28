"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Pause, Play } from "@/components/icons";

const VIDEOS = [
  {
    src: "https://images.urbanaana.com/urban-aana/video/video-1.mp4",
    poster: "/images/videos/video-1-poster.webp",
    alt: "Urban Aana product unboxing by Kerala influencer",
  },
  {
    src: "https://images.urbanaana.com/urban-aana/video/video-2.mp4",
    poster: "/images/videos/video-2-poster.webp",
    alt: "Urban Aana product unboxing by Kerala influencer",
  },
];

function VideoCell({ src, poster, alt, active, onPlayRequest }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const playing = active;
  const [armed, setArmed] = useState(false);
  // Keep the snapshot on screen until the video has actually started playing.
  const [started, setStarted] = useState(false);

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

    const onEnded = () => {
      setStarted(false);
      onPlayRequest(null);
    };
    const onPlaying = () => setStarted(true);
    video.addEventListener("ended", onEnded);
    video.addEventListener("playing", onPlaying);
    return () => {
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("playing", onPlaying);
    };
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
        poster={poster}
        playsInline
        preload="none"
        aria-hidden
      />

      {poster ? (
        <Image
          src={poster}
          alt={alt}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className={`object-cover transition-opacity duration-300 ${
            started ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        />
      ) : null}

      {/* Play button always shows until playback; pause only appears on hover while playing. */}
      <span
        className={`absolute inset-0 z-10 flex items-center justify-center transition-all ${
          playing
            ? "bg-black/0 opacity-0 group-hover:bg-black/35 group-hover:opacity-100 group-focus-visible:bg-black/35 group-focus-visible:opacity-100"
            : "bg-black/20 opacity-100 group-hover:bg-black/30"
        }`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-black shadow-lg transition-transform group-hover:scale-105 md:h-16 md:w-16">
          {playing ? (
            <Pause className="h-6 w-6 fill-current md:h-7 md:w-7" />
          ) : (
            <Play className="ml-1 h-6 w-6 fill-current md:h-7 md:w-7" />
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

      <div className="grid grid-cols-1 gap-3 px-4 md:grid-cols-2 md:gap-3 md:px-4 lg:gap-4 lg:px-8">
        {VIDEOS.map((video) => (
          <VideoCell
            key={video.src}
            src={video.src}
            poster={video.poster}
            alt={video.alt}
            active={activeSrc === video.src}
            onPlayRequest={setActiveSrc}
          />
        ))}
      </div>
    </section>
  );
}
