/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/Stock_Analyzer',
  assetPrefix: '/Stock_Analyzer/',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    isrMemoryCacheSize: 0,
  },
  // Disable dynamic features not compatible with static export
  dynamicParams: false,
};

module.exports = nextConfig;
