/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://api:3001/api/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
