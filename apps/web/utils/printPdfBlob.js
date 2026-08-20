/**
 * Open a PDF blob and trigger the print dialog. Does not download a file.
 */
export function printPdfBlob(blob, { filename = "document.pdf", autoPrint = true } = {}) {
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
    };

    popup = window.open(url, "_blank");
    if (!popup) {
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      reject(new Error("Allow pop-ups to print the PDF"));
      return;
    }

    try {
      popup.opener = null;
    } catch {
      /* ignore */
    }

    if (!autoPrint) {
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      resolve();
      return;
    }

    const tryPrint = () => {
      try {
        popup.focus();
        popup.print();
      } catch {
        /* user can print from the PDF tab */
      }
    };

    let attempts = 0;
    const tick = () => {
      attempts += 1;
      tryPrint();
      if (attempts < 4 && popup && !popup.closed) {
        window.setTimeout(tick, 400);
      }
    };
    window.setTimeout(tick, 600);

    try {
      popup.addEventListener("afterprint", cleanup, { once: true });
    } catch {
      /* ignore */
    }

    window.setTimeout(() => {
      window.addEventListener(
        "focus",
        () => {
          window.setTimeout(cleanup, 1500);
        },
        { once: true }
      );
    }, 1200);
    window.setTimeout(cleanup, 180_000);
    resolve();
  });
}
