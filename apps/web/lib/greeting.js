/** "Good morning" before noon, "Good afternoon" until 5 pm, "Good evening" after. */
export function greetingForHour(hour) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Full name to greet a staff member by, from their admin profile. */
export function greetingName(profile) {
  const full = String(profile?.name || "").trim();
  if (full) return full.replace(/\s+/g, " ");
  const parts = [profile?.firstName, profile?.lastName].map((v) => String(v || "").trim()).filter(Boolean);
  if (parts.length) return parts.join(" ");
  const email = String(profile?.email || "").trim();
  return email ? email.split("@")[0] : "";
}

/** e.g. "Good afternoon, Urban Aana" — or just the greeting when there is no name. */
export function greeting(profile, date = new Date()) {
  const name = greetingName(profile);
  const hello = greetingForHour(date.getHours());
  return name ? `${hello}, ${name}` : hello;
}
