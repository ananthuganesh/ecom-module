"use client";

import { useState } from "react";
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
import CustomerOtpForm from "@/components/auth/CustomerOtpForm";

/**
 * shadcn login-02 form body — admin password (customer OTP kept for reuse).
 */
export function LoginForm({ className, mode = "customer", ...props }) {
  const isAdmin = mode === "admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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

  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await authService.adminLogin(
        email.trim().toLowerCase(),
        password
      );
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
    } catch (err) {
      setError(userErrorMessage(err, "Invalid email or password"));
    } finally {
      setLoading(false);
    }
  };

  const inputClassName = isAdmin ? "h-9" : "h-8";

  return (
    <div className={cn("flex flex-col gap-1", className)} {...props}>
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-bold">
          {isAdmin ? "Welcome back" : "Login to your account"}
        </h1>
      </div>
      {isAdmin ? (
        <p className="mb-5 text-center text-sm text-muted-foreground">Sign in to your admin account to continue.</p>
      ) : null}
      <div>
          {isAdmin ? (
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
