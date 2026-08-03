"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";
import { persistAuth } from "@/lib/persistAuth";

const INPUT =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-0 text-[14px] text-gray-900 placeholder:text-gray-400 focus:border-[#222222] focus:outline-none focus:ring-1 focus:ring-[#222222]";

/**
 * Login required when checkout email matches an account with a password.
 * Skip means use a different email — no session is issued without credentials.
 */
export default function CheckoutAccountPrompt({ email, onLogin, onSkip }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setUserInfo } = useAuthStore();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      const data = await authService.login(email, password);
      setUserInfo(data);
      persistAuth(data);
      onLogin?.(data);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          err.response?.data?.message ||
          "Invalid password. Try again or use a different email."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-gray-200 bg-[#F9F9F5] p-4">
      <p className="text-[13px] text-gray-800">
        This email has an account — log in to continue checkout.
      </p>
      <form onSubmit={handleLogin} className="mt-3 space-y-2">
        <input
          type="password"
          autoComplete="current-password"
          className={INPUT}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-[12px] text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={loading || !password}
            className="inline-flex items-center gap-2 rounded-md bg-[#222222] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#000000] disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Log in
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="text-[13px] text-[#222222] hover:underline"
          >
            Use a different email
          </button>
        </div>
      </form>
    </div>
  );
}
