"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <h2>Something went wrong</h2>
        <p>{error?.digest ? `Error ID: ${error.digest}` : "Please try again."}</p>
      </body>
    </html>
  );
}
