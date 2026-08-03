"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { adminMediaService } from "@/api";
import SafeImage from "@/components/SafeImage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

function mediaKey(file) {
  return file?.key || `${file?.folder || ""}/${file?.name || ""}`;
}

function normalizeMediaUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const siteBase = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_WEB_URL ||
    process.env.PUBLIC_WEB_URL ||
    "https://urbanaana.com"
  ).replace(/\/$/, "");
  try {
    const u = new URL(raw, siteBase);
    return `${u.origin}${u.pathname}`;
  } catch {
    return raw.split("?")[0].split("#")[0];
  }
}

function isImageFile(file) {
  const type = String(file?.type || "").toLowerCase();
  if (type === "image") return true;
  if (type === "video") return false;
  const name = String(file?.name || file?.url || "");
  return /\.(webp|png|jpe?g|gif|avif|svg)(\?|#|$)/i.test(name);
}

function asMediaList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.files)) return data.files;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export default function SelectExistingMediaDialog({
  open,
  onOpenChange,
  onSelect,
  excludeUrls = [],
}) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  const excluded = useMemo(
    () =>
      new Set(
        (excludeUrls || []).map(normalizeMediaUrl).filter(Boolean)
      ),
    [excludeUrls]
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSelected(new Set());
    setSearch("");
    (async () => {
      try {
        // Same scope as Admin → Files ("all" = products + ai; reels excluded).
        const data = await adminMediaService.list("all");
        if (cancelled) return;
        const list = asMediaList(data).filter(
          (f) => isImageFile(f) && f.url
        );
        setFiles(list);
      } catch (err) {
        if (!cancelled) {
          setFiles([]);
          toast.error(
            err?.response?.data?.detail || "Could not load media library"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((f) => {
      if (!q) return true;
      return (
        String(f.name || "")
          .toLowerCase()
          .includes(q) ||
        String(f.altText || "")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [files, search]);

  const selectableCount = useMemo(
    () =>
      visible.filter((f) => !excluded.has(normalizeMediaUrl(f.url))).length,
    [visible, excluded]
  );

  const toggle = (url) => {
    const key = normalizeMediaUrl(url) || url;
    if (excluded.has(key)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleDone = () => {
    const urls = [...selected].filter(
      (url) => !excluded.has(normalizeMediaUrl(url))
    );
    if (!urls.length) {
      onOpenChange?.(false);
      return;
    }
    onSelect?.(urls);
    onOpenChange?.(false);
  };

  const emptyMessage = (() => {
    if (files.length === 0) {
      return "No images in the media library yet.";
    }
    if (selectableCount === 0) {
      return "All library images are already on this product.";
    }
    return "No images match your search.";
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,40rem)] w-full flex-col gap-3 sm:max-w-2xl"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="text-[16px] font-medium text-[#303030]">
            Select existing media
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#8a8a8a]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files"
            className="h-8 border-[#e3e3e3] bg-white pl-8"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[#e3e3e3]">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-[#616161]">
              <Spinner className="size-4" /> Loading media…
            </div>
          ) : visible.length === 0 ? (
            <div className="px-4 py-16 text-center text-[13px] text-[#616161]">
              {emptyMessage}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4">
              {visible.map((file) => {
                const alreadyOnProduct = excluded.has(
                  normalizeMediaUrl(file.url)
                );
                const active = selected.has(file.url);
                return (
                  <button
                    key={mediaKey(file)}
                    type="button"
                    disabled={alreadyOnProduct}
                    onClick={() => toggle(file.url)}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-lg border bg-[#fafafa] text-left",
                      alreadyOnProduct
                        ? "cursor-not-allowed border-[#e3e3e3] opacity-45"
                        : active
                          ? "border-[#005bd3] ring-2 ring-[#005bd3]/30"
                          : "border-[#e3e3e3] hover:border-[#b5b5b5]"
                    )}
                    title={
                      alreadyOnProduct
                        ? `${file.name} (already on product)`
                        : file.name
                    }
                  >
                    <SafeImage
                      src={file.url}
                      alt={file.altText || file.name || ""}
                      fill
                      className="object-cover"
                    />
                    {alreadyOnProduct ? (
                      <span className="absolute inset-x-1 bottom-1 rounded bg-black/65 px-1 py-0.5 text-center text-[10px] font-medium text-white">
                        Added
                      </span>
                    ) : active ? (
                      <span className="absolute top-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#005bd3] text-[11px] font-bold text-white">
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <p className="text-[12px] text-[#616161]">
            {selected.size
              ? `${selected.size} selected`
              : `${selectableCount} image${selectableCount === 1 ? "" : "s"} available`}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => onOpenChange?.(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 bg-[#1a1a1a] text-white hover:bg-[#000]"
              disabled={!selected.size}
              onClick={handleDone}
            >
              Add
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
