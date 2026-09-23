import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded at runtime from node_modules instead of being bundled (native binaries / dynamic requires).
  serverExternalPackages: ["mongodb-memory-server", "mongodb-memory-server-core"],
};

export default nextConfig;
