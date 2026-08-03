"use client";

import React, { useEffect, useRef } from "react";
import ProductCard from "./ProductCard";
import { trackViewItemList } from "@/lib/tracking";

export default function ProductGrid({
  products = [],
  listName = "Latest Drops",
  listId = "home-latest",
  priorityCount = 4,
}) {
  const lastKeyRef = useRef("");

  useEffect(() => {
    if (!products.length) return;
    const key = `${listId}:${products.map((p) => p._id || p.id).join(",")}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    trackViewItemList(products, listName, listId);
  }, [products, listName, listId]);

  if (!products.length) {
    return (
      <p className="py-12 text-center text-sm tracking-widest text-gray-500 uppercase">
        No products available
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 lg:grid-cols-4 lg:gap-4">
      {products.map((product, index) => (
        <ProductCard
          key={product._id || product.id || index}
          product={product}
          listName={listName}
          listId={listId}
          priority={index < priorityCount}
        />
      ))}
    </div>
  );
}
