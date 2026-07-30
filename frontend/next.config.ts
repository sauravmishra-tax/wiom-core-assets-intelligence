import type { NextConfig } from "next";

// The browser only ever calls same-origin /api/*; Next.js proxies that
// server-side to the FastAPI backend. This avoids CORS entirely and means
// the browser never needs to reach the backend's host/port directly.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8123";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
