import { expect, test } from '@playwright/test';
import { editor, expectFile, writeNote } from './support';

// 412px wide: the list and the note are one screen each.
test('on a phone the list and the note are separate screens, and nothing scrolls sideways', async ({
  page,
}) => {
  await writeNote('Phone/Pocket note.md', '# In my pocket\n\n- [ ] one thing\n');
  await page.goto('/');
  const row = page.locator('[data-path="Phone/Pocket note.md"]');
  await expect(row).toBeVisible();
  await expect(page.locator('.m-main')).toBeHidden();
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(await fits()).toBe(true);

  await row.tap();
  await expect(editor(page)).toContainText('In my pocket');
  await expect(page.locator('.m-sidebar')).toBeHidden();
  expect(await fits()).toBe(true);

  await editor(page).locator('.b-task').getByRole('checkbox').tap();
  await expectFile('Phone/Pocket note.md', '# In my pocket\n\n- [x] one thing\n');

  await page.getByRole('button', { name: 'Back to notes' }).tap();
  await expect(row).toBeVisible();
});

test('search works on a phone', async ({ page }) => {
  await writeNote('Phone/Findable.md', 'a very distinctive kumquat\n');
  await page.goto('/');
  await expect(page.locator('[data-path="Phone/Findable.md"]')).toBeVisible();
  await page.getByLabel('Search notes').fill('kumquat');
  await page.locator('.m-hit').tap();
  await expect(editor(page)).toContainText('distinctive kumquat');
});
