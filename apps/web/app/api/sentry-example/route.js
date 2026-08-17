import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

/** Temporary server-side verification route for Sentry. Disabled in production. */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Uncaught-style path: capture + rethrow so request error hooks also fire.
  const err = new Error("Sentry Next.js server test error — delete me");
  Sentry.captureException(err);
  await Sentry.flush(2000);
  throw err;
}
