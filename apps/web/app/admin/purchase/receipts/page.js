import { redirect } from "next/navigation";

export default function PurchaseReceiptsRedirect() {
  redirect("/admin/purchase");
}
