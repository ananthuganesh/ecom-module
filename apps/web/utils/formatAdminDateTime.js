/** Admin list date+time: `20 Apr at 11:02 am` */
export function formatAdminDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDate();
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  const time = d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\u202f/g, " ")
    .toLowerCase();
  return `${day} ${month} at ${time}`;
}
