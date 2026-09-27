import { defineConfig, devices } from "@playwright/test";

/**
 * Two projects:
 *  - "unit": pure-function specs (tests/unit) — no browser, run in Node.
 *  - "chromium": browser E2E (tests/e2e) against the Vite dev server.
 *
 * The browser reaches the dev server as http://app.lofin.test:5199 — Chromium's
 * host-resolver maps *.lofin.test to 127.0.0.1 — so the app sees a real, non-localhost
 * hostname and applies production gating (sign-in locks, Turnstile QA refusal, …)
 * instead of its localhost developer escape hatch. Every non-app request is blocked
 * and the Worker API is mocked per test (tests/e2e/fixtures.ts), so runs are hermetic.
 */
const PORT = 5199;

export default defineConfig({
  timeout: 30_000,
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://app.lofin.test:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "unit", testDir: "tests/unit" },
    {
      name: "chromium",
      testDir: "tests/e2e",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        viewport: { width: 1280, height: 800 },
        launchOptions: {
          args: [
            "--host-resolver-rules=MAP *.lofin.test 127.0.0.1",
            // Production is HTTPS; give the test origin the same secure-context APIs
            // (crypto.randomUUID, clipboard, …) without needing a TLS dev server.
            `--unsafely-treat-insecure-origin-as-secure=http://app.lofin.test:${PORT}`,
          ],
        },
      },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    env: { LOFIN_E2E: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
