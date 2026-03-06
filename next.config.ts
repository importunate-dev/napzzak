import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['ffmpeg-static', 'fluent-ffmpeg', '@distube/ytdl-core', 'sharp'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.s3.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: '*.s3.us-east-1.amazonaws.com',
      },
    ],
  },
};

export default nextConfig;
