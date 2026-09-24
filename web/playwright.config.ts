import { defineConfig } from '@playwright/test';

// Roda contra o servidor de dev (./compose-up). Ver scripts/e2e.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:3002/tools/magfem-web/',
    viewport: { width: 1400, height: 900 },
    screenshot: 'only-on-failure',
    locale: 'pt-BR',
  },
});
