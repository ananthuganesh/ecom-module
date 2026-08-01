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
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    if (newPassword.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    setSaving(true);
    try {
      if (hasPassword) {
        const data = await authService.updateProfile({ password: newPassword });
        setUserInfo(data);
        setMessage({ type: "success", text: "Password updated." });
      } else {
        const data = await authService.setPassword(newPassword);
        setUserInfo(data);
        setMessage({ type: "success", text: "Password set. You can sign in with email and password." });
      }
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.detail || err.response?.data?.message || "Could not update password.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Security Settings">
      <div className="max-w-xl">
        <div className="bg-white p-8 border border-gray-100 shadow-sm">
          <div className="flex items-center space-x-3 text-primary mb-8 border-b border-gray-50 pb-4">
            <Lock className="w-4 h-4 text-accent" />
            <h2 className="text-[10px] uppercase tracking-[0.2em] font-black">
              {hasPassword ? "Change Password" : "Set Password"}
            </h2>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2 relative">
              <label className="text-[9px] uppercase tracking-widest font-black text-gray-400">
                New Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
                className="w-full border border-gray-100 p-4 text-sm focus:outline-none focus:border-accent transition-colors bg-gray-50/30"
              />
              <button
                type="button"
                className="absolute right-4 bottom-4 p-1 text-gray-300 hover:text-primary transition-colors"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-widest font-black text-gray-400">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                required
                className="w-full border border-gray-100 p-4 text-sm focus:outline-none focus:border-accent transition-colors bg-gray-50/30"
              />
            </div>

            {message.text ? (
              <p
                className={`text-[11px] font-medium ${
                  message.type === "error" ? "text-red-600" : "text-emerald-600"
                }`}
              >
                {message.text}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className="btn-primary w-full py-4 text-[9px] font-black tracking-[0.2em] disabled:opacity-50"
            >
              {saving ? "Saving…" : hasPassword ? "Update Password" : "Set Password"}
            </button>
          </form>
        </div>

        <div className="mt-8 p-8 bg-primary text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-5 pointer-events-none">
            <ShieldCheck className="w-48 h-48 -ml-10 -mt-10" />
          </div>
          <p className="text-xs text-gray-300 leading-relaxed relative z-10">
            Use a unique password for your Urban Aana account. If you checked out with email only,
            set a password here to sign in next time.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
