import { describe, expect, it } from 'vitest';
import { createCrdtDoc, createFileBridge, parseMarkdown, serializeMarkdown } from '../../src/index';
import { testPlatform } from '../support/platform';

/** Awkward markdown that must survive parse → serialise unchanged. Prompt 1 grows
 *  this into a fixtures corpus; these are the cases that break naive round-trips. */
const ROUND_TRIP_CASES: Record<string, string> = {
  empty: '',
  'no trailing newline': '# Title\n\nbody',
  'crlf line endings': '# Title\r\n\r\nbody\r\n',
  'frontmatter with comments and odd spacing':
    '---\ntitle:   Spaced\n# a comment\ntags: [a,  b]\n---\n\nbody\n',
  'mixed list markers': '* one\n- two\n+ three\n  1) nested\n',
  'setext headings': 'Title\n=====\n\nSub\n---\n',
  'trailing whitespace and hard breaks': 'line one  \nline two\\\nline three\n',
  'tabs and nested tasks': '- [ ] parent\n\t- [x] child\n\t\t- [ ] grandchild\n',
  'code fence with tildes and info string': '~~~js {1,3}\nconst a = 1;\n~~~\n',
  'html and entities': '<div align="center">\n\n&copy; &amp; *x*\n\n</div>\n',
  'wiki links and embeds': 'See [[Other note|alias]] and ![[image.png]] and [[Note#^abc123]].\n',
  'block id anchor': 'A referenced paragraph. ^para-1\n',
  callout: '> [!warning] Careful\n> body of the callout\n',
  'table with alignment': '| a | b |\n|:--|--:|\n| 1 | 2 |\n',
  'multiple blank lines': 'one\n\n\n\ntwo\n',
  'unicode and emoji': '# Ünïcödé 📝\n\n日本語のノート\n',
};

describe('filebridge: markdown round-trip', () => {
  for (const [name, source] of Object.entries(ROUND_TRIP_CASES)) {
    it(`round-trips byte-identically: ${name}`, () => {
      expect(serializeMarkdown(parseMarkdown(source))).toBe(source);
    });
  }

  it('parses the block types the plan lists', () => {
    const { meta, blocks } = parseMarkdown(
      '---\ntitle: T\npinned: true\n---\n# H\n\npara\n\n- item\n- [x] done\n\n> quote\n\n```ts\ncode\n```\n',
    );
    expect(meta).toMatchObject({ title: 'T', pinned: true });
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'list-item',
      'task',
      'quote',
      'code',
    ]);
    expect(blocks[0]?.props.level).toBe(1);
    expect(blocks[5]?.props.language).toBe('ts');
  });

  it('only materialises block ids that already exist in the file', () => {
    const { blocks } = parseMarkdown('plain\n\nreferenced ^abc\n');
    expect(blocks[0]?.id).toBeUndefined();
    expect(blocks[1]?.id).toBe('abc');
  });

  it('changes only the edited block when one block is edited', () => {
    const source = '* keep  my\n\n  odd   spacing\n\nedit me\n\n+ and this\n';
    const parsed = parseMarkdown(source);
    const target = parsed.blocks.find((b) => b.text === 'edit me');
    if (!target) throw new Error('fixture block not found');
    target.text = 'edited';
    expect(serializeMarkdown(parsed)).toBe(source.replace('edit me', 'edited'));
  });
});

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
