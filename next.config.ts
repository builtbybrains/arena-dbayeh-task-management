import type { NextConfig } from "next";

// Static export: the app is plain HTML/JS served from Cloudflare's free plan.
// Shared data goes through the tiny sync API in worker/ (see README).
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
