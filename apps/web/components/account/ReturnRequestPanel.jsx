"use client";

import { useCallback, useEffect, useState } from "react";
import { returnService } from "@/api";
import SafeImage from "@/components/SafeImage";
import { userErrorMessage } from "@/lib/userMessage";

const REASONS = [
  "Wrong size",
  "Not as described",
  "Damaged or defective",
  "Received the wrong item",
  "Changed my mind",
];

function formatPrice(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Lets a customer send back part or all of a delivered order, inside the
 * return window. Renders nothing until the server says something is returnable.
 */
export default function ReturnRequestPanel({ orderRef, onSubmitted }) {
  const [check, setCheck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  const load = useCallback(async () => {
    try {
      setCheck(await returnService.eligibility(orderRef));
    } catch {
      setCheck(null);
    } finally {
      setLoading(false);
    }
  }, [orderRef]);

  useEffect(() => {
    load();
  }, [load]);

  const setQty = (index, value) => {
    setQuantities((prev) => ({ ...prev, [index]: value }));
    setError("");
  };

  const selected = Object.entries(quantities)
    .map(([index, quantity]) => ({ index: Number(index), quantity: Number(quantity) }))
    .filter((row) => row.quantity > 0);

  const refundEstimate = selected.reduce((sum, row) => {
    const item = (check?.items || []).find((i) => i.index === row.index);
    return sum + (item ? item.unitPrice * row.quantity : 0);
  }, 0);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selected.length) {
      setError("Pick at least one item to return.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const created = await returnService.create(orderRef, {
        items: selected,
        reason,
        note,
      });
      setDone(created);
      setOpen(false);
      setQuantities({});
      setNote("");
      await load();
      onSubmitted?.(created);
    } catch (e) {
      setError(userErrorMessage(e, "Couldn’t submit this return. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  if (done) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white px-5 py-4 sm:px-6">
        <h2 className="text-[16px] font-semibold text-gray-900">Return requested</h2>
        <p className="mt-1 text-[13px] text-gray-600">
          Reference <span className="font-mono">{done.number}</span>. We’ll review it and arrange
          a pickup — you’ll get an update by email.
        </p>
      </section>
    );
  }

  if (!check?.eligible) {
    // Only explain the refusal once the window has actually closed; there is no
    // point telling someone mid-transit that they cannot return yet.
    const worthSaying =
      check?.reason && /window closed|already been returned/i.test(check.reason);
    if (!worthSaying) return null;
    return (
      <section className="rounded-xl border border-gray-200 bg-white px-5 py-4 sm:px-6">
        <p className="text-[13px] text-gray-500">{check.reason}</p>
      </section>
    );
  }

  const returnable = (check.items || []).filter((item) => item.returnableQuantity > 0);

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-[16px] font-semibold text-gray-900">Return items</h2>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {check.windowClosesAt
              ? `Open until ${formatDate(check.windowClosesAt)} — ${check.windowDays} days after delivery.`
              : `Within ${check.windowDays} days of delivery.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 items-center rounded-md border border-gray-300 px-5 text-xs font-bold tracking-[0.14em] text-gray-900 uppercase transition-colors hover:bg-gray-50"
        >
          {open ? "Cancel" : "Start a return"}
        </button>
      </div>

      {open ? (
        <form onSubmit={handleSubmit} className="px-5 py-4 sm:px-6">
          <div className="divide-y divide-gray-100">
            {returnable.map((item) => (
              <div key={item.index} className="flex items-center gap-4 py-3">
                <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-gray-100">
                  <SafeImage src={item.image} alt={item.productName} fill className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {item.productName}
                  </p>
                  <p className="mt-0.5 text-[13px] text-gray-500">
                    {[item.size, item.color].filter(Boolean).join(" · ")}
                    {item.returnedQuantity > 0
                      ? ` · ${item.returnedQuantity} already returned`
                      : ""}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {formatPrice(item.unitPrice)}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-[13px] text-gray-600">
                  <span className="sr-only">Quantity to return for {item.productName}</span>
                  <select
                    value={quantities[item.index] || 0}
                    onChange={(e) => setQty(item.index, Number(e.target.value))}
                    className="h-9 rounded-md border border-gray-300 px-2 text-sm"
                  >
                    {Array.from({ length: item.returnableQuantity + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[13px] text-gray-600">
              Reason
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
              >
                {REASONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[13px] text-gray-600">
              Anything else? (optional)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                className="mt-1 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
                placeholder="Tell us what went wrong"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <p className="text-[13px] text-gray-600">
              {selected.length
                ? `Refund of about ${formatPrice(refundEstimate)} — delivery charges aren’t returned.`
                : "Choose how many of each item you’re sending back."}
            </p>
            <button
              type="submit"
              disabled={submitting || !selected.length}
              className="inline-flex h-10 items-center rounded-md bg-[#222222] px-6 text-xs font-bold tracking-[0.14em] text-white uppercase transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Request return"}
            </button>
          </div>

          {error ? <p className="mt-3 text-[13px] text-red-600">{error}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
