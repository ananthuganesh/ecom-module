"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { persistAuth, persistAdminAuth } from "@/lib/persistAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import BrandLogo from "@/components/BrandLogo";

/**
 * shadcn login-01 UI, wired for storefront or admin auth.
 */
export function LoginForm({ className, mode = "customer", ...props }) {
  const isAdmin = mode === "admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const setCustomerInfo = useAuthStore((s) => s.setUserInfo);
  const setAdminInfo = useAdminAuthStore((s) => s.setUserInfo);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (isAdmin) {
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
        return;
      }

      const data = await authService.login(
        email.trim().toLowerCase(),
        password
      );
      setCustomerInfo(data);
      persistAuth(data);
      const path =
        redirectTo &&
        typeof redirectTo === "string" &&
        redirectTo.startsWith("/") &&
        !redirectTo.startsWith("//")
          ? redirectTo
          : "/";
      router.push(path);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          err.response?.data?.message ||
          err.message ||
          "Invalid email or password"
      );
    } finally {
      setLoading(false);
    }
  };

  const inputClassName = isAdmin
    ? "h-9 border-0 !bg-zinc-100 text-foreground shadow-none focus-visible:border-0 focus-visible:ring-0"
    : "h-8";

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card
        className={cn(
          "min-h-[28rem] justify-center py-8",
          isAdmin &&
            "bg-white ring-1 ring-zinc-200 shadow-md shadow-zinc-200/60"
        )}
      >
        <CardHeader className="justify-items-center text-center">
          <BrandLogo
            href={null}
            height={36}
            priority
            className="mb-2"
          />
          <CardTitle className={isAdmin ? "text-2xl font-semibold tracking-tight" : undefined}>
            {isAdmin ? "Welcome to UA Admin" : "Login to your account"}
          </CardTitle>
          <CardDescription>
            {isAdmin
              ? "Sign in to admin."
              : "Enter your email below to login to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <form onSubmit={handleSubmit}>
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
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <a
                    href="#"
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                    onClick={(e) => e.preventDefault()}
                  >
                    Forgot your password?
                  </a>
                </div>
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
                <Button type="submit" className={isAdmin ? "h-9" : "h-8"} disabled={loading}>
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
        </CardContent>
        <CardFooter className="justify-center pt-4">
          <p className="text-center text-xs text-muted-foreground">
            Custom Shopify Solution by{" "}
            <a
              href="https://bridnetwork.in"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline"
            >
              Brid Network
            </a>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
