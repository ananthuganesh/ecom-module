import axios from "axios";
import {
  ADMIN_AUTH_STORAGE_KEY,
  AUTH_STORAGE_KEY,
  ensureStorageKey,
} from "@/lib/storageKeys";

const getApiUrl = () => {
  // In the browser, always use relative path to allow Next.js proxying
  if (typeof window !== "undefined") return "/api";

  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return "/api";
  return base.endsWith("/api") ? base : `${base.replace(/\/$/, "")}/api`;
};

export const API_URL = getApiUrl();

export const EXPLICIT_BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;
export const BASE_URL =
  typeof window !== "undefined"
    ? ""
    : (process.env.INTERNAL_BACKEND_URL || EXPLICIT_BACKEND_URL || "http://backend:4000")
        .replace(/\/api\/?$/, "")
        .replace(/\/$/, "");

const client = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "69420", // Bypass ngrok browser warning page
  },
});

// Session is HttpOnly cookie (`withCredentials`). Do not attach Bearer from localStorage.

function requestPath(error) {
  const raw = String(error?.config?.url || "");
  // axios may give "users/profile" or "/api/users/profile"
  try {
    if (raw.startsWith("http")) return new URL(raw).pathname;
  } catch {
    /* ignore */
  }
  return raw;
}

function normalizeApiPath(path) {
  return String(path || "")
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/api\//, "")
    .replace(/^\//, "")
    .split("?")[0];
}

function isAdminAuthRequest(path) {
  const p = normalizeApiPath(path);
  return p === "users/admin/profile" || p.startsWith("admin/");
}

function isCustomerAuthRequest(path) {
  const p = normalizeApiPath(path);
  return (
    p === "users/profile" ||
    p === "orders/myorders" ||
    p === "orders" ||
    p.startsWith("payments/")
  );
}

// Handle 401 Unauthorized globally — clear the matching session only.
// Key off the request URL (not the current page) so a late admin 401 after
// navigating to the storefront does not wipe the customer session.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const path = requestPath(error);
      const pagePath = window.location.pathname;
      const onAuthPage = pagePath === "/login" || pagePath === "/admin/login";

      if (!onAuthPage && isAdminAuthRequest(path)) {
        localStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
        fetch(`${API_URL}/users/admin/logout`, {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
        if (pagePath.startsWith("/admin")) {
          window.location.href = "/admin/login";
        }
      } else if (!onAuthPage && isCustomerAuthRequest(path)) {
        localStorage.removeItem(ensureStorageKey(AUTH_STORAGE_KEY));
        fetch(`${API_URL}/users/logout`, {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
      }
    }
    return Promise.reject(error);
  }
);

export default client;
