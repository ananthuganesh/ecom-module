/**
 * Allowlist HTML sanitizer for storefront product descriptions.
 *
 * The API already cleans descriptions with the same allowlist (nh3); this is a
 * second layer in the browser. Unknown tags are unwrapped to their text,
 * dangerous containers are dropped with their contents, and only a safe href
 * survives on links.
 */
const ALLOWED_TAGS = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "SPAN",
  "UL", "OL", "LI", "H2", "H3", "H4", "BLOCKQUOTE", "A",
]);
const DROP_WITH_CONTENT = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT",
  "SVG", "MATH", "FORM", "TEXTAREA", "SELECT", "BUTTON", "LINK", "META", "BASE",
]);
const SAFE_HREF = /^(https?:|mailto:|tel:|\/(?!\/)|#)/i;
// Whitespace and control characters browsers ignore inside a scheme ("java\tscript:").
const IGNORED_IN_SCHEME = /[\u0000-\u0020\u007f-\u009f]/g;

function safeHref(value) {
  const compact = String(value || "").replace(IGNORED_IN_SCHEME, "");
  return SAFE_HREF.test(compact) ? String(value).trim() : null;
}

function cleanChildren(parent) {
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === 3) continue; // text
    if (node.nodeType !== 1) {
      node.remove(); // comments, processing instructions
      continue;
    }
    const tag = node.tagName.toUpperCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      node.remove();
      continue;
    }
    cleanChildren(node);
    if (!ALLOWED_TAGS.has(tag)) {
      node.replaceWith(...node.childNodes);
      continue;
    }
    const href = tag === "A" ? safeHref(node.getAttribute("href")) : null;
    const title = tag === "A" ? node.getAttribute("title") : null;
    for (const attr of [...node.attributes]) node.removeAttribute(attr.name);
    if (tag === "A") {
      if (href) node.setAttribute("href", href);
      if (title) node.setAttribute("title", title);
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
  }
}

export function sanitizeProductHtml(html) {
  const raw = String(html || "");
  if (!raw) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    // Server render: the API has already applied the allowlist; this only
    // removes anything that could execute if an unsanitised value slipped in.
    return raw
      .replace(/<(script|style|iframe|object|embed|template|noscript|svg|math|form)\b[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<(script|style|iframe|object|embed|link|meta|base|svg|math|form)\b[^>]*>/gi, "")
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(
        /(href|src|action|formaction|xlink:href)\s*=\s*("\s*(javascript|data|vbscript):[^"]*"|'\s*(javascript|data|vbscript):[^']*'|(javascript|data|vbscript):[^\s>]*)/gi,
        ""
      );
  }
  const doc = new DOMParser().parseFromString(`<body>${raw}</body>`, "text/html");
  cleanChildren(doc.body);
  return doc.body.innerHTML;
}
