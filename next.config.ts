import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Skip static optimization for API routes that use native modules
  serverExternalPackages: ['better-sqlite3'],
  // Skip TypeScript type checking during build if SKIP_TYPE_CHECK is set
  // This can help with memory-constrained environments
  typescript: {
    ignoreBuildErrors: process.env.SKIP_TYPE_CHECK === 'true',
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark better-sqlite3 as external to avoid bundling issues
      config.externals = config.externals || [];
      config.externals.push('better-sqlite3');
    }
    return config;
  },
};

export default nextConfig;
