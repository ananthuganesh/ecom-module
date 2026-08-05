"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";
import { persistAuth } from "@/lib/persistAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const RESEND_COOLDOWN_SEC = 60;
const OTP_LENGTH = 6;

function apiError(err, fallback) {
  const detail = err.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d?.msg).filter(Boolean).join(" ") || fallback;
  }
  return err.response?.data?.message || err.message || fallback;
}

function OtpDigitInputs({
  value,
  onChange,
  disabled,
  idPrefix,
  autoFocus,
}) {
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] || "");
  const refs = useRef([]);

  useEffect(() => {
    if (!autoFocus) return;
    refs.current[0]?.focus();
  }, [autoFocus]);

  const setDigit = (index, digit) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join(""));
  };

  const focusAt = (index) => {
    const el = refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, index))];
    el?.focus();
    el?.select?.();
  };

  const handleChange = (index, raw) => {
    const onlyDigits = String(raw || "").replace(/\D/g, "");
    if (!onlyDigits) {
      setDigit(index, "");
      return;
    }
    // Paste / multi-digit into one box → fill forward
    if (onlyDigits.length > 1) {
      const next = digits.slice();
      onlyDigits
        .slice(0, OTP_LENGTH - index)
        .split("")
        .forEach((d, offset) => {
          next[index + offset] = d;
        });
      onChange(next.join(""));
      focusAt(Math.min(OTP_LENGTH - 1, index + onlyDigits.length));
      return;
    }
    setDigit(index, onlyDigits);
    if (index < OTP_LENGTH - 1) focusAt(index + 1);
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[index]) {
        setDigit(index, "");
        return;
      }
      if (index > 0) {
        setDigit(index - 1, "");
        focusAt(index - 1);
      }
      return;
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusAt(index - 1);
    }
    if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      e.preventDefault();
      focusAt(index + 1);
    }
  };

  const handlePaste = (index, e) => {
    e.preventDefault();
    const pasted = String(e.clipboardData.getData("text") || "")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array.from({ length: OTP_LENGTH }, () => "");
    pasted.split("").forEach((d, i) => {
      next[i] = d;
    });
    onChange(next.join(""));
    focusAt(Math.min(OTP_LENGTH - 1, pasted.length));
  };

  return (
    <div
      className="grid grid-cols-6 gap-2"
      role="group"
      aria-label="6-digit verification code"
    >
      {digits.map((digit, index) => (
        <input
          key={`${idPrefix}-${index}`}
          ref={(el) => {
            refs.current[index] = el;
          }}
          id={index === 0 ? `${idPrefix}-code` : undefined}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={`Digit ${index + 1}`}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={(e) => handlePaste(index, e)}
          onFocus={(e) => e.target.select()}
          className={cn(
            "h-12 w-full rounded-md border border-input bg-transparent text-center text-lg font-semibold tabular-nums shadow-xs outline-none",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        />
      ))}
    </div>
  );
}

/**
 * Shared customer OTP steps (email → 6-digit code).
 */
export default function CustomerOtpForm({
  onSuccess,
  className,
  inputClassName = "h-11",
  buttonClassName = "h-11",
  idPrefix = "otp",
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const setCustomerInfo = useAuthStore((s) => s.setUserInfo);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleSendCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await authService.requestOtp(email.trim().toLowerCase());
      setCode("");
      setStep("otp");
      setCooldown(RESEND_COOLDOWN_SEC);
      toast.success("Code sent — check your email");
    } catch (err) {
      setError(apiError(err, "Could not send code"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    const digits = code.replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (digits.length !== OTP_LENGTH) {
      setError("Enter the 6-digit code");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await authService.verifyOtp(
        email.trim().toLowerCase(),
        digits
      );
      setCustomerInfo(data);
      persistAuth(data);
      toast.success("Signed in");
      onSuccess?.(data);
    } catch (err) {
      setError(apiError(err, "Invalid or expired code"));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    setError("");
    try {
      await authService.requestOtp(email.trim().toLowerCase());
      setCode("");
      setCooldown(RESEND_COOLDOWN_SEC);
      toast.success("New code sent");
    } catch (err) {
      setError(apiError(err, "Could not resend code"));
    } finally {
      setLoading(false);
    }
  };

  const description =
    step === "otp"
      ? `Enter the 6-digit code sent to ${email.trim().toLowerCase()}`
      : "We'll email you a 6-digit code to verify your account.";

  const codeComplete = code.replace(/\D/g, "").length === OTP_LENGTH;

  return (
    <div className={cn("w-full", className)}>
      <p className="mb-5 text-sm text-muted-foreground">{description}</p>

      {step === "email" ? (
        <form onSubmit={handleSendCode}>
          <FieldGroup className="gap-4">
            {error ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-email`}>Email</FieldLabel>
              <Input
                id={`${idPrefix}-email`}
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
              <Button
                type="submit"
                className={cn("w-full", buttonClassName)}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send code"
                )}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode}>
          <FieldGroup className="gap-4">
            {error ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-code`}>Verification code</FieldLabel>
              <OtpDigitInputs
                idPrefix={idPrefix}
                value={code}
                onChange={setCode}
                disabled={loading}
                autoFocus
              />
            </Field>
            <Field>
              <Button
                type="submit"
                className={cn("w-full", buttonClassName)}
                disabled={loading || !codeComplete}
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Verifying…
                  </>
                ) : (
                  "Verify & sign in"
                )}
              </Button>
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button
                type="button"
                className="text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError("");
                }}
                disabled={loading}
              >
                Change email
              </button>
              <button
                type="button"
                className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
                onClick={handleResend}
                disabled={loading || cooldown > 0}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </FieldGroup>
        </form>
      )}
    </div>
  );
}
