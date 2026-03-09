import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'ffmpeg-static',
    'fluent-ffmpeg',
    '@distube/ytdl-core',
    'sharp',
    '@aws-sdk/client-s3',
    '@aws-sdk/client-bedrock-runtime',
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/lib-dynamodb',
    '@aws-sdk/s3-request-presigner',
  ],
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
