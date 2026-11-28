"use client";

import { useMemo, useState } from "react";
import { Loader2, MapPin } from "@/components/icons";
import { orderService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";
import { userErrorMessage } from "@/lib/userMessage";
import { lookupPincode } from "@/lib/pincodeLookup";
import { formToAddressBody } from "@/lib/customerAddressForm";
import {
  orderAddressEditState,
  orderAddressToForm,
  sameState,
  validateOrderAddressForm,
} from "@/lib/orderAddressEdit";
import { normalizeIndianState } from "@/components/storefront/StateSearchSelect";

const INPUT =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-[14px] text-gray-900 placeholder:text-gray-400 focus:border-[#222222] focus:outline-none focus:ring-1 focus:ring-[#222222]";
const LABEL = "mb-1.5 block text-[13px] font-medium text-gray-700";
const NEW = "__new__";

function AddressLines({ addr }) {
  const name =
    addr?.name || [addr?.firstName, addr?.lastName].filter(Boolean).join(" ");
  return (
    <div className="text-sm leading-relaxed text-gray-600">
      {name ? <p className="font-medium text-gray-900">{name}</p> : null}
      <p>{[addr?.address || addr?.house, addr?.address2].filter(Boolean).join(", ")}</p>
      <p>
        {[addr?.city, addr?.state].filter(Boolean).join(", ")}
        {addr?.postalCode || addr?.pincode ? ` – ${addr.postalCode || addr.pincode}` : ""}
      </p>
      {addr?.phone ? <p className="mt-1">{addr.phone}</p> : null}
    </div>
  );
}

/**
 * Shipping address card on the customer's order page, with "Change address"
 * until the order is handed to the courier (same state only).
 */
export default function OrderShippingAddress({ order, onUpdated }) {
  const savedAddresses = useAuthStore((s) => s.userInfo?.addresses);
  const current = order?.shippingAddress || {};
  const edit = orderAddressEditState(order, "customer");
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(NEW);
  const [form, setForm] = useState(() => orderAddressToForm(current));
  const [saving, setSaving] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const saved = useMemo(
    () => (Array.isArray(savedAddresses) ? savedAddresses.filter((a) => a?.id) : []),
    [savedAddresses]
  );

  const start = () => {
    const firstSameState = saved.find((a) => sameState(current.state, a.state));
    setChoice(firstSameState ? firstSameState.id : NEW);
    setForm(orderAddressToForm(current));
    setError("");
    setDone("");
    setOpen(true);
  };

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
  };

  const onPin = async (value) => {
    const pin = value.replace(/\D/g, "").slice(0, 6);
    update("pincode", pin);
    if (pin.length !== 6) return;
    setPinLoading(true);
    const hit = await lookupPincode(pin);
    setPinLoading(false);
    if (hit) {
      setForm((prev) => ({ ...prev, city: hit.city, state: normalizeIndianState(hit.state) }));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    let body;
    if (choice === NEW) {
      const problem = validateOrderAddressForm(form);
      if (problem) return setError(problem);
      if (!sameState(current.state, form.state)) {
        return setError(`The new address must be in ${current.state}. Contact us to deliver to another state.`);
      }
      body = formToAddressBody(form);
    } else {
      body = { addressId: choice };
    }
    setSaving(true);
    try {
      const updated = await orderService.updateShippingAddress(order._id, body);
      onUpdated?.(updated);
      setOpen(false);
      setDone(
        updated?.addressResult?.changed === false
          ? "That's already the delivery address."
          : "Delivery address updated."
      );
    } catch (err) {
      setError(userErrorMessage(err, "Couldn’t update the address. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[#DF1721]" />
          <h2 className="text-[14px] font-semibold text-gray-900">Shipping address</h2>
        </div>
        {edit.editable && !open ? (
          <button
            type="button"
            onClick={start}
            className="text-[13px] font-medium text-gray-900 underline underline-offset-4 hover:text-[#DF1721]"
          >
            Change
          </button>
        ) : null}
      </div>

      {!open ? <AddressLines addr={current} /> : null}
      {done ? <p className="mt-3 text-[13px] font-medium text-emerald-700">{done}</p> : null}
      {!edit.editable && edit.code === "booked" ? (
        <p className="mt-3 text-[12px] text-gray-500">{edit.reason}</p>
      ) : null}

      {open ? (
        <form onSubmit={save} className="space-y-3">
          <p className="text-[12px] leading-5 text-gray-500">
            You can change the address until we hand your order to the courier. It must be in{" "}
            {current.state || "the same state"}. Your delivery charge stays the same.
          </p>

          {saved.length ? (
            <div className="space-y-2">
              {saved.map((addr) => {
                const allowed = sameState(current.state, addr.state);
                return (
                  <label
                    key={addr.id}
                    className={`flex gap-2.5 rounded-md border p-3 text-[13px] ${
                      choice === addr.id ? "border-gray-900" : "border-gray-200"
                    } ${allowed ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                  >
                    <input
                      type="radio"
                      name="order-address"
                      className="mt-0.5 accent-[#222222]"
                      disabled={!allowed}
                      checked={choice === addr.id}
                      onChange={() => setChoice(addr.id)}
                    />
                    <span className="min-w-0 text-gray-600">
                      <span className="block font-medium text-gray-900">
                        {addr.label || addr.name || "Saved address"}
                      </span>
                      {addr.house}, {addr.city} – {addr.pincode}
                      {!allowed ? <span className="block text-[12px]">Different state</span> : null}
                    </span>
                  </label>
                );
              })}
              <label
                className={`flex cursor-pointer gap-2.5 rounded-md border p-3 text-[13px] font-medium text-gray-900 ${
                  choice === NEW ? "border-gray-900" : "border-gray-200"
                }`}
              >
                <input
                  type="radio"
                  name="order-address"
                  className="accent-[#222222]"
                  checked={choice === NEW}
                  onChange={() => setChoice(NEW)}
                />
                Enter a different address
              </label>
            </div>
          ) : null}

          {choice === NEW ? (
            <div className="space-y-3">
              <div>
                <label className={LABEL}>Full name</label>
                <input className={INPUT} value={form.name} onChange={(e) => update("name", e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Mobile number</label>
                <input
                  className={INPUT}
                  type="tel"
                  inputMode="numeric"
                  placeholder="10-digit mobile"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                />
              </div>
              <div>
                <label className={LABEL}>Address</label>
                <textarea
                  rows={2}
                  className={`${INPUT} h-auto py-2`}
                  placeholder="House / flat, street, area"
                  value={form.house}
                  onChange={(e) => update("house", e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL}>PIN code</label>
                <div className="relative">
                  <input
                    className={INPUT}
                    inputMode="numeric"
                    value={form.pincode}
                    onChange={(e) => onPin(e.target.value)}
                  />
                  {pinLoading ? (
                    <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>City</label>
                  <input className={INPUT} value={form.city} onChange={(e) => update("city", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>State</label>
                  <input className={INPUT} value={form.state} placeholder="From PIN" onChange={(e) => update("state", e.target.value)} />
                </div>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-[13px] text-[#DF1721]">{error}</p> : null}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-[#222222] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save address
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-10 rounded-md border border-gray-300 px-4 text-[13px] font-medium text-gray-900 hover:border-gray-900"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </aside>
  );
}
