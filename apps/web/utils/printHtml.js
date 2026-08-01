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

const MODERN_COLOR_RE = /(?:oklch|oklab|lab|lch|color)\(/i;

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

  if (/^\s*(?:oklch|oklab|lab|lch|color)\(/i.test(value) && value.trim().endsWith(")")) {
    return convertOne(value.trim());
  }

  return value.replace(
    /(?:oklch|oklab|lab|lch|color)\((?:[^()]|\([^()]*\))*\)/gi,
    (match) => convertOne(match)
  );
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

/**
 * Print HTML as a PDF so the browser does not inject page headers/footers
 * (date, document title, localhost URL, page 1/1).
 * `title` is used as the PDF document title / suggested Save as name when the browser allows it.
 */
export async function printHtml(html, { title = "invoice" } = {}) {
  if (typeof window === "undefined") {
    throw new Error("Print is only available in the browser");
  }

  const fileStem = safePdfName(title);
  const filename = `${fileStem}.pdf`;
  let docHtml = String(html || "");

  if (/<title>[\s\S]*?<\/title>/i.test(docHtml)) {
    docHtml = docHtml.replace(/<title>[\s\S]*?<\/title>/i, `<title>${fileStem}</title>`);
  }

  // Make relative asset URLs absolute so html2canvas can load them
  const origin = window.location.origin;
  docHtml = docHtml.replace(
    /(src|href)=["']\/(?!\/)/gi,
    (_, attr) => `${attr}="${origin}/`
  );

  // Keep invoice markup + its own <style> in a host on the page (preserves template layout).
  const host = document.createElement("div");
  host.setAttribute("data-invoice-print-root", "1");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:210mm;background:#fff;pointer-events:none;opacity:0;color:#111;";

  const parsed = new DOMParser().parseFromString(docHtml, "text/html");
  const styles = Array.from(parsed.querySelectorAll("style"))
    .map((s) => {
      let css = s.innerHTML || s.textContent || "";
      // Scope invoice CSS to the off-screen sheet only — never the live page body.
      css = css
        .replace(/(^|})\s*body\s*\{/g, "$1 .invoice-print-sheet {")
        .replace(/(^|})\s*html\s*\{/g, "$1 .invoice-print-sheet {")
        .replace(/(^|})\s*\*\s*\{/g, "$1 .invoice-print-sheet, .invoice-print-sheet * {")
        .replace(
          /@media\s+print\s*\{\s*body\s*\{/g,
          "@media print { .invoice-print-sheet {"
        )
        // @page on the live document can shift layout when the print dialog opens.
        .replace(/@page\s*\{[^}]*\}/g, "");
      return `<style>${css}</style>`;
    })
    .join("");
  const bodyHtml = parsed.body ? parsed.body.innerHTML : docHtml;

  // Avoid layout jump when the print dialog hides the page scrollbar.
  const root = document.documentElement;
  const prevScrollbarGutter = root.style.scrollbarGutter;
  root.style.scrollbarGutter = "stable";

  let restoreComputedStyle = () => {};
  try {
    host.innerHTML = `${styles}<div class="invoice-print-sheet">${bodyHtml}</div>`;
    document.body.appendChild(host);
    // Force layout before capture
    void host.offsetHeight;

    const images = Array.from(host.querySelectorAll("img"));
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

    restoreComputedStyle = patchComputedStyleColors(window);

    const mod = await import("html2pdf.js");
    const html2pdf = mod.default || mod;
    const sheet = host.querySelector(".invoice-print-sheet") || host;
    const worker = html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: "#ffffff",
          onclone: (clonedDoc) => {
            // Drop app stylesheets with oklch/lab — invoice CSS lives under the print root.
            clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach((node) => node.remove());
            clonedDoc.querySelectorAll("head style").forEach((node) => {
              const css = node.textContent || "";
              if (MODERN_COLOR_RE.test(css)) node.remove();
            });
          },
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(sheet);

    const pdf = await worker.toPdf().get("pdf");
    pdf.setProperties({
      title: fileStem,
      subject: fileStem,
    });
    const blob = await worker.outputPdf("blob");
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
