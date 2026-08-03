"use client";

import { Camera, Mail, Phone } from "lucide-react";
import {
  AccountIcon,
  ChevronRightIcon,
  InfoIcon,
} from "@/components/icons/storeIcons";
import { useState } from "react";
import { authService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { motion } from "framer-motion";

export default function SettingsPage() {
  const { userInfo, setUserInfo } = useAuthStore();
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [profileForm, setProfileForm] = useState({
    name: userInfo?.name || "",
    email: userInfo?.email || "",
    phone: userInfo?.phone || "",
  });

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setMessage({ type: "", text: "" });
    try {
      const data = await authService.updateProfile({
        name: profileForm.name,
        email: profileForm.email,
        phone: profileForm.phone,
      });
      setUserInfo(data);
      setMessage({ type: "success", text: "Profile details updated successfully." });
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.message || "Error updating profile",
      });
    } finally {
      setUpdating(false);
    }
  };

  const LABEL = "mb-1.5 block text-[12px] font-bold uppercase tracking-[0.16em] text-black";
  const inputClass =
    "h-10 w-full border border-black bg-white px-3 text-[14px] text-black placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#DF1721]";

  return (
    <DashboardLayout title="Account Settings" eyebrow="Profile">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        <aside className="border border-black bg-white p-6 text-center sm:p-8 lg:col-span-1">
          <div className="relative mx-auto mb-6 inline-block">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden border border-black bg-[#F9F9F5]">
              <AccountIcon className="h-12 w-12 text-gray-300" />
            </div>
            <button
              type="button"
              className="absolute right-0 bottom-0 bg-[#DF1721] p-2 text-white transition-colors hover:bg-black"
              aria-label="Update photo"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
          </div>
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-black">
            {userInfo?.name}
          </h3>
          <p className="mt-1 truncate text-[12px] text-gray-500">{userInfo?.email}</p>

          <div className="mt-8 space-y-3 border-t border-black pt-6 text-left">
            <div className="flex items-center gap-3 text-gray-500">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate text-[12px]">{userInfo?.email}</span>
            </div>
            <div className="flex items-center gap-3 text-gray-500">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[12px]">{userInfo?.phone || "No phone added"}</span>
            </div>
          </div>
        </aside>

        <div className="border border-black bg-white p-6 sm:p-8 lg:col-span-2">
          <form onSubmit={handleUpdateProfile} className="space-y-6">
            {message.text ? (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className={`border border-l-4 px-4 py-3 text-[12px] font-bold uppercase tracking-[0.16em] ${
                  message.type === "success"
                    ? "border-black bg-[#F9F9F5] text-black"
                    : "border-[#DF1721] bg-red-50 text-[#DF1721]"
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
                  className={inputClass}
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className={LABEL}>Email address</label>
                <input
                  type="email"
                  className={inputClass}
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <label className={LABEL}>Phone number</label>
                <input
                  type="tel"
                  className={inputClass}
                  value={profileForm.phone}
                  placeholder="+91 00000 00000"
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={updating}
              className="inline-flex h-10 w-full items-center justify-center gap-2 bg-[#DF1721] px-8 text-xs font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-black disabled:opacity-50 md:w-auto"
            >
              {updating ? (
                <div className="h-4 w-4 animate-spin border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  <span>Save changes</span>
                  <ChevronRightIcon className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 flex items-start gap-3 border border-black bg-[#F9F9F5] p-4">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <p className="text-[12px] leading-relaxed text-gray-600">
              Changing your email address will require you to log in again with the new credentials.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
