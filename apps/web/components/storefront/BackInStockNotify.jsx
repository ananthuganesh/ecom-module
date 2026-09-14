"use client";

import { useEffect, useState } from "react";

import { productService } from "@/api";
import { isValidAlertEmail, soldOutSizes, stockAlertMessage } from "@/lib/stockAlert";
import { useAuthStore } from "@/store/useAuthStore";

const TONE_CLASS = {
  success: "text-emerald-600",
  info: "text-gray-700",
  error: "text-[#DF1721]",
};

/**
 * "Notify me" for sold-out sizes. Pass `sizes` for a sized product, or
 * `soldOut` for a product with no size options.
 */
export default function BackInStockNotify({ productId, sizes = [], soldOut = false }) {
  const userEmail = useAuthStore((s) => s.userInfo?.email || "");
  const options = soldOutSizes(sizes);
  const sized = sizes.length > 0;

  const [open, setOpen] = useState(false);
  const [size, setSize] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (userEmail) setEmail((current) => current || userEmail);
  }, [userEmail]);

  useEffect(() => {
    setOpen(false);
    setSize("");
    setMessage(null);
  }, [productId]);

  if (!productId || (sized ? options.length === 0 : !soldOut)) return null;

  const chosenSize = sized ? size || (options.length === 1 ? options[0] : "") : "";

  const submit = async (event) => {
    event.preventDefault();
    if (sized && !chosenSize) {
      setMessage({ tone: "error", text: "Choose the size you want." });
      return;
    }
    if (!isValidAlertEmail(email)) {
      setMessage({ tone: "error", text: "Enter a valid email address." });
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const result = await productService.subscribeStockAlert(productId, {
        email: email.trim(),
        size: chosenSize,
      });
      setMessage(stockAlertMessage(result, chosenSize));
    } catch (error) {
      const detail = error?.response?.data?.detail;
      setMessage({
        tone: "error",
        text: typeof detail === "string" ? detail : "Couldn't save that. Please try again.",
      });
    } finally {
      setPending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2.5 text-[12px] font-medium text-gray-600 underline underline-offset-2 hover:text-black"
      >
        {sized ? "Size sold out? Notify me when it's back" : "Notify me when it's back"}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-md border border-gray-200 p-3" noValidate>
      <p className="text-[12px] font-medium text-gray-700">
        Get one email when it&apos;s back in stock.
      </p>

      {sized && options.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Sold-out size">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={chosenSize === option}
              onClick={() => {
                setSize(option);
                setMessage(null);
              }}
              className={`min-w-10 rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                chosenSize === option
                  ? "border-black bg-black text-white"
                  : "border-gray-200 text-black hover:border-black"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex gap-2">
        <label htmlFor="stock-alert-email" className="sr-only">
          Email
        </label>
        <input
          id="stock-alert-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setMessage(null);
          }}
          placeholder="you@example.com"
          className="h-10 min-w-0 flex-1 rounded-md border border-gray-200 px-3 text-[13px] outline-none focus:border-black"
        />
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="h-10 shrink-0 rounded-md bg-black px-4 text-[13px] font-semibold text-white transition hover:bg-gray-900 disabled:bg-gray-300"
        >
          {pending ? "Saving…" : "Notify me"}
        </button>
      </div>

      {message ? (
        <p role="status" className={`mt-2 text-[12px] ${TONE_CLASS[message.tone] || ""}`}>
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
