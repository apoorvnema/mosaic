import { expect, test } from '@playwright/test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { caretAtEndOf, editor, expectFile, openNote, readNote, vault, writeNote } from './support';

const AWKWARD =
  '---\ntitle:   Spaced\n# a comment\ntags: [a,  b]\n---\n\n* keep  my   spacing\n+ and __this__ style\n\n' +
  'Setext\n======\n\nedit me\n\n~~~js {1}\ncode\n~~~\n\n| a | b |\n|---|---|\n\n1) last, no newline';

test('opening a note and looking at it never changes the file', async ({ page }) => {
  await writeNote('Fidelity/Untouched.md', AWKWARD);
  await openNote(page, 'Fidelity/Untouched.md');
  await expect(editor(page)).toContainText('edit me');
  await editor(page).click();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(800);
  expect(await readNote('Fidelity/Untouched.md')).toBe(AWKWARD);
});

test('typing in one paragraph rewrites that paragraph and nothing else', async ({ page }) => {
  await writeNote('Fidelity/Edited.md', AWKWARD);
  await openNote(page, 'Fidelity/Edited.md');
  await caretAtEndOf(page, 'edit me');
  await page.keyboard.type(' please');
  await expect(page.getByRole('status')).toHaveText('Saved');
  await expectFile('Fidelity/Edited.md', AWKWARD.replace('edit me', 'edit me please'));
});

test('markdown typed at the keyboard becomes blocks, and the file is plain markdown', async ({
  page,
}) => {
  await writeNote('Editor/Shortcuts.md', '');
  await openNote(page, 'Editor/Shortcuts.md');
  await editor(page).click();
  const type = async (...lines: string[]) => {
    for (const line of lines) {
      await page.keyboard.type(line);
      await page.keyboard.press('Enter');
    }
  };
  await type('# Trip plan', 'Some **bold** and *soft* and `code` text.');
  await type('- pack bags', 'book train');
  await page.keyboard.press('Enter'); // an empty item ends the list
  await type('[ ] passport');
  await page.keyboard.type('tickets');
  await page.keyboard.press('Control+Enter'); // tick the task from the keyboard
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await type('1. first', 'second');
  await page.keyboard.press('Enter');
  await type('> a quote');
  await page.keyboard.type('---');
  await page.keyboard.type('the end');

  await expect(editor(page).locator('h1')).toHaveText('Trip plan');
  await expect(editor(page).locator('strong')).toHaveText('bold');
  await expect(editor(page).locator('.b-task')).toHaveCount(2);
  await expect(editor(page).locator('.b-list[data-ordered="true"]').nth(1)).toHaveAttribute(
    'data-number',
    '2',
  );
  await expectFile(
    'Editor/Shortcuts.md',
    '# Trip plan\n\nSome **bold** and *soft* and `code` text.\n\n- pack bags\n- book train\n- [ ] passport\n- [x] tickets\n\n' +
      '1. first\n2. second\n\n> a quote\n\n---\n\nthe end\n',
  );
});

test('the slash menu inserts blocks, by keyboard alone', async ({ page }) => {
  await writeNote('Editor/Slash.md', 'intro\n');
  await openNote(page, 'Editor/Slash.md');
  await caretAtEndOf(page, 'intro');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  const menu = page.getByRole('listbox', { name: 'Insert block' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('option')).toHaveCount(12);
  await page.keyboard.type('cod');
  await expect(menu.getByRole('option')).toHaveText(['Code```']);
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await page.keyboard.type('let x = 1;');
  await page.keyboard.press('Enter'); // Enter stays inside a code block
  await page.keyboard.type('x++;');
  await expectFile('Editor/Slash.md', 'intro\n\n```\nlet x = 1;\nx++;\n```\n');

  // Arrow keys choose; Escape dismisses and leaves the text alone.
  // Arrow down from anywhere on the last line of a trailing code block leaves it.
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('/');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Sub heading');
  await expect(editor(page).locator('h2')).toHaveText('Sub heading');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/quo');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expectFile(
    'Editor/Slash.md',
    'intro\n\n```\nlet x = 1;\nx++;\n```\n\n## Sub heading\n\n/quo\n',
  );
});

test('wiki links autocomplete from the vault and open the note they name', async ({ page }) => {
  await writeNote('Work/Roadmap.md', '# Roadmap for the year\n');
  await writeNote('Editor/Links.md', 'See\n');
  await openNote(page, 'Editor/Links.md');
  await caretAtEndOf(page, 'See');
  await page.keyboard.type(' [[road');
  const menu = page.getByRole('listbox', { name: 'Link to note' });
  await expect(menu.getByRole('option').first()).toContainText('Roadmap for the year');
  await page.keyboard.press('Enter');
  await page.keyboard.type(' today');
  // The link names the file, which is what resolves; the menu showed the title.
  await expectFile('Editor/Links.md', 'See [[Roadmap]] today\n');

  await editor(page).locator('.wikilink').click();
  await expect(page.getByLabel('Note name')).toHaveValue('Roadmap');
  // And the link shows up as a backlink on the other side.
  await expect(page.locator('.m-backlinks')).toContainText('Links');
});

