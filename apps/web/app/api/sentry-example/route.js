import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

/** Temporary server-side verification route for Sentry. */
export async function GET() {
  // Uncaught-style path: capture + rethrow so request error hooks also fire.
  const err = new Error("Sentry Next.js server test error — delete me");
  Sentry.captureException(err);
  await Sentry.flush(2000);
  throw err;
}
