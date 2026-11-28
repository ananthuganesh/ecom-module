"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminMediaService, adminStoreThemeService } from "@/api";
import { userErrorMessage } from "@/lib/userMessage";
import { bustStorefrontCatalogCache } from "@/lib/bustStorefrontCatalogCache";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
  Upload,
} from "@/components/icons";
import { Sparkles } from "@/components/admin/LocalIcons";
import { AdminListLayout, AdminHeaderButton } from "@/components/admin/list";
import { Input } from "@/components/ui/input";
import SafeImage from "@/components/SafeImage";
import { HERO_DESKTOP_SIZE, HERO_MOBILE_SIZE } from "@/lib/heroArtDirection";

const MAX_SLIDES = 5;
const DESKTOP_LABEL = `${HERO_DESKTOP_SIZE.width} × ${HERO_DESKTOP_SIZE.height} px`;
const MOBILE_LABEL = `${HERO_MOBILE_SIZE.width} × ${HERO_MOBILE_SIZE.height} px`;

export default function AdminBannersPage() {
  const [slides, setSlides] = useState([]);
  const [usingDefaults, setUsingDefaults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef(null);
  // One hidden picker replaces either image of a banner: { index, field: "url" | "mobileUrl" }.
  const replaceFileRef = useRef(null);
  const [replaceTarget, setReplaceTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminStoreThemeService.getBanners();
      setSlides(data?.heroSlides || []);
      setUsingDefaults(Boolean(data?.usingDefaults));
      setDirty(false);
    } catch (e) {
      toast.error(userErrorMessage(e, "Couldn’t load banners"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (index, patch) => {
    setSlides((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
    setDirty(true);
  };

  const move = (index, delta) => {
    setSlides((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const remove = (index) => {
    setSlides((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const room = MAX_SLIDES - slides.length;
    if (room <= 0) {
      toast.error(`Up to ${MAX_SLIDES} banners.`);
      event.target.value = "";
      return;
    }

    setUploading(true);
    const added = [];
    try {
      for (const file of files.slice(0, room)) {
        try {
          const result = await adminMediaService.upload(file, "banner");
          const url = result?.url || result?.location || result?.path;
          if (url) added.push({ url, mobileUrl: null, alt: "", visible: true, href: null });
        } catch (e) {
          toast.error(userErrorMessage(e, `Couldn’t upload ${file.name}`));
        }
      }
      if (added.length) {
        setSlides((prev) => [...prev, ...added]);
        setDirty(true);
        toast.success(`${added.length} added — save to publish.`);
      }
      if (files.length > room) {
        toast.message(`Only ${room} more fit — the rest were skipped.`);
      }
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const pickImage = (index, field) => {
    setReplaceTarget({ index, field });
    replaceFileRef.current?.click();
  };

  const handleReplaceUpload = async (event) => {
    const file = event.target.files?.[0];
    const target = replaceTarget;
    event.target.value = "";
    if (!file || !target) return;
    setUploading(true);
    try {
      const result = await adminMediaService.upload(file, "banner");
      const url = result?.url || result?.location || result?.path;
      if (url) {
        update(target.index, { [target.field]: url });
        toast.success(
          target.field === "url"
            ? "Desktop image replaced — save to publish."
            : "Mobile image added — save to publish."
        );
      }
    } catch (e) {
      toast.error(userErrorMessage(e, `Couldn’t upload ${file.name}`));
    } finally {
      setUploading(false);
      setReplaceTarget(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await adminStoreThemeService.saveBanners(slides);
      setSlides(data?.heroSlides || []);
      setUsingDefaults(Boolean(data?.usingDefaults));
      setDirty(false);
      // Drop the cached hero so shoppers see this without waiting for the TTL.
      await bustStorefrontCatalogCache();
      toast.success("Banners published");
    } catch (e) {
      toast.error(userErrorMessage(e, "Couldn’t save banners"));
    } finally {
      setSaving(false);
    }
  };

  const visibleSlides = slides.filter((s) => s.visible !== false);
  const visibleCount = visibleSlides.length;
  const missingMobile = visibleSlides.filter((s) => !s.mobileUrl).length;

  return (
    <AdminListLayout
      fill={false}
      title="Banner"
      icon={Sparkles}
      description="Slides in the homepage hero, shown in this order."
      actions={
        <>
          <AdminHeaderButton
            variant="primary"
            disabled={uploading || slides.length >= MAX_SLIDES}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            {uploading ? "Uploading…" : "Add banner"}
          </AdminHeaderButton>
          <AdminHeaderButton
            variant="outline"
            disabled={!dirty || saving}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Save
          </AdminHeaderButton>
        </>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={handleUpload}
      />
      <input
        ref={replaceFileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleReplaceUpload}
      />

      <div className="flex flex-col gap-3 px-4 pb-6">
        <p className="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          Desktop banner {DESKTOP_LABEL}. Mobile banner {MOBILE_LABEL} (portrait).
          Keep text and faces near the centre so nothing important is cut off.
        </p>

        {visibleCount > 0 && missingMobile > 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            {missingMobile === visibleCount
              ? "No mobile banners yet, so phones show the desktop banners."
              : `${missingMobile} shown banner${missingMobile === 1 ? " is" : "s are"} missing a mobile image. Phones switch to the tall mobile layout once every shown banner has one; until then they show the desktop banners.`}
          </p>
        ) : null}

        {usingDefaults ? (
          <p className="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
            Showing the banners that ship with the store. Save to replace them
            with your own.
          </p>
        ) : null}

        {visibleCount === 0 && slides.length > 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            Every banner is hidden, so the homepage will fall back to the
            default slides.
          </p>
        ) : null}

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="mx-auto size-4 animate-spin" />
          </div>
        ) : slides.length === 0 ? (
          <div className="rounded-lg border border-dashed py-16 text-center text-[13px] text-muted-foreground">
            No banners yet. Add one to get started.
          </div>
        ) : (
          slides.map((slide, index) => (
            <div
              key={`${slide.url}-${index}`}
              className={`flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 ${
                slide.visible === false ? "opacity-60" : ""
              }`}
            >
              <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground tabular-nums">
                {index + 1}
              </span>

              <div className="flex shrink-0 items-end gap-2">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => pickImage(index, "url")}
                    disabled={uploading}
                    className="group relative h-16 w-[154px] overflow-hidden rounded-md border border-transparent bg-muted hover:border-foreground/40 disabled:opacity-60"
                    aria-label="Replace desktop image"
                    title={`Replace desktop image (${DESKTOP_LABEL})`}
                  >
                    <SafeImage
                      src={slide.url}
                      alt={slide.alt || "Desktop banner"}
                      fill
                      className="object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/45 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      <Upload className="w-3 h-3" /> Replace
                    </span>
                  </button>
                  <span className="text-[11px] text-muted-foreground">Desktop</span>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => pickImage(index, "mobileUrl")}
                    disabled={uploading}
                    className="relative flex h-16 w-[43px] items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted text-muted-foreground hover:border-foreground/40 disabled:opacity-60"
                    aria-label={slide.mobileUrl ? "Replace mobile image" : "Add mobile image"}
                    title={slide.mobileUrl ? `Replace mobile image (${MOBILE_LABEL})` : `Add mobile image (${MOBILE_LABEL})`}
                  >
                    {slide.mobileUrl ? (
                      <SafeImage
                        src={slide.mobileUrl}
                        alt={slide.alt || "Mobile banner"}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    Mobile
                    {slide.mobileUrl ? (
                      <button
                        type="button"
                        onClick={() => update(index, { mobileUrl: null })}
                        className="underline-offset-2 hover:underline"
                        aria-label="Remove mobile image"
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                </div>
              </div>

              <div className="flex min-w-[220px] flex-1 flex-col gap-2">
                <Input
                  value={slide.alt || ""}
                  onChange={(e) => update(index, { alt: e.target.value })}
                  placeholder="Alt text — describes the image for search and screen readers"
                  className="h-8 text-xs"
                />
                <Input
                  value={slide.href || ""}
                  onChange={(e) => update(index, { href: e.target.value })}
                  placeholder="Link when tapped, e.g. /shop (optional)"
                  className="h-8 text-xs"
                />
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <AdminHeaderButton
                  variant="outline"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </AdminHeaderButton>
                <AdminHeaderButton
                  variant="outline"
                  disabled={index === slides.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </AdminHeaderButton>
                <AdminHeaderButton
                  variant="outline"
                  onClick={() =>
                    update(index, { visible: slide.visible === false })
                  }
                >
                  {slide.visible === false ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" /> Hidden
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" /> Shown
                    </>
                  )}
                </AdminHeaderButton>
                <AdminHeaderButton
                  variant="outline"
                  onClick={() => remove(index)}
                  aria-label="Remove banner"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </AdminHeaderButton>
              </div>
            </div>
          ))
        )}
      </div>
    </AdminListLayout>
  );
}
