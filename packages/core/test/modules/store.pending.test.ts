import { describe, expect, it } from 'vitest';
import { createNoteStore, type StoreChange } from '../../src/index';
import { testPlatform } from '../support/platform';

const NOTE = '---\ntitle: Groceries\ncolor: yellow\n---\n\n- [ ] milk\n- [x] eggs\n';

describe('store', () => {
  it('opens a markdown file as a block tree with its frontmatter', async () => {
    const platform = testPlatform();
    await platform.fs.write('Inbox/groceries.md', NOTE);
    const store = createNoteStore(platform);
    const note = await store.open('Inbox/groceries.md');
    expect(note.meta.title).toBe('Groceries');
    expect(note.meta.color).toBe('yellow');
    expect(note.blocks.map((b) => b.type)).toEqual(['task', 'task']);
    expect(note.blocks[1]?.props.checked).toBe(true);
  });

  it('does not touch the file when saving an unchanged note', async () => {
    const platform = testPlatform();
    await platform.fs.write('a.md', NOTE);
    const before = await platform.fs.stat('a.md');
    platform.clock.advance(60_000);
    const store = createNoteStore(platform);
    await store.save(await store.open('a.md'));
    expect(await platform.fs.readText('a.md')).toBe(NOTE);
    expect((await platform.fs.stat('a.md'))?.modifiedAt).toBe(before?.modifiedAt);
  });

  it('pins a note by setting a flag on the same file, not by copying it', async () => {
    const platform = testPlatform();
    await platform.fs.write('Work/Specs/api.md', '# API\n');
    const store = createNoteStore(platform);
    const pinned = await store.updateMeta('Work/Specs/api.md', { pinned: true, color: 'blue' });
    expect(pinned.path).toBe('Work/Specs/api.md');
    expect(pinned.meta.pinned).toBe(true);
    const files = (await platform.fs.list('', { recursive: true })).filter(
      (e) => e.kind === 'file',
    );
    expect(files.map((f) => f.path)).toEqual(['Work/Specs/api.md']);
    expect(await platform.fs.readText('Work/Specs/api.md')).toContain('pinned: true');
    expect(await platform.fs.readText('Work/Specs/api.md')).toContain('# API\n');
  });

  it('preserves frontmatter keys it does not understand', async () => {
    const platform = testPlatform();
    await platform.fs.write('n.md', '---\naliases: [x, y]\ncssclass: wide\n---\nbody\n');
    const store = createNoteStore(platform);
    await store.updateMeta('n.md', { pinned: true });
    const text = await platform.fs.readText('n.md');
    expect(text).toContain('aliases: [x, y]');
    expect(text).toContain('cssclass: wide');
  });

  it('refuses to create over an existing note', async () => {
    const platform = testPlatform();
    await platform.fs.write('n.md', 'mine\n');
    const store = createNoteStore(platform);
    await expect(store.create('n.md')).rejects.toThrow();
    expect(await platform.fs.readText('n.md')).toBe('mine\n');
  });

  it('moves a note to the trash and can restore it byte for byte', async () => {
    const platform = testPlatform();
    await platform.fs.write('n.md', NOTE);
    const store = createNoteStore(platform);
    await store.trash('n.md');
    expect(await platform.fs.exists('n.md')).toBe(false);
    expect(await store.list()).toEqual([]);
    await store.restore('n.md');
    expect(await platform.fs.readText('n.md')).toBe(NOTE);
  });

  it('lists notes but not the hidden .mosaic directory', async () => {
    const platform = testPlatform();
    await platform.fs.write('a.md', 'a');
    await platform.fs.write('Work/b.md', 'b');
    await platform.fs.write('.mosaic/trash/old.md', 'old');
    await platform.fs.write('_media/pic.jpg', 'jpg');
    const store = createNoteStore(platform);
    expect(await store.list()).toEqual(['Work/b.md', 'a.md']);
  });

  it('reports an external edit as a change with origin "external"', async () => {
    const platform = testPlatform();
    await platform.fs.write('n.md', 'one\n');
    const store = createNoteStore(platform);
    const changes: StoreChange[] = [];
    store.onChange((c) => changes.push(c));
    await platform.fs.externalWrite('n.md', 'two\n');
    expect(changes).toContainEqual({ kind: 'saved', path: 'n.md', origin: 'external' });
    expect((await store.open('n.md')).blocks[0]?.text).toBe('two');
  });
});
