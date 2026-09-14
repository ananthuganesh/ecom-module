"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authService } from "@/api";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { persistAdminAuth } from "@/lib/persistAuth";
import { userErrorMessage } from "@/lib/userMessage";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import BrandLogo from "@/components/BrandLogo";
import CustomerOtpForm, { OtpDigitInputs } from "@/components/auth/CustomerOtpForm";

const ADMIN_OTP_LENGTH = 6;
const ADMIN_RESEND_COOLDOWN_SEC = 60;

/**
 * shadcn login-02 form body — admin password (customer OTP kept for reuse).
 */
export function LoginForm({ className, mode = "customer", ...props }) {
  const isAdmin = mode === "admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Password accepted → { challenge, email } while the emailed OTP is pending.
  const [otpStep, setOtpStep] = useState(null);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const setAdminInfo = useAdminAuthStore((s) => s.setUserInfo);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  const safeRedirect = () => {
    const path =
      redirectTo &&
      typeof redirectTo === "string" &&
      redirectTo.startsWith("/") &&
      !redirectTo.startsWith("//")
        ? redirectTo
        : "/";
    router.push(path);
  };

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const completeAdminSignIn = (data) => {
    const profile = {
        _id: data._id,
        name: data.name,
        email: data.email,
        isAdmin: data.isAdmin,
        roleId: data.roleId || null,
      };
    setAdminInfo(profile);
    persistAdminAuth(profile);
    toast.success("Signed in");
    router.push("/admin/dashboard");
  };

  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await authService.adminLogin(
        email.trim().toLowerCase(),
        password
      );
      if (data?.otpRequired) {
        setOtpStep({ challenge: data.challenge, email: data.email });
        setPassword("");
        setCode("");
        setCooldown(ADMIN_RESEND_COOLDOWN_SEC);
        return;
      }
      completeAdminSignIn(data);
    } catch (err) {
      setError(userErrorMessage(err, "Invalid email or password"));
    } finally {
      setLoading(false);
    }
  };

  const restartAdminLogin = (message = "") => {
    setOtpStep(null);
    setCode("");
    setError(message);
  };

  const handleAdminVerify = async (e) => {
    e.preventDefault();
    const digits = code.replace(/\D/g, "").slice(0, ADMIN_OTP_LENGTH);
    if (digits.length !== ADMIN_OTP_LENGTH) {
      setError("Enter the 6-digit OTP");
      return;
    }
    setLoading(true);
    setError("");
    try {
      completeAdminSignIn(await authService.adminVerifyOtp(otpStep.challenge, digits));
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) {
        restartAdminLogin(userErrorMessage(err, "Your sign-in expired. Enter your password again."));
      } else if (status === 429) {
        restartAdminLogin("Too many incorrect codes. Enter your password again.");
      } else {
        setError(userErrorMessage(err, "That OTP is invalid or has expired."));
        setCode("");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAdminResend = async () => {
    if (cooldown > 0 || loading || !otpStep) return;
    setLoading(true);
    setError("");
    try {
      await authService.adminResendOtp(otpStep.challenge);
      setCode("");
      setCooldown(ADMIN_RESEND_COOLDOWN_SEC);
      toast.success("New OTP sent");
    } catch (err) {
      if (err?.response?.status === 401) {
        restartAdminLogin("Your sign-in expired. Enter your password again.");
      } else {
        setError(userErrorMessage(err, "We couldn’t send a new OTP. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  };

  // Same input style as the customer login page.
  const inputClassName = "h-9 border-gray-300 focus-visible:border-gray-400";

  return (
    <div className={cn("flex flex-col gap-1", className)} {...props}>
      <div className="flex flex-col items-center gap-1 text-center">
        {isAdmin ? <BrandLogo href={null} height={36} priority className="mb-4" /> : null}
        <h1 className="text-2xl font-bold">
          {isAdmin && otpStep ? "Check your email" : isAdmin ? "Welcome back" : "Login to your account"}
        </h1>
      </div>
      {isAdmin ? (
        <p className="mb-5 text-center text-sm text-muted-foreground">
          {otpStep
            ? `Enter the 6-digit OTP sent to ${otpStep.email || "your email"}.`
            : "Sign in to your admin account to continue."}
        </p>
      ) : null}
      <div>
          {isAdmin && otpStep ? (
            <form onSubmit={handleAdminVerify}>
              <FieldGroup className="gap-5">
                {error ? (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {error}
                  </p>
                ) : null}
                <Field>
                  <FieldLabel htmlFor="admin-otp-code">OTP</FieldLabel>
                  <OtpDigitInputs
                    idPrefix="admin-otp"
                    value={code}
                    onChange={setCode}
                    disabled={loading}
                    autoFocus
                  />
                </Field>
                <Field>
                  <Button
                    type="submit"
                    className="h-9"
                    disabled={loading || code.replace(/\D/g, "").length !== ADMIN_OTP_LENGTH}
                  >
                    {loading ? <Loader2 className="animate-spin" /> : null}
                    Verify & sign in
                  </Button>
                </Field>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <button
                    type="button"
                    className="text-muted-foreground underline-offset-4 hover:underline"
                    onClick={() => restartAdminLogin()}
                    disabled={loading}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
                    onClick={handleAdminResend}
                    disabled={loading || cooldown > 0}
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
                  </button>
                </div>
              </FieldGroup>
            </form>
          ) : isAdmin ? (
            <form onSubmit={handleAdminSubmit}>
              <FieldGroup className="gap-5">
                {error ? (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {error}
                  </p>
                ) : null}
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    className={inputClassName}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className={inputClassName}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                </Field>
                <Field>
                  <Button type="submit" className="h-9" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Login
                      </>
                    ) : (
                      "Login"
                    )}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          ) : (
            <CustomerOtpForm
              idPrefix="card-otp"
              inputClassName={inputClassName}
              buttonClassName="h-8"
              onSuccess={safeRedirect}
            />
          )}
      </div>
    </div>
  );
}
