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
    <DashboardLayout title="Saved Addresses">
      {addresses.length === 0 ? (
        <div className="bg-white border border-gray-100 p-10 text-center">
          <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-4" />
          <p className="text-sm text-gray-500 mb-2">No saved addresses yet.</p>
          <p className="text-[11px] text-gray-400 mb-6">
            Addresses are saved when you complete checkout.
          </p>
          <Link
            href="/all-products"
            className="inline-block text-[10px] uppercase tracking-widest font-black text-accent border-b border-accent pb-1"
          >
            Continue shopping
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {addresses.map((addr, idx) => {
            const text = formatAddress(addr);
            return (
              <div key={addr._id || addr.id || idx} className="bg-white p-8 border border-gray-100 shadow-sm">
                <div className="flex items-center space-x-3 text-primary mb-6">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <h3 className="text-[10px] uppercase tracking-[0.2em] font-black">
                    {addr.label || addr.type || `Address ${idx + 1}`}
                  </h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{text}</p>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-[11px] text-gray-400">
        To change a delivery address, update it during checkout on your next order.
      </p>
    </DashboardLayout>
  );
}
