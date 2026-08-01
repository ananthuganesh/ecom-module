import axios from "axios";
import { AUTH_STORAGE_KEY, ensureStorageKey } from "@/lib/storageKeys";

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

// Handle 401 Unauthorized globally
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        const onAuthPage = path === "/login" || path === "/admin/login";
        if (!onAuthPage) {
          localStorage.removeItem(ensureStorageKey(AUTH_STORAGE_KEY));
          // Best-effort cookie clear (avoid axios recursion on 401).
          fetch(`${API_URL}/users/logout`, {
            method: "POST",
            credentials: "include",
          }).catch(() => {});
          if (path.startsWith("/admin")) {
            window.location.href = "/admin/login";
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

export default client;
