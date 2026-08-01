"use client";

import { Ban, Loader2, Zap } from "lucide-react";
import {
  BagIcon,
  CloseIcon,
  MinusIcon,
  PlusIcon
} from "@/components/icons/storeIcons";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import { useCartStore } from "@/store/useCartStore";
import { adaptProductForCard } from "@/utils/urbanProductAdapter";
import { resolveImageUrl } from "@/utils/imageResolver";
import { getProductSizeOptions } from "@/utils/productSizes";
import { trackSelectItem } from "@/lib/tracking";

export default function ProductCard({ product, listName = "Catalog", listId = "catalog" }) {
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);

  const [showPicker, setShowPicker] = useState(false);
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  if (!product) return null;

  const { id, title, price, image, href } = adaptProductForCard(product);
  const variants = product.variants?.filter((v) => !v.isDeleted) || product.variants || [];

  const totalStock =
    product.totalStock ??
    variants.reduce((acc, variant) => acc + (variant.quantity ?? variant.stock ?? 0), 0);

  const isOutOfStock = totalStock <= 0;
  const category = product.category?.name || product.product || "Drops";

  const availableSizes = getProductSizeOptions(product);
  const currentSizeData = availableSizes.find((s) => s.size === selectedSize);
  const maxStock = currentSizeData?.stock ?? currentSizeData?.quantity ?? totalStock;

  const handleOpenPicker = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock) return;
    setSelectedSize("");
    setQuantity(1);
    setShowPicker(true);
  };

  const handleBuyNow = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock) return;
    router.push(href);
  };

  const handleConfirmAddToCart = async () => {
    if (!selectedSize) return;

    setAdding(true);
    try {
      addItem({
        ...product,
        _id: id,
        slug: product.slug,
        qty: quantity,
        size: selectedSize,
        color: "",
        price,
        totalStock: maxStock || totalStock,
        variants,
      });
      setShowPicker(false);
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <div
        className={`group flex h-full flex-col overflow-hidden rounded-lg border border-gray-100 bg-white transition-all duration-300 ${
          isOutOfStock ? "opacity-70" : "hover:border-black/20 hover:shadow-xl"
        }`}
      >
        <Link
          href={href}
          className="relative block w-full overflow-hidden bg-gray-50"
          style={{ aspectRatio: "2/3" }}
          onClick={() => trackSelectItem(product, listName, listId)}
        >
          <SafeImage
            src={resolveImageUrl(image)}
            alt={title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
            className={`object-cover transition-transform duration-700 ${
              !isOutOfStock && "group-hover:scale-105"
            }`}
          />
          {isOutOfStock && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10">
              <span className="font-vina text-white text-lg sm:text-2xl border-y border-white px-3 py-1.5 tracking-widest leading-none">
                SOLD OUT
              </span>
            </div>
          )}
        </Link>

        <div className="flex flex-1 flex-col p-2 sm:p-3 font-sans [font-style:normal]">
          <div className="flex items-baseline justify-between w-full gap-1">
            {category && (
              <span
                className={`text-[12px] sm:text-[12px] font-extrabold uppercase tracking-widest leading-none flex-shrink-0 ${
                  isOutOfStock ? "text-gray-400" : "text-[#DF1721]"
                }`}
              >
                {category}
              </span>
            )}
            <div className="flex items-baseline gap-1 flex-1 justify-end min-w-0 overflow-hidden">
              <h3
                className={`text-[12px] sm:text-[12px] md:text-[13px] font-bold uppercase tracking-tight leading-tight truncate text-right ${
                  isOutOfStock ? "text-gray-400" : "text-black"
                }`}
              >
                {title}
              </h3>
            </div>
          </div>

          <div className="mt-0.5">
            <span
              className={`text-[13px] sm:text-[14px] md:text-[15px] font-black leading-none ${
                isOutOfStock ? "text-gray-300" : "text-black"
              }`}
            >
              ₹{price.toLocaleString("en-IN")}
            </span>
          </div>

          <div className="mt-auto pt-1.5 flex flex-col gap-1">
            {isOutOfStock ? (
              <div className="flex w-full items-center justify-center gap-1.5 rounded-md bg-gray-100 py-2 sm:py-2.5 text-[12px] sm:text-[12px] font-black text-gray-400 uppercase tracking-widest border border-gray-200 min-h-[2.5rem]">
                <Ban size={14} /> OUT OF ARCHIVE
              </div>
            ) : (
              <>
                <button
                  onClick={handleOpenPicker}
                  className="flex w-full items-center justify-center gap-1 rounded-md border border-black bg-white py-1.5 sm:py-2 text-[12px] sm:text-[12px] md:text-[12px] font-black uppercase tracking-wide text-black transition-all duration-300 hover:bg-black hover:text-white active:scale-95 cursor-pointer min-h-[2rem]"
                >
                  <BagIcon size={14} className="flex-shrink-0" />
                  <span className="hidden sm:inline">ADD TO BAG</span>
                  <span className="sm:hidden text-[12px]">ADD</span>
                </button>

                <button
                  onClick={handleBuyNow}
                  className="flex w-full items-center justify-center gap-1 rounded-md border border-black bg-black py-1.5 sm:py-2 text-[12px] sm:text-[12px] md:text-[12px] font-black uppercase tracking-wide text-white transition-all duration-300 hover:bg-white hover:text-black active:scale-95 cursor-pointer min-h-[2rem]"
                >
                  <Zap size={14} className="flex-shrink-0" />
                  <span className="hidden sm:inline">BUY NOW</span>
                  <span className="sm:hidden text-[12px]">BUY</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showPicker && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowPicker(false)}
          />

          <div className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl z-10 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                  <SafeImage src={resolveImageUrl(image)} alt={title} fill className="object-cover" sizes="40px" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 leading-tight line-clamp-1">{title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    ₹{price.toLocaleString("en-IN")}
                    {quantity > 1 && (
                      <span className="ml-1 text-gray-400">
                        × {quantity} = ₹{(price * quantity).toLocaleString("en-IN")}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPicker(false)}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
              >
                <CloseIcon size={18} className="text-gray-500" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Select Size
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableSizes.map((sizeObj) => {
                    const sizeLabel = sizeObj.size || sizeObj;
                    const stock = sizeObj.stock ?? sizeObj.quantity ?? totalStock;
                    const outOfStock = stock === 0;
                    const selected = selectedSize === sizeLabel;
                    return (
                      <button
                        key={sizeLabel}
                        onClick={() => !outOfStock && setSelectedSize(sizeLabel)}
                        disabled={outOfStock}
                        className={`min-w-[48px] px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${
                          selected
                            ? "border-black bg-black text-white"
                            : outOfStock
                              ? "border-gray-100 text-gray-300 line-through cursor-not-allowed bg-gray-50"
                              : "border-gray-200 hover:border-gray-400 text-gray-800"
                        }`}
                      >
                        {sizeLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedSize && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Quantity
                  </p>
                  <div className="flex items-center border border-gray-200 rounded-xl w-fit overflow-hidden">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      className="w-10 h-10 flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-40"
                    >
                      <MinusIcon size={14} className="text-gray-600" />
                    </button>
                    <span className="w-10 text-center text-sm font-semibold">{quantity}</span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(maxStock || 5, q + 1))}
                      disabled={quantity >= Math.min(maxStock || 5, 5)}
                      className="w-10 h-10 flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-40"
                    >
                      <PlusIcon size={14} className="text-gray-600" />
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={handleConfirmAddToCart}
                disabled={!selectedSize || adding}
                className={`w-full py-3.5 rounded-xl font-bold text-sm tracking-widest transition-all flex items-center justify-center gap-2 ${
                  selectedSize && !adding
                    ? "bg-black hover:bg-gray-800 text-white active:scale-[0.98]"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                {adding ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Adding...
                  </>
                ) : (
                  <>
                    <BagIcon size={15} />
                    {selectedSize ? "ADD TO CART" : "SELECT A SIZE"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
