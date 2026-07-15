/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@cos/shared'],
  webpack(config) {
    // Resolve ESM-correct ".js" import specifiers in TS-source workspace packages
    // (e.g. @cos/shared's `export * from './enums.js'`) to their .ts sources.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
