import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native (.node) addon; keep it external so Next doesn't
  // try to bundle it into the server build.
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
