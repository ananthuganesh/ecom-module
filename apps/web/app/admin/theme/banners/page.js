"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminMediaService, adminStoreThemeService } from "@/api";
import { userErrorMessage } from "@/lib/userMessage";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { Sparkles } from "@/components/admin/LocalIcons";
import { AdminListLayout, AdminHeaderButton } from "@/components/admin/list";
import { Input } from "@/components/ui/input";
import SafeImage from "@/components/SafeImage";

const MAX_SLIDES = 10;

export default function AdminBannersPage() {
  const [slides, setSlides] = useState([]);
  const [usingDefaults, setUsingDefaults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef(null);

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
          if (url) added.push({ url, alt: "", visible: true, href: null });
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await adminStoreThemeService.saveBanners(slides);
      setSlides(data?.heroSlides || []);
      setUsingDefaults(Boolean(data?.usingDefaults));
      setDirty(false);
      toast.success("Banners published");
    } catch (e) {
      toast.error(userErrorMessage(e, "Couldn’t save banners"));
    } finally {
      setSaving(false);
    }
  };

  const visibleCount = slides.filter((s) => s.visible !== false).length;

  return (
    <AdminListLayout
      fill={false}
      title="Banner"
      icon={Sparkles}
      description="Slides in the homepage hero, shown in this order."
      actions={
        <>
          <AdminHeaderButton
            variant="outline"
            disabled={uploading || slides.length >= MAX_SLIDES}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Add banner
          </AdminHeaderButton>
          <AdminHeaderButton disabled={!dirty || saving} onClick={handleSave}>
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

      <div className="flex flex-col gap-3 px-4 pb-6">
        {usingDefaults ? (
          <p className="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
            Showing the banners that ship with the store. Save to replace them
            with your own.
          </p>
        ) : null}

        {visibleCount === 0 && slides.length > 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">
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

              <div className="relative h-16 w-32 shrink-0 overflow-hidden rounded-md bg-muted">
                <SafeImage
                  src={slide.url}
                  alt={slide.alt || "Banner"}
                  fill
                  className="object-cover"
                />
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
