import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The collector at the repo root has its own package-lock; tell Turbopack this app is the root.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
