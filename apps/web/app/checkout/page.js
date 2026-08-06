"use client";

import { ChevronDown, Loader2, Lock, Smartphone } from "lucide-react";
import {
  CheckIcon,
  InfoIcon
} from "@/components/icons/storeIcons";
import { useState, useEffect, useRef, Suspense } from "react";
import { useCartStore } from "@/store/useCartStore";
import { useBuyNowStore } from "@/store/useBuyNowStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter, useSearchParams } from "next/navigation";

import Image from "next/image";
import SafeImage from "@/components/SafeImage";
import Link from "next/link";
import {
  orderService,
  paymentService,
  abandonedCheckoutService,
  couponService,
  productService,
  authService,
} from "@/api";
import { isCartLineUnavailable } from "@/utils/cartStock";
import { emailQualityError } from "@/utils/emailQuality";
import CheckoutAccountPrompt from "@/components/CheckoutAccountPrompt";
import CheckoutDeliveryAddress, {
  savedAddressToFormPatch,
} from "@/components/checkout/CheckoutDeliveryAddress";
import { normalizeIndianState } from "@/components/storefront/StateSearchSelect";
import { trackBeginCheckout, stashPurchaseEvent, trackSelectPromotion, trackAddPaymentInfo, trackAddShippingInfo } from "@/lib/tracking";
import { getAttributionSnapshot } from "@/lib/attribution";
import { persistAuth } from "@/lib/persistAuth";

