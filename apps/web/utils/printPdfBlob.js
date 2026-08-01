/**
 * Open the system print dialog for a PDF blob (no forced download).
 * Uses a hidden iframe so it still works after async network calls.
 * `filename` is used as the print job / Save as PDF suggested name when the browser supports it.
 */
export function printPdfBlob(blob, { filename = "document.pdf" } = {}) {
  return new Promise((resolve, reject) => {
    if (!(blob instanceof Blob)) {
      reject(new Error("Invalid PDF"));
      return;
    }
    const safeName = String(filename || "document.pdf").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "") || "document.pdf";
    const pdf =
      blob.type === "application/pdf"
        ? blob
        : new Blob([blob], { type: "application/pdf" });
    const named =
      typeof File !== "undefined"
        ? new File([pdf], safeName, { type: "application/pdf" })
        : pdf;
    const url = URL.createObjectURL(named);
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", safeName.replace(/\.pdf$/i, ""));
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
    iframe.src = url;

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      URL.revokeObjectURL(url);
      iframe.remove();
    };

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) throw new Error("Print window unavailable");
        // Give the PDF viewer a moment to render before print().
        window.setTimeout(() => {
          try {
            win.focus();
            win.print();
            resolve();
          } catch (err) {
            cleanup();
            reject(err);
          }
          // Keep the iframe until the print dialog can finish reading it.
          window.setTimeout(cleanup, 120_000);
          window.addEventListener("focus", cleanup, { once: true });
        }, 300);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    iframe.onerror = () => {
      cleanup();
      reject(new Error("Failed to load label PDF"));
    };

    document.body.appendChild(iframe);
  });
}
