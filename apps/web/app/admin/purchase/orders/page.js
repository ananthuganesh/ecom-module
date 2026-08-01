import { redirect } from "next/navigation";

export default function PurchaseOrdersRedirect() {
  redirect("/admin/purchase");
}
