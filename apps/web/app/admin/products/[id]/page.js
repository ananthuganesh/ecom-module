"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  adminProductService,
  adminProductColorService,
} from "@/api";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/userMessage";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  Plus,
  Printer,
} from "lucide-react";
import SafeImage from "@/components/SafeImage";
import SelectExistingMediaDialog from "@/components/admin/SelectExistingMediaDialog";
import { AdminHeaderButton, AdminStatusText } from "@/components/admin/list";
import { Package } from "@/components/admin/LocalIcons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { bustStorefrontCatalogCache } from "@/lib/bustStorefrontCatalogCache";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import ProductRichTextEditor from "@/components/admin/ProductRichTextEditor";
import ProductVariantsCard from "@/components/admin/ProductVariantsCard";
import ProductColorChips from "@/components/admin/ProductColorChips";
import ProductAttrCombobox from "@/components/admin/ProductAttrCombobox";
import ProductInventoryCard from "@/components/admin/ProductInventoryCard";
import ProductSeoCard from "@/components/admin/ProductSeoCard";
import { cn } from "@/lib/utils";
import { adminProductHref, productUrlKey } from "@/utils/formatProductUrl";
import { gstRateForUnitPrice } from "@/utils/gstRate";
import {
  buildProductPayload,
  defaultForm,
  emptyVariant,
  isProductFormDirty,
  PRODUCT_CATEGORIES,
  PRODUCT_ATTR_FIELDS,
  productToForm,
  productTypesForCategory,
  sanitizePriceInput,
  formatPriceDisplay,
  slugify,
  STATUSES,
  validateProductForm,
} from "@/utils/productForm";
import {
  listProductVariants,
  normalizeBarcodeCopies,
  printProductBarcodeLabel,
  variantLabel,
} from "@/utils/printProductBarcodeLabel";
import { storefrontHref } from "../columns";
import { useProductSaveBarStore } from "@/store/useProductSaveBarStore";
import { PRODUCT_CARD_BADGE_OPTIONS } from "@/utils/urbanProductAdapter";

const productSelectTriggerClass =
  "h-8 w-full border-[#e3e3e3] bg-white shadow-none ring-0 focus-visible:border-[#b5b5b5] focus-visible:ring-0";


function SortableMediaTile({
  src,
  featured,
  active,
  selectionMode,
  onToggleSelect,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: src });

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
      }}
      onClick={() => onToggleSelect(src)}
      aria-label={featured ? "Featured product image" : "Product image"}
      {...attributes}
      {...listeners}
      className={cn(
        "admin-media-tile group relative shrink-0 overflow-hidden border bg-[#fafafa]",
        featured ? "admin-media-tile--featured" : "admin-media-tile--thumb",
        active ? "border-[#303030]" : "border-[#e3e3e3]",
        isDragging && "admin-media-tile--dragging opacity-90 shadow-md"
      )}
    >
      <SafeImage src={src} alt="" fill className="object-cover" />
      <span
        className={cn(
          "admin-media-tile-overlay",
          (active || selectionMode) && "opacity-100"
        )}
      >
        <span
          className="absolute top-2 left-2"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={active}
            onCheckedChange={(checked) => {
              onToggleSelect(src, Boolean(checked));
            }}
            className="size-4 rounded-[0.25rem] border-white bg-white shadow-sm data-checked:border-[#303030] data-checked:bg-[#303030]"
          />
        </span>
      </span>
    </button>
  );
}

function ProductSelectContent({ children, ...props }) {
  return (
    <SelectContent
      align="start"
      alignItemWithTrigger={false}
      side="bottom"
      sideOffset={4}
      {...props}
    >
      {children}
    </SelectContent>
  );
}

function statusTone(status) {
  if (status === "active") return "success";
  if (status === "draft") return "neutral";
  return "neutral";
}

