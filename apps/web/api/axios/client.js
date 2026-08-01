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
  headers: {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "69420", // Bypass ngrok browser warning page
  },
});

// Attach auth token from persisted store
client.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const auth = localStorage.getItem(ensureStorageKey(AUTH_STORAGE_KEY));
    let token = null;

    if (auth) {
      try {
        const parsed = JSON.parse(auth);
        token = parsed.state?.userInfo?.token;
      } catch (err) {
        console.error("Axios Interceptor: Error parsing auth storage", err);
      }
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      console.warn("Axios Interceptor: No auth token found for request to", config.url);
    }
  }
  return config;
});

// Handle 401 Unauthorized globally
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error("Axios Response Interceptor: 401 Unauthorized detected.");
      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        const onAuthPage = path === "/login" || path === "/admin/login";
        if (!onAuthPage) {
          localStorage.removeItem(ensureStorageKey(AUTH_STORAGE_KEY));
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
