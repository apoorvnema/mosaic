import { describe, expect, it } from 'vitest';
import { createCrdtDoc, createFileBridge, parseMarkdown } from '../../src/index';
import { testPlatform } from '../support/platform';

describe('filebridge: external edits', () => {
  async function setup(text: string) {
    const platform = testPlatform();
    const bridge = createFileBridge(platform);
    await platform.fs.write('n.md', text);
    const doc = createCrdtDoc();
    doc.loadNote({ path: 'n.md', ...parseMarkdown(text) });
    await bridge.setBase('n.md', text);
    return { platform, bridge, doc };
  }

  it('reports unchanged when the file matches the base', async () => {
    const { bridge, doc } = await setup('one\n');
    expect(await bridge.reconcileExternalChange('n.md', doc)).toEqual({ kind: 'unchanged' });
  });

  it('merges an external edit with a concurrent in-app edit', async () => {
    const { platform, bridge, doc } = await setup('first line\n\nsecond line\n');
    doc.applyTextDiff('first line, edited in app\n\nsecond line\n', 'local');
    await platform.fs.externalWrite('n.md', 'first line\n\nsecond line, edited in vim\n');

    const result = await bridge.reconcileExternalChange('n.md', doc);
    expect(result.kind).toBe('merged');
    await bridge.flush('n.md', doc);
    expect(await platform.fs.readText('n.md')).toBe(
      'first line, edited in app\n\nsecond line, edited in vim\n',
    );
  });

  it('always copies the original to a timestamped file before merging', async () => {
    const { platform, bridge, doc } = await setup('base\n');
    const external = 'rewritten by another editor\n';
    await platform.fs.externalWrite('n.md', external);
    const result = await bridge.reconcileExternalChange('n.md', doc);
    if (result.kind === 'unchanged') throw new Error('expected a merge');
    expect(result.backupPath).toMatch(/^\.mosaic\/backups\/.*n.*\.md$/);
    expect(await platform.fs.readText(result.backupPath)).toBe(external);
  });

  it('advances the base after a flush so the next diff is against the merged text', async () => {
    const { bridge, doc } = await setup('one\n');
    doc.applyTextDiff('one two\n', 'local');
    await bridge.flush('n.md', doc);
    expect(await bridge.getBase('n.md')).toBe('one two\n');
    expect(await bridge.reconcileExternalChange('n.md', doc)).toEqual({ kind: 'unchanged' });
  });

  it('surfaces both versions when the same line was changed on both sides', async () => {
    const { platform, bridge, doc } = await setup('status: draft\n');
    doc.applyTextDiff('status: approved\n', 'local');
    await platform.fs.externalWrite('n.md', 'status: rejected\n');
    const result = await bridge.reconcileExternalChange('n.md', doc);
    expect(result.kind).toBe('conflict');
    if (result.kind !== 'conflict') return;
    expect(result.ours).toBe('status: approved\n');
    expect(result.theirs).toBe('status: rejected\n');
  });
});
