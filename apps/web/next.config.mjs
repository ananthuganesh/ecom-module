import path from 'path';
import { fileURLToPath } from 'url';

/** @type {import('next').NextConfig} */
const nextConfig = {
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
    root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
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
