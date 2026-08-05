"use client";

import { Camera, Mail, Phone } from "lucide-react";
import {
  AccountIcon,
  ChevronRightIcon,
  InfoIcon,
} from "@/components/icons/storeIcons";
import { useEffect, useState } from "react";
import { authService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { motion } from "framer-motion";

const LABEL = "mb-1.5 block text-[13px] font-medium text-gray-700";
const INPUT =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-[14px] text-gray-900 placeholder:text-gray-400 focus:border-[#222222] focus:outline-none focus:ring-1 focus:ring-[#222222]";
const INPUT_LOCKED =
  "h-10 w-full cursor-not-allowed rounded-md border border-gray-200 bg-gray-50 px-3 text-[14px] text-gray-600";

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

function apiErrorMessage(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d?.msg).filter(Boolean).join(" ") || fallback;
  }
  return err?.response?.data?.message || fallback;
}

export default function SettingsPage() {
  const { userInfo, setUserInfo } = useAuthStore();
  const lockedPhone = toIndianMobile(userInfo?.phone);
  const phoneLocked = Boolean(lockedPhone);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [profileForm, setProfileForm] = useState({
    name: userInfo?.name || "",
    email: userInfo?.email || "",
    phone: lockedPhone || "",
  });

  useEffect(() => {
    setProfileForm({
      name: userInfo?.name || "",
      email: userInfo?.email || "",
      phone: toIndianMobile(userInfo?.phone) || "",
    });
  }, [userInfo?.name, userInfo?.email, userInfo?.phone]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setMessage({ type: "", text: "" });

    const payload = { name: profileForm.name };
    if (!phoneLocked) {
      const phone = toIndianMobile(profileForm.phone);
      if (phone && !isIndianMobile(phone)) {
        setMessage({
          type: "error",
          text: "Enter a valid 10-digit Indian mobile number.",
        });
        setUpdating(false);
        return;
      }
      if (phone) payload.phone = phone;
    }

    try {
      const data = await authService.updateProfile(payload);
      setUserInfo(data);
      setMessage({ type: "success", text: "Profile details updated successfully." });
    } catch (error) {
      setMessage({
        type: "error",
        text: apiErrorMessage(error, "Error updating profile"),
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <DashboardLayout title="Account Settings" eyebrow="Profile">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <aside className="rounded-xl border border-gray-200 bg-[#F8F8F8] p-6 text-center sm:p-8 lg:col-span-1">
          <div className="relative mx-auto mb-5 inline-block">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white">
              <AccountIcon className="h-12 w-12 text-gray-300" />
            </div>
            <button
              type="button"
              className="absolute right-0 bottom-0 rounded-full bg-[#DF1721] p-2 text-white transition-colors hover:bg-black"
              aria-label="Update photo"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
          </div>
          <h3 className="text-sm font-semibold text-gray-900">{userInfo?.name}</h3>
          <p className="mt-1 truncate text-[13px] text-gray-500">{userInfo?.email}</p>

          <div className="mt-6 space-y-3 border-t border-gray-200 pt-5 text-left">
            <div className="flex items-center gap-3 text-gray-500">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate text-[13px]">{userInfo?.email}</span>
            </div>
            <div className="flex items-center gap-3 text-gray-500">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[13px]">
                {lockedPhone || "No phone added"}
              </span>
            </div>
          </div>
        </aside>

        <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 lg:col-span-2">
          <form onSubmit={handleUpdateProfile} className="space-y-5">
            {message.text ? (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className={`rounded-md border px-4 py-3 text-[13px] ${
                  message.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {message.text}
              </motion.div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={LABEL}>Full name</label>
                <input
                  type="text"
                  className={INPUT}
                  value={profileForm.name}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className={LABEL}>Email address</label>
                <input
                  type="email"
                  className={INPUT_LOCKED}
                  value={profileForm.email}
                  readOnly
                  aria-readonly="true"
                />
                <p className="mt-1.5 text-[12px] text-gray-500">
                  Used to sign in. Cannot be changed.
                </p>
              </div>
              <div className="md:col-span-2">
                <label className={LABEL}>Phone number</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  className={phoneLocked ? INPUT_LOCKED : INPUT}
                  value={profileForm.phone}
                  placeholder={phoneLocked ? undefined : "10-digit mobile"}
                  readOnly={phoneLocked}
                  aria-readonly={phoneLocked ? "true" : undefined}
                  maxLength={10}
                  onChange={(e) => {
                    if (phoneLocked) return;
                    setProfileForm({
                      ...profileForm,
                      phone: toIndianMobile(e.target.value),
                    });
                  }}
                />
                <p className="mt-1.5 text-[12px] text-gray-500">
                  {phoneLocked
                    ? "Cannot be changed once set."
                    : "Add a 10-digit Indian mobile number."}
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={updating}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#222222] px-6 text-xs font-bold tracking-[0.14em] text-white uppercase transition-colors hover:bg-black disabled:opacity-50 md:w-auto"
            >
              {updating ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  <span>Save changes</span>
                  <ChevronRightIcon className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-start gap-3 rounded-md border border-gray-200 bg-[#F8F8F8] p-4">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <p className="text-[13px] leading-relaxed text-gray-600">
              To use a different email, sign out and verify that address with a
              new login code. Phone can only be added if it is missing.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
