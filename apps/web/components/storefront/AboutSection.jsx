"use client";

import {
  ArrowIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/icons/storeIcons";
import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import WhyUrbanAana from "@/components/storefront/WhyUrbanAana";

import { motion, AnimatePresence } from "framer-motion";

const aboutImages = [
  { src: "/urban/about-1.jpg" },
  { src: "/urban/about-2.jpg" },
  { src: "/urban/about-3.jpg" },
  { src: "/urban/about-4.jpg" },
];

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.5, ease: [0.32, 0.72, 0, 1] } },
  exit: (dir) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0, transition: { duration: 0.4 } }),
};

function ImageCarousel() {
  const [[page, dir], setPage] = useState([0, 0]);
  const idx = ((page % aboutImages.length) + aboutImages.length) % aboutImages.length;

  const paginate = useCallback((newDir) => setPage(([p]) => [p + newDir, newDir]), []);

  useEffect(() => {
    const t = setInterval(() => paginate(1), 4000);
    return () => clearInterval(t);
  }, [paginate]);

  return (
    <div className="relative w-full max-w-md mx-auto lg:mx-0">
      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-gray-100 shadow-xl">
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={page}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="absolute inset-0"
          >
            <Image src={aboutImages[idx].src} alt="Urban Aana" fill className="object-cover object-top" />
          </motion.div>
        </AnimatePresence>

        <button
          onClick={() => paginate(-1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-brand-red transition-all"
          aria-label="Previous image"
        >
          <ChevronLeftIcon size={14} />
        </button>
        <button
          onClick={() => paginate(1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-brand-red transition-all"
          aria-label="Next image"
        >
          <ChevronRightIcon size={14} />
        </button>
      </div>

      <div className="flex justify-center gap-1.5 mt-3">
        {aboutImages.map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === idx ? "w-6 bg-brand-red" : "w-1.5 bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

const AboutSection = () => {
  return (
    <section className="w-full bg-white py-6 md:py-10 font-sans overflow-hidden">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center mb-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="order-1 lg:order-2"
          >
            <ImageCarousel />
          </motion.div>

          <div className="space-y-5 order-2 lg:order-1">
            <h4 className="text-[12px] font-bold tracking-[0.2em] text-gray-400 uppercase">Our Identity</h4>

            <div className="space-y-1">
              <h2 className="text-2xl md:text-4xl font-black tracking-tighter text-black uppercase leading-tight">
                WE ARE <span className="text-brand-red">URBAN</span> AANA.
              </h2>
              <div className="w-12 h-1 bg-brand-red" />
            </div>

            <p className="text-gray-600 text-sm md:text-base leading-relaxed max-w-md">
              Urban Aana blends modern city style with Kerala&apos;s cultural essence.
              <span className="font-bold text-black ml-1">&ldquo;Aana&rdquo;</span> symbolizes strength and tradition.
            </p>

            <Link
              href="/all-products"
              className="group inline-flex items-center gap-2 px-6 py-3 bg-black text-white font-bold text-[12px] uppercase tracking-widest hover:bg-brand-red transition-all rounded-sm"
            >
              Shop Now <ArrowIcon size={14} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <WhyUrbanAana />
      </div>
    </section>
  );
};

export default AboutSection;
