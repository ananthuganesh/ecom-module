import { redirect } from "next/navigation";

/** Security page removed (OTP-only sign-in). Keep route as redirect for old links. */
export default function SecurityRedirect() {
  redirect("/account");
}
