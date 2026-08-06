"use client";

import { Mail, Phone } from "lucide-react";
import {
  ChevronRightIcon,
} from "@/components/icons/storeIcons";
import { useEffect, useMemo, useState } from "react";
import { authService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { motion } from "framer-motion";

const LABEL = "mb-1.5 block text-[13px] font-medium text-gray-700";
const INPUT =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-[14px] text-gray-900 placeholder:text-gray-400 focus:border-[#222222] focus:outline-none focus:ring-1 focus:ring-[#222222]";

const AVATAR_COLORS = [
  "#DF1721",
  "#1F4B99",
  "#0F766E",
  "#B45309",
  "#7C3AED",
  "#BE185D",
  "#166534",
  "#1E3A5F",
  "#9A3412",
  "#334155",
];

function avatarColorFor(seed) {
  const text = String(seed || "U");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function nameInitial(name) {
  const letter = String(name || "").trim().charAt(0);
  return letter ? letter.toUpperCase() : "?";
}

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

  const displayName = profileForm.name || userInfo?.name || "";
  const initial = useMemo(() => nameInitial(displayName), [displayName]);
  const avatarBg = useMemo(
    () => avatarColorFor(userInfo?.email || userInfo?._id || displayName),
    [userInfo?.email, userInfo?._id, displayName]
  );

  return (
    <DashboardLayout title="Account Settings" eyebrow="Profile">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <aside className="rounded-xl border border-gray-200 bg-[#F8F8F8] p-6 text-center sm:p-8 lg:col-span-1">
          <div className="mx-auto mb-5 inline-block">
            <div
              className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full text-white"
              style={{ backgroundColor: avatarBg }}
              aria-hidden
            >
              <span className="text-3xl font-semibold leading-none tracking-tight">
                {initial}
              </span>
            </div>
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
                <p className={LABEL}>Email address</p>
                <p className="truncate text-[14px] text-gray-900">
                  {profileForm.email || "—"}
                </p>
                <p className="mt-1.5 text-[12px] text-gray-500">
                  Used to sign in. Cannot be changed.
                </p>
              </div>
              <div className="md:col-span-2">
                <p className={LABEL}>Phone number</p>
                {phoneLocked ? (
                  <>
                    <p className="text-[14px] text-gray-900">
                      {profileForm.phone}
                    </p>
                    <p className="mt-1.5 text-[12px] text-gray-500">
                      Cannot be changed once set.
                    </p>
                  </>
                ) : (
                  <>
                    <input
                      type="tel"
                      inputMode="numeric"
                      className={INPUT}
                      value={profileForm.phone}
                      placeholder="10-digit mobile"
                      maxLength={10}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          phone: toIndianMobile(e.target.value),
                        })
                      }
                    />
                    <p className="mt-1.5 text-[12px] text-gray-500">
                      Add a 10-digit Indian mobile number.
                    </p>
                  </>
                )}
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
        </div>
      </div>
    </DashboardLayout>
  );
}
