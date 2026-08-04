import { printPdfBlob } from "@/utils/printPdfBlob";

function safePdfName(title) {
  const raw = String(title || "invoice").trim();
  const cleaned = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/\.pdf$/i, "")
    .trim();
  return cleaned || "invoice";
}

// Use RegExp() — Turbopack misparses regex literals ending with \(/i
const MODERN_COLOR_RE = new RegExp("(?:oklch|oklab|lab|lch|color)\\(", "i");
const MODERN_COLOR_FULL_RE = new RegExp(
  "^\\s*(?:oklch|oklab|lab|lch|color)\\(",
  "i"
);
const MODERN_COLOR_VALUE_RE = new RegExp(
  "(?:oklch|oklab|lab|lch|color)\\((?:[^()]|\\([^()]*\\))*\\)",
  "gi"
);

/** Convert lab/oklch/color() values to rgb/rgba via canvas. */
function sanitizeCssColorValue(value, ctx) {
  if (!value || typeof value !== "string") return value;
  if (!MODERN_COLOR_RE.test(value)) return value;

  const convertOne = (color) => {
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000000";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      if (a === 0) return "rgba(0, 0, 0, 0)";
      return a === 255
        ? `rgb(${r}, ${g}, ${b})`
        : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
    } catch {
      return "rgb(0, 0, 0)";
    }
  };

  if (MODERN_COLOR_FULL_RE.test(value) && value.trim().endsWith(")")) {
    return convertOne(value.trim());
  }

  return value.replace(MODERN_COLOR_VALUE_RE, (match) => convertOne(match));
}

/**
 * html2canvas cannot parse lab()/oklch() from Chrome's getComputedStyle.
 * Never use Reflect.get(..., receiver) — that causes Illegal invocation on CSSStyleDeclaration.
 */
function patchComputedStyleColors(win) {
  const originalGetComputedStyle = win.getComputedStyle;
  const canvas = win.document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  win.getComputedStyle = function patchedGetComputedStyle(el, pseudo) {
    const style = originalGetComputedStyle.call(win, el, pseudo);
    return new Proxy(style, {
      get(target, prop) {
        if (prop === "getPropertyValue") {
          return (name) => sanitizeCssColorValue(target.getPropertyValue(name), ctx);
        }

        let val;
        try {
          val = target[prop];
        } catch {
          return undefined;
        }

        if (typeof val === "string") {
          return sanitizeCssColorValue(val, ctx);
        }
        if (typeof val === "function") {
          return val.bind(target);
        }
        return val;
      },
    });
  };

  return () => {
    win.getComputedStyle = originalGetComputedStyle;
  };
}

function absolutizeAssetUrls(docHtml) {
  const origin = window.location.origin;
  return String(docHtml || "").replace(
    /(src|href)=["']\/(?!\/)/gi,
    (_, attr) => `${attr}="${origin}/`
  );
}

function withTitle(docHtml, fileStem) {
  if (/<title>[\s\S]*?<\/title>/i.test(docHtml)) {
    return docHtml.replace(/<title>[\s\S]*?<\/title>/i, `<title>${fileStem}</title>`);
  }
  return docHtml.replace(/<head([^>]*)>/i, `<head$1><title>${fileStem}</title>`);
}

function buildPrintHost(docHtml) {
  const host = document.createElement("div");
  host.setAttribute("data-invoice-print-root", "1");
  // Do NOT use opacity:0 — html2canvas treats that as fully transparent.
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:210mm;background:#fff;pointer-events:none;color:#111;z-index:-1;";

  const parsed = new DOMParser().parseFromString(docHtml, "text/html");
  const styles = Array.from(parsed.querySelectorAll("style"))
    .map((s) => {
      let css = s.innerHTML || s.textContent || "";
      css = css
        .replace(/(^|})\s*body\s*\{/g, "$1 .invoice-print-sheet {")
        .replace(/(^|})\s*html\s*\{/g, "$1 .invoice-print-sheet {")
        .replace(/(^|})\s*\*\s*\{/g, "$1 .invoice-print-sheet, .invoice-print-sheet * {")
        .replace(
          /@media\s+print\s*\{\s*body\s*\{/g,
          "@media print { .invoice-print-sheet {"
        )
        .replace(/@page\s*\{[^}]*\}/g, "");
      return `<style>${css}</style>`;
    })
    .join("");
  const bodyHtml = parsed.body ? parsed.body.innerHTML : docHtml;
  host.innerHTML = `${styles}<div class="invoice-print-sheet">${bodyHtml}</div>`;
  return host;
}

async function waitForImages(root) {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
          window.setTimeout(resolve, 2000);
        })
    )
  );
}

