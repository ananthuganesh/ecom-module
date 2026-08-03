/**
 * Open the system print dialog for a PDF blob (no forced download).
 * Uses a hidden iframe when possible; falls back to a same-origin HTML tab
 * (Chrome’s PDF iframe viewer blocks print()). That tab closes on afterprint.
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
      if (popup && !popup.closed) {
        try {
          popup.close();
        } catch {
          /* ignore */
        }
      }
      popup = null;
      URL.revokeObjectURL(url);
      iframe.remove();
    };

    const tryPrint = (win) => {
      win.focus();
      win.print();
    };

    const printViaPopup = () => {
      // HTML shell (not raw PDF URL) so afterprint can close the tab.
      popup = window.open("", "_blank");
      if (!popup) {
        cleanup();
        reject(new Error("Allow pop-ups to print the PDF"));
        return;
      }

      const title = (safeName.replace(/\.pdf$/i, "") || "document").replace(/[<>&"]/g, "");
      const doc = popup.document;
      doc.open();
      doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #fff; }
    embed { display: block; width: 100%; height: 100%; border: 0; }
  </style>
</head>
<body>
  <embed type="application/pdf" src="${url}" />
  <script>
    (function () {
      var closed = false;
      function closeSelf() {
        if (closed) return;
        closed = true;
        try { window.close(); } catch (e) {}
      }
      function armCloseAfterPrint() {
        window.addEventListener("afterprint", closeSelf);
        try {
          var mql = window.matchMedia("print");
          mql.addEventListener("change", function (e) {
            if (!e.matches) setTimeout(closeSelf, 200);
          });
        } catch (e) {}
        // Dialog closed / cancelled → focus returns here.
        window.addEventListener("focus", function onFocus() {
          setTimeout(closeSelf, 300);
        });
        setTimeout(closeSelf, 120000);
      }
      setTimeout(function () {
        try {
          window.focus();
          window.print();
        } catch (e) {}
        armCloseAfterPrint();
      }, 500);
    })();
  <\/script>
</body>
</html>`);
      doc.close();

      // Parent also closes leftover tab when user returns to admin.
      window.setTimeout(() => {
        window.addEventListener(
          "focus",
          () => {
            window.setTimeout(cleanup, 200);
          },
          { once: true }
        );
      }, 800);
      window.setTimeout(cleanup, 120_000);
      resolve();
    };

    iframe.onload = () => {
      window.setTimeout(() => {
        try {
          const win = iframe.contentWindow;
          if (!win) throw new Error("Print window unavailable");
          tryPrint(win);
          try {
            win.addEventListener("afterprint", cleanup, { once: true });
          } catch {
            /* ignore */
          }
          window.setTimeout(() => {
            window.addEventListener("focus", cleanup, { once: true });
          }, 800);
          window.setTimeout(cleanup, 120_000);
          resolve();
        } catch {
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
