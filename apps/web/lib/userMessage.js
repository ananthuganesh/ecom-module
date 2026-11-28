const DEFAULT_FALLBACK = "Something went wrong. Please try again.";

const DEV_RE = [
  /status code\s*\d+/i,
  /\bHTTP\s*[45]\d\d\b/i,
  /internal server error/i,
  /traceback/i,
  /\bexception\b/i,
  /stack trace/i,
  /ECONNREFUSED/i,
  /ENOTFOUND/i,
  /ETIMEDOUT/i,
  /network error/i,
  /failed to fetch/i,
  /load failed/i,
  /\baxios\b/i,
  /\bmongodb\b/i,
  /objectid/i,
  /modulenotfound/i,
  /\bpypdf\b/i,
  /\bfastapi\b/i,
  /\bstarlette\b/i,
  /<html/i,
  /<!doctype/i,
  /application\/json/i,
  /value_error|type_error|assertion_error/i,
  /\bnoneType\b/i,
  /\bkeyerror\b/i,
  /\btypeerror\b/i,
  /\battributeerror\b/i,
  /\bline \d+\b/i,
];

function looksLikeDeveloperMessage(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (t.length > 160) return true;
  if (t.startsWith("{") || t.startsWith("[")) return true;
  if (t.includes("\n") && t.length > 80) return true;
  if (/^[A-Z][A-Z0-9_]{5,}$/.test(t)) return true;
  return DEV_RE.some((re) => re.test(t));
}

function extractCandidate(err) {
  if (err == null) return "";
  if (typeof err === "string") return err.trim();
  if (typeof err === "number") return "";

  const data = err.response?.data;
  let detail = data?.detail ?? data?.message ?? data?.error;
  if (Array.isArray(detail)) {
    detail = detail
      .map((d) =>
        String(d?.msg || d?.message || "")
          .replace(/^Value error,\s*/i, "")
          .trim()
      )
      .filter(Boolean)
      .join(" ");
  } else if (detail && typeof detail === "object") {
    detail = String(detail.msg || detail.message || "").trim();
  }
  if (typeof detail === "string" && detail.trim()) return detail.trim();

  if (typeof err.message === "string" && err.message.trim()) {
    return err.message.trim();
  }
  return "";
}

/**
 * Safe copy for customers (and admin toasts). Drops status codes, Axios
 * messages, HTML/JSON dumps, and stack traces.
 */
export function userErrorMessage(err, fallback = DEFAULT_FALLBACK) {
  const safeFallback = fallback || DEFAULT_FALLBACK;
  const candidate = extractCandidate(err).replace(/^Value error,\s*/i, "").trim();
  if (candidate && !looksLikeDeveloperMessage(candidate)) return candidate;

  const status = err?.response?.status;
  if (status === 401) return "Please sign in again.";
  if (status === 403) return "You don’t have permission to do that.";
  if (status === 429) return "Too many attempts. Please wait a moment and try again.";
  return safeFallback;
}

/** When axios `responseType: "blob"` still returns a JSON error body. */
export async function userErrorFromAxios(err, fallback = DEFAULT_FALLBACK) {
  const data = err?.response?.data;
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return userErrorMessage(parsed?.detail ?? parsed, fallback);
    } catch {
      return fallback || DEFAULT_FALLBACK;
    }
  }
  return userErrorMessage(err, fallback);
}
