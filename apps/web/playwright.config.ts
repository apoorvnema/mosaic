import { defineConfig, devices } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Each run gets a fresh, empty vault folder; the tests write the files they need.
const vaultDir = process.env.MOSAIC_E2E_VAULT ?? mkdtempSync(join(tmpdir(), 'mosaic-e2e-'));
process.env.MOSAIC_E2E_VAULT = vaultDir;

// Use the machine's preinstalled Chromium when there is one (cloud dev sessions).
const systemChromium = '/opt/pw-browsers/chromium';
const launchOptions =
  existsSync(systemChromium) && !process.env.CI ? { executablePath: systemChromium } : {};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:5173', launchOptions },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'pnpm exec vite',
    url: 'http://localhost:5173',
    env: { MOSAIC_VAULT: vaultDir },
    reuseExistingServer: false,
  },
});
