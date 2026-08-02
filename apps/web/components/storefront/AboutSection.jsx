"use client";

import {
  ArrowIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PackageIcon,
  ReturnIcon,
  SecureIcon,
  TruckIcon,
} from "@/components/icons/storeIcons";
import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

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

const trustItems = [
  {
    num: "1",
    Icon: PackageIcon,
    title: "Premium fabric",
    text: "High-grade heavy GSM cotton built to last.",
  },
  {
    num: "2",
    Icon: TruckIcon,
    title: "Fast delivery",
    text: "Express shipping across India.",
  },
  {
    num: "3",
    Icon: ReturnIcon,
    title: "Easy exchange",
    text: "Hassle-free returns when you need them.",
  },
  {
    num: "4",
    Icon: SecureIcon,
    title: "Secure pay",
    text: "100% safe checkout every time.",
  },
];

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

      {/* Trust / studies-style band */}
      <div className="w-full mt-4 bg-[#F9F9F5] text-[#222222]">
        <div className="max-w-7xl mx-auto px-6 py-14 md:py-20 flex flex-col items-center">
          <h2 className="trust-title text-center text-[22pt] md:text-[40pt] leading-none max-w-4xl mx-auto normal-case">
            Why Urban Aana
          </h2>

          <div className="w-full grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-10 mt-14">
            {trustItems.map((item) => {
              const Icon = item.Icon;
              return (
              <div key={item.num} className="w-full text-center flex flex-row xl:flex-col items-center">
                <div className="flex justify-center items-center mb-0 xl:mb-6 shrink-0">
                  <div className="relative flex h-16 w-16 rotate-[-3deg] items-center justify-center bg-[#DF1721] 2xl:h-20 2xl:w-20">
                    <Icon size={28} className="text-white" style={{ color: "#ffffff" }} />
                    <span className="trust-num absolute -bottom-8 -left-4 2xl:-left-6 text-[28pt] md:text-[48pt] leading-none font-black italic">
                      {item.num}
                    </span>
                  </div>
                </div>
                <p className="ml-5 mt-0 text-left xl:ml-0 xl:mt-8 xl:text-center leading-snug">
                  <span className="block text-[13pt] md:text-[15pt] font-bold text-[#222222]">{item.title}</span>
                  <span className="mt-1 block text-[11px] md:text-[13px] font-medium text-gray-500">{item.text}</span>
                </p>
              </div>
              );
            })}
          </div>

          <Link
            href="/all-products"
            className="group mt-14 inline-flex items-center gap-2 rotate-[-2deg] bg-[#222222] border-2 border-[#222222] px-5 py-2 text-[14pt] md:text-[18pt] font-bold text-[#F9F9F5] transition-colors hover:bg-brand-red hover:border-brand-red"
          >
            Shop the drops
            <ArrowIcon size={18} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
