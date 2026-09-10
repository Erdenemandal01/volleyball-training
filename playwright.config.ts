import { defineConfig, devices } from '@playwright/test'

/**
 * E2E тестүүд нь demo seed-тэй ХӨГЖҮҮЛЭЛТИЙН өгөгдлийн сангийн эсрэг ажиллана.
 * Production өгөгдлийн сан руу ХЭЗЭЭ Ч чиглүүлж болохгүй — тест өгөгдөл өөрчилнө.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'mn-MN',
    timezoneId: 'Asia/Ulaanbaatar',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000/login',
        reuseExistingServer: true,
        timeout: 120_000,
      },
})
