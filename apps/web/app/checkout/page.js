"use client";

import { Loader2, Lock, Smartphone } from "lucide-react";
import {
  CheckIcon,
  InfoIcon
} from "@/components/icons/storeIcons";
import { useState, useEffect, useRef } from "react";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";

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
import CheckoutAccountPrompt from "@/components/CheckoutAccountPrompt";
import { normalizeIndianState } from "@/components/storefront/StateSearchSelect";
import { trackBeginCheckout, stashPurchaseEvent, trackSelectPromotion, trackAddPaymentInfo, trackAddShippingInfo } from "@/lib/tracking";
import { getAttributionSnapshot } from "@/lib/attribution";
import { persistAuth } from "@/lib/persistAuth";

const INPUT =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-[14px] text-gray-900 placeholder:text-gray-400 focus:border-[#1773b0] focus:outline-none focus:ring-1 focus:ring-[#1773b0]";
const INPUT_ERR =
  "w-full rounded-md border border-red-400 bg-white px-3 py-3 text-[14px] text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500";
const INPUT_READONLY =
  "w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-[14px] text-gray-700 placeholder:text-gray-400 cursor-not-allowed";
const LABEL = "mb-1.5 block text-[13px] font-medium text-gray-700";
const SECTION = "text-[18px] font-semibold text-gray-900 tracking-tight";

function splitName(full = "") {
  const parts = String(full).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export default function CheckoutPage() {
  const {
    cartItems,
    shippingAddress,
    saveShippingAddress,
    paymentMethod,
    savePaymentMethod,
    removeItems,
    syncStock,
  } = useCartStore();
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
  const [cartHydrated, setCartHydrated] = useState(() =>
    typeof window === "undefined" ? false : useCartStore.persist.hasHydrated()
  );

  const [isPincodeLoading, setIsPincodeLoading] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [couponError, setCouponError] = useState("");
  const [isCouponLoading, setIsCouponLoading] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState(null);
  const [paymentError, setPaymentError] = useState("");
  const [emailOffers, setEmailOffers] = useState(true);
  const [saveInfo, setSaveInfo] = useState(true);

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
    if (useCartStore.persist.hasHydrated()) {
      setCartHydrated(true);
      return;
    }
    return useCartStore.persist.onFinishHydration(() => setCartHydrated(true));
  }, []);

  useEffect(() => {
    syncStock(productService);
    paymentService
      .getConfig()
      .then((cfg) => {
        setRazorpayConfigured(cfg?.razorpayConfigured !== false);
      })
      .catch(() => setRazorpayConfigured(false));
    couponService.getAll().then(setAvailableCoupons).catch(() => {});
  }, []);

  useEffect(() => {
    if (cartItems.length > 0) trackBeginCheckout(cartItems);
  }, []);

  useEffect(() => {
    if (!cartHydrated) return;
    if (cartItems.length === 0 && !loading) router.replace("/cart");
  }, [cartHydrated, router, cartItems.length, loading]);

  useEffect(() => {
    if (!userInfo) return;
    const parts = splitName(userInfo.name || "");
    setFormData((prev) => ({
      ...prev,
      name: prev.name || userInfo.name || "",
      firstName: prev.firstName || parts.firstName,
      lastName: prev.lastName || parts.lastName,
      phone: prev.phone || userInfo.phone || "",
      email: prev.email || userInfo.email || "",
    }));
  }, [userInfo]);

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

  const availableItems = cartItems.filter(
    (item) => (item.countInStock ?? 1) >= (item.qty || 1) && item.countInStock > 0
  );
  const unavailableItems = cartItems.filter(
    (item) => (item.countInStock ?? 1) < (item.qty || 1) || item.countInStock === 0
  );

  const subtotal = availableItems.reduce(
    (acc, item) => acc + (Number(item.price) || 0) * (item.qty || 1),
    0
  );
  const shippingPrice = subtotal > 150 ? 0 : 15;
  const baseTotalPrice = subtotal + shippingPrice;
  const discountAmount = appliedCoupon ? appliedCoupon.discountAmount : 0;
  const totalPrice = baseTotalPrice - discountAmount;

  const syncFullName = (next) => {
    const name = [next.firstName, next.lastName].filter(Boolean).join(" ").trim();
    return { ...next, name };
  };

  const updateField = (key, value) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "firstName" || key === "lastName") return syncFullName(next);
      if (key === "postalCode" && String(value).length !== 6) {
        next.city = "";
        next.state = "";
      }
      return next;
    });
    if (key === "email") {
      setShowLoginPrompt(false);
      setLoginPromptSkipped(false);
      const normalized = String(value).trim().toLowerCase();
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
      if (cartItems.length === 0) return;
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
  }, [cartItems, formData, userInfo, totalPrice]);

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email || "")) {
      errors.email = "Enter a valid email.";
    }
    if (!formData.firstName?.trim() && !formData.name?.trim()) {
      errors.firstName = "Enter a first name.";
    }
    if (!/^\d{10}$/.test(formData.phone || "")) {
      errors.phone = "Enter a valid 10-digit mobile number.";
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
      phone: prev.phone || user.phone || "",
      email: prev.email || user.email || "",
    }));
    const defaultAddr = (user.addresses || []).find((a) => a.isDefault) || user.addresses?.[0];
    if (defaultAddr) {
      setFormData((prev) => ({
        ...prev,
        address: prev.address || defaultAddr.house || "",
        postalCode: prev.postalCode || defaultAddr.pincode || "",
        phone: prev.phone || defaultAddr.phone || prev.phone,
      }));
    }
  };

  const resolveCheckoutEmail = async (emailOverride) => {
    const email = (emailOverride || formData.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

    const name =
      formData.name ||
      [formData.firstName, formData.lastName].filter(Boolean).join(" ").trim() ||
      undefined;

    setIsResolvingEmail(true);
    try {
      const data = await authService.checkoutEmail(email, name);
      data.authMethod = "checkout";
      if (data?.token || data?._id || data?.authenticated) {
        setUserInfo(data);
        persistAuth(data);
        applyUserToForm(data);
      } else {
        setUserInfo({ ...data, token: null });
      }
      setResolvedEmail(email);
      if (data?.requiresExistingSession) {
        setPaymentError(
          "This email was used before on another device. Use the same browser, create a password from your last order email, or enter a different email."
        );
      }
      return data;
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        "Could not verify email.";
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
      (data?.requiresLogin || data?.hasPassword) &&
      data.authMethod === "checkout" &&
      !loginPromptSkipped
    ) {
      setShowLoginPrompt(true);
    }
  };

  const ensureCheckoutAccount = async (onReady) => {
    const email = (formData.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setPaymentError("Please enter a valid email.");
      setFormErrors((prev) => ({ ...prev, email: "Enter a valid email." }));
      return;
    }

    if ((userInfo?.token || userInfo?.authenticated || userInfo?._id) && userInfo?.email?.toLowerCase() === email) {
      onReady(userInfo);
      return;
    }

    afterAccountRef.current = onReady;
    const data = await resolveCheckoutEmail(email);
    if (!data) {
      afterAccountRef.current = null;
      return;
    }

    if ((data.requiresLogin || data.hasPassword) && !(data.token || data._id || data.authenticated)) {
      setShowLoginPrompt(true);
      setPaymentError("Please log in to continue with this email.");
      return;
    }

    if (data.requiresExistingSession && !(data.token || data._id || data.authenticated)) {
      setPaymentError(
        "This email was used before on another device. Use the same browser, create a password from your last order email, or enter a different email."
      );
      afterAccountRef.current = null;
      return;
    }

    if ((data.requiresLogin || data.hasPassword) && data.authMethod === "checkout" && !loginPromptSkipped) {
      setShowLoginPrompt(true);
      return;
    }

    const next = afterAccountRef.current;
    afterAccountRef.current = null;
    next?.(data);
  };

  const openRazorpayCheckout = ({ paymentData, localOrderId }) => {
    const rzOrderId = paymentData.razorpayOrderId || paymentData.razorpayOrder?.id;
    const keyId = paymentData.keyId;
    const amount = paymentData.amount || paymentData.razorpayOrder?.amount;
    const options = {
      key: keyId,
      amount,
      currency: paymentData.currency || "INR",
      name: "Urban Aana",
      description: `Order #${localOrderId}`,
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
          removeItems(availableItems);
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
        contact: formData.phone || userInfo?.phone || "",
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
    rzp.open();
  };

  const executePlaceOrder = async () => {
    if (availableItems.length === 0) {
      setPaymentError("Your order has no available items. Please return to cart and check stock.");
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
      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message ||
        "Something went wrong.";
      setPaymentError(typeof errorMessage === "string" ? errorMessage : "Something went wrong.");
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

  const OrderSummary = ({ compact = false }) => (
    <div className={compact ? "" : "lg:sticky lg:top-8"}>
      <h2 className={`${SECTION} mb-5`}>Order summary</h2>

      {unavailableItems.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
          {unavailableItems.length} item{unavailableItems.length > 1 ? "s" : ""} out of stock and
          won’t be included.
        </div>
      )}

      <div className="space-y-4 mb-6">
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
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-700 px-1 text-[11px] font-medium text-white">
                  {item.qty || 1}
                </span>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="truncate text-[13px] font-medium text-gray-900">
                  {item.name || item.productName}
                </p>
                {(item.size || item.color) && (
                  <p className="text-[12px] text-gray-500">
                    {[item.size].filter(Boolean).join(" / ")}
                  </p>
                )}
              </div>
              <p className="shrink-0 text-[13px] font-medium text-gray-900">
                {line === 0 ? "FREE" : `₹${line.toLocaleString("en-IN")}`}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mb-4 flex gap-2">
        {!appliedCoupon ? (
          <>
            <input
              className={INPUT}
              placeholder="Discount code"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleApplyCoupon()}
            />
            <button
              type="button"
              onClick={() => handleApplyCoupon()}
              disabled={isCouponLoading || !couponInput}
              className="shrink-0 rounded-md bg-gray-200 px-4 text-[13px] font-medium text-gray-700 disabled:opacity-50 hover:bg-gray-300"
            >
              {isCouponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
            </button>
          </>
        ) : (
          <div className="flex w-full items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
            <span className="text-[13px] font-medium text-emerald-800">
              {appliedCoupon.code} (−₹{discountAmount.toFixed(0)})
            </span>
            <button
              type="button"
              onClick={removeCoupon}
              className="text-[12px] font-medium text-gray-500 hover:text-red-600"
            >
              Remove
            </button>
          </div>
        )}
      </div>
      {couponError && <p className="mb-3 text-[12px] text-red-600">{couponError}</p>}

      {!appliedCoupon && availableCoupons.filter((c) => c?.code).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {availableCoupons.filter((c) => c?.code).slice(0, 4).map((coupon) => (
            <button
              key={coupon._id || coupon.code}
              type="button"
              onClick={() => handleApplyCoupon(coupon.code)}
              className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:border-brand-red hover:text-brand-red"
            >
              {coupon.code}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2 border-t border-gray-200 pt-4 text-[13px]">
        <div className="flex justify-between text-gray-600">
          <span>Subtotal</span>
          <span>₹{subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Shipping</span>
          <span>
            {shippingPrice === 0
              ? "FREE"
              : `₹${shippingPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
          </span>
        </div>
        {appliedCoupon && (
          <div className="flex justify-between text-emerald-700">
            <span>Discount</span>
            <span>−₹{discountAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex items-end justify-between border-t border-gray-200 pt-3">
          <span className="text-[16px] font-semibold text-gray-900">Total</span>
          <div className="text-right">
            <span className="mr-2 text-[12px] text-gray-500">INR</span>
            <span className="text-[20px] font-semibold text-gray-900">
              ₹{totalPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  if (!cartHydrated) {
    return (
      <main className="grid min-h-screen place-items-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-gray-200 px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="inline-flex items-center">
            <Image
              src="/urban/logo.png"
              alt="URBAN AANA"
              width={120}
              height={40}
              priority
              className="h-8 w-auto object-contain"
            />
          </Link>
          <Link href="/cart" className="text-[13px] text-[#1773b0] hover:underline">
            Return to cart
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Form column */}
        <div className="order-2 px-4 py-8 sm:px-8 lg:order-1 lg:border-r lg:border-gray-200 lg:pr-10">
            <div className="max-w-xl space-y-8">
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
                      onLogin={(user) => {
                        user.authMethod = "password";
                        setUserInfo(user);
                        persistAuth(user);
                        setShowLoginPrompt(false);
                        applyUserToForm(user);
                        const next = afterAccountRef.current;
                        afterAccountRef.current = null;
                        next?.(user);
                      }}
                      onSkip={() => {
                        setLoginPromptSkipped(false);
                        setShowLoginPrompt(false);
                        setResolvedEmail("");
                        setFormData((prev) => ({ ...prev, email: "" }));
                        setUserInfo(null);
                        afterAccountRef.current = null;
                        setPaymentError("Enter a different email to continue as guest.");
                      }}
                    />
                  )}
                </div>
                <label className="mt-3 flex items-center gap-2 text-[13px] text-gray-700">
                  <input
                    type="checkbox"
                    checked={emailOffers}
                    onChange={(e) => setEmailOffers(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Email me with news and offers
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
                        className={INPUT}
                        autoComplete="family-name"
                        value={formData.lastName}
                        onChange={(e) => updateField("lastName", e.target.value)}
                      />
                    </div>
                  </div>

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

                  <div>
                    <label className={LABEL}>Apartment, suite, etc. (optional)</label>
                    <input
                      className={INPUT}
                      autoComplete="address-line2"
                      value={formData.address2}
                      onChange={(e) => updateField("address2", e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                  </div>
                  <p className="text-[12px] text-gray-500">
                    City and state are filled automatically from your PIN code.
                  </p>

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
                        maxLength={10}
                        autoComplete="tel"
                        value={formData.phone}
                        onChange={(e) =>
                          updateField("phone", e.target.value.replace(/\D/g, ""))
                        }
                      />
                    </div>
                    {formErrors.phone && (
                      <p className="mt-1 text-[12px] text-red-600">{formErrors.phone}</p>
                    )}
                  </div>

                  <label className="flex items-center gap-2 text-[13px] text-gray-700">
                    <input
                      type="checkbox"
                      checked={saveInfo}
                      onChange={(e) => setSaveInfo(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    Save this information for next time
                  </label>
                </div>
              </section>

              {/* Shipping */}
              <section>
                <h2 className={`${SECTION} mb-3`}>Shipping method</h2>
                <div className="overflow-hidden rounded-md border border-gray-300">
                  <div className="flex items-center justify-between gap-3 bg-[#f0f5ff] px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full border-[5px] border-[#1773b0] bg-white" />
                      <span className="text-[14px] text-gray-900">
                        Standard
                      </span>
                    </div>
                    <span className="text-[14px] font-medium text-gray-900">
                      {shippingPrice === 0 ? "FREE" : `₹${shippingPrice.toFixed(2)}`}
                    </span>
                  </div>
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
                  <div className="flex w-full items-center gap-3 bg-[#f0f5ff] px-4 py-3.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[5px] border-[#1773b0] bg-white" />
                    <Smartphone className="h-5 w-5 text-gray-600" />
                    <span className="flex-1">
                      <span className="block text-[14px] font-medium text-gray-900">Razorpay</span>
                      <span className="block text-[12px] text-gray-500">Card, UPI, or wallet</span>
                    </span>
                    <CheckIcon className="h-4 w-4 text-[#1773b0]" />
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
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#1773b0] py-3.5 text-[15px] font-semibold text-white hover:bg-[#0e5a8c] disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading
                  ? "Processing…"
                  : pendingOrderId
                    ? "Retry payment"
                    : "Pay now"}
              </button>

              <p className="pt-2 text-[12px]">
                <Link href="/contact" className="text-[#1773b0] hover:underline">
                  Contact
                </Link>
              </p>
            </div>
        </div>

        {/* Summary column */}
        <aside className="order-1 border-b border-gray-200 bg-[#f5f5f5] px-4 py-8 sm:px-8 lg:order-2 lg:border-b-0 lg:pl-10">
          <OrderSummary />
        </aside>
      </div>
    </main>
  );
}
