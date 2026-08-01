"use client";

import { Loader2, Lock } from "lucide-react";
import { authService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";
import { persistAuth } from "@/lib/persistAuth";

const INPUT =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-[14px] text-gray-900 placeholder:text-gray-400 focus:border-[#1773b0] focus:outline-none focus:ring-1 focus:ring-[#1773b0]";

/**
 * Post-purchase one-click password setup for passwordless customer records.
 */
export default function CreatePasswordPrompt() {
  const { userInfo, setUserInfo } = useAuthStore();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (!userInfo?.token || userInfo?.hasPassword || done) {
    if (done) {
      return (
        <p className="mt-6 text-[13px] text-emerald-700 font-medium">
          Account created — you can track this order anytime.
        </p>
      );
    }
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await authService.setPassword(password);
      setUserInfo(data);
      persistAuth(data);
      setDone(true);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          err.response?.data?.message ||
          "Could not set password. Try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 rounded-md border border-gray-200 bg-gray-50 p-6 text-left">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white border border-gray-200">
          <Lock className="h-4 w-4 text-gray-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-gray-900">
            Create a password to track your order
          </h2>
          <p className="mt-1 text-[13px] text-gray-500">
            Your order is saved to{" "}
            <span className="font-medium text-gray-700">{userInfo.email}</span>.
            Set a password to view order status anytime.
          </p>
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col sm:flex-row gap-2">
            <input
              type="password"
              autoComplete="new-password"
              className={INPUT}
              placeholder="Choose a password (min. 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading || password.length < 6}
              className="shrink-0 inline-flex items-center justify-center gap-2 rounded-md bg-[#1773b0] px-5 py-3 text-[13px] font-semibold text-white hover:bg-[#0e5a8c] disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Save password
            </button>
          </form>
          {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
