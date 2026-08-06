"use client";

import { MapPin } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useAuthStore } from "@/store/useAuthStore";
import Link from "next/link";

function formatAddress(addr) {
  if (!addr) return "";
  if (typeof addr === "string") return addr;
  const parts = [
    addr.name,
    addr.address || addr.address1 || addr.line1,
    addr.address2 || addr.line2,
    [addr.city, addr.state, addr.postalCode || addr.pincode].filter(Boolean).join(", "),
    addr.country,
    addr.phone ? `Phone: ${addr.phone}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

export default function AddressesPage() {
  const { userInfo } = useAuthStore();
  const raw = userInfo?.addresses;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const fallback = userInfo?.address ? [{ address: userInfo.address }] : [];
  const addresses = list.length > 0 ? list : fallback;

  return (
    <DashboardLayout title="Saved Addresses" eyebrow="Delivery">
      {addresses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-6 py-16 text-center sm:px-12">
          <MapPin className="mx-auto mb-4 h-10 w-10 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900">No addresses yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
            Addresses are saved when you complete checkout.
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
            const text = formatAddress(addr);
            return (
              <article
                key={addr._id || addr.id || idx}
                className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6"
              >
                <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
                  <MapPin className="h-4 w-4 text-[#DF1721]" />
                  <h3 className="text-[14px] font-semibold text-gray-900">
                    {addr.label || addr.type || `Address ${idx + 1}`}
                  </h3>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600">
                  {text}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
