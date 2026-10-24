/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Desktop (Tauri) build: static files in out/ that src-tauri bundles
  ...(process.env.DESKTOP_EXPORT === '1' ? { output: 'export', images: { unoptimized: true } } : {}),
};

module.exports = nextConfig;
