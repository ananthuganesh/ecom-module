"use client";

import {
  CaretIcon,
  CloseIcon,
  LocationIcon,
  RulerIcon,
} from "@/components/icons/storeIcons";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import SafeImage from "@/components/SafeImage";
import ProductCard from "@/components/storefront/ProductCard";
import ProductDetailSkeleton from "@/components/ProductDetailSkeleton";
import RecentlyViewed from "@/components/RecentlyViewed";
import { productService } from "@/api";
import { trackViewItem } from "@/lib/tracking";
import WishlistButton from "@/components/storefront/WishlistButton";
import {
  SIZE_GUIDE_COLUMNS,
  SIZE_GUIDE_NOTE,
  SIZE_GUIDE_ROWS,
  formatSizeGuideValue,
} from "@/lib/sizeGuide";
import { useCartStore } from "@/store/useCartStore";
import { useBuyNowStore } from "@/store/useBuyNowStore";
import { useRecentlyViewedStore } from "@/store/useRecentlyViewedStore";
import { resolveImageUrl } from "@/utils/imageResolver";
import { getProductSizeOptions } from "@/utils/productSizes";
import { sanitizeProductHtml } from "@/utils/sanitizeProductHtml";
import { resolveCardBadge } from "@/utils/urbanProductAdapter";

const stockFor = (item, fallback = 0) => Number(item?.stock ?? item?.quantity ?? fallback ?? 0);

