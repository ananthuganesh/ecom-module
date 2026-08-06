"use client";

import { useMemo, useState } from "react";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useAuthStore } from "@/store/useAuthStore";
import { authService } from "@/api";
import { persistAuth } from "@/lib/persistAuth";
import { normalizeIndianState } from "@/components/storefront/StateSearchSelect";
import Link from "next/link";

const INPUT =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-[14px] text-gray-900 placeholder:text-gray-400 focus:border-[#222222] focus:outline-none focus:ring-1 focus:ring-[#222222]";
const LABEL = "mb-1.5 block text-[13px] font-medium text-gray-700";

function formatAddress(addr) {
  if (!addr) return "";
  if (typeof addr === "string") return addr;
  const parts = [
    addr.name,
    addr.house || addr.address || addr.address1 || addr.line1,
    addr.address2 || addr.line2,
    [addr.city, addr.state, addr.postalCode || addr.pincode].filter(Boolean).join(", "),
    addr.country,
    addr.phone ? `Phone: ${addr.phone}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

function addressKey(addr, idx) {
  return String(addr?.id || `legacy-${idx}`);
}

const emptyForm = {
  label: "",
  name: "",
  phone: "",
  house: "",
  city: "",
  state: "",
  pincode: "",
};

export default function AddressesPage() {
  const { userInfo, setUserInfo } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const addresses = useMemo(() => {
    const raw = userInfo?.addresses;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (list.length) return list;
    return userInfo?.address ? [{ address: userInfo.address }] : [];
  }, [userInfo]);

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
  };

  const lookupPin = async (code) => {
    if (!/^\d{6}$/.test(code)) return;
    setPinLoading(true);
    try {
      const response = await fetch(`https://api.postalpincode.in/pincode/${code}`);
      const data = await response.json();
      const result = Array.isArray(data) ? data[0] : null;
      if (result?.Status === "Success" && result.PostOffice?.length > 0) {
        const office = result.PostOffice[0];
        setForm((prev) => ({
          ...prev,
          city: office.District || office.Block || office.Name || "",
          state: normalizeIndianState(office.State || ""),
        }));
      }
    } catch {
      // ignore — user can retry
    } finally {
      setPinLoading(false);
    }
  };

  const syncUser = (updated) => {
    if (!updated) return;
    setUserInfo(updated);
    persistAuth(updated);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if ((form.house || "").trim().length < 5) {
      setError("Enter a complete street address.");
      return;
    }
    if (!/^\d{6}$/.test(form.pincode || "")) {
      setError("Enter a valid 6-digit PIN code.");
      return;
    }
    if (!form.city?.trim() || !form.state?.trim()) {
      setError("City and state will appear after a valid PIN.");
      return;
    }
    setSaving(true);
    try {
      const updated = await authService.addAddress({
        label: form.label.trim() || "Home",
        name: form.name.trim() || userInfo?.name || "",
        phone: form.phone.trim() || userInfo?.phone || "",
        house: form.house.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        country: "India",
        isDefault: addresses.length === 0,
      });
      syncUser(updated);
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "Could not save address."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDefault = async (id) => {
    setBusyId(id);
    try {
      const updated = await authService.setDefaultAddress(id);
      syncUser(updated);
    } catch {
      // ignore
    } finally {
      setBusyId("");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this address?")) return;
    setBusyId(id);
    try {
      const updated = await authService.deleteAddress(id);
      syncUser(updated);
    } catch {
      // ignore
    } finally {
      setBusyId("");
    }
  };

  return (
    <DashboardLayout title="Saved Addresses" eyebrow="Delivery">
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v);
            setError("");
          }}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-[#222222] px-4 text-xs font-bold tracking-[0.14em] text-white uppercase transition-colors hover:bg-black"
        >
          <Plus className="h-4 w-4" />
          {showForm ? "Cancel" : "Add address"}
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={handleSave}
          className="mb-6 space-y-3 rounded-xl border border-gray-200 bg-white p-5 sm:p-6"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Label</label>
              <input
                className={INPUT}
                placeholder="Home / Work"
                value={form.label}
                onChange={(e) => updateForm("label", e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Full name</label>
              <input
                className={INPUT}
                value={form.name}
                placeholder={userInfo?.name || "Recipient name"}
                onChange={(e) => updateForm("name", e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Street address</label>
            <input
              className={INPUT}
              value={form.house}
              onChange={(e) => updateForm("house", e.target.value)}
              placeholder="House / street"
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={LABEL}>City</label>
              <input className={INPUT} value={form.city} readOnly placeholder="From PIN" />
            </div>
            <div>
              <label className={LABEL}>State</label>
              <input className={INPUT} value={form.state} readOnly placeholder="From PIN" />
            </div>
            <div>
              <label className={LABEL}>PIN code</label>
              <div className="relative">
                <input
                  className={INPUT}
                  value={form.pincode}
                  maxLength={6}
                  inputMode="numeric"
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, "").slice(0, 6);
                    updateForm("pincode", next);
                    if (next.length === 6) lookupPin(next);
                  }}
                  required
                />
                {pinLoading ? (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
                ) : null}
              </div>
            </div>
          </div>
          <div>
            <label className={LABEL}>Phone</label>
            <input
              className={INPUT}
              value={form.phone}
              maxLength={10}
              inputMode="numeric"
              placeholder={userInfo?.phone || "10-digit mobile"}
              onChange={(e) =>
                updateForm("phone", e.target.value.replace(/\D/g, "").slice(0, 10))
              }
            />
          </div>
          {error ? <p className="text-[13px] text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-10 items-center justify-center rounded-md bg-black px-5 text-xs font-bold tracking-[0.14em] text-white uppercase disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save address"}
          </button>
        </form>
      ) : null}

      {addresses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-16 text-center sm:px-12">
          <MapPin className="mx-auto mb-4 h-10 w-10 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900">No addresses yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
            Add an address here, or save one when you checkout.
          </p>
          <Link
            href="/all-products"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-[#222222] px-6 text-xs font-bold tracking-[0.14em] text-white uppercase transition-colors hover:bg-black"
          >
            Continue shopping
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          {addresses.map((addr, idx) => {
            const id = addressKey(addr, idx);
            const text = formatAddress(addr);
            const busy = busyId === id;
            return (
              <article
                key={id}
                className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6"
              >
                <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
                  <MapPin className="h-4 w-4 text-[#DF1721]" />
                  <h3 className="text-[14px] font-semibold text-gray-900">
                    {addr.label || addr.type || `Address ${idx + 1}`}
                  </h3>
                  {addr.isDefault ? (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-gray-600 uppercase">
                      Default
                    </span>
                  ) : null}
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600">
                  {text}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!addr.isDefault && addr.id ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDefault(id)}
                      className="rounded-md border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Set default
                    </button>
                  ) : null}
                  {addr.id || String(id).startsWith("legacy-") ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDelete(id)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-100 px-3 py-1.5 text-[12px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
