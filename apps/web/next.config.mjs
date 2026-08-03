import path from 'path';
import { fileURLToPath } from 'url';
import { withSentryConfig } from '@sentry/nextjs';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, '../..');
// Docker builds copy only apps/web → keep tracing inside /app (flat standalone/server.js).
// Local monorepo keeps the repo root so Turbopack/file tracing sees the workspace.
const tracingRoot = process.env.DOCKER_BUILD === '1' ? appDir : repoRoot;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Minimal runtime image for low-RAM Docker hosts (2c / 4GB)
  output: 'standalone',
  outputFileTracingRoot: tracingRoot,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.urbanaana.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.r2.dev',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.cloudflarestorage.com',
        pathname: '/**',
      },
      // Dynamic backend host from environment variable
      ...(process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.startsWith('http') ? [{
        protocol: process.env.NEXT_PUBLIC_API_URL.startsWith('https') ? 'https' : 'http',
        hostname: new URL(process.env.NEXT_PUBLIC_API_URL).hostname,
        pathname: '/**',
      }] : []),
      ...(process.env.NEXT_PUBLIC_R2_PUBLIC_URL && process.env.NEXT_PUBLIC_R2_PUBLIC_URL.startsWith('http') ? [{
        protocol: 'https',
        hostname: new URL(process.env.NEXT_PUBLIC_R2_PUBLIC_URL).hostname,
        pathname: '/**',
      }] : []),
    ],
  },
  experimental: {
    // Dev/proxy rewrites default to 10MB — reels allow up to 200MB videos.
    proxyClientMaxBodySize: "210mb",
    serverActions: {
      // Use ALLOWED_ORIGINS from env, fallback to a safe default
      allowedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : ["localhost:3000", "localhost:4000"],
      bodySizeLimit: "210mb",
    },
  },
  turbopack: {
    root: tracingRoot,
  },
  async redirects() {
    return [
      { source: "/admin", destination: "/admin/login", permanent: false },
      // Deleted settings / wallet / payment UI
      { source: "/admin/wallet", destination: "/admin/settings/general", permanent: false },
      { source: "/admin/settings/payments", destination: "/admin/settings/general", permanent: false },
      { source: "/admin/settings/taxes", destination: "/admin/settings/general", permanent: false },
      { source: "/admin/settings/warehouses", destination: "/admin/settings/general", permanent: false },
      { source: "/admin/settings/roles", destination: "/admin/settings/users", permanent: false },
      { source: "/admin/integrations/gtm", destination: "/admin/analytics", permanent: false },
      { source: "/admin/integrations/razorpay", destination: "/admin/settings/general", permanent: false },
      { source: "/admin/settings/integrations/gtm", destination: "/admin/analytics", permanent: false },
      { source: "/admin/settings/integrations/ga4", destination: "/admin/analytics", permanent: false },
      { source: "/admin/settings/integrations/razorpay", destination: "/admin/settings/general", permanent: false },
      // Legacy path stubs (formerly redirect-only pages)
      { source: "/admin/brands", destination: "/admin/products", permanent: false },
      { source: "/admin/coupons", destination: "/admin/discounts", permanent: false },
      { source: "/admin/inventory", destination: "/admin/products/inventory", permanent: false },
      { source: "/admin/warehouses", destination: "/admin/settings/general", permanent: false },
      { source: "/admin/content/ai-media", destination: "/admin/content", permanent: false },
      { source: "/admin/content/ai-studio", destination: "/admin/content", permanent: false },
      { source: "/admin/reels", destination: "/admin/content/reels", permanent: false },
      { source: "/admin/reels/:path*", destination: "/admin/content/reels", permanent: false },
      { source: "/admin/integrations/aisensy", destination: "/admin/settings/integrations/aisensy", permanent: false },
      { source: "/admin/sales/invoices", destination: "/admin/orders", permanent: false },
      { source: "/admin/sales/returns", destination: "/admin/orders", permanent: false },
      { source: "/admin/sales/credit-notes", destination: "/admin/orders", permanent: false },
      { source: "/admin/settings", destination: "/admin/settings/general", permanent: false },
      { source: "/admin/settings/store-details", destination: "/admin/settings/general", permanent: false },
      { source: "/admin/users", destination: "/admin/customers", permanent: false },
      { source: "/admin/content/library", destination: "/admin/content", permanent: false },
      { source: "/admin/purchase", destination: "/admin/products/inventory", permanent: false },
      { source: "/admin/purchase/:path*", destination: "/admin/products/inventory", permanent: false },
      { source: "/admin/marketing", destination: "/admin/settings/integrations/aisensy", permanent: false },
      { source: "/admin/marketing/:path*", destination: "/admin/settings/integrations/aisensy", permanent: false },
      { source: "/admin/settings/user-roles", destination: "/admin/settings/users", permanent: false },
      { source: "/admin/settings/staff/admins", destination: "/admin/settings/users", permanent: false },
      { source: "/admin/settings/staff/managers", destination: "/admin/settings/users", permanent: false },
      { source: "/admin/settings/staff/permissions", destination: "/admin/settings/users", permanent: false },
      { source: "/admin/settings/integrations/openrouter", destination: "/admin/content", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), accelerometer=(self \"https://api.razorpay.com\" \"https://checkout.razorpay.com\"), gyroscope=(self \"https://api.razorpay.com\" \"https://checkout.razorpay.com\"), payment=(self \"https://api.razorpay.com\" \"https://checkout.razorpay.com\")",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "img-src 'self' data: blob: https:",
              "media-src 'self' blob: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Razorpay; GTM; Meta Pixel (+ optional clientParamBuilder); Cloudflare
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://connect.facebook.net https://capi-automation.s3.us-east-2.amazonaws.com https://checkout.razorpay.com https://cdn.razorpay.com https://static.cloudflareinsights.com",
              "connect-src 'self' https: blob: http://127.0.0.1:* http://localhost:*",
              "frame-src https://api.razorpay.com https://checkout.razorpay.com https://cdn.razorpay.com https://www.googletagmanager.com https://www.facebook.com https://web.facebook.com",
            ].join("; "),
          },
        ],
      },
    ];
  },
  async rewrites() {
    const apiBase = (process.env.INTERNAL_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${apiBase}/uploads/:path*`,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload a wider set of client source files for better stack traces
  widenClientFileUpload: true,

  // Tunnel can 404 under Turbopack/dev; send straight to Sentry ingest instead.
  // Re-enable with tunnelRoute: "/monitoring" after a production build if needed.
  silent: !process.env.CI,
});
