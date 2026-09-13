import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 2,
  timeout: 30000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:4186", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4186/tests/browser.html",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "android-emulation", use: { ...devices["Pixel 7"] } },
    { name: "ios-emulation", use: { ...devices["iPhone 13"] } },
  ],
});
