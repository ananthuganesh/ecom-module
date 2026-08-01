import { redirect } from "next/navigation";

export default async function AccountRedirect({ searchParams }) {
  const params = await searchParams;
  const tab = params?.tab;
  if (tab) redirect(`/profile?tab=${encodeURIComponent(String(tab))}`);
  redirect("/profile");
}
