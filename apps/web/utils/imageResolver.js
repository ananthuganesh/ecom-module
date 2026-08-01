import { BASE_URL, EXPLICIT_BACKEND_URL } from "@/api/axios/client";

/**
 * Resolves a potentially relative image URL to an absolute one (server-side) 
 * or a relative one (client-side) using the centralized BASE_URL.
 * Also strips the backend host from absolute URLs to allow proxying.
 * @param {string} url - The image URL to resolve.
 * @returns {string} - The resolved URL.
 */
export function resolveImageUrl(url) {
  if (!url || typeof url !== "string") return url;
  
  let u = url.trim();
  if (!u) return u;
  
  // Strip the backend base if it's present (handles absolute ngrok/localhost URLs)
  const backendBase = (EXPLICIT_BACKEND_URL || "").replace(/\/api\/?$/, "").replace(/\/$/, "");
  if (backendBase && u.startsWith(backendBase)) {
    u = u.substring(backendBase.length);
  }
  
  // If it's an absolute URL containing /uploads/, assume it's a backend path and strip host
  if ((u.startsWith("http://") || u.startsWith("https://")) && u.includes("/uploads/")) {
    u = u.substring(u.indexOf("/uploads/"));
  }

  // If it's still an absolute URL (different external host), return it
  if (u.startsWith("http://") || u.startsWith("https://")) {
    return u;
  }
  
  // Ensure we don't have double slashes when joining
  const cleanBase = BASE_URL.replace(/\/$/, "");
  const cleanPath = u.startsWith("/") ? u : `/${u}`;
  
  return `${cleanBase}${cleanPath}`;
}