test('a link to a note that does not exist creates it', async ({ page }) => {
  await writeNote('Editor/Stub.md', 'Go to [[Brand new idea]].\n');
  await openNote(page, 'Editor/Stub.md');
  await editor(page).locator('.wikilink').click();
  await expect(page.getByLabel('Note name')).toHaveValue('Brand new idea');
  await expectFile('Editor/Brand new idea.md', '');
});

test('ticking a checkbox with the mouse changes one character in the file', async ({ page }) => {
  const source = '# List\n\n* [ ] first\n* [ ] second\n    * [ ] nested with four spaces\n';
  await writeNote('Editor/Tasks.md', source);
  await openNote(page, 'Editor/Tasks.md');
  await editor(page).locator('.b-task', { hasText: 'nested' }).getByRole('checkbox').click();
  await expectFile('Editor/Tasks.md', source.replace('* [ ] nested', '* [x] nested'));
  await expect(editor(page).locator('.b-task', { hasText: 'nested' })).toHaveAttribute(
    'data-checked',
    'true',
  );
});

test('Tab and Shift+Tab nest and un-nest list items', async ({ page }) => {
  await writeNote('Editor/Nest.md', '- parent\n- child\n');
  await openNote(page, 'Editor/Nest.md');
  await caretAtEndOf(page, 'child');
  await page.keyboard.press('Tab');
  await expectFile('Editor/Nest.md', '- parent\n  - child\n');
  await page.keyboard.press('Tab'); // cannot go deeper than one level below the item above
  await page.keyboard.press('Shift+Tab');
  await expectFile('Editor/Nest.md', '- parent\n- child\n');
});

test('blocks reorder from the keyboard', async ({ page }) => {
  await writeNote('Editor/Reorder.md', 'one\n\ntwo\n\nthree\n');
  await openNote(page, 'Editor/Reorder.md');
  await caretAtEndOf(page, 'three');
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('Alt+ArrowUp');
  await expectFile('Editor/Reorder.md', 'three\n\none\n\ntwo\n');
  await page.keyboard.type('!'); // the caret travelled with the block
  await page.keyboard.press('Alt+ArrowDown');
  await expectFile('Editor/Reorder.md', 'one\n\nthree!\n\ntwo\n');
});

test('blocks reorder by dragging the handle', async ({ page }) => {
  await writeNote('Editor/Drag.md', 'alpha\n\nbravo\n\ncharlie\n');
  await openNote(page, 'Editor/Drag.md');
  const blocks = editor(page).locator('.b');
  await blocks.nth(2).hover();
  const handle = page.locator('.m-drag-handle');
  await expect(handle).toHaveAttribute('data-visible', 'true');
  // Drag the way a hand does: press, move a little, travel, release. Dropping on the
  // top half of a block puts the dragged one above it, wherever along the line.
  const from = (await handle.boundingBox())!;
  const to = (await blocks.nth(0).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 5, { steps: 5 });
  await page.mouse.move(to.x + 300, to.y + 3, { steps: 10 });
  await page.mouse.up();
  await expect(blocks).toHaveText(['charlie', 'alpha', 'bravo']);
  await expectFile('Editor/Drag.md', 'charlie\n\nalpha\n\nbravo\n');
});

test('an image goes into _media/ and the note links to it', async ({ page }) => {
  await writeNote('Editor/Picture.md', 'caption\n');
  await openNote(page, 'Editor/Picture.md');
  await caretAtEndOf(page, 'caption');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/image');
  await page.keyboard.press('Enter');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  await page
    .getByTestId('image-input')
    .setInputFiles({ name: 'white board.png', mimeType: 'image/png', buffer: png });
  await expectFile('Editor/Picture.md', 'caption\n\n![white board](_media/white board.png)\n');
  expect(await readdir(join(vault, '_media'))).toContain('white board.png');
  // The editor shows it, loaded from the vault through core.
  const img = editor(page).locator('.b-image img');
  await expect(img).toHaveJSProperty('complete', true);
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
});

test('undo and redo work across block changes', async ({ page }) => {
  await writeNote('Editor/Undo.md', 'start\n');
  await openNote(page, 'Editor/Undo.md');
  await caretAtEndOf(page, 'start');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# heading');
  await expectFile('Editor/Undo.md', 'start\n\n# heading\n');
  for (let i = 0; i < 12; i++) await page.keyboard.press('Control+z');
  await expectFile('Editor/Undo.md', 'start\n');
});
