import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['imapflow', 'mailparser'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
}

export default nextConfig
