import { redirect } from "next/navigation";

export default async function ShopRedirect({ searchParams }) {
  const params = await searchParams;
  const q = new URLSearchParams(
    Object.entries(params || {}).flatMap(([key, value]) =>
      Array.isArray(value) ? value.map((v) => [key, v]) : [[key, value]]
    )
  ).toString();
  redirect(q ? `/all-products?${q}` : "/all-products");
}
