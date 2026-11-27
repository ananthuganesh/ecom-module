import Link from "next/link";

const LINK = "font-medium text-gray-900 underline underline-offset-4 hover:text-brand-red";

/** Consent line shown under every sign-in form. */
export default function LoginLegalNote({ className = "" }) {
  return (
    <p className={`text-center text-[12px] leading-5 text-gray-500 ${className}`}>
      By continuing, you agree to our{" "}
      <Link href="/privacy-policy" className={LINK}>
        Privacy Policy
      </Link>{" "}
      and{" "}
      <Link href="/terms-and-conditions" className={LINK}>
        Terms of Service
      </Link>
      .
    </p>
  );
}
