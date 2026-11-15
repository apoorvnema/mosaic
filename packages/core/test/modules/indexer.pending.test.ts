import { describe, expect, it } from 'vitest';
import { createVaultIndex } from '../../src/index';
import { createTestDatabase } from '../support/sqlite';
import { testPlatform } from '../support/platform';

async function seededPlatform() {
  const platform = testPlatform();
  await platform.fs.write(
    'Inbox/idea.md',
    '---\npinned: true\ncolor: yellow\nlabels: [todo]\n---\nAn idea about [[Roadmap]].\n',
  );
  await platform.fs.write('Work/Roadmap.md', '# Roadmap\n\nQ1 plans. See [[idea]].\n');
  await platform.fs.write('Work/Old.md', '---\narchived: true\nlabels: [todo, work]\n---\nold\n');
  await platform.fs.write('_media/pic.jpg', 'not a note');
  return platform;
}

describe('indexer', () => {
  it('indexes every note with title, flags and a preview', async () => {
    const platform = await seededPlatform();
    const index = createVaultIndex(platform);
    expect((await index.rebuild()).notes).toBe(3);
    const idea = await index.get('Inbox/idea.md');
    expect(idea?.title).toBe('idea');
    expect(idea?.meta.pinned).toBe(true);
    expect(idea?.preview).toContain('An idea about');
    expect((await index.get('Work/Roadmap.md'))?.title).toBe('Roadmap');
  });

  it('answers the board query: pinned first-class, archived excluded', async () => {
    const platform = await seededPlatform();
    const index = createVaultIndex(platform);
    await index.rebuild();
    expect((await index.query({ pinned: true })).map((n) => n.path)).toEqual(['Inbox/idea.md']);
    expect((await index.query({ archived: false, orderBy: 'path' })).map((n) => n.path)).toEqual([
      'Inbox/idea.md',
      'Work/Roadmap.md',
    ]);
    expect((await index.query({ folder: 'Work', orderBy: 'path' })).map((n) => n.path)).toEqual([
      'Work/Old.md',
      'Work/Roadmap.md',
    ]);
  });

  it('resolves wiki links into backlinks in both directions', async () => {
    const platform = await seededPlatform();
    const index = createVaultIndex(platform);
    await index.rebuild();
    expect((await index.backlinks('Work/Roadmap.md')).map((l) => l.from)).toEqual([
      'Inbox/idea.md',
    ]);
    expect((await index.outboundLinks('Work/Roadmap.md')).map((l) => l.to)).toEqual([
      'Inbox/idea.md',
    ]);
  });

  it('counts labels across the vault', async () => {
    const platform = await seededPlatform();
    const index = createVaultIndex(platform);
    await index.rebuild();
    expect(await index.labels()).toEqual([
      { label: 'todo', count: 2 },
      { label: 'work', count: 1 },
    ]);
  });

  it('refreshes one file after an edit or a delete', async () => {
    const platform = await seededPlatform();
    const index = createVaultIndex(platform);
    await index.rebuild();
    await platform.fs.write('Inbox/idea.md', 'No more links.\n');
    await index.refresh('Inbox/idea.md');
    expect(await index.backlinks('Work/Roadmap.md')).toEqual([]);
    expect((await index.get('Inbox/idea.md'))?.meta.pinned).toBeUndefined();
    await platform.fs.delete('Work/Old.md');
    await index.refresh('Work/Old.md');
    expect(await index.get('Work/Old.md')).toBeUndefined();
  });

  it('is derived: wipe the database, rebuild, and the state is identical', async () => {
    const platform = await seededPlatform();
    const index = createVaultIndex(platform);
    await index.rebuild();
    await platform.fs.write('Inbox/new.md', 'added later [[Roadmap]]\n');
    await index.refresh('Inbox/new.md');
    const before = await index.fingerprint();

    const wiped = { ...platform, db: createTestDatabase() };
    const rebuilt = createVaultIndex(wiped);
    await rebuilt.rebuild();
    expect(await rebuilt.fingerprint()).toBe(before);
  });

  it('never writes to the vault while indexing', async () => {
    const platform = await seededPlatform();
    const before = await platform.fs.list('', { recursive: true });
    const writes: string[] = [];
    platform.fs.watch('', (c) => writes.push(c.path));
    await createVaultIndex(platform).rebuild();
    expect(writes.filter((p) => !p.startsWith('.mosaic/'))).toEqual([]);
    expect(
      (await platform.fs.list('', { recursive: true })).filter(
        (e) => !e.path.startsWith('.mosaic'),
      ),
    ).toEqual(before);
  });
});