function statusLabel(status) {
  const map = {
    active: "Active",
    draft: "Draft",
  };
  const key = String(status || "").toLowerCase();
  if (map[key]) return map[key];
  return String(status || "")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function variantMenuLabel(variant, index) {
  const label = variantLabel(variant);
  const sku = String(variant?.sku || "").trim();
  if (label && sku) return `${label} · ${sku}`;
  if (label) return label;
  if (sku) return sku;
  return `Variant ${index + 1}`;
}

function cloneForm(form) {
  return JSON.parse(JSON.stringify(form));
}

export default function AdminProductDetailPage() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const productRef = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const isNew =
    String(productRef || "") === "new" ||
    String(pathname || "").endsWith("/products/new");

  const [product, setProduct] = useState(null);
  const [form, setForm] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [neighbors, setNeighbors] = useState({ previous: null, next: null });
  const [productColors, setProductColors] = useState([]);
  const [attrOptions, setAttrOptions] = useState({});
  const [variantMenuOpen, setVariantMenuOpen] = useState(false);
  const [qtyOpen, setQtyOpen] = useState(false);
  const [pendingVariant, setPendingVariant] = useState(null);
  const [copies, setCopies] = useState("1");
  const barcodeBtnRef = useRef(null);
  const qtyInputRef = useRef(null);

  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  /** null = product Media gallery; number = variant row index */
  const [mediaPickerVariantIndex, setMediaPickerVariantIndex] = useState(null);
  const [selectedMedia, setSelectedMedia] = useState(() => new Set());
  const [addMediaOpen, setAddMediaOpen] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const mediaSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const dirty = form && snapshot ? isProductFormDirty(form, snapshot) : false;
  const showSaveBar = useProductSaveBarStore((s) => s.show);
  const hideSaveBar = useProductSaveBarStore((s) => s.hide);
  const setSaveBarSaving = useProductSaveBarStore((s) => s.setSaving);
  const saveHandlerRef = useRef(() => {});
  const discardHandlerRef = useRef(() => {});

  const loadProduct = useCallback(async () => {
    if (!productRef) return;
    if (isNew) {
      const next = defaultForm();
      next.productName = "";
      next.status = "draft";
      setProduct(null);
      setForm(next);
      setSnapshot(cloneForm(next));
      setNeighbors({ previous: null, next: null });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [data, nav] = await Promise.all([
        adminProductService.getById(productRef),
        adminProductService.getNeighbors(productRef).catch(() => ({
          previous: null,
          next: null,
        })),
      ]);
      const nextForm = productToForm(data);
      setProduct(data || null);
      setForm(nextForm);
      setSnapshot(cloneForm(nextForm));
      setNeighbors({
        previous: nav?.previous || null,
        next: nav?.next || null,
      });
      const key = productUrlKey(data);
      if (key && key !== String(productRef)) {
        router.replace(adminProductHref(data));
      }
    } catch (error) {
      console.error("Error loading product:", error);
      setProduct(null);
      setForm(null);
      setSnapshot(null);
      toast.error(
        error?.response?.status === 404 ? "Product not found" : "Failed to load product"
      );
    } finally {
      setLoading(false);
    }
  }, [productRef, router, isNew]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  useEffect(() => {
    adminProductColorService
      .getAll()
      .then((data) => {
        const list = Array.isArray(data?.colors) ? data.colors : [];
        setProductColors(list.filter(Boolean));
      })
      .catch(() => setProductColors([]));
  }, []);

  useEffect(() => {
    adminProductService
      .getAttributeOptions()
      .then((data) => setAttrOptions(data && typeof data === "object" ? data : {}))
      .catch(() => setAttrOptions({}));
  }, []);

  useEffect(() => {
    setVariantMenuOpen(false);
    setQtyOpen(false);
    setPendingVariant(null);
    setCopies("1");
  }, [product?._id]);

  useEffect(() => {
    if (!dirty && !isNew) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, isNew]);

  useEffect(() => {
    if (!variantMenuOpen && !qtyOpen) return;
    const onDoc = (e) => {
      if (barcodeBtnRef.current && !barcodeBtnRef.current.contains(e.target)) {
        setVariantMenuOpen(false);
        setQtyOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setVariantMenuOpen(false);
        setQtyOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [variantMenuOpen, qtyOpen]);

  useEffect(() => {
    if (!qtyOpen) return;
    const t = window.setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [qtyOpen]);

  const barcodeVariants = useMemo(
    () => listProductVariants({ ...product, variants: form?.variants }),
    [product, form?.variants]
  );

  const typeOptions = useMemo(
    () => productTypesForCategory(form?.category),
    [form?.category]
  );

  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const updatePricing = (field, value) =>
    setForm((prev) => ({
      ...prev,
      pricing: { ...prev.pricing, [field]: sanitizePriceInput(value) },
    }));

  const focusPricing = (field) =>
    setForm((prev) => {
      const current = prev.pricing?.[field];
      const n = Number(current);
      if (current === "" || current == null || !Number.isFinite(n) || n === 0) {
        return {
          ...prev,
          pricing: { ...prev.pricing, [field]: "" },
        };
      }
      return prev;
    });

  const blurPricing = (field) =>
    setForm((prev) => ({
      ...prev,
      pricing: {
        ...prev.pricing,
        [field]: formatPriceDisplay(prev.pricing?.[field]),
      },
    }));

  /** Product Media gallery — never auto-assigns to a variant. */
  const attachProductMediaUrls = (urls) => {
    const nextUrls = (Array.isArray(urls) ? urls : []).filter(Boolean);
    if (!nextUrls.length) return;
    setForm((prev) => {
      const existing = Array.isArray(prev.thumbnails)
        ? prev.thumbnails.filter(Boolean)
        : [];
      // Append new uploads after existing so gallery order stays stable.
      const imgs = [...existing];
      for (const url of nextUrls) {
        if (!imgs.includes(url)) imgs.push(url);
      }
      return { ...prev, thumbnails: imgs };
    });
  };

  /** Per-variant image upload — shows only on that variant row. */
  const attachVariantMediaUrls = (urls, variantIndex) => {
    const nextUrls = (Array.isArray(urls) ? urls : []).filter(Boolean);
    if (!nextUrls.length) return;
    setForm((prev) => {
      const list = Array.isArray(prev.variants) ? [...prev.variants] : [];
      if (!list.length) list.push(emptyVariant());
      const idx = Math.min(
        Math.max(0, Number(variantIndex) || 0),
        Math.max(0, list.length - 1)
      );
      const existing = Array.isArray(list[idx]?.images)
        ? list[idx].images.filter(Boolean)
        : [];
      const imgs = [...existing];
      for (const url of nextUrls) {
        if (!imgs.includes(url)) imgs.push(url);
      }
      list[idx] = {
        ...list[idx],
        images: imgs,
      };
      // Also strip these URLs from product Media so they only show on the variant.
      const variantOnly = new Set(imgs);
      const thumbnails = (prev.thumbnails || []).filter(
        (url) => !variantOnly.has(url)
      );
      return { ...prev, variants: list, thumbnails };
    });
  };

  const reorderMedia = (activeId, overId) => {
    if (!activeId || !overId || activeId === overId) return;
    setForm((prev) => {
      const current = (Array.isArray(prev.thumbnails) ? prev.thumbnails : []).filter(
        Boolean
      );
      const oldIndex = current.indexOf(activeId);
      const newIndex = current.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return {
        ...prev,
        thumbnails: arrayMove(current, oldIndex, newIndex),
      };
    });
  };

  const toggleMediaSelect = (src, forceChecked) => {
    setSelectedMedia((prev) => {
      const next = new Set(prev);
      if (typeof forceChecked === "boolean") {
        if (forceChecked) next.add(src);
        else next.delete(src);
        return next;
      }
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  };

  const uploadImageFiles = async (fileList, variantIndex = null) => {
    const files = Array.from(fileList || []).filter((f) =>
      String(f?.type || "").startsWith("image/")
    );
    if (!files.length) {
      toast.error("Choose a JPG, PNG, WEBP, or GIF image");
      return;
    }
    setUploadingMedia(true);
    try {
      const urls = [];
      for (const file of files) {
        const { url } = await adminProductService.uploadImage(file);
        if (url) urls.push(url);
      }
      if (!urls.length) {
        toast.error("Image upload failed");
        return;
      }
      if (variantIndex == null) attachProductMediaUrls(urls);
      else attachVariantMediaUrls(urls, variantIndex);
      toast.success(
        urls.length === 1 ? "Image uploaded" : `${urls.length} images uploaded`
      );
    } catch (e) {
      toast.error(
        userErrorMessage(
          e?.response?.status === 401
            ? "Your session expired. Sign in again, then retry the upload."
            : e,
          "Couldn’t upload the image"
        )
      );
    } finally {
      setUploadingMedia(false);
    }
  };

  /** Same reliable picker path as variant thumbs (avoids broken label→hidden Input). */
  const openImageFilePicker = (variantIndex = null) => {
    if (uploadingMedia) return;
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/webp,image/gif";
    fileInput.multiple = true;
    fileInput.onchange = (ev) => {
      const files = ev.target?.files;
      if (!files?.length) return;
      void uploadImageFiles(files, variantIndex);
    };
    fileInput.click();
  };

  const handleDiscard = () => {
    if (isNew) {
      if (!window.confirm("Discard unsaved product?")) return;
      router.push("/admin/products");
      return;
    }
    if (!snapshot) return;
    setForm(cloneForm(snapshot));
  };

  const handleSave = async () => {
    if (!form || saving) return;
    const payload = buildProductPayload(form);
    const check = validateProductForm(payload);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await adminProductService.create(payload);
        toast.success("Product saved");
        await bustStorefrontCatalogCache();
        router.replace(adminProductHref(created));
        return;
      }
      if (!product?._id) return;
      const updated = await adminProductService.update(product._id, payload);
      const nextForm = productToForm(updated);
      setProduct(updated);
      setForm(nextForm);
      setSnapshot(cloneForm(nextForm));
      toast.success("Product saved");
      await bustStorefrontCatalogCache();
      const key = productUrlKey(updated);
      if (key && key !== String(productRef)) {
        router.replace(adminProductHref(updated));
      }
    } catch (err) {
      toast.error(userErrorMessage(err, "Couldn’t save the product"));
    } finally {
      setSaving(false);
    }
  };

  const confirmLeave = () => {
    if (isNew) {
      return window.confirm("You have unsaved changes. Leave without saving?");
    }
    if (!dirty) return true;
    return window.confirm("You have unsaved changes. Leave without saving?");
  };

  saveHandlerRef.current = () => {
    void handleSave();
  };
  discardHandlerRef.current = () => {
    handleDiscard();
  };

  useEffect(() => {
    if (!isNew && !dirty) {
      hideSaveBar();
      return undefined;
    }
    showSaveBar({
      saving,
      onSave: () => saveHandlerRef.current?.(),
      onDiscard: () => discardHandlerRef.current?.(),
    });
    return () => hideSaveBar();
  }, [isNew, dirty, saving, hideSaveBar, showSaveBar]);

  useEffect(() => {
    setSaveBarSaving(saving);
  }, [saving, setSaveBarSaving]);

  const openQtyPrompt = (variant) => {
    setPendingVariant(variant);
    setCopies("1");
    setVariantMenuOpen(false);
    setQtyOpen(true);
  };

  const confirmBarcodePrint = async () => {
    const count = normalizeBarcodeCopies(copies);
    setQtyOpen(false);
    const variant = pendingVariant;
    setPendingVariant(null);
    try {
      const result = await printProductBarcodeLabel({
        product: {
          ...product,
          productName: form.productName,
          name: form.productName,
          category: form.category,
          type: form.type,
          pricing: form.pricing,
        },
        variant,
        copies: count,
      });
      if (!result.ok) {
        toast.error(userErrorMessage(result.error, "Couldn’t print barcodes"));
        return;
      }
      toast.success(
        result.copies === 1
          ? "Print dialog opened"
          : `Printing ${result.copies} barcodes`
      );
    } catch (err) {
      toast.error(userErrorMessage(err, "Couldn’t print barcodes"));
    }
  };

  const handleBarcodePrintClick = () => {
    if (!form) return;
    if (barcodeVariants.length <= 1) {
      openQtyPrompt(barcodeVariants[0] || form.variants?.[0]);
      return;
    }
    setQtyOpen(false);
    setVariantMenuOpen((v) => !v);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  if (!form || (!isNew && !product)) {
    return (
      <main className="flex h-screen flex-col items-center justify-center bg-background p-10">
        <Package className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">Product not found</p>
        <Link
          href="/admin/products"
          className="mt-6 border-b border-primary pb-1 text-xs font-medium text-primary"
        >
          Return to products
        </Link>
      </main>
    );
  }

  const variantMediaUrls = [
    ...new Set(
      (form.variants || []).flatMap((v) =>
        Array.isArray(v.images) ? v.images.filter(Boolean) : []
      )
    ),
  ];
  const mediaImages = (Array.isArray(form.thumbnails) ? form.thumbnails : [])
    .filter(Boolean)
    .filter((url) => !variantMediaUrls.includes(url));
  const uniqueMedia = [...new Set(mediaImages)];
  const selectedMediaList = uniqueMedia.filter((src) => selectedMedia.has(src));

  return (
    <>
      <main className="admin-product-form mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 bg-background md:gap-6">
        <header className="flex shrink-0 flex-col gap-3 bg-transparent py-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Package active className="size-[18px] shrink-0 text-[#303030]" />
            <h2 className="admin-page-title m-0 truncate text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
              {isNew
                ? form.productName || "Add product"
                : form.productName || "Untitled product"}
            </h2>
            <AdminStatusText tone={statusTone(form.status)} dot>
              {statusLabel(form.status)}
            </AdminStatusText>
            {!isNew && dirty ? (
              <span className="text-xs font-medium text-muted-foreground">
                Unsaved
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!isNew ? (
              <>
            <div className="relative" ref={barcodeBtnRef}>
              <AdminHeaderButton onClick={handleBarcodePrintClick}>
                <Printer className="h-3.5 w-3.5" /> Print Barcode
                {barcodeVariants.length > 1 ? (
                  <ChevronDown
                    className={`h-3.5 w-3.5 opacity-70 transition-transform ${
                      variantMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                ) : null}
              </AdminHeaderButton>
              {variantMenuOpen && barcodeVariants.length > 1 ? (
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[220px] max-w-[280px] rounded-xl border border-border bg-card py-1.5 shadow-sm">
                  <p className="px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Choose variant
                  </p>
                  {barcodeVariants.map((v, i) => (
                    <button
                      key={v._id || v.sku || i}
                      type="button"
                      onClick={() => openQtyPrompt(v)}
                      className="w-full cursor-pointer px-3 py-2 text-left text-[13px] font-normal text-foreground hover:bg-muted"
                    >
                      {variantMenuLabel(v, i)}
                    </button>
                  ))}
                </div>
              ) : null}
              {qtyOpen ? (
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[240px] rounded-xl border border-border bg-card p-3 shadow-sm">
                  <p className="mb-2 text-[13px] font-medium text-foreground">
                    Number of barcodes
                  </p>
                  <input
                    ref={qtyInputRef}
                    type="number"
                    min={1}
                    max={200}
                    value={copies}
                    onChange={(e) => setCopies(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        confirmBarcodePrint();
                      }
                    }}
                    className="h-8 w-full rounded-lg border border-border px-3 text-[13px] font-medium text-foreground focus:border-border focus:outline-none"
                  />
                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setQtyOpen(false);
                        setPendingVariant(null);
                      }}
                      className="h-8 flex-1 cursor-pointer rounded-lg border border-border text-[13px] font-medium text-muted-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={confirmBarcodePrint}
                      className="h-8 flex-1 cursor-pointer rounded-lg bg-primary text-[13px] font-medium text-primary-foreground hover:bg-black"
                    >
                      Print
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <AdminHeaderButton
              onClick={() =>
                window.open(
                  storefrontHref({ ...product, slug: form.slug }),
                  "_blank",
                  "noopener,noreferrer"
                )
              }
            >
              <Eye className="h-3.5 w-3.5" /> View store
            </AdminHeaderButton>

            <div className="ml-1 inline-flex items-center gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="icon-lg"
                title="Previous product"
                disabled={!neighbors.previous}
                className="size-8 rounded-lg border-transparent bg-[#e3e3e3] text-[#303030] shadow-none hover:bg-[#d4d4d4] active:bg-[#ccc]"
                onClick={() => {
                  if (!neighbors.previous || !confirmLeave()) return;
                  router.push(
                    `/admin/products/${encodeURIComponent(neighbors.previous.key)}`
                  );
                }}
              >
                <ChevronUp strokeWidth={1.75} />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon-lg"
                title="Next product"
                disabled={!neighbors.next}
                className="size-8 rounded-lg border-transparent bg-[#e3e3e3] text-[#303030] shadow-none hover:bg-[#d4d4d4] active:bg-[#ccc]"
                onClick={() => {
                  if (!neighbors.next || !confirmLeave()) return;
                  router.push(
                    `/admin/products/${encodeURIComponent(neighbors.next.key)}`
                  );
                }}
              >
                <ChevronDown strokeWidth={1.75} />
              </Button>
            </div>
              </>
            ) : null}
          </div>
        </header>

        <div className="grid grid-cols-1 items-start gap-4 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="@container/card">
              <CardContent className="flex flex-col gap-4">
                <Field>
                  <FieldLabel>Title</FieldLabel>
                  <Input
                    value={form.productName}
                    onChange={(e) => {
                      const productName = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        productName,
                        slug: prev.slugManual ? prev.slug : slugify(productName),
                      }));
                    }}
                    placeholder="Product title"
                  />
                </Field>
                <Field>
                  <FieldLabel>Description</FieldLabel>
                  <ProductRichTextEditor
                    value={form.description}
                    onChange={(description) => updateForm({ description })}
                    placeholder="Describe this product"
                  />
                </Field>

                <div className="flex flex-col gap-3">
                  <CardTitle>Media</CardTitle>
                  {uniqueMedia.length === 0 ? (
                  <div
                    className="admin-media-dropzone flex flex-col items-center justify-center gap-3 bg-white px-4 py-12 text-center"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (uploadingMedia) return;
                      void uploadImageFiles(e.dataTransfer?.files);
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        disabled={uploadingMedia}
                        className="m-0 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[#c9cccf] bg-white px-3 text-[13px] font-medium text-[#303030] hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => openImageFilePicker(null)}
                      >
                        {uploadingMedia ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                        ) : null}
                        {uploadingMedia ? "Uploading…" : "Upload new"}
                      </button>
                      <button
                        type="button"
                        className="text-[13px] font-medium text-[#005bd3] hover:underline disabled:opacity-50"
                        disabled={uploadingMedia}
                        onClick={() => {
                          setMediaPickerVariantIndex(null);
                          setMediaPickerOpen(true);
                        }}
                      >
                        Select existing
                      </button>
                    </div>
                    <p className="text-[12px] text-[#616161]">
                      JPG, PNG, WEBP, or GIF — up to 25 MB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedMediaList.length > 0 ? (
                      <div className="flex items-center justify-between gap-3">
                        <label className="inline-flex items-center gap-2 text-[13px] font-medium text-[#303030]">
                          <Checkbox
                            checked={
                              uniqueMedia.length > 0 &&
                              selectedMediaList.length === uniqueMedia.length
                            }
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedMedia(new Set(uniqueMedia));
                              } else {
                                setSelectedMedia(new Set());
                              }
                            }}
                            className="data-checked:border-[#303030] data-checked:bg-[#303030]"
                          />
                          {selectedMediaList.length} file
                          {selectedMediaList.length === 1 ? "" : "s"} selected
                        </label>
                        <button
                          type="button"
                          className="text-[13px] font-medium text-[#c70a24] hover:underline"
                          onClick={() => {
                            const remove = new Set(selectedMediaList);
                            setForm((prev) => ({
                              ...prev,
                              thumbnails: (prev.thumbnails || []).filter(
                                (img) => !remove.has(img)
                              ),
                            }));
                            setSelectedMedia(new Set());
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-start gap-3">
                      <DndContext
                        sensors={mediaSensors}
                        collisionDetection={closestCenter}
                        onDragEnd={({ active, over }) => {
                          if (!over) return;
                          reorderMedia(String(active.id), String(over.id));
                        }}
                      >
                        <SortableContext
                          items={uniqueMedia}
                          strategy={rectSortingStrategy}
                        >
                          {uniqueMedia.map((src, imgIdx) => (
                            <SortableMediaTile
                              key={src}
                              src={src}
                              featured={imgIdx === 0}
                              active={selectedMedia.has(src)}
                              selectionMode={selectedMediaList.length > 0}
                              onToggleSelect={toggleMediaSelect}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>

                      <Popover open={addMediaOpen} onOpenChange={setAddMediaOpen}>
                        <PopoverTrigger
                          type="button"
                          disabled={uploadingMedia}
                          className="admin-media-tile admin-media-tile--add relative inline-flex shrink-0 items-center justify-center border border-dashed border-[#c9cccf] bg-[#fafafa] text-[#303030] hover:bg-[#f3f3f3] disabled:opacity-60"
                          aria-label={uploadingMedia ? "Uploading media" : "Add media"}
                        >
                          {uploadingMedia ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Plus className="h-5 w-5" />
                          )}
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-44 gap-0.5 p-1.5"
                        >
                          <button
                            type="button"
                            className="flex w-full rounded-md px-2.5 py-2 text-left text-[13px] text-[#303030] hover:bg-[#f1f1f1]"
                            onClick={() => {
                              setAddMediaOpen(false);
                              openImageFilePicker(null);
                            }}
                          >
                            Upload new
                          </button>
                          <button
                            type="button"
                            className="flex w-full rounded-md px-2.5 py-2 text-left text-[13px] text-[#303030] hover:bg-[#f1f1f1]"
                            onClick={() => {
                              setAddMediaOpen(false);
                              setMediaPickerVariantIndex(null);
                              setMediaPickerOpen(true);
                            }}
                          >
                            Select existing
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}
                </div>
              </CardContent>
            </Card>

            <Card className="@container/card">
              <CardHeader>
                <CardTitle>Price</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel>MRP</FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-[#616161]">
                        ₹
                      </span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={form.pricing?.mrp ?? ""}
                        onChange={(e) => updatePricing("mrp", e.target.value)}
                        onFocus={() => focusPricing("mrp")}
                        onBlur={() => blurPricing("mrp")}
                        placeholder="0.00"
                        className="pl-6"
                      />
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel>Selling Price</FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-[#616161]">
                        ₹
                      </span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={form.pricing?.sellingPrice ?? ""}
                        onChange={(e) => updatePricing("sellingPrice", e.target.value)}
                        onFocus={() => focusPricing("sellingPrice")}
                        onBlur={() => blurPricing("sellingPrice")}
                        placeholder="0.00"
                        className="pl-6"
                      />
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel>Cost</FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-[#616161]">
                        ₹
                      </span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={form.pricing?.buyingPrice ?? ""}
                        onChange={(e) => updatePricing("buyingPrice", e.target.value)}
                        onFocus={() => focusPricing("buyingPrice")}
                        onBlur={() => blurPricing("buyingPrice")}
                        placeholder="0.00"
                        className="pl-6"
                      />
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel>Tax (Automatic)</FieldLabel>
                    <Input
                      readOnly
                      value={
                        form.pricing?.mrp != null &&
                        form.pricing?.mrp !== "" &&
                        Number(form.pricing.mrp) > 0
                          ? `GST ${gstRateForUnitPrice(form.pricing.mrp)}%`
                          : ""
                      }
                      className="bg-muted/40 text-muted-foreground"
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>

            <ProductInventoryCard form={form} setForm={setForm} />

            <ProductVariantsCard
              form={form}
              setForm={setForm}
              updatePricing={updatePricing}
              focusPricing={focusPricing}
              blurPricing={blurPricing}
              uploadingMedia={uploadingMedia}
              onUploadImage={(variantIndex) => openImageFilePicker(variantIndex)}
              onSelectExistingImage={(variantIndex) => {
                setMediaPickerVariantIndex(variantIndex);
                setMediaPickerOpen(true);
              }}
            />

            <ProductSeoCard form={form} updateForm={updateForm} />
          </div>

          <aside className="flex flex-col gap-4">
            <Card className="@container/card">
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Select
                  value={form.status || "draft"}
                  onValueChange={(status) => updateForm({ status })}
                >
                  <SelectTrigger className={productSelectTriggerClass}>
                    <SelectValue placeholder="Select status">
                      {(value) => statusLabel(value || "draft")}
                    </SelectValue>
                  </SelectTrigger>
                  <ProductSelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabel(s)}
                      </SelectItem>
                    ))}
                  </ProductSelectContent>
                </Select>
                <Field>
                  <FieldLabel>Card badge</FieldLabel>
                  <Select
                    value={form.badge || "auto"}
                    onValueChange={(badge) => updateForm({ badge })}
                  >
                    <SelectTrigger className={productSelectTriggerClass}>
                      <SelectValue placeholder="Auto">
                        {(value) =>
                          PRODUCT_CARD_BADGE_OPTIONS.find((o) => o.value === value)
                            ?.label || "Auto"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <ProductSelectContent>
                      {PRODUCT_CARD_BADGE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </ProductSelectContent>
                  </Select>
                </Field>
              </CardContent>
            </Card>

            <Card className="@container/card">
              <CardHeader>
                <CardTitle>Category</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Field>
                  <FieldLabel>Category</FieldLabel>
                  <Select
                    value={form.category || "T-Shirt"}
                    onValueChange={(category) => {
                      const nextTypes = productTypesForCategory(category);
                      const keepType = nextTypes.includes(form.type)
                        ? form.type
                        : "";
                      updateForm({ category, type: keepType });
                    }}
                  >
                    <SelectTrigger className={productSelectTriggerClass}>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <ProductSelectContent>
                      {PRODUCT_CATEGORIES.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                      {form.category &&
                      !PRODUCT_CATEGORIES.includes(form.category) ? (
                        <SelectItem value={form.category}>
                          {form.category}
                        </SelectItem>
                      ) : null}
                    </ProductSelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Product Type</FieldLabel>
                  <Select
                    value={form.type || null}
                    onValueChange={(type) => updateForm({ type })}
                    disabled={!form.category}
                  >
                    <SelectTrigger className={productSelectTriggerClass}>
                      <SelectValue placeholder="Select product type" />
                    </SelectTrigger>
                    <ProductSelectContent>
                      {typeOptions.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                      {form.type && !typeOptions.includes(form.type) ? (
                        <SelectItem value={form.type}>{form.type}</SelectItem>
                      ) : null}
                    </ProductSelectContent>
                  </Select>
                </Field>
              </CardContent>
            </Card>

            <Card className="@container/card">
              <CardHeader>
                <CardTitle>Attributes</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {PRODUCT_ATTR_FIELDS.map(({ key, label, options, creatable }) => {
                  if (creatable && key === "colors") {
                    return (
                      <Field key={key}>
                        <FieldLabel>{label}</FieldLabel>
                        <ProductColorChips
                          value={Array.isArray(form.colors) ? form.colors : []}
                          suggestions={productColors}
                          onChange={(colors) => updateForm({ colors })}
                          onSaveColor={async (name) => {
                            try {
                              const res = await adminProductColorService.create(name);
                              if (Array.isArray(res?.colors)) {
                                setProductColors(res.colors);
                              } else {
                                setProductColors((prev) => {
                                  if (
                                    prev.some(
                                      (c) =>
                                        c.toLowerCase() === name.toLowerCase()
                                    )
                                  ) {
                                    return prev;
                                  }
                                  return [...prev, name].sort((a, b) =>
                                    a.localeCompare(b)
                                  );
                                });
                              }
                            } catch {
                              setProductColors((prev) => {
                                if (
                                  prev.some(
                                    (c) => c.toLowerCase() === name.toLowerCase()
                                  )
                                ) {
                                  return prev;
                                }
                                return [...prev, name].sort((a, b) =>
                                  a.localeCompare(b)
                                );
                              });
                            }
                          }}
                        />
                      </Field>
                    );
                  }
                  if (creatable) {
                    // Built-in options plus anything already used on a product,
                    // so a value typed once becomes a suggestion afterwards.
                    const merged = [
                      ...(options || []),
                      ...(attrOptions[key] || []),
                    ];
                    return (
                      <Field key={key}>
                        <FieldLabel>{label}</FieldLabel>
                        <ProductAttrCombobox
                          value={form[key] || ""}
                          suggestions={merged}
                          onChange={(value) => updateForm({ [key]: value })}
                          placeholder={`Select or type a ${label.toLowerCase()}`}
                        />
                      </Field>
                    );
                  }

                  return (
                  <Field key={key}>
                    <FieldLabel>{label}</FieldLabel>
                    {Array.isArray(options) && options.length > 0 ? (
                      <Select
                        value={form[key] || null}
                        onValueChange={(value) => updateForm({ [key]: value })}
                      >
                        <SelectTrigger className={productSelectTriggerClass}>
                          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
                        </SelectTrigger>
                        <ProductSelectContent>
                          {options.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                          {form[key] && !options.includes(form[key]) ? (
                            <SelectItem value={form[key]}>{form[key]}</SelectItem>
                          ) : null}
                        </ProductSelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={form[key] || ""}
                        onChange={(e) => updateForm({ [key]: e.target.value })}
                        placeholder={label}
                      />
                    )}
                  </Field>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="@container/card">
              <CardHeader>
                <CardTitle>Publishing</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    window.open(
                      storefrontHref({ ...product, slug: form.slug }),
                      "_blank",
                      "noopener,noreferrer"
                    )
                  }
                >
                  <Eye className="h-3.5 w-3.5" /> View on store
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>

      <SelectExistingMediaDialog
        open={mediaPickerOpen}
        onOpenChange={(open) => {
          setMediaPickerOpen(open);
          if (!open) setMediaPickerVariantIndex(null);
        }}
        excludeUrls={
          mediaPickerVariantIndex == null
            ? [...uniqueMedia, ...variantMediaUrls]
            : variantMediaUrls
        }
        onSelect={(urls) => {
          if (mediaPickerVariantIndex == null) {
            attachProductMediaUrls(urls);
          } else {
            attachVariantMediaUrls(urls, mediaPickerVariantIndex);
          }
          setMediaPickerVariantIndex(null);
        }}
      />
    </>
  );
}
