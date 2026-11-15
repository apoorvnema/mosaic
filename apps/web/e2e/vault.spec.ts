import { expect, test } from '@playwright/test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { editor, expectFile, openNote, readNote, vault, writeNote } from './support';

test('every adapter works in a real browser', async ({ page }) => {
  await writeNote('Inbox/Welcome.md', '# Welcome\n');
  await page.goto('/#/~diagnostics');
  await expect(page.getByRole('heading', { name: 'Foundation' })).toBeVisible();
  // wa-sqlite over OPFS with FTS5: the part that cannot be unit-tested in node.
  await expect(page.getByTestId('status-database')).toContainText(/SQLite \d+\.\d+/);
  await expect(page.getByTestId('status-database')).toContainText('FTS5 available');
  await expect(page.getByTestId('status-crypto')).toContainText('libsodium');
  await expect(page.getByTestId('status-storage')).toContainText('Key-value');
  await expect(page.locator('.m-dot[data-state="error"]')).toHaveCount(0);
});

test('opens a folder it has never seen and lists its notes by folder', async ({ page }) => {
  await writeNote('Work/Research/Paper.md', '# A paper\n');
  await writeNote('Journal/2026-11-15.md', 'today\n');
  await writeNote('_media/not-a-note.txt', 'ignored');
  await page.goto('/');
  await expect(page.locator('[data-path="Work/Research/Paper.md"]')).toBeVisible();
  await expect(page.locator('[data-path="Journal/2026-11-15.md"]')).toBeVisible();
  await expect(page.locator('.m-folder-name', { hasText: 'Work/Research' })).toBeVisible();
  await expect(page.locator('.m-note-row', { hasText: 'not-a-note' })).toHaveCount(0);
});

test('a note created by another program appears, and disappears when deleted, without a reload', async ({
  page,
}) => {
  await page.goto('/');
  await writeNote('Inbox/From vim.md', 'written outside the app\n');
  const row = page.locator('[data-path="Inbox/From vim.md"]');
  await expect(row).toBeVisible();
  await rm(join(vault, 'Inbox/From vim.md'));
  await expect(row).toHaveCount(0);
});

test('an external edit updates the open document', async ({ page }) => {
  await writeNote('Inbox/Live.md', 'before the edit\n');
  await openNote(page, 'Inbox/Live.md');
  await expect(editor(page)).toContainText('before the edit');
  await writeNote('Inbox/Live.md', 'after the edit\n\n- [x] and a task\n');
  await expect(editor(page)).toContainText('after the edit');
  await expect(editor(page).locator('.b-task[data-checked="true"]')).toHaveText('and a task');
  // Reloading the note from disk must not write anything back.
  await page.waitForTimeout(700);
  expect(await readNote('Inbox/Live.md')).toBe('after the edit\n\n- [x] and a task\n');
});

test('full-text search finds a note by its body and opens it', async ({ page }) => {
  await writeNote(
    'Reading/Attention.md',
    '# Attention is all you need\n\nTransformers replace recurrence.\n',
  );
  await writeNote('Reading/Other.md', 'Nothing relevant here.\n');
  await page.goto('/');
  await expect(page.locator('[data-path="Reading/Attention.md"]')).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.keyboard.type('transform');
  const hit = page.locator('.m-hit');
  await expect(hit).toHaveCount(1);
  await expect(hit.locator('mark')).toHaveText('Transformers');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Note name')).toHaveValue('Attention');
  await expect(editor(page)).toContainText('Transformers replace recurrence.');
});

test('search picks up an edit made outside the app', async ({ page }) => {
  await writeNote('Inbox/Changing.md', 'first version\n');
  await page.goto('/');
  await expect(page.locator('[data-path="Inbox/Changing.md"]')).toBeVisible();
  await writeNote('Inbox/Changing.md', 'now mentions zeppelins\n');
  await page.getByLabel('Search notes').fill('zeppelin');
  await expect(page.locator('.m-hit')).toContainText('Changing');
});

test('backlinks list the notes that link here, and follow them', async ({ page }) => {
  await writeNote('Work/Roadmap.md', '# Roadmap\n');
  await writeNote('Inbox/Idea.md', 'An idea for the [[Roadmap]].\n');
  await openNote(page, 'Work/Roadmap.md');
  const backlinks = page.locator('.m-backlinks');
  await expect(backlinks).toContainText('Idea');
  await backlinks.getByRole('button', { name: /Idea/ }).click();
  await expect(page.getByLabel('Note name')).toHaveValue('Idea');
});

test('new note, rename, trash and undo all happen to one file on disk', async ({ page }) => {
  await writeNote('Inbox/Existing.md', 'x\n');
  await page.goto('/');
  await page.getByRole('button', { name: 'New note' }).first().click();
  await expect(page.getByLabel('Note name')).toHaveValue('Untitled');
  await expectFile('Inbox/Untitled.md', '');

  await editor(page).click();
  await page.keyboard.type('Shopping');
  await expectFile('Inbox/Untitled.md', 'Shopping\n');

  await page.getByLabel('Note name').fill('Groceries');
  await page.getByLabel('Note name').press('Enter');
  await expectFile('Inbox/Groceries.md', 'Shopping\n');
  await expectFile('Inbox/Untitled.md', '<missing>');
  await expect(page.locator('[data-path="Inbox/Groceries.md"]')).toBeVisible();

  // Renaming onto an existing note is refused, not overwritten.
  await page.getByLabel('Note name').fill('Existing');
  await page.getByLabel('Note name').press('Enter');
  await expect(page.getByRole('alert')).toContainText('already exists');
  expect(await readNote('Inbox/Existing.md')).toBe('x\n');

  await page.getByRole('button', { name: 'Move note to trash' }).click();
  await expectFile('Inbox/Groceries.md', '<missing>');
  await expect(page.locator('[data-path="Inbox/Groceries.md"]')).toHaveCount(0);
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expectFile('Inbox/Groceries.md', 'Shopping\n');
  await expect(page.getByLabel('Note name')).toHaveValue('Groceries');
});

test('dark mode is a token swap', async ({ page }) => {
  await page.goto('/');
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await background();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await background()).not.toBe(light);
});
