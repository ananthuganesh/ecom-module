"use client";

import { Loader2 } from "lucide-react";
import { CloseIcon } from "@/components/icons/storeIcons";
import React, { useState } from "react";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { useCartStore } from "@/store/useCartStore";
import { adaptProductForCard } from "@/utils/urbanProductAdapter";
import { resolveImageUrl } from "@/utils/imageResolver";
import { getProductSizeOptions } from "@/utils/productSizes";
import { trackSelectItem } from "@/lib/tracking";

function formatInr(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

export default function ProductCard({
  product,
  listName = "Catalog",
  listId = "catalog",
  priority = false,
}) {
  const addItem = useCartStore((s) => s.addItem);

  const [showPicker, setShowPicker] = useState(false);
  const [selectedSize, setSelectedSize] = useState("");
  const [adding, setAdding] = useState(false);
  const [quickAddingSize, setQuickAddingSize] = useState("");

  if (!product) return null;

  const {
    id,
    title,
    productType,
    price,
    compareAt,
    discountPercent,
    badge,
    image,
    hoverImage,
    href,
  } = adaptProductForCard(product);
  const variants =
    product.variants?.filter((v) => !v.isDeleted) || product.variants || [];

  const totalStock =
    product.totalStock ??
    variants.reduce(
      (acc, variant) => acc + (variant.quantity ?? variant.stock ?? 0),
      0
    );

  const isOutOfStock = totalStock <= 0;

  const availableSizes = getProductSizeOptions(product);

  const addSizeToCart = (sizeLabel, qty = 1) => {
    const sizeData = availableSizes.find((s) => s.size === sizeLabel);
    const stock = sizeData?.stock ?? sizeData?.quantity ?? totalStock;
    const sizeImage = (sizeData?.images || []).filter(Boolean)[0];
    addItem({
      ...product,
      _id: id,
      slug: product.slug,
      qty,
      size: sizeLabel,
      color: "",
      price,
      image: sizeImage || image,
      totalStock: stock || totalStock,
      variants,
    });
  };

  const handleOpenPicker = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock) return;
    const firstAvailable = availableSizes.find(
      (sizeObj) => (sizeObj.stock ?? sizeObj.quantity ?? totalStock) > 0
    );
    setSelectedSize(firstAvailable?.size || firstAvailable || "");
    setShowPicker(true);
  };

  const handleQuickAddSize = async (e, sizeLabel, stock) => {
    e.preventDefault();
    e.stopPropagation();
    if (!sizeLabel || stock <= 0 || quickAddingSize) return;
    setQuickAddingSize(sizeLabel);
    try {
      addSizeToCart(sizeLabel, 1);
    } finally {
      setQuickAddingSize("");
    }
  };

  const handleConfirmAddToCart = async () => {
    if (!selectedSize) return;

    setAdding(true);
    try {
      addSizeToCart(selectedSize, 1);
      setShowPicker(false);
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <article
        className={`group flex h-full flex-col justify-between overflow-hidden rounded-xl border-[0.5px] border-[#c9cbcc] bg-white lg:rounded-2xl ${
          isOutOfStock ? "opacity-70" : ""
        }`}
      >
        <div className="relative flex flex-col">
          <div className="relative w-full p-0.5">
            <div
              className="relative w-full overflow-hidden rounded-lg border-[0.5px] border-[#eee] bg-[#f5f5f5] lg:rounded-xl"
              style={{ aspectRatio: "2 / 3" }}
            >
              <Link
                href={href}
                className="absolute inset-0 z-0 block"
                onClick={() => trackSelectItem(product, listName, listId)}
              >
                <SafeImage
                  src={resolveImageUrl(image)}
                  alt={title}
                  fill
                  priority={priority}
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                  className={`object-cover transition-opacity duration-300 ${
                    hoverImage ? "group-hover:opacity-0" : ""
                  }`}
                />
                {hoverImage ? (
                  <SafeImage
                    src={resolveImageUrl(hoverImage)}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                    className="object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />
                ) : null}
              </Link>

              {badge ? (
                <div className="pointer-events-none absolute top-2 left-2 z-10 rounded-sm bg-white px-1.5 py-1 lg:top-3 lg:left-3 lg:px-2">
                  <span
                    className={`text-[8px] font-medium uppercase leading-none tracking-wide lg:text-xs ${
                      badge.key === "sold_out"
                        ? "text-[#c70a24]"
                        : badge.key === "low_stock"
                          ? "text-[#b45309]"
                          : "text-[#133b5f]"
                    }`}
                  >
                    {badge.label}
                  </span>
                </div>
              ) : null}

              {!isOutOfStock && availableSizes.length > 0 ? (
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex translate-y-full flex-wrap justify-center gap-1 px-1.5 pb-2 transition-transform duration-300 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 max-lg:hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  {availableSizes.map((sizeObj) => {
                    const sizeLabel = sizeObj.size || sizeObj;
                    const stock =
                      sizeObj.stock ?? sizeObj.quantity ?? totalStock;
                    const outOfStock = stock <= 0;
                    const busy = quickAddingSize === sizeLabel;
                    return (
                      <button
                        key={sizeLabel}
                        type="button"
                        disabled={outOfStock || Boolean(quickAddingSize)}
                        onClick={(e) =>
                          handleQuickAddSize(e, sizeLabel, stock)
                        }
                        className={`min-w-[2rem] rounded border px-2 py-1.5 text-[11px] font-semibold uppercase shadow-sm transition-colors lg:min-w-[2.25rem] lg:text-xs ${
                          outOfStock
                            ? "cursor-not-allowed border-[#eee] bg-white/80 text-[#c9cbcc] line-through"
                            : busy
                              ? "border-[#131814] bg-[#131814] text-white"
                              : "border-[#e5e5e5] bg-white text-[#131814] hover:border-[#131814] hover:bg-[#131814] hover:text-white"
                        }`}
                        aria-label={
                          outOfStock
                            ? `${sizeLabel} sold out`
                            : `Add size ${sizeLabel} to cart`
                        }
                      >
                        {busy ? (
                          <Loader2
                            size={12}
                            className="mx-auto animate-spin"
                          />
                        ) : (
                          sizeLabel
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <Link
            href={href}
            className="flex flex-col gap-1 px-2.5 pt-2.5 pb-2 sm:gap-1.5 sm:px-3 sm:pt-3"
            onClick={() => trackSelectItem(product, listName, listId)}
          >
            <h3 className="w-full truncate text-[12px] font-medium uppercase tracking-wide text-[#131814] lg:text-sm">
              {productType ? `${title} ${productType}` : title}
            </h3>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="text-sm font-semibold text-[#131814] lg:text-base">
                ₹{formatInr(price)}
              </span>
              {compareAt ? (
                <span className="text-[11px] font-medium text-[#afb2b4] line-through lg:text-sm">
                  ₹{formatInr(compareAt)}
                </span>
              ) : null}
              {discountPercent > 0 ? (
                <span className="inline-flex items-center rounded-sm bg-[#c70a24] px-1.5 py-1 text-[10px] font-semibold leading-none tracking-wide text-white uppercase lg:px-2 lg:py-1 lg:text-[11px]">
                  {discountPercent}% off
                </span>
              ) : null}
            </div>
          </Link>
        </div>

        <div className="flex border-t-[0.5px] border-[#c9cbcc]">
          {isOutOfStock ? (
            <div className="flex flex-1 items-center justify-center p-2 text-[11px] font-semibold tracking-wide text-[#afb2b4] uppercase lg:p-4 lg:text-sm">
              Out of stock
            </div>
          ) : (
            <button
              type="button"
              onClick={handleOpenPicker}
              className="flex flex-1 cursor-pointer items-center justify-center p-2 transition-colors hover:bg-[#f7f7f7] lg:p-4"
            >
              <span className="text-[11px] font-semibold tracking-wide text-[#131814] uppercase lg:text-sm">
                Add to cart
              </span>
            </button>
          )}
        </div>
      </article>

      {showPicker && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowPicker(false)}
          />

          <div className="relative z-10 flex w-full max-w-lg min-h-[280px] overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-2xl sm:min-h-[320px]">
            <div className="relative w-[38%] min-w-[120px] shrink-0 bg-[#f5f5f5] sm:w-[42%]">
              <SafeImage
                src={resolveImageUrl(image)}
                alt={title}
                fill
                className="object-cover"
                sizes="220px"
              />
            </div>

            <div className="relative flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5">
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="absolute top-2.5 right-2.5 rounded-md p-1.5 transition-colors hover:bg-gray-100"
                aria-label="Close"
              >
                <CloseIcon size={16} className="text-gray-500" />
              </button>

              <div className="pr-8">
                {productType ? (
                  <p className="mb-1 text-[10px] font-medium tracking-[0.08em] text-[#8a8f93] uppercase">
                    {productType}
                  </p>
                ) : null}
                <h3 className="line-clamp-2 text-sm font-semibold uppercase tracking-wide text-[#131814] sm:text-base">
                  {title}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="text-sm font-semibold text-[#131814] sm:text-base">
                    ₹{formatInr(price)}
                  </span>
                  {compareAt ? (
                    <span className="text-[11px] font-medium text-[#afb2b4] line-through sm:text-sm">
                      ₹{formatInr(compareAt)}
                    </span>
                  ) : null}
                  {discountPercent > 0 ? (
                    <span className="inline-flex items-center rounded-sm bg-[#c70a24] px-1.5 py-1 text-[10px] font-semibold leading-none tracking-wide text-white uppercase">
                      {discountPercent}% off
                    </span>
                  ) : null}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-[#8a8f93] uppercase">
                  Size
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {availableSizes.map((sizeObj) => {
                    const sizeLabel = sizeObj.size || sizeObj;
                    const stock =
                      sizeObj.stock ?? sizeObj.quantity ?? totalStock;
                    const outOfStock = stock === 0;
                    const selected = selectedSize === sizeLabel;
                    return (
                      <button
                        key={sizeLabel}
                        type="button"
                        onClick={() =>
                          !outOfStock && setSelectedSize(sizeLabel)
                        }
                        disabled={outOfStock}
                        className={`min-w-[40px] rounded border px-2.5 py-1.5 text-xs font-semibold uppercase transition-all sm:min-w-[44px] sm:text-sm ${
                          selected
                            ? "border-[#131814] bg-[#131814] text-white"
                            : outOfStock
                              ? "cursor-not-allowed border-[#eee] bg-[#f7f7f7] text-[#c9cbcc] line-through"
                              : "border-[#e5e5e5] text-[#131814] hover:border-[#131814]"
                        }`}
                      >
                        {sizeLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={handleConfirmAddToCart}
                disabled={!selectedSize || adding}
                className={`mt-auto flex w-full items-center justify-center gap-2 rounded-lg py-3 text-xs font-bold tracking-widest uppercase transition-all sm:text-sm ${
                  selectedSize && !adding
                    ? "bg-[#131814] text-white hover:bg-black active:scale-[0.98]"
                    : "cursor-not-allowed bg-[#f1f1f1] text-[#afb2b4]"
                }`}
              >
                {adding ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Adding...
                  </>
                ) : selectedSize ? (
                  "Add to cart"
                ) : (
                  "Select a size"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
