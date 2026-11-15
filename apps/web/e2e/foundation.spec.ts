import { expect, test } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const vault = process.env.MOSAIC_E2E_VAULT!;

test.beforeAll(async () => {
  await mkdir(join(vault, 'Inbox'), { recursive: true });
  await writeFile(join(vault, 'Inbox', 'Welcome.md'), '# Welcome\n');
});

test('the shell starts against a local folder and every adapter works in a real browser', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Foundation' })).toBeVisible();

  // File system: the dev-folder bridge lists what is on disk.
  await expect(page.locator('[data-path="Inbox/Welcome.md"]')).toBeVisible();

  // Database: wa-sqlite over OPFS, with FTS5 — the part that cannot be unit-tested in node.
  const database = page.getByTestId('status-database');
  await expect(database).toContainText(/SQLite \d+\.\d+/);
  await expect(database).toContainText('FTS5 available');

  await expect(page.getByTestId('status-crypto')).toContainText('libsodium');
  await expect(page.getByTestId('status-storage')).toContainText('Key-value');
  await expect(page.locator('.m-dot[data-state="error"]')).toHaveCount(0);
});

test('an edit made by another program shows up without a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-path="Inbox/Welcome.md"]')).toBeVisible();

  const external = join(vault, 'Inbox', `from-another-editor-${test.info().project.name}.md`);
  await writeFile(external, 'written outside the app\n');
  const row = page.locator(
    `[data-path="Inbox/from-another-editor-${test.info().project.name}.md"]`,
  );
  await expect(row).toBeVisible();

  await rm(external);
  await expect(row).toHaveCount(0);
});

test('app state stays out of the notes: only .mosaic/ is added to the folder', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status-storage')).toContainText('Key-value');
  await expect(page.locator('[data-path^=".mosaic"]')).toHaveCount(0);
});

test('dark mode is a token swap, and the choice is applied to the document', async ({ page }) => {
  await page.goto('/');
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await background();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await background()).not.toBe(light);
});

test('navigation is reachable: sidebar on desktop, bottom tabs on a phone', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const nav = page.locator(isMobile ? '.m-tabs' : '.m-sidebar');
  await expect(nav).toBeVisible();
  await nav.getByRole('button', { name: 'Notebooks' }).click();
  await expect(page.getByText('Notebooks, sections and pages arrive')).toBeVisible();
  // Nothing scrolls sideways at any width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
