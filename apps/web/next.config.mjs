/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@shedit/engine', '@shedit/shared'],
  reactStrictMode: true,
};

export default nextConfig;
