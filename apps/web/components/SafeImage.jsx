"use client";

import { useState } from "react";
import Image from "next/image";
import { BASE_URL, EXPLICIT_BACKEND_URL } from "@/api/axios/client";

/**
 * Renders image only when src exists. Uses unoptimized for external URLs
 * to avoid Next.js upstream 404 errors. Shows placeholder on load error.
 */
export default function SafeImage({ src, alt = "", className, fill, ...props }) {
  const [error, setError] = useState(false);

  if (!src || typeof src !== "string" || !src.trim()) {
    return (
      <div
        className={`bg-gray-100 flex items-center justify-center ${className || ""}`}
        style={fill ? { position: "absolute", inset: 0 } : undefined}
      >
        <span className="text-gray-300 text-xs uppercase">No image</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`bg-gray-100 flex items-center justify-center ${className || ""}`}
        style={fill ? { position: "absolute", inset: 0 } : undefined}
      >
        <span className="text-gray-300 text-xs uppercase">No image</span>
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

  const imageElement = (
    <Image
      src={normalizedSrc}
      alt={alt}
      fill={fill}
      className={className}
      unoptimized={isExternal}
      onError={() => setError(true)}
      sizes={props.sizes || (fill ? "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" : undefined)}
      {...props}
    />
  );

  return fill ? (
    <div className="relative w-full h-full">
      {imageElement}
    </div>
  ) : (
    imageElement
  );
}
