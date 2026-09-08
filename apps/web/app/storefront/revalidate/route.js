import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getInternalApiBase } from "@/lib/siteUrl";

/**
 * Bust storefront ISR cache after admin edits (products, hero banners).
 * Auth: forwards cookies to FastAPI admin profile.
 */
export async function POST(request) {
  const cookie = request.headers.get("cookie") || "";
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const base = getInternalApiBase();
    const authRes = await fetch(`${base}/api/users/admin/profile`, {
      headers: {
        Accept: "application/json",
        Cookie: cookie,
      },
      cache: "no-store",
    });
    if (!authRes.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch (err) {
    console.error("storefront revalidate auth failed", err);
    return NextResponse.json({ error: "Auth check failed" }, { status: 502 });
  }

  revalidateTag("store-catalog");
  revalidateTag("store-filters");
  // Hero banners edited under Store Theme.
  revalidateTag("store-theme");
  revalidatePath("/");
  revalidatePath("/all-products");
  revalidatePath("/category", "layout");

  return NextResponse.json({ revalidated: true, at: Date.now() });
}
