import { NextResponse } from "next/server";

/** Apex is the Razorpay-approved Live domain; www must not host checkout. */
const APEX_HOST = "urbanaana.com";
const WWW_HOST = `www.${APEX_HOST}`;

export function middleware(request) {
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
