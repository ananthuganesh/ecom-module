"use client";

import { ShieldCheck } from "lucide-react";
import {
  BagIcon,
  CaretIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  HeartBagIcon,
  MinusIcon,
  PackageIcon,
  PlusIcon,
  ReturnIcon,
  RulerIcon,
  TruckIcon
} from "@/components/icons/storeIcons";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import SafeImage from "@/components/SafeImage";
import ProductCard from "@/components/storefront/ProductCard";
import ProductDetailSkeleton from "@/components/ProductDetailSkeleton";
import RecentlyViewed from "@/components/RecentlyViewed";
import { productService } from "@/api";
import { trackViewItem } from "@/lib/tracking";
import { useAuthStore } from "@/store/useAuthStore";
import { useCartStore } from "@/store/useCartStore";
import { useRecentlyViewedStore } from "@/store/useRecentlyViewedStore";
import { useWishlistStore } from "@/store/useWishlistStore";
import { resolveImageUrl } from "@/utils/imageResolver";
import { getProductSizeOptions } from "@/utils/productSizes";
import { sanitizeProductHtml } from "@/utils/sanitizeProductHtml";

const stockFor = (item, fallback = 0) => Number(item?.stock ?? item?.quantity ?? fallback ?? 0);

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const cartItems = useCartStore((state) => state.cartItems);
  const addRecentlyViewed = useRecentlyViewedStore((state) => state.addProduct);
  const userInfo = useAuthStore((state) => state.userInfo);
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistStore();
  const [product, setProduct] = useState(null);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [openSection, setOpenSection] = useState("description");

  useEffect(() => {
    const fetchProduct = async () => {
      if (!params?.id) return;
      setLoading(true);
      try {
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(params.id);
        let data;
        if (isObjectId) {
          try {
            data = await productService.getById(params.id);
          } catch {
            data = await productService.getBySlug(params.id);
          }
        } else {
          data = await productService.getBySlug(params.id);
        }
        if (!data) return;
        setProduct(data);
        addRecentlyViewed(data);
        trackViewItem(data);
        if (data.product) {
          const result = await productService.getProducts({ product: data.product });
          const items = Array.isArray(result?.products) ? result.products : Array.isArray(result) ? result : [];
          setSimilarProducts(items.filter((item) => item._id !== data._id).slice(0, 4));
        }
      } catch (error) {
        console.error("Error fetching product:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [params?.id, addRecentlyViewed]);

  const sizes = useMemo(() => getProductSizeOptions(product), [product]);
  const selectedSizeData = sizes.find((size) => size.size === selectedSize);
  const selectedVariant = useMemo(() => {
    if (!product) return null;
    if (selectedSize) {
      return (
        (product.variants || []).find(
          (variant) => String(variant.size || "").trim() === selectedSize
        ) || null
      );
    }
    return product.variants?.[0] || null;
  }, [product, selectedSize]);
  const images = useMemo(() => {
    if (selectedVariant?.images?.length) return selectedVariant.images.filter(Boolean);
    if (product?.thumbnails?.length) return product.thumbnails.filter(Boolean);
    if (product?.images?.length) return product.images.filter(Boolean);
    return product?.variants?.[0]?.images?.filter(Boolean) || [];
  }, [product, selectedVariant]);
  const availableStock = selectedSizeData
    ? stockFor(selectedSizeData, product?.totalStock)
    : Number(product?.totalStock || 0);
  const maxQuantity = Math.min(5, availableStock);
  const inStock = availableStock > 0;
  const price = Number(product?.pricing?.sellingPrice ?? product?.price ?? 0);
  const mrp = Number(product?.pricing?.mrp ?? 0);
  const hasCompareAt = mrp > 0 && mrp > price;
  const originalPrice = hasCompareAt ? mrp : null;
  const title = product?.productName || product?.name || "Product";
  const productLink = `/product/${params?.id || product?._id}`;
  const isFavorite = isInWishlist(product?._id);
  const isInCart = cartItems.some(
    (item) => item._id === product?._id && (item.size || "") === selectedSize
  );

  useEffect(() => {
    setQuantity(1);
  }, [selectedSize]);

  useEffect(() => {
    setQuantity((current) => Math.max(1, Math.min(current, maxQuantity || 1)));
  }, [maxQuantity]);

  const handleAddToCart = () => {
    if (!inStock) return;
    if (sizes.length > 0 && !selectedSize) return;
    addItem({
      ...product,
      qty: quantity,
      size: selectedSize,
      color: "",
      image: selectedVariant?.images?.[0] || product?.thumbnails?.[0],
      totalStock: availableStock,
      variants: product?.variants || [],
    });
  };

  const handleBuyNow = () => {
    if (!inStock) return;
    if (sizes.length > 0 && !selectedSize) return;
    handleAddToCart();
    router.push("/cart");
  };

  const toggleWishlist = () => {
    if (!userInfo?.token && !userInfo?.authenticated && !userInfo?._id && !userInfo?.id) {
      router.push(`/login?redirect=${encodeURIComponent(productLink)}`);
      return;
    }
    if (isFavorite) removeFromWishlist(product._id);
    else addToWishlist(product);
  };

  if (loading) return <main className="min-h-screen pt-24"><ProductDetailSkeleton /></main>;
  if (!product) return <p className="py-32 text-center text-sm font-bold uppercase tracking-widest text-gray-400">Product not found</p>;

  const details = [
    ["description", "Product description", product.description || "No description available."],
    ["details", "Product details", [
      selectedVariant?.sku || product.productId ? `SKU: ${selectedVariant?.sku || product.productId}` : null,
      [product.category?.name || product.category, product.type?.name || product.type, product.brand].filter(Boolean).join(" · "),
    ].filter(Boolean).join("\n") || "Details coming soon."],
  ];

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-6 text-[12px] font-bold uppercase tracking-[0.18em] text-gray-400">
          <Link href="/all-products" className="hover:text-black">All Products</Link><span className="mx-2">/</span>{product.category?.name || product.category || "Archive"}
        </div>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-16">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {images.slice(0, 4).map((image, index) => (
                <button key={`${image}-${index}`} type="button" onClick={() => setLightboxIndex(index)} className="group relative aspect-[3/4] overflow-hidden rounded-xl bg-gray-100 text-left">
                  <SafeImage src={resolveImageUrl(image)} alt={`${title} ${index + 1}`} fill priority={index === 0} sizes="(max-width: 1024px) 50vw, 30vw" className="object-cover transition duration-500 group-hover:scale-[1.03]" />
                </button>
              ))}
              {images.length < 4 && Array.from({ length: 4 - images.length }).map((_, index) => (
                <div key={`empty-${index}`} className="flex aspect-[3/4] items-center justify-center rounded-xl bg-gray-50"><PackageIcon className="h-8 w-8 text-gray-200" /></div>
              ))}
            </div>
            {images.length > 4 && <div className="flex gap-2 overflow-x-auto pb-1">{images.slice(4).map((image, index) => (
              <button key={`${image}-${index}`} type="button" onClick={() => setLightboxIndex(index + 4)} className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-200 hover:border-black">
                <SafeImage src={resolveImageUrl(image)} alt="" fill className="object-cover" sizes="64px" />
              </button>
            ))}</div>}
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-[12px] font-extrabold uppercase tracking-[0.2em] text-[#DF1721]">{product.type?.name || product.type || product.category?.name || product.category}</p>
                <h1 className="font-vina text-4xl uppercase leading-[0.9] tracking-tight text-black sm:text-5xl lg:text-6xl">{title}</h1>
              </div>
              <button type="button" onClick={toggleWishlist} aria-label="Toggle wishlist" className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gray-200 hover:border-black">
                <HeartBagIcon className={`h-[18px] w-[18px] ${isFavorite ? "fill-[#DF1721] text-[#DF1721]" : "text-black"}`} />
              </button>
            </div>
            {product.shortDescription && <p className="mt-4 text-sm leading-relaxed text-gray-500">{product.shortDescription}</p>}
            <div className="mt-6 flex flex-wrap items-end gap-3">
              <span className="text-3xl font-black tracking-tight">₹{price.toLocaleString("en-IN")}</span>
              {originalPrice && <span className="text-lg text-gray-400 line-through">₹{originalPrice.toLocaleString("en-IN")}</span>}
              {hasCompareAt && <span className="rounded bg-[#DF1721]/10 px-2 py-1 text-[12px] font-extrabold uppercase tracking-wider text-[#DF1721]">{Math.round(((originalPrice - price) / originalPrice) * 100)}% off</span>}
            </div>
            <p className="mt-1 text-[12px] text-gray-400">Inclusive of all taxes</p>

            {sizes.length > 0 && <div className="mt-8">
              <div className="mb-3 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-widest text-gray-700">Select size</p>
                <button type="button" onClick={() => setShowSizeGuide(true)} className="flex items-center gap-1 text-[12px] font-bold uppercase tracking-wider text-[#DF1721] hover:underline"><RulerIcon className="h-3.5 w-3.5" /> Size guide</button>
              </div>
              <div className="flex flex-wrap gap-2">{sizes.map((size) => {
                const unavailable = stockFor(size, 0) <= 0;
                return <button key={size.size} type="button" disabled={unavailable} onClick={() => setSelectedSize(size.size)} className={`min-w-12 rounded-lg border px-4 py-2.5 text-sm font-bold transition ${selectedSize === size.size ? "border-black bg-black text-white" : unavailable ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 line-through" : "border-gray-200 hover:border-black"}`}>{size.size}</button>;
              })}</div>
            </div>}

            <div className="mt-8 flex items-end gap-4">
              <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-700">Quantity</p>
                <div className="flex h-12 items-center overflow-hidden rounded-lg border border-gray-200">
                  <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} className="grid h-full w-11 place-items-center hover:bg-gray-50 disabled:opacity-30"><MinusIcon className="h-4 w-4" /></button>
                  <span className="w-10 text-center text-sm font-bold">{quantity}</span>
                  <button type="button" onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))} disabled={quantity >= maxQuantity} className="grid h-full w-11 place-items-center hover:bg-gray-50 disabled:opacity-30"><PlusIcon className="h-4 w-4" /></button>
                </div>
              </div>
              {inStock && availableStock <= 3 && <p className="pb-3 text-xs font-bold text-[#DF1721]">Only {availableStock} left</p>}
              {!inStock && <p className="pb-3 text-xs font-bold uppercase tracking-wider text-[#DF1721]">Out of archive</p>}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {isInCart ? <button type="button" onClick={() => useCartStore.getState().setDrawerOpen(true)} className="flex h-14 items-center justify-center gap-2 rounded-lg bg-black text-xs font-extrabold uppercase tracking-widest text-white"><BagIcon className="h-4 w-4" /> View bag</button>
                : <button type="button" onClick={handleAddToCart} disabled={!inStock || (sizes.length > 0 && !selectedSize)} className="flex h-14 items-center justify-center gap-2 rounded-lg border border-black text-xs font-extrabold uppercase tracking-widest transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"><BagIcon className="h-4 w-4" /> {sizes.length > 0 && !selectedSize ? "Select size" : "Add to bag"}</button>}
              <button type="button" onClick={handleBuyNow} disabled={!inStock || (sizes.length > 0 && !selectedSize)} className="h-14 rounded-lg bg-[#DF1721] text-xs font-extrabold uppercase tracking-widest text-white hover:bg-brand-red disabled:cursor-not-allowed disabled:bg-gray-200">Buy now</button>
            </div>

            <div className="mt-7 grid grid-cols-3 gap-2">{[[ShieldCheck, "Secure payment"], [ReturnIcon, "Easy returns"], [TruckIcon, "Shipping available"]].map(([Icon, label]) => (
              <div key={label} className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50 px-2 py-3 text-center"><Icon className="h-4 w-4 text-gray-600" /><span className="text-[12px] font-semibold leading-tight text-gray-500">{label}</span></div>
            ))}</div>
            <div className="mt-8 border-t border-gray-100">{details.map(([key, label, content]) => (
              <div key={key} className="border-b border-gray-100">
                <button type="button" onClick={() => setOpenSection(openSection === key ? null : key)} className="flex w-full items-center justify-between py-4 text-left text-xs font-extrabold uppercase tracking-widest"><span>{label}</span><CaretIcon className={`h-4 w-4 transition-transform ${openSection === key ? "rotate-180" : ""}`} /></button>
                {openSection === key && (
                  key === "description" && /<\/?[a-z][\s\S]*>/i.test(String(content || "")) ? (
                    <div
                      className="prose prose-sm max-w-none pb-5 text-sm leading-relaxed text-gray-600 [&_a]:text-[#005bd3] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                      dangerouslySetInnerHTML={{ __html: sanitizeProductHtml(content) }}
                    />
                  ) : (
                    <p className="whitespace-pre-line pb-5 text-sm leading-relaxed text-gray-600">{content}</p>
                  )
                )}
              </div>
            ))}</div>
          </div>
        </div>
      </section>

      {similarProducts.length > 0 && <section className="border-t border-gray-100 bg-[#F9F9F5] py-16 sm:py-20">
        <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
          <div className="mb-10 flex items-end justify-between gap-4"><div><p className="text-[12px] font-extrabold uppercase tracking-[0.2em] text-[#DF1721]">Keep exploring</p><h2 className="mt-2 font-vina text-4xl uppercase leading-none tracking-tight sm:text-5xl">You may also like</h2></div><Link href="/all-products" className="border-b-2 border-black pb-1 text-[12px] font-extrabold uppercase tracking-widest">View all</Link></div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3 lg:gap-4">{similarProducts.map((item) => <ProductCard key={item._id} product={item} />)}</div>
        </div>
      </section>}
      <RecentlyViewed />

      {lightboxIndex !== null && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4">
        <button type="button" onClick={() => setLightboxIndex(null)} className="absolute right-4 top-4 rounded-full p-2 text-white hover:bg-white/10" aria-label="Close image viewer"><CloseIcon className="h-6 w-6" /></button>
        <div className="relative h-[82vh] w-full max-w-4xl"><SafeImage src={resolveImageUrl(images[lightboxIndex])} alt={title} fill className="object-contain" priority />
          {images.length > 1 && <><button type="button" onClick={() => setLightboxIndex((index) => index === 0 ? images.length - 1 : index - 1)} className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-3 text-white" aria-label="Previous image"><ChevronLeftIcon /></button><button type="button" onClick={() => setLightboxIndex((index) => index === images.length - 1 ? 0 : index + 1)} className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-3 text-white" aria-label="Next image"><ChevronRightIcon /></button></>}
        </div>
      </div>}

      {showSizeGuide && <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setShowSizeGuide(false)} aria-label="Close size guide" />
        <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"><button type="button" onClick={() => setShowSizeGuide(false)} className="absolute right-4 top-4 rounded-full p-2 hover:bg-gray-100" aria-label="Close size guide"><CloseIcon className="h-5 w-5" /></button>
          <h2 className="font-vina text-3xl uppercase leading-none">Size guide</h2><p className="mt-4 text-sm leading-relaxed text-gray-600">Compare these options with a similar item you already own. Allow a little room beyond body measurements for a comfortable fit.</p>
          <div className="mt-6 overflow-hidden rounded-xl border border-gray-100"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-[12px] font-extrabold uppercase tracking-widest text-gray-500"><tr><th className="px-4 py-3">Size</th><th className="px-4 py-3">Availability</th></tr></thead><tbody>{sizes.map((size) => <tr key={size.size} className="border-t border-gray-100"><td className="px-4 py-3 font-bold">{size.size}</td><td className="px-4 py-3 text-gray-500">{stockFor(size, 0) > 0 ? "Available" : "Sold out"}</td></tr>)}</tbody></table></div>
        </div>
      </div>}
    </main>
  );
}
