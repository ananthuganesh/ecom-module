"use client";

import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { adaptProductForCard } from "@/utils/urbanProductAdapter";
import { resolveImageUrl } from "@/utils/imageResolver";
import { trackSelectItem } from "@/lib/tracking";
import { formatINR } from "@/utils/formatINR";

const GRID = "grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-4";

/** Grey placeholders while search-panel products load. */
export function SearchProductGridSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-[5/7] animate-pulse bg-gray-100" />
      ))}
    </div>
  );
}

/**
 * Product tiles used in the search panel (popular products and typed results):
 * tall image, centred name, sale price in red with the MRP struck through.
 */
export default function SearchProductGrid({ products, onNavigate, listId, listName }) {
  return (
    <ul className={GRID}>
      {products.map((product) => {
        const card = adaptProductForCard(product);
        const onSale = card.compareAt && card.compareAt > card.price;
        return (
          <li key={card.id}>
            <Link
              href={card.href}
              onClick={() => {
                trackSelectItem(product, listName, listId);
                onNavigate?.();
              }}
              className="group block"
            >
              <span className="relative block aspect-[5/7] overflow-hidden bg-gray-100">
                {card.image ? (
                  <SafeImage
                    src={resolveImageUrl(card.image)}
                    alt={card.title}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                ) : null}
              </span>
              <span className="mt-3 block truncate px-2 text-center text-[13px] text-gray-900 md:text-[15px]">
                {card.title}
              </span>
              {card.price > 0 ? (
                <span className="mt-1 flex flex-wrap items-center justify-center gap-x-2 px-2 text-[13px] tabular-nums md:text-[15px]">
                  <span className={onSale ? "text-[#c70a24]" : "text-gray-900"}>{formatINR(card.price)}</span>
                  {onSale ? <span className="text-gray-900 line-through">{formatINR(card.compareAt)}</span> : null}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
