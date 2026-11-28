"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

/**
 * Photo that drifts slower than the page while its frame scrolls past. The
 * image is 20% taller than the frame and moves within that slack, so no edge
 * ever shows. Still for visitors who prefer reduced motion.
 */
export default function ParallaxImage({
  src,
  alt,
  sizes,
  className = "",
  imageClassName = "object-cover object-center",
  strength = 8,
}) {
  const frameRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: frameRef, offset: ["start end", "end start"] });
  const shift = reduceMotion ? 0 : Math.min(strength, 9);
  const y = useTransform(scrollYProgress, [0, 1], [`-${shift}%`, `${shift}%`]);

  return (
    <div ref={frameRef} className={`relative overflow-hidden ${className}`}>
      <motion.div style={{ y }} className="absolute inset-x-0 -top-[10%] -bottom-[10%] will-change-transform">
        <Image src={src} alt={alt} fill loading="lazy" sizes={sizes} className={imageClassName} />
      </motion.div>
    </div>
  );
}
