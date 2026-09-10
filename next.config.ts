import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Энэ project-ийг file tracing-ийн үндэс болгоно (дээд түвшний lockfile-аас хамаарахгүй)
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ['@electric-sql/pglite', 'pg', 'bcryptjs'],
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