function CtaSpinner({ tone = "dark" }) {
  const ring =
    tone === "light"
      ? "border-white/30 border-t-white"
      : "border-black/20 border-t-black";
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 ${ring}`}
      aria-hidden="true"
    />
  );
}

/** Convert ALL CAPS / shouty text to sentence case; leave mixed-case alone. */
function toSentenceCase(value) {
  const text = String(value ?? "").trim();
  if (!text) return text;
  // Keep SKUs / codes as-is (e.g. TJ9I99-S).
  if (/[0-9]/.test(text) && !/\s/.test(text)) return text;
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (!letters) return text;
  const upperRatio =
    letters.replace(/[^A-Z]/g, "").length / Math.max(1, letters.length);
  if (upperRatio < 0.6) return text;
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function estimateDeliveryWindow(from = new Date()) {
  const start = new Date(from);
  start.setDate(start.getDate() + 3);
  const end = new Date(from);
  end.setDate(end.getDate() + 6);
  const fmt = (d) =>
    d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  return `${fmt(start)}–${fmt(end)}`;
}

export default function ProductDetailPage({ initialProduct = null }) {
  const params = useParams();
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const cartItems = useCartStore((state) => state.cartItems);
  const addRecentlyViewed = useRecentlyViewedStore((state) => state.addProduct);
  const [product, setProduct] = useState(initialProduct);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [loading, setLoading] = useState(!initialProduct);
  const [selectedSize, setSelectedSize] = useState("");
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [sizeGuideUnit, setSizeGuideUnit] = useState("in");
  const [openSection, setOpenSection] = useState("description");
  const [pinCode, setPinCode] = useState("");
  const [pinChecking, setPinChecking] = useState(false);
  const [pinError, setPinError] = useState("");
  const [deliveryLabel, setDeliveryLabel] = useState("");
  const [ctaPending, setCtaPending] = useState(null);
  const [showStickyCta, setShowStickyCta] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const trackedViewIdRef = useRef(null);
  const primaryCtaRef = useRef(null);
  const mobileGalleryRef = useRef(null);
  const mobileGalleryScrollLock = useRef(false);

  // Next can leave the page mid-viewport when opening a product (sticky
  // product column + preserved scroll from the previous listing page).
  const productScrollKey = product?._id || params?.id;
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const toTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };
    toTop();
    // Router scroll can run after first paint — re-assert top briefly.
    const t0 = window.setTimeout(toTop, 0);
    const t1 = window.setTimeout(toTop, 80);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [productScrollKey]);

  useEffect(() => {
    if (!initialProduct?._id) return;
    if (trackedViewIdRef.current === initialProduct._id) return;
    trackedViewIdRef.current = initialProduct._id;
    addRecentlyViewed(initialProduct);
    trackViewItem(initialProduct);
  }, [initialProduct, addRecentlyViewed]);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!params?.id) return;
      const hadInitial = Boolean(initialProduct);
      // Keep SSR paint visible; only show skeleton when we have no product yet.
      if (!hadInitial) setLoading(true);
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
        if (!data) {
          if (!hadInitial) setProduct(null);
          return;
        }
        setProduct(data);
        addRecentlyViewed(data);
        if (trackedViewIdRef.current !== data._id) {
          trackedViewIdRef.current = data._id;
          trackViewItem(data);
        }

        const currentId = data._id;
        const categoryValue =
          typeof data.category === "object"
            ? data.category?.name || data.category?.slug
            : data.category;
        const productGroup = data.product;

        const normalizeList = (result) =>
          Array.isArray(result?.products)
            ? result.products
            : Array.isArray(result)
              ? result
              : [];

        const mergeUnique = (base, next) => {
          const seen = new Set(base.map((item) => item._id));
          for (const item of next) {
            if (!item?._id || item._id === currentId || seen.has(item._id)) continue;
            seen.add(item._id);
            base.push(item);
          }
          return base;
        };

        let related = [];
        try {
          if (productGroup) {
            const byGroup = await productService.getProducts({
              product: productGroup,
              pageSize: 12,
            });
            related = mergeUnique(related, normalizeList(byGroup));
          }
          if (related.length < 8 && categoryValue) {
            const byCategory = await productService.getProducts({
              category: categoryValue,
              pageSize: 12,
            });
            related = mergeUnique(related, normalizeList(byCategory));
          }
          if (related.length < 8) {
            const latest = await productService.getProducts({ pageSize: 12 });
            related = mergeUnique(related, normalizeList(latest));
          }
        } catch (relatedError) {
          console.error("Error fetching related products:", relatedError);
        }
        setSimilarProducts(related.slice(0, 8));
      } catch (error) {
        console.error("Error fetching product:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [params?.id, addRecentlyViewed, initialProduct]);

  const sizes = useMemo(() => getProductSizeOptions(product), [product]);

  useEffect(() => {
    if (!sizes.length) {
      setSelectedSize("");
      return;
    }
    const currentStillAvailable =
      selectedSize &&
      sizes.some((size) => size.size === selectedSize && stockFor(size, 0) > 0);
    if (currentStillAvailable) return;

    const firstAvailable = sizes.find((size) => stockFor(size, 0) > 0);
    setSelectedSize(firstAvailable?.size || "");
  }, [product?._id, sizes, selectedSize]);

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
    if (!product) return [];

    const ordered = [];
    const pushUnique = (url) => {
      const src = String(url || "").trim();
      if (!src || ordered.includes(src)) return;
      ordered.push(src);
    };

    // All photos in order: product media, then each variant's images.
    for (const url of product.thumbnails || []) pushUnique(url);
    for (const url of product.images || []) pushUnique(url);
    for (const variant of product.variants || []) {
      if (variant?.isDeleted) continue;
      for (const url of variant.images || []) pushUnique(url);
    }

    // If the selected variant has a photo, put that photo first — that's the only change.
    const selectedPhotos = (
      selectedSizeData?.images ||
      selectedVariant?.images ||
      []
    )
      .map((url) => String(url || "").trim())
      .filter(Boolean);
    const lead = selectedPhotos[0];
    if (!lead || !ordered.includes(lead)) return ordered;

    return [lead, ...ordered.filter((url) => url !== lead)];
  }, [product, selectedSizeData, selectedVariant]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [product?._id, selectedSize]);

  useEffect(() => {
    if (!images.length) {
      setActiveImageIndex(0);
      return;
    }
    setActiveImageIndex((i) => Math.min(Math.max(0, i), images.length - 1));
  }, [images.length]);

  const mobileGalleryLoops = images.length > 1;

  const mobileGallerySlides = useMemo(() => {
    if (!images.length) return [];
    if (!mobileGalleryLoops) {
      return images.map((image, index) => ({
        image,
        realIndex: index,
        key: `slide-${index}`,
      }));
    }
    return [
      {
        image: images[images.length - 1],
        realIndex: images.length - 1,
        key: "clone-end",
      },
      ...images.map((image, index) => ({
        image,
        realIndex: index,
        key: `slide-${index}`,
      })),
      {
        image: images[0],
        realIndex: 0,
        key: "clone-start",
      },
    ];
  }, [images, mobileGalleryLoops]);

  useEffect(() => {
    const el = mobileGalleryRef.current;
    if (!el) return;
    mobileGalleryScrollLock.current = true;
    const width = el.clientWidth || 0;
    // With infinite loop clones, real index 0 sits at slide 1.
    const startLeft = mobileGalleryLoops && width ? width : 0;
    el.scrollTo({ left: startLeft, behavior: "auto" });
    const t = window.setTimeout(() => {
      mobileGalleryScrollLock.current = false;
    }, 80);
    return () => window.clearTimeout(t);
  }, [product?._id, selectedSize, images.length, mobileGalleryLoops]);

  const scrollMobileGalleryTo = (index) => {
    const el = mobileGalleryRef.current;
    if (!el) return;
    const width = el.clientWidth || 0;
    if (!width) return;
    const slide = mobileGalleryLoops ? index + 1 : index;
    mobileGalleryScrollLock.current = true;
    el.scrollTo({ left: slide * width, behavior: "smooth" });
    window.setTimeout(() => {
      mobileGalleryScrollLock.current = false;
    }, 320);
  };

  const settleMobileGalleryLoop = () => {
    const el = mobileGalleryRef.current;
    if (!el || !mobileGalleryLoops) return;
    const width = el.clientWidth || 0;
    if (!width) return;
    const slide = Math.round(el.scrollLeft / width);
    const last = images.length;
    if (slide <= 0) {
      mobileGalleryScrollLock.current = true;
      el.scrollTo({ left: last * width, behavior: "auto" });
      setActiveImageIndex(last - 1);
      window.requestAnimationFrame(() => {
        mobileGalleryScrollLock.current = false;
      });
      return;
    }
    if (slide >= last + 1) {
      mobileGalleryScrollLock.current = true;
      el.scrollTo({ left: width, behavior: "auto" });
      setActiveImageIndex(0);
      window.requestAnimationFrame(() => {
        mobileGalleryScrollLock.current = false;
      });
    }
  };

  useEffect(() => {
    const el = mobileGalleryRef.current;
    if (!el || !mobileGalleryLoops) return undefined;

    let settleTimer = 0;
    const onScrollEnd = () => settleMobileGalleryLoop();
    const onScroll = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settleMobileGalleryLoop, 80);
    };

    el.addEventListener("scrollend", onScrollEnd);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(settleTimer);
      el.removeEventListener("scrollend", onScrollEnd);
      el.removeEventListener("scroll", onScroll);
    };
  }, [mobileGalleryLoops, images.length, product?._id, selectedSize]);

  const handleMobileGalleryScroll = () => {
    if (mobileGalleryScrollLock.current) return;
    const el = mobileGalleryRef.current;
    if (!el) return;
    const width = el.clientWidth || 0;
    if (!width) return;
    const slide = Math.round(el.scrollLeft / width);
    if (mobileGalleryLoops) {
      const last = images.length;
      if (slide >= 1 && slide <= last) {
        const next = slide - 1;
        if (next !== activeImageIndex) setActiveImageIndex(next);
      }
      return;
    }
    if (slide >= 0 && slide < images.length && slide !== activeImageIndex) {
      setActiveImageIndex(slide);
    }
  };

  const availableStock = selectedSizeData
    ? stockFor(selectedSizeData, product?.totalStock)
    : Number(product?.totalStock || 0);
  const inStock = availableStock > 0;
  const price = Number(product?.pricing?.sellingPrice ?? product?.price ?? 0);
  const mrp = Number(product?.pricing?.mrp ?? 0);
  const hasCompareAt = mrp > 0 && mrp > price;
  const originalPrice = hasCompareAt ? mrp : null;
  const saveAmount = hasCompareAt ? originalPrice - price : 0;
  const savePercent = hasCompareAt
    ? Math.round((saveAmount / originalPrice) * 100)
    : 0;
  const title = toSentenceCase(product?.productName || product?.name || "Product");
  const productType = toSentenceCase(
    String(product?.type || product?.productType || product?.subcategory || "").trim()
  );
  const productBadge = useMemo(
    () => (product ? resolveCardBadge(product) : null),
    [product]
  );
  const isInCart = cartItems.some(
    (item) => item._id === product?._id && (item.size || "") === selectedSize
  );

  const checkDeliveryPin = async (rawCode = pinCode) => {
    const code = String(rawCode || "").trim();
    setPinError("");
    setDeliveryLabel("");
    if (!/^\d{6}$/.test(code)) {
      return;
    }
    setPinChecking(true);
    try {
      const response = await fetch(
        `https://api.postalpincode.in/pincode/${code}`
      );
      const data = await response.json();
      const result = Array.isArray(data) ? data[0] : null;
      if (result?.Status === "Success" && result.PostOffice?.length > 0) {
        setDeliveryLabel(`Delivery by ${estimateDeliveryWindow()}`);
      } else {
        setPinError("Invalid PIN code. Please check and try again.");
      }
    } catch {
      setPinError("Could not check delivery. Try again.");
    } finally {
      setPinChecking(false);
    }
  };

  useEffect(() => {
    if (pinCode.length !== 6) return;
    void checkDeliveryPin(pinCode);
     
  }, [pinCode]);

  useEffect(() => {
    const target = primaryCtaRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Sticky bar only when the real CTAs are off-screen.
        setShowStickyCta(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "0px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [product?._id, loading]);

  const handleAddToCart = () => {
    if (!inStock || ctaPending) return;
    if (sizes.length > 0 && !selectedSize) return;
    setCtaPending("add");
    addItem({
      ...product,
      qty: 1,
      size: selectedSize,
      color: "",
      image: selectedVariant?.images?.[0] || product?.thumbnails?.[0],
      totalStock: availableStock,
      variants: product?.variants || [],
    });
    window.setTimeout(() => setCtaPending(null), 450);
  };

  const handleBuyNow = () => {
    if (!inStock || ctaPending) return;
    if (sizes.length > 0 && !selectedSize) return;
    setCtaPending("buy");
    const ok = useBuyNowStore.getState().setBuyNowItem({
      ...product,
      qty: 1,
      size: selectedSize,
      color: "",
      image: selectedVariant?.images?.[0] || product?.thumbnails?.[0],
      totalStock: availableStock,
      variants: product?.variants || [],
      price,
    });
    if (!ok) {
      setCtaPending(null);
      return;
    }
    router.push("/checkout?buyNow=1");
  };

  if (loading && !product) return <main className="min-h-screen bg-white py-8"><ProductDetailSkeleton /></main>;
  if (!product) return <p className="min-h-screen bg-white py-24 text-center text-sm text-gray-400">Product not found</p>;

  const formatSpec = (value) => {
    if (Array.isArray(value)) {
      return value
        .map((item) => toSentenceCase(String(item || "").trim()))
        .filter(Boolean)
        .join(", ");
    }
    if (value && typeof value === "object") {
      return toSentenceCase(String(value.name || value.label || "").trim());
    }
    return toSentenceCase(String(value || "").trim());
  };

  const productSpecs = [
    { label: "Product Category", value: formatSpec(product.category) },
    { label: "Fit", value: formatSpec(product.fit) },
    { label: "Fabric", value: formatSpec(product.fabric) },
    { label: "Neck Type", value: formatSpec(product.neckType) },
    { label: "Sleeve Type", value: formatSpec(product.sleeveType) },
    { label: "Pattern", value: formatSpec(product.pattern) },
    {
      label: "Colour",
      value: formatSpec(
        Array.isArray(product.colors) && product.colors.length
          ? product.colors
          : product.color
      ),
    },
    { label: "Gender", value: formatSpec(product.gender) },
    {
      label: "SKU",
      value: formatSpec(selectedVariant?.sku || product.productId),
    },
  ].filter((spec) => spec.value);

  const categoryLabel = toSentenceCase(
    product.category?.name || product.category || "Archive"
  );

  const ctaDisabled = !inStock || (sizes.length > 0 && !selectedSize);
  const addLabel =
    sizes.length > 0 && !selectedSize ? "Select size" : "Add to cart";

  return (
    <main
      className={`min-h-screen bg-[#ffffff] text-black lg:pb-0 ${
        showStickyCta
          ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
          : "pb-0"
      }`}
    >
      <section className="w-full px-4 py-5 md:px-4 md:py-8 lg:px-8 lg:py-10">
        <nav className="mb-4 text-[11px] font-medium text-gray-400 md:mb-5">
          <Link href="/all-products" className="transition-colors hover:text-black">
            All Products
          </Link>
          <span className="mx-1.5 text-gray-300">/</span>
          <span>{categoryLabel}</span>
        </nav>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-10 xl:gap-14">
          {/* Gallery */}
          <div className="space-y-2.5">
            {/* Mobile — swipeable main gallery + square thumbs */}
            <div className="space-y-2 lg:hidden">
              <div className="relative">
                <div
                  ref={mobileGalleryRef}
                  onScroll={handleMobileGalleryScroll}
                  className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-lg"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  {mobileGallerySlides.length > 0 ? (
                    mobileGallerySlides.map(
                      ({ image, realIndex, key }, slideIndex) => (
                        <div
                          key={key}
                          className="relative aspect-[3/4] w-full shrink-0 snap-center overflow-hidden bg-gray-100"
                        >
                          <SafeImage
                            src={resolveImageUrl(image)}
                            alt={`${title} ${realIndex + 1}`}
                            fill
                            priority={
                              slideIndex === (mobileGalleryLoops ? 1 : 0)
                            }
                            fetchPriority={
                              slideIndex === (mobileGalleryLoops ? 1 : 0)
                                ? "high"
                                : undefined
                            }
                            loading={
                              slideIndex === (mobileGalleryLoops ? 1 : 0)
                                ? "eager"
                                : "lazy"
                            }
                            sizes="100vw"
                            className="pointer-events-none object-cover"
                            draggable={false}
                          />
                        </div>
                      )
                    )
                  ) : (
                    <div className="relative aspect-[3/4] w-full shrink-0 bg-gray-100" />
                  )}
                </div>

                {productBadge ? (
                  <div className="pointer-events-none absolute top-2 left-2 z-10 inline-flex h-5 items-center rounded-sm bg-white px-1.5">
                    <span
                      className={`text-[8px] font-medium uppercase leading-none tracking-wide ${
                        productBadge.key === "sold_out"
                          ? "text-[#c70a24]"
                          : productBadge.key === "low_stock"
                            ? "text-[#b45309]"
                            : "text-[#133b5f]"
                      }`}
                    >
                      {productBadge.label}
                    </span>
                  </div>
                ) : null}

                <WishlistButton
                  product={product}
                  iconSize={18}
                  className="absolute top-2 right-2 z-20 inline-flex items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
                />

                {images.length > 1 ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center gap-1.5">
                    {images.map((_, index) => (
                      <span
                        key={`dot-${index}`}
                        className={`h-1.5 rounded-full transition-all ${
                          index === activeImageIndex
                            ? "w-4 bg-white"
                            : "w-1.5 bg-white/55"
                        }`}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              {images.length > 1 ? (
                <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                  {images.map((image, index) => {
                    const active = index === activeImageIndex;
                    return (
                      <button
                        key={`m-${image}-${index}`}
                        type="button"
                        onClick={() => {
                          setActiveImageIndex(index);
                          scrollMobileGalleryTo(index);
                        }}
                        className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md ${
                          active
                            ? "border-2 border-gray-400"
                            : "border border-gray-200"
                        }`}
                        aria-label={`View image ${index + 1}`}
                        aria-current={active ? "true" : undefined}
                      >
                        <SafeImage
                          src={resolveImageUrl(image)}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* Desktop — multi-image grid */}
            <div className="hidden lg:block">
              <div className="grid grid-cols-2 gap-2">
                {images.slice(0, 4).map((image, index) => (
                  <div
                    key={`${image}-${index}`}
                    className="group relative aspect-[3/4] overflow-hidden rounded-xl bg-gray-100"
                  >
                    <SafeImage
                      src={resolveImageUrl(image)}
                      alt={`${title} ${index + 1}`}
                      fill
                      priority={index === 0}
                      fetchPriority={index === 0 ? "high" : undefined}
                      loading={index === 0 ? "eager" : undefined}
                      sizes="35vw"
                      className="object-cover transition duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                ))}
              </div>
              {images.length > 4 ? (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {images.slice(4).map((image, index) => (
                    <div
                      key={`${image}-${index}`}
                      className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md border border-gray-200"
                    >
                      <SafeImage
                        src={resolveImageUrl(image)}
                        alt={`${title} ${index + 5}`}
                        fill
                        className="object-cover"
                        sizes="48px"
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Buy box */}
          <div className="lg:sticky lg:top-24 lg:self-start lg:max-w-md xl:max-w-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold leading-snug tracking-tight text-black sm:text-2xl">
                  {title}
                </h1>
                {productType ? (
                  <p className="mt-1 text-[13px] font-medium text-gray-500">
                    {productType}
                  </p>
                ) : null}
              </div>
              <WishlistButton
                product={product}
                iconSize={20}
                className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-800 transition-colors hover:border-black hover:bg-gray-50 lg:inline-flex"
              />
            </div>

            {product.shortDescription ? (
              <p className="mt-3 text-[13px] leading-relaxed text-gray-500">
                {toSentenceCase(product.shortDescription)}
              </p>
            ) : null}

            <div className="mt-4 space-y-1">
              <p className="text-2xl font-bold tracking-tight text-black">
                ₹{price.toLocaleString("en-IN")}
              </p>
              {hasCompareAt ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-gray-400">
                      MRP{" "}
                      <span className="line-through">
                        ₹{originalPrice.toLocaleString("en-IN")}
                      </span>
                    </p>
                    {savePercent > 0 ? (
                      <span className="inline-flex items-center rounded-sm bg-[#c70a24] px-2 py-1 text-[13px] font-semibold leading-none tracking-wide text-white uppercase">
                        {savePercent}% OFF
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[13px] font-semibold text-emerald-600">
                    You save ₹{saveAmount.toLocaleString("en-IN")}
                  </p>
                </>
              ) : null}
              <p className="text-[11px] text-gray-400">Inclusive of all taxes</p>
            </div>

            {sizes.length > 0 ? (
              <div className="mt-6">
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <p className="text-[12px] font-medium text-gray-600">
                    Size
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowSizeGuide(true)}
                    className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-[#DF1721] hover:underline"
                  >
                    <RulerIcon className="h-3 w-3" /> Find my size
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sizes.map((size) => {
                    const unavailable = stockFor(size, 0) <= 0;
                    const selected = selectedSize === size.size && !unavailable;
                    return (
                      <button
                        key={size.size}
                        type="button"
                        disabled={unavailable}
                        onClick={() => setSelectedSize(size.size)}
                        aria-label={
                          unavailable
                            ? `${size.size} sold out`
                            : `Select size ${size.size}`
                        }
                        className={`relative min-w-10 overflow-hidden rounded-md border px-3 py-2 text-xs font-semibold transition ${
                          selected
                            ? "border-black bg-black text-white"
                            : unavailable
                              ? "cursor-not-allowed border-gray-200 bg-transparent text-gray-400"
                              : "border-gray-200 text-black hover:border-black"
                        }`}
                      >
                        <span className="relative z-[1]">{size.size}</span>
                        {unavailable ? (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-0 z-0"
                            style={{
                              background:
                                "linear-gradient(to top right, transparent calc(50% - 0.6px), #c4c4c4 0, #c4c4c4 calc(50% + 0.6px), transparent 0)",
                            }}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div ref={primaryCtaRef} className="mt-5 flex gap-2">
              {isInCart && ctaPending !== "add" ? (
                <button
                  type="button"
                  onClick={() => useCartStore.getState().setDrawerOpen(true)}
                  className="flex h-11 w-1/2 items-center justify-center rounded-lg border border-black text-[13px] font-semibold transition hover:bg-black hover:text-white"
                >
                  View bag
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={ctaDisabled || Boolean(ctaPending)}
                  aria-busy={ctaPending === "add"}
                  className="flex h-11 w-1/2 items-center justify-center rounded-lg border border-black text-[13px] font-semibold transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
                >
                  {ctaPending === "add" ? (
                    <CtaSpinner tone="dark" />
                  ) : sizes.length > 0 && !selectedSize ? (
                    "Select size"
                  ) : (
                    "Add to cart"
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={handleBuyNow}
                disabled={ctaDisabled || Boolean(ctaPending)}
                aria-busy={ctaPending === "buy"}
                className="flex h-11 w-1/2 items-center justify-center rounded-lg bg-black text-[13px] font-semibold text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:bg-gray-200"
              >
                {ctaPending === "buy" ? <CtaSpinner tone="light" /> : "Buy now"}
              </button>
            </div>

            <div className="mt-5 rounded-lg p-0">
              <p className="mb-2 text-[12px] font-medium text-gray-600">
                Delivery check
              </p>
              <label className="relative block">
                <LocationIcon className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinCode}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setPinCode(next);
                    setPinError("");
                    setDeliveryLabel("");
                  }}
                  placeholder="Enter 6-digit PIN"
                  className="h-10 w-full rounded-md border border-gray-200 bg-white pr-10 pl-8 text-sm outline-none focus:border-black"
                />
                {pinChecking ? (
                  <span className="absolute top-1/2 right-3 -translate-y-1/2">
                    <CtaSpinner tone="dark" />
                  </span>
                ) : null}
              </label>
              {pinError ? (
                <p className="mt-2 text-[12px] font-medium text-[#DF1721]">{pinError}</p>
              ) : null}
              {deliveryLabel ? (
                <p className="mt-2 text-[12px] font-semibold text-emerald-700">
                  {deliveryLabel}
                </p>
              ) : null}
            </div>

            {productSpecs.length > 0 ? (
              <div className="mt-6 pt-1">
                <h2 className="mb-3 text-[16px] font-semibold text-gray-800">
                  Product details
                </h2>
                <div className="grid grid-cols-2">
                  {productSpecs.map((spec, index) => {
                    const isLastRow =
                      index >=
                      productSpecs.length -
                        (productSpecs.length % 2 === 0 ? 2 : 1);
                    return (
                      <div
                        key={spec.label}
                        className={`py-4 pr-4 ${
                          index % 2 === 1 ? "pl-4" : ""
                        } ${!isLastRow ? "border-b border-gray-200" : ""}`}
                      >
                        <p className="text-[12px] leading-snug text-gray-400">
                          {spec.label}
                        </p>
                        <p className="mt-1.5 text-[14px] font-medium leading-snug text-[#222222]">
                          {spec.value}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-6 pt-1">
              <h2 className="mb-3 text-[16px] font-semibold text-gray-800">
                Information
              </h2>
              <div>
              {[
                {
                  id: "description",
                  title: "Description",
                  body: (
                    /<\/?[a-z][\s\S]*>/i.test(String(product.description || "")) ? (
                      <div
                        className="prose prose-sm max-w-none pb-4 text-[13px] leading-relaxed text-gray-600 [&_a]:text-[#005bd3] [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeProductHtml(
                            product.description || "No description available."
                          ),
                        }}
                      />
                    ) : (
                      <p className="whitespace-pre-line pb-4 text-[13px] leading-relaxed text-gray-600">
                        {toSentenceCase(
                          product.description || "No description available."
                        )}
                      </p>
                    )
                  ),
                },
                {
                  id: "shipping",
                  title: "Shipping & returns",
                  body: (
                    <div className="space-y-3 pb-4 text-[13px] leading-relaxed text-gray-600">
                      <p>
                        Orders are packed and dispatched as quickly as stock
                        allows. Delivery usually takes 3–6 business days after
                        dispatch, depending on your pin code and courier
                        serviceability.
                      </p>
                      <p>
                        Easy returns and exchanges are available on eligible
                        products within the return window, provided items are
                        unused and in original condition with tags.
                      </p>
                      <Link
                        href="/return-refund"
                        className="inline-block font-medium text-[#DF1721] hover:underline"
                      >
                        View full shipping & returns policy
                      </Link>
                    </div>
                  ),
                },
                {
                  id: "wash",
                  title: "Wash care",
                  body: (
                    <ul className="list-disc space-y-1.5 pb-4 pl-5 text-[13px] leading-relaxed text-gray-600">
                      <li>Machine wash cold with similar colours</li>
                      <li>Use mild detergent; avoid bleach</li>
                      <li>Do not tumble dry — hang dry in shade</li>
                      <li>Warm iron inside out if needed</li>
                      <li>Do not dry clean</li>
                    </ul>
                  ),
                },
              ]
                .filter(Boolean)
                .map((section, sectionIndex, sectionList) => {
                  const isOpen = openSection === section.id;
                  const isLast = sectionIndex === sectionList.length - 1;
                  return (
                    <div
                      key={section.id}
                      className={isLast ? "" : "border-b border-gray-200"}
                    >                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => {
                          if (!isOpen) setOpenSection(section.id);
                        }}
                        className="flex w-full items-center justify-between py-3 text-left text-[13px] font-medium text-gray-700"
                      >
                        <span>{section.title}</span>
                        <CaretIcon
                          className={`h-3.5 w-3.5 transition-transform duration-300 ease-out ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      <div
                        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                          isOpen
                            ? "grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0"
                        }`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          {section.body}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 grid grid-cols-4 gap-2 sm:gap-3">
                {[
                  {
                    src: "/badge/premium-quality.png",
                    alt: "Premium quality",
                  },
                  {
                    src: "/badge/great-customer-service.png",
                    alt: "Great customer service",
                  },
                  {
                    src: "/badge/secure-payment.png",
                    alt: "100% secure payment",
                  },
                  {
                    src: "/badge/fast-free-shipping.png",
                    alt: "Fast and free shipping",
                  },
                ].map((badge) => (
                  <div
                    key={badge.src}
                    className="relative mx-auto aspect-square w-full max-w-[4.75rem] sm:max-w-[5.5rem] md:max-w-[6.25rem]"
                  >
                    <SafeImage
                      src={badge.src}
                      alt={badge.alt}
                      fill
                      className="object-contain"
                      sizes="100px"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {similarProducts.length > 0 ? (
        <section className="border-t border-gray-100 bg-[#ffffff] py-6 md:py-10">
          <header className="mb-3 w-full px-4 text-center md:mb-6 lg:px-8">
            <h2 className="title-knewave mx-auto w-full text-center text-2xl leading-none tracking-tight normal-case md:text-4xl">
              Similar <span className="title-knewave-accent">Products</span>
            </h2>
          </header>
          <div
            className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1 md:gap-3 lg:gap-4 lg:px-8"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {similarProducts.map((item) => (
              <div
                key={item._id}
                className="w-[48%] shrink-0 sm:w-[30%] md:w-[22%] lg:w-[18%]"
              >
                <ProductCard
                  product={item}
                  listName="Similar products"
                  listId="similar-products"
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <RecentlyViewed excludeId={product._id} />

      {showSizeGuide ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowSizeGuide(false)}
            aria-label="Close size guide"
          />
          <div className="relative w-full max-w-3xl border border-black bg-white p-5 shadow-2xl sm:p-7">
            <button
              type="button"
              onClick={() => setShowSizeGuide(false)}
              className="absolute right-3 top-3 p-2 text-black transition-colors hover:text-[#DF1721]"
              aria-label="Close size guide"
            >
              <CloseIcon className="h-4 w-4" />
            </button>

            <div className="flex flex-wrap items-end justify-between gap-3 pr-8">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#DF1721]">
                  Urban Aana
                </p>
                <h2 className="mt-1 text-lg font-bold uppercase tracking-tight sm:text-xl">
                  Size chart
                </h2>
              </div>
              <div className="inline-flex overflow-hidden border border-black text-[12px] font-bold uppercase tracking-[0.12em]">
                <button
                  type="button"
                  onClick={() => setSizeGuideUnit("in")}
                  className={`px-3 py-1.5 transition-colors ${
                    sizeGuideUnit === "in"
                      ? "bg-black text-white"
                      : "bg-white text-gray-600 hover:bg-[#F9F9F5]"
                  }`}
                >
                  Inches
                </button>
                <button
                  type="button"
                  onClick={() => setSizeGuideUnit("cm")}
                  className={`px-3 py-1.5 transition-colors ${
                    sizeGuideUnit === "cm"
                      ? "bg-black text-white"
                      : "bg-white text-gray-600 hover:bg-[#F9F9F5]"
                  }`}
                >
                  Cm
                </button>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto border border-gray-300">
              <table className="w-full min-w-[640px] border-collapse text-center text-[13px]">
                <thead>
                  <tr className="bg-[#DF1721] text-white">
                    <th className="border border-[#c4141d] px-3 py-3 text-[12px] font-bold">
                      Size
                    </th>
                    {SIZE_GUIDE_COLUMNS.map((column) => (
                      <th
                        key={column.key}
                        className="border border-[#c4141d] px-3 py-3 text-[12px] font-bold leading-snug"
                      >
                        {column.label} ({sizeGuideUnit === "cm" ? "cm" : "in"})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SIZE_GUIDE_ROWS.map((row) => (
                    <tr key={row.size} className="border-t border-gray-200 bg-white">
                      <td className="border border-gray-200 px-3 py-2.5 font-bold text-black">
                        {row.size}
                      </td>
                      {SIZE_GUIDE_COLUMNS.map((column) => (
                        <td
                          key={column.key}
                          className="border border-gray-200 px-3 py-2.5 text-black"
                        >
                          {formatSizeGuideValue(row[column.key], sizeGuideUnit)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-center text-[12px] italic leading-relaxed text-gray-600">
              {sizeGuideUnit === "cm"
                ? "All measurements converted from inches. Slight variation of about 1–2.5 cm may occur due to manual measurement."
                : SIZE_GUIDE_NOTE}
            </p>
          </div>
        </div>
      ) : null}

      {!showSizeGuide && showStickyCta ? (
        <div className="fixed inset-x-0 bottom-0 z-[120] border-t border-gray-200 bg-white/95 px-3 pt-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
          <div className="flex gap-2">
              {isInCart && ctaPending !== "add" ? (
                <button
                  type="button"
                  onClick={() => useCartStore.getState().setDrawerOpen(true)}
                  className="flex h-11 w-1/2 items-center justify-center rounded-lg border border-black text-[12px] font-semibold"
                >
                  View bag
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={ctaDisabled || Boolean(ctaPending)}
                  aria-busy={ctaPending === "add"}
                  className="flex h-11 w-1/2 items-center justify-center rounded-lg border border-black text-[12px] font-semibold disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
                >
                  {ctaPending === "add" ? <CtaSpinner tone="dark" /> : addLabel}
                </button>
              )}
              <button
                type="button"
                onClick={handleBuyNow}
                disabled={ctaDisabled || Boolean(ctaPending)}
                aria-busy={ctaPending === "buy"}
                className="flex h-11 w-1/2 items-center justify-center rounded-lg bg-black text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200"
              >
                {ctaPending === "buy" ? <CtaSpinner tone="light" /> : "Buy now"}
              </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
