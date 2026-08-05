/** @type {import('next').NextConfig} */
const nextConfig = {
  // Zeops/stok gibi büyük importlar 30sn'yi aşabiliyor; proxy kesilmesin
  experimental: {
    proxyTimeout: 5 * 60 * 1000,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: (process.env.BACKEND_URL || "http://localhost:3052") + "/api/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://arconai.net https://prim.fly-work.com",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;