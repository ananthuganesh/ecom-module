"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ProductCard from "./ProductCard";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/icons/storeIcons";
import { trackViewItemList } from "@/lib/tracking";

const ARROW =
  "flex h-9 w-9 items-center justify-center rounded-full border border-black/15 bg-white text-black transition-colors hover:border-black hover:bg-black hover:text-white disabled:pointer-events-none disabled:opacity-30 md:h-10 md:w-10";

/**
 * One row of product cards that runs off the right edge of the screen (the
 * next card peeks in), with previous / next buttons beside the heading.
 * Swipe and trackpad scrolling work too; cards snap into place.
 */
export default function ProductCarousel({
  titleFirst,
  titleAccent,
  products = [],
  listName,
  listId,
  viewAllHref,
}) {
  const trackRef = useRef(null);
  const lastKeyRef = useRef("");
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    if (!products.length) return;
    const key = `${listId}:${products.map((p) => p._id || p.id).join(",")}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    trackViewItemList(products, listName, listId);
  }, [products, listName, listId]);

  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    updateArrows();
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows, products.length]);

  const slide = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  if (!products.length) return null;

  return (
    <div>
      <header className="relative mb-3 flex items-center justify-center px-4 md:mb-6 lg:px-8">
        {/* Built here from plain strings: JSX passed in from a Server
            Component loses its static-children marker and trips React's
            key warning. */}
        <h2 className="title-knewave text-center text-2xl leading-none tracking-tight normal-case md:text-4xl">
          {titleFirst} <span className="title-knewave-accent">{titleAccent}</span>
        </h2>
        {/* Phones swipe instead. */}
        <div className="absolute right-4 hidden items-center gap-2 md:flex lg:right-8">
          <button
            type="button"
            className={ARROW}
            onClick={() => slide(-1)}
            disabled={!canPrev}
            aria-label="Previous products"
          >
            <ChevronLeftIcon size={18} />
          </button>
          <button
            type="button"
            className={ARROW}
            onClick={() => slide(1)}
            disabled={!canNext}
            aria-label="Next products"
          >
            <ChevronRightIcon size={18} />
          </button>
        </div>
      </header>

      <div
        ref={trackRef}
        className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth scroll-pl-4 pl-4 md:gap-3 lg:gap-4 lg:scroll-pl-8 lg:pl-8"
        aria-label={listName}
        role="region"
      >
        {products.map((product, index) => (
          <div
            key={product._id || product.id || index}
            className="w-[44%] shrink-0 snap-start md:w-[30%] lg:w-[22.5%]"
          >
            <ProductCard
              product={product}
              listName={listName}
              listId={listId}
              priority={false}
            />
          </div>
        ))}
        {/* Trailing gutter so the last card can scroll clear of the edge. */}
        <div className="w-2 shrink-0 lg:w-4" aria-hidden />
      </div>

      {viewAllHref ? (
        <div className="mt-5 flex justify-center px-4 md:mt-6">
          <Link
            href={viewAllHref}
            className="text-[11px] font-medium uppercase tracking-[0.12em] text-black underline underline-offset-4 transition-colors hover:text-brand-red"
          >
            View all
          </Link>
        </div>
      ) : null}
    </div>
  );
}
