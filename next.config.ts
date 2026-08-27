import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['imapflow', 'mailparser', '@react-pdf/renderer'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
}

export default nextConfig