const canvasOpts = {
  scale: 1.5,
  useCORS: true,
  allowTaint: true,
  logging: false,
  backgroundColor: "#ffffff",
  onclone: (clonedDoc) => {
    clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach((node) => node.remove());
    clonedDoc.querySelectorAll("head style").forEach((node) => {
      const css = node.textContent || "";
      if (MODERN_COLOR_RE.test(css)) node.remove();
    });
  },
};

/**
 * Build a real PDF (no browser about:blank / page X/Y chrome).
 * Multi-invoice: capture each .invoice-page separately to avoid blank huge canvases.
 */
async function printHtmlAsPdf(docHtml, { title = "invoice" } = {}) {
  const fileStem = safePdfName(title);
  const filename = `${fileStem}.pdf`;
  docHtml = withTitle(absolutizeAssetUrls(docHtml), fileStem);

  const root = document.documentElement;
  const prevScrollbarGutter = root.style.scrollbarGutter;
  root.style.scrollbarGutter = "stable";

  const host = buildPrintHost(docHtml);
  let restoreComputedStyle = () => {};

  try {
    document.body.appendChild(host);
    void host.offsetHeight;
    await waitForImages(host);
    restoreComputedStyle = patchComputedStyleColors(window);

    const sheet = host.querySelector(".invoice-print-sheet") || host;
    const pageNodes = Array.from(sheet.querySelectorAll(".invoice-page"));
    const targets = pageNodes.length ? pageNodes : [sheet];

    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const margin = 8;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;

    for (let i = 0; i < targets.length; i += 1) {
      if (i > 0) pdf.addPage();
      const canvas = await html2canvas(targets[i], canvasOpts);
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      let drawWidth = contentWidth;
      let drawHeight = (canvas.height * contentWidth) / canvas.width;
      if (drawHeight > contentHeight) {
        const scale = contentHeight / drawHeight;
        drawHeight = contentHeight;
        drawWidth = contentWidth * scale;
      }
      pdf.addImage(imgData, "JPEG", margin, margin, drawWidth, drawHeight, undefined, "FAST");
    }

    pdf.setProperties({
      // Empty title so Chrome print headers (if user prints from the tab) stay blank.
      title: " ",
      subject: " ",
      author: " ",
      creator: " ",
    });

    const blob = pdf.output("blob");
    const pdfBlob =
      blob.type === "application/pdf"
        ? blob
        : new Blob([blob], { type: "application/pdf" });

    await printPdfBlob(pdfBlob, { filename });
  } finally {
    restoreComputedStyle();
    host.remove();
    root.style.scrollbarGutter = prevScrollbarGutter;
  }
}

/**
 * Print invoice HTML as a clean PDF (download + preview).
 * Avoids browser print chrome: date, INV title, about:blank, page X/Y.
 */
export async function printHtml(html, { title = "invoice" } = {}) {
  if (typeof window === "undefined") {
    throw new Error("Print is only available in the browser");
  }

  const docHtml = String(html || "");
  if (!docHtml.trim()) {
    throw new Error("Nothing to print");
  }

  await printHtmlAsPdf(docHtml, { title });
}
