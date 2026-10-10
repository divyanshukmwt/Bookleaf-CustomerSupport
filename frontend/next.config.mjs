
const backend = process.env.BACKEND_URL || 'http://localhost:4000';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`,
      },
      {
        source: '/socket.io',
        destination: `${backend}/socket.io/`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${backend}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
