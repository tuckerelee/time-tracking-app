import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@react-pdf/renderer", "exceljs"],
  poweredByHeader: false,
};

export default nextConfig;
