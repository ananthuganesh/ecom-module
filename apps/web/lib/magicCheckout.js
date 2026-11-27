/**
 * Razorpay Magic Checkout, shared by the product page (Buy now) and /checkout.
 *
 * start → POST /api/payments/magic/start (creates or reuses the pending order)
 * open  → Razorpay's one-click popup (phone, address, coupon, payment)
 * paid  → POST /api/payments/magic/verify, purchase event, then the caller redirects
 */
import { paymentService } from "@/api";
import { getAttributionSnapshot } from "@/lib/attribution";
import { clearCopiedCoupon, readCopiedCoupon } from "@/lib/copiedCoupon";
import { ensureGuestId, toMagicOrderItems } from "@/lib/magicOrderItems";
import { stashPurchaseEvent, trackAddPaymentInfo } from "@/lib/tracking";
import { userErrorMessage } from "@/lib/userMessage";

export const RAZORPAY_STANDARD_SRC = "https://checkout.razorpay.com/v1/checkout.js";
// Magic Checkout ships its own build of Razorpay; a page loads only the one it needs.
export const RAZORPAY_MAGIC_SRC = "https://checkout.razorpay.com/v1/magic-checkout.js";

export function loadRazorpayScript(src = RAZORPAY_STANDARD_SRC) {
  if (typeof window !== "undefined" && window.Razorpay && document.querySelector(`script[src="${src}"]`)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Razorpay failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay failed to load"));
    document.body.appendChild(script);
  });
}

/** Start loading the Magic script early (e.g. on hover of Buy now). Errors are ignored. */
export function prefetchMagicCheckout() {
  loadRazorpayScript(RAZORPAY_MAGIC_SRC).catch(() => {});
}

let configPromise = null;
/** { razorpayConfigured, magicCheckout } — fetched once per page load. */
export function getPaymentConfig() {
  if (!configPromise) {
    configPromise = paymentService.getConfig().catch((err) => {
      configPromise = null;
      throw err;
    });
  }
  return configPromise;
}

/** Create (or reuse) the pending order and its Razorpay order. Throws on failure. */
export async function startMagicCheckout({ items, localOrderId = null }) {
  await loadRazorpayScript(RAZORPAY_MAGIC_SRC);
  const paymentData = await paymentService.startMagicCheckout({
    localOrderId,
    orderItems: toMagicOrderItems(items),
    guestId: ensureGuestId(),
    attribution: getAttributionSnapshot(),
  });
  trackAddPaymentInfo(items, "razorpay_magic");
  return paymentData;
}

/**
 * Open the one-click popup for a started order.
 * onPaid(localOrderId) after the payment is verified; onError(message) for
 * failures; onDismiss() when the shopper closes the popup. `fallbackValue` is
 * the purchase value reported if the server doesn't return the paid total.
 */
export function openMagicCheckout({ paymentData, items, fallbackValue = 0, onPaid, onError, onDismiss }) {
  const localOrderId = paymentData.localOrderId;
  const rzOrderId = paymentData.razorpayOrderId || paymentData.razorpayOrder?.id;
  const keyId = paymentData.keyId;
  const amount = Number(paymentData.amount || paymentData.razorpayOrder?.amount || 0);
  if (!rzOrderId || !keyId || !Number.isFinite(amount) || amount < 100) {
    onError?.("Payment session is invalid. Please refresh and try again.");
    return;
  }
  const copiedCoupon = readCopiedCoupon();

  const rzp = new window.Razorpay({
    key: keyId,
    amount,
    currency: paymentData.currency || "INR",
    name: "Urban Aana",
    description: `Order #${String(localOrderId).slice(-8)}`,
    order_id: rzOrderId,
    handler: async (response) => {
      try {
        const verified = await paymentService.verifyMagicPayment({
          razorpayOrderId: response.razorpay_order_id || rzOrderId,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
          localOrderId,
        });
        clearCopiedCoupon();
        // Delivery and the coupon are added in the popup, so the paid total
        // comes from the server.
        const paidOrder = verified?.order || {};
        stashPurchaseEvent({
          transactionId: localOrderId,
          value: Number(paidOrder.finalPrice) || fallbackValue,
          items,
          coupon: paidOrder.couponCode || "",
        });
        onPaid?.(localOrderId, verified);
      } catch (verifyError) {
        console.error("Verification failed:", verifyError);
        onError?.(
          "Payment verification failed. If your money was deducted, please contact support with Order ID: " +
            localOrderId
        );
      }
    },
    prefill: {
      ...(paymentData.prefill || {}),
      // A code copied on a product page; Razorpay checks it with our apply-promotion endpoint.
      ...(copiedCoupon ? { coupon_code: copiedCoupon } : {}),
    },
    one_click_checkout: true,
    show_coupons: true,
    // Signed-in shoppers keep orders on their account's email.
    readonly: { email: Boolean(paymentData.prefill?.email) },
    theme: { color: "#DF1721" },
    modal: {
      // Stock is not released here: UPI apps close the modal while payment is
      // still completing. The 30-minute TTL drops unpaid holds.
      ondismiss: () => onDismiss?.(),
    },
  });
  rzp.on("payment.failed", (response) => {
    const err = response?.error || {};
    console.error("Razorpay payment.failed", err);
    onError?.(userErrorMessage(err.description || err.reason, "Payment didn’t go through. Please try another method."));
  });
  rzp.open();
}
