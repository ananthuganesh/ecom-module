"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ProductSlugPage() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    if (params?.slug) router.replace(`/product/${params.slug}`);
  }, [params?.slug, router]);

  return (
    <main className="grid min-h-screen place-items-center bg-white">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Opening product</p>
    </main>
  );
}
