import { redirect } from "next/navigation";

export default function ManagersPage() {
    redirect("/admin/settings/users");
}
