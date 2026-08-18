"use client";

import { useState } from "react";
import Image from "next/image";
import { BASE_URL, EXPLICIT_BACKEND_URL } from "@/api/axios/client";

const OPTIMIZED_HOSTS = new Set([
  "images.urbanaana.com",
  "images.unsplash.com",
]);

function shouldOptimizeExternal(url) {
  try {
    const host = new URL(url).hostname;
    if (OPTIMIZED_HOSTS.has(host)) return true;
    if (host.endsWith(".r2.dev") || host.endsWith(".cloudflarestorage.com")) return true;
    if (host === "localhost" || host === "127.0.0.1") return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Renders image only when src exists. Unknown external hosts stay unoptimized
 * to avoid Next.js upstream 404s; CDN/R2 URLs go through the optimizer.
 */
export default function SafeImage({
  src,
  alt = "",
  className,
  fill,
  priority = false,
  fetchPriority,
  loading,
  sizes,
  ...props
}) {
  const [error, setError] = useState(false);

  if (!src || typeof src !== "string" || !src.trim()) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 ${className || ""}`}
        style={fill ? { position: "absolute", inset: 0 } : undefined}
      >
        <span className="text-xs uppercase text-gray-300">No image</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 ${className || ""}`}
        style={fill ? { position: "absolute", inset: 0 } : undefined}
      >
        <span className="text-xs uppercase text-gray-300">No image</span>
      </div>
    );
  }

  // Normalize local absolute URLs to relative paths using the centralized backend base
  let normalizedSrc = src;
  if (typeof src === "string") {
    // Strip the backend base if it's present (handles absolute ngrok/localhost URLs)
    const backendBase = (EXPLICIT_BACKEND_URL || "").replace(/\/api\/?$/, "").replace(/\/$/, "");
    
    if (backendBase && src.startsWith(backendBase)) {
      normalizedSrc = src.substring(backendBase.length);
    }
    
    // If it's an absolute URL containing /uploads/, strip the host (handles legacy/incorrect ports)
    if ((normalizedSrc.startsWith("http://") || normalizedSrc.startsWith("https://")) && normalizedSrc.includes("/uploads/")) {
      normalizedSrc = normalizedSrc.substring(normalizedSrc.indexOf("/uploads/"));
    }
    
    // Ensure leading slash for local paths
    if (!normalizedSrc.startsWith("http") && !normalizedSrc.startsWith("/")) {
      normalizedSrc = "/" + normalizedSrc;
    }
  }

  const isExternal = normalizedSrc.startsWith("http://") || normalizedSrc.startsWith("https://");
  const resolvedFetchPriority = fetchPriority ?? (priority ? "high" : undefined);
  const resolvedLoading = loading ?? (priority ? "eager" : undefined);

  const imageElement = (
    <Image
      src={normalizedSrc}
      alt={alt}
      fill={fill}
      className={className}
      unoptimized={isExternal && !shouldOptimizeExternal(normalizedSrc)}
      onError={() => setError(true)}
      priority={priority}
      fetchPriority={resolvedFetchPriority}
      loading={resolvedLoading}
      sizes={sizes || (fill ? "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" : undefined)}
      {...props}
    />
  );

  // Absolute fill so stacked images (e.g. product-card hover) overlay correctly.
  return fill ? (
    <div className="absolute inset-0">{imageElement}</div>
  ) : (
    imageElement
  );
}
