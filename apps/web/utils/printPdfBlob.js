/**
 * Open the system print dialog for a PDF blob (no forced download).
 * Uses a hidden iframe when possible; falls back to a same-origin blob tab
 * because Chrome’s PDF viewer inside an iframe is cross-origin and blocks print().
 * `filename` is used as the print job / Save as PDF suggested name when the browser supports it.
 */
export function printPdfBlob(blob, { filename = "document.pdf" } = {}) {
  return new Promise((resolve, reject) => {
    if (!(blob instanceof Blob)) {
      reject(new Error("Invalid PDF"));
      return;
    }
    const safeName =
      String(filename || "document.pdf").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "") ||
      "document.pdf";
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
    let popup = null;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      URL.revokeObjectURL(url);
      iframe.remove();
      if (popup && !popup.closed) {
        try {
          popup.close();
        } catch {
          /* ignore */
        }
      }
    };

    const scheduleCleanup = () => {
      window.setTimeout(cleanup, 120_000);
      window.addEventListener("focus", cleanup, { once: true });
    };

    const tryPrint = (win) => {
      win.focus();
      win.print();
    };

    const printViaPopup = () => {
      popup = window.open(url, "_blank");
      if (!popup) {
        cleanup();
        reject(new Error("Allow pop-ups to print the PDF"));
        return;
      }
      window.setTimeout(() => {
        try {
          tryPrint(popup);
        } catch {
          /* PDF is open — user can print manually */
        }
        resolve();
        scheduleCleanup();
      }, 400);
    };

    iframe.onload = () => {
      // Give the PDF viewer a moment to render before print().
      window.setTimeout(() => {
        try {
          const win = iframe.contentWindow;
          if (!win) throw new Error("Print window unavailable");
          tryPrint(win);
          resolve();
          scheduleCleanup();
        } catch {
          // Chrome: PDF plugin frame is cross-origin — open blob in a tab (same origin).
          printViaPopup();
        }
      }, 300);
    };

    iframe.onerror = () => {
      cleanup();
      reject(new Error("Failed to load label PDF"));
    };

    document.body.appendChild(iframe);
  });
}
