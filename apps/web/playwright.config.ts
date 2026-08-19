import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const API = 'http://127.0.0.1:3100';
const WEB = 'http://127.0.0.1:5174';
const root = resolve(import.meta.dirname, '../..');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: WEB,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'pnpm --filter @openbahia/api exec tsx src/server.ts',
      cwd: root,
      url: `${API}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        TRANSIT_PROVIDER: 'mock',
        PORT: '3100',
        HOST: '127.0.0.1',
        PUBLIC_API_URL: API,
        DEBUG_ENDPOINTS: 'false',
        STATIC_CACHE_DIR: join(tmpdir(), 'openbahia-e2e-static'),
      },
    },
    {
      command: 'pnpm --filter @openbahia/web exec vite dev --port 5174 --host 127.0.0.1',
      cwd: root,
      url: WEB,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        PUBLIC_API_URL: API,
      },
    },
  ],
  projects: process.env.CI
    ? [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
      ]
    : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
