import { redirect } from "next/navigation";

export default function LegacyAiProviderSettingsRedirect() {
  redirect("/admin/content/ai-studio");
}
