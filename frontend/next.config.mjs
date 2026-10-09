// Single-origin setup: the browser only ever talks to this Next.js server. /api and /socket.io are
// proxied to the Express backend, so the HTTP-only session cookie is first-party and Socket.IO
// needs no CORS. BACKEND_URL is read at build time (it is baked into the rewrite rules).
const backend = process.env.BACKEND_URL || 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,

async rewrites() {
  return [
    { source: '/api/:path*', destination: `${backend}/api/:path*` },

    // Normalize requests that arrive without the trailing slash.
    { source: '/socket.io', destination: `${backend}/socket.io/` },

    // Proxy Socket.IO polling and WebSocket upgrade requests.
    { source: '/socket.io/:path*', destination: `${backend}/socket.io/:path*` },
  ];
},

};

export default nextConfig;
