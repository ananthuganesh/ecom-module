import path from 'path';
import { fileURLToPath } from 'url';

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
    serverActions: {
      // Use ALLOWED_ORIGINS from env, fallback to a safe default
      allowedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : ["localhost:3000", "localhost:4000"],
    },
  },
  turbopack: {
    root: tracingRoot,
  },
  async redirects() {
    return [
      {
        source: "/admin",
        destination: "/admin/login",
        permanent: false,
      },
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
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://checkout.razorpay.com",
              "connect-src 'self' https: http://127.0.0.1:* http://localhost:*",
              "frame-src https://api.razorpay.com https://checkout.razorpay.com https://www.googletagmanager.com",
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

export default nextConfig;
