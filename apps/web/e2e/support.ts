import { expect, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const vault = process.env.MOSAIC_E2E_VAULT!;

/** Put a file in the vault the way another program would. */
export async function writeNote(path: string, text: string): Promise<void> {
  await mkdir(dirname(join(vault, path)), { recursive: true });
  await writeFile(join(vault, path), text);
}

export const readNote = (path: string) => readFile(join(vault, path), 'utf8');

/** Wait until the file on disk has exactly this content. */
export async function expectFile(path: string, text: string): Promise<void> {
  await expect.poll(() => readNote(path).catch(() => '<missing>'), { timeout: 8000 }).toBe(text);
}

export async function openNote(page: Page, path: string): Promise<void> {
  await page.goto(`/#/${path.split('/').map(encodeURIComponent).join('/')}`);
  await expect(page.locator('.m-editor')).toBeVisible();
}

export const editor = (page: Page) => page.locator('.m-editor');

/** Put the caret at the end of the block containing `text`. */
export async function caretAtEndOf(page: Page, text: string): Promise<void> {
  await editor(page).locator('.b', { hasText: text }).first().click();
  await page.keyboard.press('End');
  // The editor reads a mouse-placed caret on a short timer; a script can out-type it.
  await page.waitForTimeout(80);
}
