import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@react-pdf/renderer", "exceljs"],
  poweredByHeader: false,
  // Migrations are read from disk at startup; make sure serverless bundles include them.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
};

export default nextConfig;
