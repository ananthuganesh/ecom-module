import { NextResponse } from "next/server";

function apexHostFromEnv() {
  const raw = (
    process.env.PUBLIC_WEB_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_WEB_URL ||
    "https://urbanaana.com"
  ).trim();
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(
      /^www\./i,
      ""
    );
  } catch {
    return "urbanaana.com";
  }
}

/** Apex is the Razorpay-approved Live domain; www must not host checkout. */
const APEX_HOST = apexHostFromEnv();
const WWW_HOST = `www.${APEX_HOST}`;

export function middleware(request) {
  /**
   * The app defines no server actions, so a Next-Action header only comes from
   * scanners. Left alone, Next renders the not-found page for them and throws
   * "Invariant: Expected RSC response, got text/plain" with a 500.
   */
  if (request.headers.has("next-action")) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  if (host !== WWW_HOST) {
    return NextResponse.next();
  }

  const target = new URL(request.url);
  target.hostname = APEX_HOST;
  target.protocol = "https:";
  target.port = "";
  return NextResponse.redirect(target, 308);
}

export const config = {
  matcher: "/:path*",
};
