import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./interface",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  outputDir: "/tmp/iga-phase1-test-results",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4175",
    browserName: "chromium",
    launchOptions: {
      executablePath: process.env["CHROMIUM_PATH"] || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "../node_modules/.bin/vite --config interface/vite.config.ts",
    port: 4175,
    reuseExistingServer: false,
  },
});
