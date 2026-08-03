"use client";

import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { authService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";

export default function SecurityPage() {
  const { userInfo, setUserInfo } = useAuthStore();
  const hasPassword = Boolean(userInfo?.hasPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    if (newPassword.length < 8) {
      setMessage({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }
    if (hasPassword && !currentPassword) {
      setMessage({ type: "error", text: "Enter your current password." });
      return;
    }

    setSaving(true);
    try {
      if (hasPassword) {
        const data = await authService.updateProfile({
          password: newPassword,
          currentPassword,
        });
        setUserInfo(data);
        setMessage({ type: "success", text: "Password updated." });
      } else {
        const data = await authService.setPassword(newPassword);
        setUserInfo(data);
        setMessage({
          type: "success",
          text: "Password set. You can sign in with email and password.",
        });
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err.response?.data?.detail ||
          err.response?.data?.message ||
          "Could not update password.",
      });
    } finally {
      setSaving(false);
    }
  };

  const LABEL = "mb-1.5 block text-[12px] font-bold uppercase tracking-[0.16em] text-black";
  const inputClass =
    "h-10 w-full border border-black bg-white px-3 text-[14px] text-black placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#DF1721]";

  return (
    <DashboardLayout title="Security" eyebrow="Account safety">
      <div className="max-w-xl">
        <div className="border border-black bg-white p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3 border-b border-black pb-4">
            <Lock className="h-4 w-4 text-[#DF1721]" />
            <h2 className="text-[12px] font-bold uppercase tracking-[0.2em]">
              {hasPassword ? "Change password" : "Set password"}
            </h2>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {hasPassword ? (
              <div>
                <label className={LABEL}>Current password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
            ) : null}

            <div className="relative">
              <label className={LABEL}>New password</label>
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
                className={inputClass}
              />
              <button
                type="button"
                className="absolute right-3 bottom-2.5 p-1 text-gray-400 transition-colors hover:text-black"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <div>
              <label className={LABEL}>Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
                className={inputClass}
              />
            </div>

            {message.text ? (
              <p
                className={`text-[12px] font-medium ${
                  message.type === "error" ? "text-[#DF1721]" : "text-black"
                }`}
              >
                {message.text}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className="mt-2 h-10 w-full bg-[#DF1721] text-xs font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-black disabled:opacity-50"
            >
              {saving ? "Saving…" : hasPassword ? "Update password" : "Set password"}
            </button>
          </form>
        </div>

        <div className="relative mt-6 overflow-hidden border border-black bg-black p-6 text-white sm:p-8">
          <div className="pointer-events-none absolute inset-0 opacity-10">
            <ShieldCheck className="-mt-8 -ml-8 h-40 w-40" />
          </div>
          <p className="relative z-10 text-sm leading-relaxed text-gray-300">
            Use a unique password for your Urban Aana account. If you checked out with email only,
            set a password here to sign in next time.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
