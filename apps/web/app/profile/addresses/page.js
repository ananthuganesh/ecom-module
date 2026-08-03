"use client";

import { MapPin } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useAuthStore } from "@/store/useAuthStore";
import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons/storeIcons";

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
        <div className="border border-black bg-white px-6 py-16 text-center sm:px-12">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center border border-black">
            <MapPin className="h-7 w-7" />
          </div>
          <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#DF1721]">
            No addresses yet
          </p>
          <h2 className="mt-3 font-vina text-4xl uppercase leading-none">Add on checkout</h2>
          <p className="mx-auto mt-4 max-w-sm text-sm text-gray-600">
            Addresses are saved when you complete checkout.
          </p>
          <Link
            href="/all-products"
            className="mt-8 inline-flex h-10 items-center gap-2 bg-black px-7 text-xs font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#DF1721]"
          >
            Continue shopping <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {addresses.map((addr, idx) => {
            const text = formatAddress(addr);
            return (
              <article
                key={addr._id || addr.id || idx}
                className="border border-black bg-white p-6 sm:p-8"
              >
                <div className="mb-5 flex items-center gap-3 border-b border-black pb-4">
                  <MapPin className="h-4 w-4 text-[#DF1721]" />
                  <h3 className="text-[12px] font-bold uppercase tracking-[0.16em]">
                    {addr.label || addr.type || `Address ${idx + 1}`}
                  </h3>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600">{text}</p>
              </article>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-[12px] text-gray-500">
        To change a delivery address, update it during checkout on your next order.
      </p>
    </DashboardLayout>
  );
}
