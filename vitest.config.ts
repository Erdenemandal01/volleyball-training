import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    // Playwright-ийн e2e файлуудыг оруулахгүй
    include: ['tests/**/*.test.ts'],
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // Файл бүр өөрийн in-memory PostgreSQL-тэй байхын тулд тусад нь ажиллана
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