const INPUT =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-0 text-[14px] text-gray-900 placeholder:text-gray-400 focus:border-[#222222] focus:outline-none focus:ring-1 focus:ring-[#222222]";
const INPUT_ERR =
  "h-10 w-full rounded-md border border-red-400 bg-white px-3 py-0 text-[14px] text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500";
const INPUT_READONLY =
  "h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-0 text-[14px] text-gray-700 placeholder:text-gray-400 cursor-not-allowed";
const LABEL = "mb-1.5 block text-[13px] font-medium text-gray-700";
const SECTION = "text-[18px] font-semibold text-gray-900 tracking-tight";

function splitName(full = "") {
  const parts = String(full).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Normalize to a 10-digit Indian mobile (strip +91 / leading 0). */
function toIndianMobile(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length >= 12) {
    digits = digits.slice(-10);
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

const isIndianMobile = (phone) => /^[6-9]\d{9}$/.test(String(phone || ""));

const formatCheckoutMoney = (amount) => {
  const n = Number(amount) || 0;
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
};

function CheckoutOrderSummary({
  availableItems,
  subtotal,
  shippingPrice,
  appliedCoupon,
  discountAmount,
  totalPrice,
  totalSavings,
  couponInput,
  setCouponInput,
  couponError,
  showCouponPanel,
  setShowCouponPanel,
  isCouponLoading,
  handleApplyCoupon,
  removeCoupon,
}) {
  const itemCount = availableItems.reduce((acc, item) => acc + (item.qty || 1), 0);
  const itemLabel = itemCount === 1 ? "Item" : "Items";

  return (
    <div className="lg:sticky lg:top-8">
      <h2 className={`${SECTION} mb-5`}>
        Order Summary ({itemCount} {itemLabel})
      </h2>

      <div className="mb-6 space-y-4">
        {availableItems.map((item) => {
          const img =
            item.image || item.thumbnails?.[0] || item.variants?.[0]?.images?.[0];
          const line = (Number(item.price) || 0) * (item.qty || 1);
          return (
            <div
              key={`${item._id}-${item.color}-${item.size}`}
              className="flex items-start gap-3"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                <SafeImage
                  src={img}
                  alt={item.name || item.productName || "Product"}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="truncate text-[13px] font-medium text-gray-900">
                  {item.name || item.productName}
                </p>
                <p className="text-[12px] text-gray-500">
                  {[item.size, item.color].filter(Boolean).join(" / ")}
                  {[item.size, item.color].some(Boolean) ? " • " : ""}
                  Qty {item.qty || 1}
                </p>
                <p className="mt-1 text-[13px] font-medium text-gray-900">
                  {line === 0 ? "FREE" : formatCheckoutMoney(line)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-gray-200 pt-4 text-[13px]">
        <div className="flex justify-between text-gray-600">
          <span>Subtotal</span>
          <span>{formatCheckoutMoney(subtotal)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Shipping</span>
          <span>
            {shippingPrice === 0 ? "FREE" : formatCheckoutMoney(shippingPrice)}
          </span>
        </div>
        {appliedCoupon && discountAmount > 0 && (
          <div className="flex justify-between text-emerald-700">
            <span>Coupon ({appliedCoupon.code})</span>
            <span>−{formatCheckoutMoney(discountAmount)}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-gray-200 pt-3">
          <span className="text-[16px] font-semibold text-gray-900">Total</span>
          <span className="text-[16px] font-semibold text-gray-900">
            {formatCheckoutMoney(totalPrice)}
          </span>
        </div>
        {totalSavings > 0 && (
          <p className="pt-1 text-[13px] font-medium text-emerald-700">
            You save {formatCheckoutMoney(totalSavings)}
          </p>
        )}
      </div>

      <div className="mt-5 border-t border-gray-200 pt-4">
        {appliedCoupon ? (
          <div className="flex w-full items-center justify-between rounded-md bg-emerald-600 px-3 py-2.5">
            <span className="text-[13px] font-medium text-white">
              {appliedCoupon.code} applied (−{formatCheckoutMoney(discountAmount)})
            </span>
            <button
              type="button"
              onClick={() => {
                removeCoupon();
                setShowCouponPanel(false);
              }}
              className="text-[12px] font-medium text-white/90 underline-offset-2 hover:text-white hover:underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowCouponPanel((open) => !open)}
              className="flex w-full items-center justify-between text-left text-[13px] text-gray-700"
              aria-expanded={showCouponPanel}
            >
              <span>Have a discount code?</span>
              <span className="inline-flex items-center gap-1 font-medium text-gray-900">
                Apply Coupon
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showCouponPanel ? "rotate-180" : ""}`}
                />
              </span>
            </button>
            {showCouponPanel ? (
              <div className="mt-3 space-y-3">
                <div className="flex gap-2">
                  <input
                    className={INPUT}
                    placeholder="Discount code"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    value={couponInput}
                    onChange={(e) =>
                      setCouponInput(e.target.value.toUpperCase())
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleApplyCoupon();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleApplyCoupon()}
                    disabled={isCouponLoading || !couponInput}
                    className="shrink-0 rounded-md bg-gray-200 px-4 text-[13px] font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                  >
                    {isCouponLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Apply"
                    )}
                  </button>
                </div>
                {couponError ? (
                  <p className="text-[12px] text-red-600">{couponError}</p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </main>
      }
    >
      <CheckoutPageContent />
    </Suspense>
  );
}

function CheckoutPageContent() {
  const searchParams = useSearchParams();
  const isBuyNow = searchParams.get("buyNow") === "1";

  const {
    cartItems,
    shippingAddress,
    saveShippingAddress,
    paymentMethod,
    savePaymentMethod,
    removeItems,
    syncStock,
  } = useCartStore();
  const buyNowItems = useBuyNowStore((state) => state.items);
  const clearBuyNow = useBuyNowStore((state) => state.clearBuyNow);
  const syncBuyNowStock = useBuyNowStore((state) => state.syncStock);
  const { userInfo, setUserInfo } = useAuthStore();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [isRazorpayLoaded, setIsRazorpayLoaded] = useState(false);
  const [razorpayConfigured, setRazorpayConfigured] = useState(true);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [loginPromptSkipped, setLoginPromptSkipped] = useState(false);
  const [resolvedEmail, setResolvedEmail] = useState("");
  const [isResolvingEmail, setIsResolvingEmail] = useState(false);
  const afterAccountRef = useRef(null);
  // Always false on first paint (server + client) to avoid hydration mismatch.
  const [cartHydrated, setCartHydrated] = useState(false);

  const [isPincodeLoading, setIsPincodeLoading] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [showCouponPanel, setShowCouponPanel] = useState(false);
  const [isCouponLoading, setIsCouponLoading] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState(null);
  const [paymentError, setPaymentError] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [deliveryMode, setDeliveryMode] = useState("new"); // "saved" | "new"
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [saveToAccount, setSaveToAccount] = useState(true);

  const checkoutItems = isBuyNow ? buyNowItems : cartItems;

  const nameParts = splitName(shippingAddress?.name || "");

  const [formData, setFormData] = useState({
    email: "",
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    name: shippingAddress?.name || "",
    phone: "",
    address: shippingAddress.address || "",
    address2: shippingAddress.address2 || "",
    city: "",
    state: "",
    postalCode: shippingAddress.postalCode || "",
    country: shippingAddress.country || "India",
  });

  useEffect(() => {
    const store = isBuyNow ? useBuyNowStore : useCartStore;
    if (store.persist.hasHydrated()) {
      setCartHydrated(true);
      return;
    }
    return store.persist.onFinishHydration(() => setCartHydrated(true));
  }, [isBuyNow]);

  useEffect(() => {
    if (isBuyNow) syncBuyNowStock(productService);
    else syncStock(productService);
    paymentService
      .getConfig()
      .then((cfg) => {
        setRazorpayConfigured(cfg?.razorpayConfigured !== false);
      })
      .catch(() => setRazorpayConfigured(false));
  }, [isBuyNow, syncBuyNowStock, syncStock]);

  useEffect(() => {
    if (checkoutItems.length > 0) trackBeginCheckout(checkoutItems);
  }, []);

  useEffect(() => {
    if (!cartHydrated) return;
    if (checkoutItems.length === 0 && !loading) {
      router.replace(isBuyNow ? "/all-products" : "/cart");
    }
  }, [cartHydrated, router, checkoutItems.length, loading, isBuyNow]);

  useEffect(() => {
    if (!userInfo) return;
    applyUserToForm(userInfo);
    // Only hydrate once when profile becomes available — avoid fighting user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userInfo?._id]);

  useEffect(() => {
    if (!paymentMethod) savePaymentMethod("razorpay");
  }, [paymentMethod, savePaymentMethod]);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setIsRazorpayLoaded(true);
    document.body.appendChild(script);
  }, []);

  const availableItems = checkoutItems.filter(
    (item) => !isCartLineUnavailable(item)
  );

  const subtotal = availableItems.reduce(
    (acc, item) => acc + (Number(item.price) || 0) * (item.qty || 1),
    0
  );
  const shippingPrice = subtotal > 150 ? 0 : 15;
  const baseTotalPrice = subtotal + shippingPrice;
  const discountAmount = appliedCoupon ? appliedCoupon.discountAmount : 0;
  const totalPrice = baseTotalPrice - discountAmount;
  const mrpSavings = availableItems.reduce((acc, item) => {
    const price = Number(item.price) || 0;
    const mrp = Number(item.mrp ?? item.pricing?.mrp ?? 0);
    const qty = item.qty || 1;
    if (mrp > price) return acc + (mrp - price) * qty;
    return acc;
  }, 0);
  const totalSavings = mrpSavings + (Number(discountAmount) || 0);

  const syncFullName = (next) => {
    const name = [next.firstName, next.lastName].filter(Boolean).join(" ").trim();
    return { ...next, name };
  };

  const updateField = (key, value) => {
    let nextValue = value;
    if (key === "firstName" || key === "lastName") {
      // Letters, spaces, hyphen, apostrophe only — no digits.
      nextValue = String(value).replace(/[^\p{L}\s'-]/gu, "");
    }
    if (key === "phone") {
      nextValue = toIndianMobile(value);
    }
    setFormData((prev) => {
      const next = { ...prev, [key]: nextValue };
      if (key === "firstName" || key === "lastName") return syncFullName(next);
      if (key === "postalCode" && String(nextValue).length !== 6) {
        next.city = "";
        next.state = "";
      }
      return next;
    });
    if (key === "email") {
      setShowLoginPrompt(false);
      setLoginPromptSkipped(false);
      setPaymentError("");
      const normalized = String(nextValue).trim().toLowerCase();
      if (normalized !== resolvedEmail) setResolvedEmail("");
    }
    if (key === "postalCode") {
      setFormErrors((prev) => ({ ...prev, postalCode: "", city: "", state: "" }));
      return;
    }
    if (formErrors[key] || formErrors.name) {
      setFormErrors((prev) => ({ ...prev, [key]: "", name: "" }));
    }
  };

  useEffect(() => {
    const trackCheckout = async () => {
      if (checkoutItems.length === 0) return;
      let guestId = localStorage.getItem("abandoned_guest_id");
      if (!guestId) {
        guestId = `guest_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
        localStorage.setItem("abandoned_guest_id", guestId);
      }
      try {
        await abandonedCheckoutService.upsertCheckout({
          userId: userInfo?._id || null,
          guestId,
          items: availableItems.map((item) => ({
            productId: item._id,
            name: item.name || item.productName,
            price: item.price,
            quantity: item.qty,
            color: item.color,
            size: item.size,
            image: item.image || item.thumbnails?.[0] || item.variants?.[0]?.images?.[0],
          })),
          totalAmount: totalPrice,
          customerDetails: {
            name: formData.name,
            phone: formData.phone,
            email: formData.email,
            address: `${formData.address}${formData.address2 ? ", " + formData.address2 : ""}`,
            city: formData.city,
            state: formData.state,
            postalCode: formData.postalCode,
          },
        });
      } catch (err) {
        console.warn("Abandoned checkout tracking failed", err);
      }
    };
    const timeoutId = setTimeout(trackCheckout, 2000);
    return () => clearTimeout(timeoutId);
  }, [checkoutItems, formData, userInfo, totalPrice, availableItems]);

  const fetchPincodeDetails = async (code) => {
    const pincode = code || formData.postalCode;
    if (pincode.length === 6 && /^\d+$/.test(pincode)) {
      setIsPincodeLoading(true);
      try {
        const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
        const data = await response.json();
        const result = Array.isArray(data) ? data[0] : null;

        if (result?.Status === "Success" && result.PostOffice?.length > 0) {
          const office = result.PostOffice[0];
          const state = normalizeIndianState(office.State || "");
          const city = office.District || office.Block || office.Name || "";
          setFormData((prev) => ({
            ...prev,
            city,
            state,
            country: office.Country || prev.country || "India",
          }));
          setFormErrors((prev) => ({ ...prev, postalCode: "", city: "", state: "" }));
        } else {
          setFormData((prev) => ({ ...prev, city: "", state: "" }));
          setFormErrors((prev) => ({
            ...prev,
            postalCode: "Invalid PIN code. Please check and try again.",
            city: "",
            state: "",
          }));
        }
      } catch (error) {
        console.error("Pincode fetch error:", error);
      } finally {
        setIsPincodeLoading(false);
      }
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => fetchPincodeDetails(), 400);
    return () => clearTimeout(timeoutId);
  }, [formData.postalCode]);

  const handleApplyCoupon = async (code) => {
    const couponCodeToApply = code || couponInput;
    if (!couponCodeToApply) return;
    setCouponError("");
    setIsCouponLoading(true);
    try {
      const items = availableItems.map((item) => ({
        productId: item._id,
        price: Number(item.price) || 0,
        quantity: item.qty || 1,
      }));
      const result = await couponService.validate(couponCodeToApply, subtotal, items);
      setAppliedCoupon({
        ...result,
        code: result.code || result.coupon?.code || couponCodeToApply,
        discountAmount: result.discountAmount ?? result.discount ?? 0,
      });
      setCouponInput("");
      setCouponError("");
      trackSelectPromotion({
        promotionId: result.code || result.coupon?.code || couponCodeToApply,
        promotionName: result.coupon?.name || result.code || couponCodeToApply,
        discount: result.discountAmount ?? result.discount ?? 0,
      });
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        err.message ||
        "Invalid discount";
      setCouponError(typeof msg === "string" ? msg : "Invalid discount");
      setAppliedCoupon(null);
    } finally {
      setIsCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponError("");
  };

  const validateForm = () => {
    const errors = {};
    const emailErr = emailQualityError(formData.email || "");
    if (emailErr) {
      errors.email = emailErr;
    }
    if (!formData.firstName?.trim() && !formData.name?.trim()) {
      errors.firstName = "Enter a first name.";
    } else if (
      formData.firstName?.trim() &&
      !/^[\p{L}\s'-]+$/u.test(formData.firstName.trim())
    ) {
      errors.firstName = "First name can only contain letters.";
    }
    if (
      formData.lastName?.trim() &&
      !/^[\p{L}\s'-]+$/u.test(formData.lastName.trim())
    ) {
      errors.lastName = "Last name can only contain letters.";
    }
    if (!isIndianMobile(formData.phone)) {
      errors.phone = "Enter a valid 10-digit Indian mobile number.";
    }
    if ((formData.address || "").trim().length < 10) {
      errors.address = "Enter a complete street address.";
    }
    if (!/^\d{6}$/.test(formData.postalCode || "")) {
      errors.postalCode = "Enter a valid 6-digit PIN code.";
    }
    if (!formData.city?.trim()) {
      errors.city = "City will appear after a valid PIN code.";
    }
    if (!formData.state?.trim()) {
      errors.state = "State will appear after a valid PIN code.";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const applyUserToForm = (user) => {
    if (!user) return;
    const parts = splitName(user.name || "");
    setFormData((prev) => ({
      ...prev,
      name: prev.name || user.name || "",
      firstName: prev.firstName || parts.firstName,
      lastName: prev.lastName || parts.lastName,
      phone: prev.phone || toIndianMobile(user.phone),
      email: prev.email || user.email || "",
    }));
    if (
      user.emailSubscribed !== undefined ||
      user.whatsappSubscribed !== undefined
    ) {
      setMarketingOptIn(
        Boolean(user.emailSubscribed) && Boolean(user.whatsappSubscribed)
      );
    }
    const list = Array.isArray(user.addresses) ? user.addresses : [];
    if (!list.length) {
      setDeliveryMode("new");
      setSelectedAddressId("");
      return;
    }
    const defaultAddr =
      list.find((a) => a.isDefault) || list[0];
    const defaultIndex = Math.max(
      0,
      list.findIndex((a) => a === defaultAddr)
    );
    const id = String(defaultAddr?.id || `legacy-${defaultIndex}`);
    const patch = savedAddressToFormPatch(defaultAddr);
    setDeliveryMode("saved");
    setSelectedAddressId(id);
    setFormData((prev) => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v != null && v !== "")
      ),
      phone:
        prev.phone ||
        toIndianMobile(defaultAddr.phone) ||
        toIndianMobile(user.phone) ||
        prev.phone,
      name: prev.name || defaultAddr.name || user.name || prev.name,
    }));
    const pin = String(patch.postalCode || "").trim();
    if (pin.length === 6 && !(patch.city && patch.state)) {
      // City/state filled asynchronously from India Post when missing on saved addr.
      setTimeout(() => fetchPincodeDetails(pin), 0);
    }
  };

  const selectSavedAddress = (addr, id) => {
    const patch = savedAddressToFormPatch(addr);
    setSelectedAddressId(id);
    setDeliveryMode("saved");
    setFormData((prev) => ({
      ...prev,
      ...patch,
      phone: toIndianMobile(addr.phone) || prev.phone,
      name: addr.name || prev.name,
    }));
    const pin = String(patch.postalCode || "").trim();
    if (pin.length === 6 && !(patch.city && patch.state)) {
      fetchPincodeDetails(pin);
    }
  };

  const resolveCheckoutEmail = async (emailOverride) => {
    const email = (emailOverride || formData.email || "").trim().toLowerCase();
    const emailErr = emailQualityError(email);
    if (emailErr) {
      setFormErrors((prev) => ({ ...prev, email: emailErr }));
      return null;
    }

    const name =
      formData.name ||
      [formData.firstName, formData.lastName].filter(Boolean).join(" ").trim() ||
      undefined;

    setIsResolvingEmail(true);
    try {
      const data = await authService.checkoutEmail(email, name, {
        emailSubscribed: marketingOptIn,
        whatsappSubscribed: marketingOptIn,
      });
      data.authMethod = "checkout";
      const hasSession = Boolean(data?.token || (data?._id && !data?.requiresLogin));
      if (hasSession) {
        setUserInfo(data);
        persistAuth(data);
        applyUserToForm(data);
      } else {
        // Do not keep a stale local profile when the API did not mint a session.
        setUserInfo(null);
      }
      setResolvedEmail(email);
      return data;
    } catch (err) {
      const detail = err.response?.data?.detail;
      let msg = err.response?.data?.message || "Could not verify email.";
      if (typeof detail === "string") {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg =
          detail
            .map((d) => String(d?.msg || "").replace(/^Value error,\s*/i, ""))
            .filter(Boolean)
            .join(" ") || msg;
      }
      setFormErrors((prev) => ({
        ...prev,
        email: typeof msg === "string" ? msg : "Enter a valid email.",
      }));
      setPaymentError(typeof msg === "string" ? msg : "Could not verify email.");
      return null;
    } finally {
      setIsResolvingEmail(false);
    }
  };

  const handleEmailBlur = async () => {
    const email = (formData.email || "").trim().toLowerCase();
    if (!email || email === resolvedEmail) return;
    const data = await resolveCheckoutEmail(email);
    if (
      data?.requiresLogin &&
      data.authMethod === "checkout" &&
      !loginPromptSkipped
    ) {
      setShowLoginPrompt(true);
    }
  };

  const ensureCheckoutAccount = async (onReady) => {
    const email = (formData.email || "").trim().toLowerCase();
    const emailErr = emailQualityError(email);
    if (emailErr) {
      setPaymentError(emailErr);
      setFormErrors((prev) => ({ ...prev, email: emailErr }));
      return;
    }

    // Always re-resolve with the API. localStorage `authenticated` / `_id` is not
    // proof of an HttpOnly cookie session — trusting it caused 401 on order create.
    afterAccountRef.current = onReady;
    const data = await resolveCheckoutEmail(email);
    if (!data) {
      afterAccountRef.current = null;
      return;
    }

    const hasSession = Boolean(data.token || (data._id && !data.requiresLogin));

    if (data.requiresLogin && !hasSession) {
      setShowLoginPrompt(true);
      setPaymentError("Please use a different email to continue.");
      return;
    }

    if (data.requiresLogin && data.authMethod === "checkout" && !loginPromptSkipped) {
      setShowLoginPrompt(true);
      return;
    }

    if (!hasSession) {
      setPaymentError("Could not start checkout session. Please try again.");
      afterAccountRef.current = null;
      return;
    }

    const next = afterAccountRef.current;
    afterAccountRef.current = null;
    next?.(data);
  };

  const openRazorpayCheckout = ({ paymentData, localOrderId }) => {
    const rzOrderId = paymentData.razorpayOrderId || paymentData.razorpayOrder?.id;
    const keyId = paymentData.keyId;
    const amount = Number(paymentData.amount || paymentData.razorpayOrder?.amount || 0);
    if (!rzOrderId || !keyId || !Number.isFinite(amount) || amount < 100) {
      setLoading(false);
      setPaymentError("Payment session is invalid. Please refresh and try again.");
      return;
    }

    const rawPhone = String(formData.phone || userInfo?.phone || "").replace(/\D/g, "");
    const contact =
      rawPhone.length === 10
        ? `+91${rawPhone}`
        : rawPhone.length === 12 && rawPhone.startsWith("91")
          ? `+${rawPhone}`
          : rawPhone
            ? `+${rawPhone}`
            : "";

    const options = {
      key: keyId,
      amount,
      currency: paymentData.currency || "INR",
      name: "Urban Aana",
      description: `Order #${String(localOrderId).slice(-8)}`,
      order_id: rzOrderId,
      handler: async (response) => {
        try {
          setLoading(true);
          await paymentService.verifyPayment({
            razorpayOrderId: response.razorpay_order_id || rzOrderId,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
            localOrderId,
          });
          if (isBuyNow) clearBuyNow();
          else removeItems(availableItems);
          stashPurchaseEvent({
            transactionId: localOrderId,
            value: totalPrice,
            items: availableItems,
            coupon: appliedCoupon?.code || "",
          });
          router.push(`/checkout/success?orderId=${localOrderId}`);
        } catch (verifyError) {
          console.error("Verification failed:", verifyError);
          setPaymentError(
            "Payment verification failed. If your money was deducted, please contact support with Order ID: " +
              localOrderId
          );
          setLoading(false);
        }
      },
      prefill: {
        name: formData.name || userInfo?.name || "",
        contact,
        email: formData.email || userInfo?.email || "",
      },
      theme: { color: "#DF1721" },
      modal: {
        ondismiss: () => {
          setLoading(false);
          setPaymentError("Payment cancelled. You can try again below.");
          if (localOrderId) {
            paymentService.releaseReservation(localOrderId);
          }
        },
      },
    };
    const rzp = new window.Razorpay(options);
    rzp.on("payment.failed", (response) => {
      const err = response?.error || {};
      console.error("Razorpay payment.failed", err);
      setLoading(false);
      setPaymentError(
        err.description ||
          err.reason ||
          "Payment failed. Please try another method or card."
      );
      if (localOrderId) {
        paymentService.releaseReservation(localOrderId);
      }
    });
    rzp.open();
  };

  const executePlaceOrder = async () => {
    if (availableItems.length === 0) {
      setPaymentError(
        isBuyNow
          ? "Your order has no available items. Please go back and check stock."
          : "Your order has no available items. Please return to cart and check stock."
      );
      setLoading(false);
      return;
    }
    if (!razorpayConfigured) {
      setPaymentError("Online payments are currently unavailable. Please try again later.");
      return;
    }
    if (!isRazorpayLoaded) {
      alert("Razorpay is still loading. Please wait a moment.");
      return;
    }

    setLoading(true);
    setPaymentError("");

    try {
      // Persist marketing opt-in on the customer record (email + WhatsApp).
      try {
        const updated = await authService.updateProfile({
          emailSubscribed: marketingOptIn,
          whatsappSubscribed: marketingOptIn,
        });
        if (updated) {
          setUserInfo(updated);
          persistAuth(updated);
        }
      } catch {
        // Non-blocking — order can still proceed if prefs update fails.
      }

      // Save new delivery address to the account book when requested.
      if (deliveryMode === "new" && saveToAccount) {
        try {
          const fullName =
            formData.name ||
            [formData.firstName, formData.lastName].filter(Boolean).join(" ").trim();
          const updated = await authService.addAddress({
            name: fullName,
            phone: formData.phone,
            house: formData.address,
            city: formData.city,
            state: formData.state,
            pincode: formData.postalCode,
            country: formData.country || "India",
            isDefault: !(userInfo?.addresses || []).length,
          });
          if (updated) {
            setUserInfo(updated);
            persistAuth(updated);
            const list = Array.isArray(updated.addresses) ? updated.addresses : [];
            const last = list[list.length - 1];
            if (last?.id) {
              setSelectedAddressId(String(last.id));
              setDeliveryMode("saved");
            }
          }
        } catch (err) {
          console.warn("Could not save address to account", err);
        }
      }

      let localOrderId = pendingOrderId;
      if (!localOrderId) {
        const orderData = {
          orderItems: availableItems.map((item) => ({
            name: item.name || item.productName,
            qty: item.qty || 1,
            image: item.image || item.thumbnails?.[0] || item.variants?.[0]?.images?.[0],
            price: Number(item.price) || 0,
            product: item._id,
            size: item.size,
            color: item.color || "",
          })),
          shippingAddress: {
            ...formData,
            name: formData.name || [formData.firstName, formData.lastName].filter(Boolean).join(" "),
          },
          paymentMethod: "razorpay",
          shippingPrice,
          totalPrice,
          guestId: localStorage.getItem("abandoned_guest_id"),
          couponCode: appliedCoupon ? appliedCoupon.code : null,
          discountAmount,
          attribution: getAttributionSnapshot(),
        };
        const data = await orderService.create(orderData);
        localOrderId = data._id;
        setPendingOrderId(localOrderId);
      }

      const paymentData = await paymentService.createRazorpayOrder(localOrderId);
      trackAddShippingInfo(availableItems, shippingPrice > 0 ? "standard" : "free");
      trackAddPaymentInfo(availableItems, "razorpay");
      openRazorpayCheckout({ paymentData, localOrderId });
    } catch (error) {
      console.error("Error placing order:", error);
      const status = error.response?.status;
      const detail =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message ||
        "Something went wrong.";
      if (status === 401) {
        setUserInfo(null);
        setPendingOrderId(null);
        setPaymentError("Your session expired. Confirm your email and try again.");
      } else {
        setPaymentError(typeof detail === "string" ? detail : "Something went wrong.");
      }
      setLoading(false);
    }
  };

  const handlePlaceOrder = () => {
    if (!validateForm()) {
      setPaymentError("Please fix the highlighted fields.");
      return;
    }
    saveShippingAddress({
      ...formData,
      name: formData.name || [formData.firstName, formData.lastName].filter(Boolean).join(" "),
    });
    ensureCheckoutAccount(() => executePlaceOrder());
  };

  if (!cartHydrated) {
    return (
      <main className="grid min-h-screen place-items-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-8">
          <Link href="/" className="inline-flex items-center">
            <Image
              src="/brand/logo.png"
              alt="URBAN AANA"
              width={96}
              height={34}
              priority
              className="h-8 w-auto object-contain"
            />
          </Link>
          <Link
            href={isBuyNow ? "/all-products" : "/cart"}
            className="text-[13px] text-[#222222] hover:underline"
          >
            {isBuyNow ? "Back to shopping" : "Return to Cart"}
          </Link>
        </div>
      </header>

      <div className="relative lg:min-h-[calc(100vh-3.5rem)]">
        {/* Full-bleed summary background on desktop */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-[#F8F8F8] lg:block"
          aria-hidden
        />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 px-4 sm:px-8 lg:min-h-[calc(100vh-3.5rem)] lg:grid-cols-2">
          {/* Form — left edge matches nav logo */}
          <div className="order-2 bg-white py-8 lg:order-1 lg:border-r lg:border-gray-200 lg:py-10 lg:pr-10">
            <div className="w-full max-w-xl space-y-8">
              {/* Contact */}
              <section>
                <h2 className={`${SECTION} mb-3`}>Contact</h2>
                <div>
                  <label className={LABEL}>Email</label>
                  <input
                    type="email"
                    autoComplete="email"
                    className={formErrors.email ? INPUT_ERR : INPUT}
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    onBlur={handleEmailBlur}
                  />
                  {formErrors.email && (
                    <p className="mt-1 text-[12px] text-red-600">{formErrors.email}</p>
                  )}
                  {isResolvingEmail && (
                    <p className="mt-1 text-[12px] text-gray-500">Checking email…</p>
                  )}
                  {showLoginPrompt && !loginPromptSkipped && (
                    <CheckoutAccountPrompt
                      email={formData.email.trim().toLowerCase()}
                      onSkip={() => {
                        setLoginPromptSkipped(false);
                        setShowLoginPrompt(false);
                        setResolvedEmail("");
                        setFormData((prev) => ({ ...prev, email: "" }));
                        setUserInfo(null);
                        afterAccountRef.current = null;
                        setPaymentError("");
                      }}
                    />
                  )}
                </div>
                <label className="mt-3 flex items-start gap-2 text-[13px] text-gray-700">
                  <input
                    type="checkbox"
                    checked={marketingOptIn}
                    onChange={(e) => setMarketingOptIn(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300"
                  />
                  <span>Email & WhatsApp me about offers and updates</span>
                </label>
              </section>

              {/* Delivery */}
              <section>
                <h2 className={`${SECTION} mb-3`}>Delivery</h2>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={LABEL}>First name</label>
                      <input
                        className={formErrors.firstName ? INPUT_ERR : INPUT}
                        autoComplete="given-name"
                        inputMode="text"
                        autoCapitalize="words"
                        value={formData.firstName}
                        onChange={(e) => updateField("firstName", e.target.value)}
                      />
                      {formErrors.firstName && (
                        <p className="mt-1 text-[12px] text-red-600">{formErrors.firstName}</p>
                      )}
                    </div>
                    <div>
                      <label className={LABEL}>Last name</label>
                      <input
                        className={formErrors.lastName ? INPUT_ERR : INPUT}
                        autoComplete="family-name"
                        inputMode="text"
                        autoCapitalize="words"
                        value={formData.lastName}
                        onChange={(e) => updateField("lastName", e.target.value)}
                      />
                      {formErrors.lastName && (
                        <p className="mt-1 text-[12px] text-red-600">{formErrors.lastName}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className={LABEL}>Phone</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-[13px] text-gray-600">
                        <span className="text-[16px] leading-none" aria-hidden>
                          🇮🇳
                        </span>
                        <span>+91</span>
                      </span>
                      <input
                        className={`${formErrors.phone ? INPUT_ERR : INPUT} pl-[4.25rem]`}
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        autoComplete="tel-national"
                        placeholder="10-digit mobile"
                        value={formData.phone}
                        onChange={(e) => updateField("phone", e.target.value)}
                      />
                    </div>
                    {formErrors.phone && (
                      <p className="mt-1 text-[12px] text-red-600">{formErrors.phone}</p>
                    )}
                  </div>

                  <CheckoutDeliveryAddress
                    addresses={userInfo?.addresses || []}
                    selectedId={selectedAddressId}
                    deliveryMode={deliveryMode}
                    onModeChange={(mode) => {
                      setDeliveryMode(mode);
                      if (mode === "new") setSelectedAddressId("");
                    }}
                    onSelectSaved={selectSavedAddress}
                    saveToAccount={saveToAccount}
                    onSaveToAccountChange={setSaveToAccount}
                    showSaveToggle={Boolean(
                      userInfo?._id || userInfo?.authenticated || resolvedEmail
                    )}
                  >
                    <div>
                      <label className={LABEL}>Address</label>
                      <input
                        className={formErrors.address ? INPUT_ERR : INPUT}
                        autoComplete="address-line1"
                        placeholder="Street address"
                        value={formData.address}
                        onChange={(e) => updateField("address", e.target.value)}
                      />
                      {formErrors.address && (
                        <p className="mt-1 text-[12px] text-red-600">{formErrors.address}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className={LABEL}>City</label>
                        <input
                          readOnly
                          tabIndex={-1}
                          className={`${formErrors.city ? INPUT_ERR : INPUT_READONLY}`}
                          value={formData.city}
                          placeholder="Auto-filled from PIN"
                        />
                        {formErrors.city && (
                          <p className="mt-1 text-[12px] text-red-600">{formErrors.city}</p>
                        )}
                      </div>
                      <div>
                        <label className={LABEL}>State</label>
                        <input
                          readOnly
                          tabIndex={-1}
                          className={`${formErrors.state ? INPUT_ERR : INPUT_READONLY}`}
                          value={formData.state}
                          placeholder="Auto-filled from PIN"
                        />
                        {formErrors.state && (
                          <p className="mt-1 text-[12px] text-red-600">{formErrors.state}</p>
                        )}
                      </div>
                      <div>
                        <label className={LABEL}>PIN code</label>
                        <div className="relative">
                          <input
                            className={formErrors.postalCode ? INPUT_ERR : INPUT}
                            maxLength={6}
                            inputMode="numeric"
                            autoComplete="postal-code"
                            value={formData.postalCode}
                            onChange={(e) =>
                              updateField("postalCode", e.target.value.replace(/\D/g, ""))
                            }
                          />
                          {isPincodeLoading && (
                            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
                          )}
                        </div>
                        {formErrors.postalCode && (
                          <p className="mt-1 text-[12px] text-red-600">{formErrors.postalCode}</p>
                        )}
                      </div>
                    </div>
                  </CheckoutDeliveryAddress>
                </div>
              </section>

              {/* Payment */}
              <section>
                <h2 className={`${SECTION} mb-1`}>Payment</h2>
                <p className="mb-3 flex items-center gap-1.5 text-[13px] text-gray-500">
                  <Lock className="h-3.5 w-3.5" />
                  All transactions are secure and encrypted.
                </p>

                <div className="overflow-hidden rounded-md border border-gray-300">
                  <div className="flex h-10 w-full items-center gap-3 bg-[#F9F9F5] px-4">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[5px] border-[#222222] bg-white" />
                    <Smartphone className="h-4 w-4 shrink-0 text-gray-600" />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-gray-900">
                      Razorpay
                      <span className="ml-2 font-normal text-gray-500">Card, UPI, or wallet</span>
                    </span>
                    <CheckIcon className="h-4 w-4 shrink-0 text-[#222222]" />
                  </div>
                </div>

              </section>

              {paymentError && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
                  <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={loading || availableItems.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#222222] py-3.5 text-[15px] font-semibold text-white hover:bg-[#000000] disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading
                  ? "Processing…"
                  : pendingOrderId
                    ? "Retry payment"
                    : "Pay now"}
              </button>

              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[12px] text-gray-500">
                <Link href="/return-refund" className="hover:text-gray-900 hover:underline">
                  Refund policy
                </Link>
                <span aria-hidden>·</span>
                <Link href="/shipping" className="hover:text-gray-900 hover:underline">
                  Shipping policy
                </Link>
                <span aria-hidden>·</span>
                <Link href="/privacy-policy" className="hover:text-gray-900 hover:underline">
                  Privacy policy
                </Link>
                <span aria-hidden>·</span>
                <Link href="/terms-and-conditions" className="hover:text-gray-900 hover:underline">
                  Terms of service
                </Link>
                <span aria-hidden>·</span>
                <Link href="/contact" className="hover:text-gray-900 hover:underline">
                  Contact
                </Link>
              </p>
            </div>
          </div>

          {/* Summary — right edge matches nav “Return to Cart” */}
          <aside className="order-1 border-b border-gray-200 bg-[#F8F8F8] py-8 lg:order-2 lg:flex lg:justify-end lg:border-b-0 lg:bg-transparent lg:py-10 lg:pl-10">
            <div className="w-full max-w-xl">
              <CheckoutOrderSummary
                availableItems={availableItems}
                subtotal={subtotal}
                shippingPrice={shippingPrice}
                appliedCoupon={appliedCoupon}
                discountAmount={discountAmount}
                totalPrice={totalPrice}
                totalSavings={totalSavings}
                couponInput={couponInput}
                setCouponInput={setCouponInput}
                couponError={couponError}
                showCouponPanel={showCouponPanel}
                setShowCouponPanel={setShowCouponPanel}
                isCouponLoading={isCouponLoading}
                handleApplyCoupon={handleApplyCoupon}
                removeCoupon={removeCoupon}
              />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
