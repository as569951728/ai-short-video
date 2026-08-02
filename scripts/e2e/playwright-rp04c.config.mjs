export default {
  testDir: '../../tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: process.env.RP04C_PLAYWRIGHT_OUTPUT_DIR ?? 'output/playwright/rp-04c/latest',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    browserName: 'chromium',
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 20_000
  },
  projects: [{ name: 'chromium-rp04c-fixed-1.56.1' }]
};
