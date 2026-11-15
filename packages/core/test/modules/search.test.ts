import { describe, expect, it } from 'vitest';
import { createSearchEngine, createVaultIndex } from '../../src/index';
import { testPlatform } from '../support/platform';

async function setup() {
  const platform = testPlatform();
  await platform.fs.write(
    'Reading/Attention.md',
    '# Attention is all you need\n\nTransformers replace recurrence.\n',
  );
  await platform.fs.write(
    'Reading/Recurrence.md',
    'Recurrent networks and attention mechanisms.\n',
  );
  await platform.fs.write('Journal/2026-09-10.md', 'Deployed the relay. Nothing about papers.\n');
  await platform.fs.write(
    'Old/archived.md',
    '---\narchived: true\n---\nattention attention attention\n',
  );
  await createVaultIndex(platform).rebuild();
  return { platform, search: createSearchEngine(platform) };
}

describe('search', () => {
  it('finds notes by body text and returns a highlighted snippet', async () => {
    const { search } = await setup();
    const hits = await search.search('transformers');
    expect(hits.map((h) => h.path)).toEqual(['Reading/Attention.md']);
    expect(hits[0]?.snippet).toContain('<mark>Transformers</mark>');
  });

  it('ranks a title match above a body match', async () => {
    const { search } = await setup();
    const hits = await search.search('attention');
    expect(hits.map((h) => h.path)).toEqual(['Reading/Attention.md', 'Reading/Recurrence.md']);
  });

  it('matches prefixes as the user types', async () => {
    const { search } = await setup();
    expect((await search.search('recur')).map((h) => h.path).sort()).toEqual([
      'Reading/Attention.md',
      'Reading/Recurrence.md',
    ]);
  });

  it('excludes archived notes unless asked', async () => {
    const { search } = await setup();
    expect((await search.search('attention')).some((h) => h.path === 'Old/archived.md')).toBe(
      false,
    );
    const all = await search.search('attention', { includeArchived: true });
    expect(all.some((h) => h.path === 'Old/archived.md')).toBe(true);
  });

  it('scopes to a folder', async () => {
    const { search } = await setup();
    expect(await search.search('relay', { folder: 'Reading' })).toEqual([]);
    expect((await search.search('relay', { folder: 'Journal' })).length).toBe(1);
  });

  it('treats query syntax characters as text, never as an error', async () => {
    const { search } = await setup();
    for (const q of ['"unbalanced', 'a AND', 'NEAR(', '*', 'c++ (draft)', '']) {
      await expect(search.search(q)).resolves.toBeInstanceOf(Array);
    }
  });

  it('suggests notes by title for wiki-link autocomplete', async () => {
    const { search } = await setup();
    expect((await search.suggest('att')).map((s) => s.title)).toEqual([
      'Attention is all you need',
    ]);
  });
});
