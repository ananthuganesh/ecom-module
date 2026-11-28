"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "@/components/icons";
import { authService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";
import { persistAuth } from "@/lib/persistAuth";
import { userErrorMessage } from "@/lib/userMessage";
import { cn } from "@/lib/utils";
import { formatWait, retryAfterSeconds } from "@/lib/rateLimitWait";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const RESEND_COOLDOWN_SEC = 60;
const OTP_LENGTH = 6;

/** Problems with the typed email belong under the field, not in the form banner. */
function isEmailProblem(err) {
  const status = err?.response?.status;
  return status === 400 || status === 422;
}

/** Calm "please wait" banner: a pause, not a mistake. */
function WaitNotice({ children }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      {children}
    </div>
  );
}

export function OtpDigitInputs({
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
            // One light outline when active (no extra ring around the border).
            "transition-colors focus-visible:border-gray-400",
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
  // Verify a known address (checkout) instead of asking for one.
  fixedEmail = "",
}) {
  const [email, setEmail] = useState(fixedEmail);
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  // Rate limited until this time (ms). Drives the countdown and disables Send / Verify.
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [cooldown, setCooldown] = useState(0);
  // Inline "New code sent" after Resend (no toast on the storefront).
  const [resent, setResent] = useState(false);
  const setCustomerInfo = useAuthStore((s) => s.setUserInfo);

  useEffect(() => {
    if (!resent) return;
    const t = setTimeout(() => setResent(false), 4000);
    return () => clearTimeout(t);
  }, [resent]);

  useEffect(() => {
    if (waitUntil <= Date.now()) return undefined;
    const t = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (tick >= waitUntil) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [waitUntil]);

  const waitLeft = Math.max(0, Math.ceil((waitUntil - now) / 1000));
  const startWait = (seconds) => {
    const at = Date.now();
    setNow(at);
    setWaitUntil(at + seconds * 1000);
  };

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleSendCode = async (e) => {
    e.preventDefault();
    if (waitLeft > 0) return;
    setLoading(true);
    setError("");
    setEmailError("");
    try {
      await authService.requestOtp(email.trim().toLowerCase());
      setCode("");
      setStep("otp");
      setCooldown(RESEND_COOLDOWN_SEC);
      setResent(false);
    } catch (err) {
      const wait = retryAfterSeconds(err);
      if (wait) {
        startWait(wait);
      } else if (isEmailProblem(err) && !fixedEmail) {
        setEmailError(userErrorMessage(err, "Enter a valid email address."));
      } else {
        setError(userErrorMessage(err, "We couldn’t send a code. Please try again."));
      }
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
    if (waitLeft > 0) return;
    setLoading(true);
    setError("");
    try {
      const data = await authService.verifyOtp(
        email.trim().toLowerCase(),
        digits
      );
      setCustomerInfo(data);
      persistAuth(data);
      // The sheet closing / checkout moving on is the confirmation.
      onSuccess?.(data);
    } catch (err) {
      const wait = retryAfterSeconds(err);
      if (wait) startWait(wait);
      else setError(userErrorMessage(err, "That code is invalid or has expired."));
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
      setResent(true);
    } catch (err) {
      const wait = retryAfterSeconds(err);
      if (wait) {
        // The code already sent still works; Resend just waits for the window.
        setCooldown(wait);
      } else {
        setError(userErrorMessage(err, "We couldn’t send a new code. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  };

  const sentTo = email.trim().toLowerCase();
  const description =
    step === "otp" ? (
      <>
        We sent a 6-digit code to{" "}
        <span className="font-medium text-foreground break-all">{sentTo}</span>. Check your inbox
        (and spam).
      </>
    ) : fixedEmail
        ? `We'll email a 6-digit code to ${fixedEmail} to confirm it's you.`
        : "Enter your email below to login to your account";

  const codeComplete = code.replace(/\D/g, "").length === OTP_LENGTH;

  return (
    <div className={cn("w-full", className)}>
      <p className="mb-5 text-sm text-muted-foreground" aria-live="polite">
        {description}
      </p>

      {step === "email" ? (
        <form onSubmit={handleSendCode}>
          <FieldGroup className="gap-4">
            {waitLeft > 0 ? (
              <WaitNotice>
                Too many code requests. Try again in{" "}
                <span className="font-semibold tabular-nums">{formatWait(waitLeft)}</span>
                {email.trim() ? (
                  <>
                    , or{" "}
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-4"
                      onClick={() => {
                        setStep("otp");
                        setCode("");
                        setError("");
                      }}
                    >
                      enter the code we already emailed you
                    </button>
                  </>
                ) : null}
                .
              </WaitNotice>
            ) : null}
            {error ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            {fixedEmail ? null : (
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-email`}>Email</FieldLabel>
                <Input
                  id={`${idPrefix}-email`}
                  type="email"
                  autoComplete="email"
                  required
                  className={inputClassName}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError("");
                  }}
                  disabled={loading}
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? `${idPrefix}-email-error` : undefined}
                />
                {emailError ? (
                  <p id={`${idPrefix}-email-error`} className="text-[13px] text-destructive">
                    {emailError}
                  </p>
                ) : null}
              </Field>
            )}
            <Field>
              <Button
                type="submit"
                className={cn("w-full", buttonClassName)}
                disabled={loading || waitLeft > 0}
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Sending…
                  </>
                ) : waitLeft > 0 ? (
                  `Try again in ${formatWait(waitLeft)}`
                ) : (
                  fixedEmail ? "Email me a code" : "Send OTP"
                )}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode}>
          <FieldGroup className="gap-4">
            {waitLeft > 0 ? (
              <WaitNotice>
                Too many attempts. Try again in{" "}
                <span className="font-semibold tabular-nums">{formatWait(waitLeft)}</span>.
              </WaitNotice>
            ) : null}
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
                disabled={loading || !codeComplete || waitLeft > 0}
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Verifying…
                  </>
                ) : (
                  fixedEmail ? "Verify & continue" : "Verify & sign in"
                )}
              </Button>
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              {fixedEmail ? (
                <span />
              ) : (
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
              )}
              <span className="flex items-center gap-2">
                <span role="status" aria-live="polite" className="text-emerald-700">
                  {resent ? "New code sent" : ""}
                </span>
                <button
                  type="button"
                  className="text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
                  onClick={handleResend}
                  disabled={loading || cooldown > 0}
                >
                  {cooldown > 0 ? `Resend in ${formatWait(cooldown)}` : "Resend code"}
                </button>
              </span>
            </div>
          </FieldGroup>
        </form>
      )}
    </div>
  );
}
