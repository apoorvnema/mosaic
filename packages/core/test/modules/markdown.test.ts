import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  extractWikiLinks,
  inlineToPlainText,
  parseInline,
  parseMarkdown,
  serializeInline,
  serializeMarkdown,
  type Block,
} from '../../src/index';

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

// The headline test: a corpus of awkward real-world markdown survives untouched.
describe('filebridge: fixtures corpus', () => {
  const dir = new URL('../fixtures/', import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith('.md'));

  it('has a corpus to test', () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  for (const name of files) {
    const source = readFileSync(new URL(name, dir), 'utf8');
    it(`round-trips byte-identically: ${name}`, () => {
      expect(serializeMarkdown(parseMarkdown(source))).toBe(source);
    });

    it(`survives a parse → serialise → parse cycle unchanged: ${name}`, () => {
      const once = parseMarkdown(source);
      const twice = parseMarkdown(serializeMarkdown(once));
      expect(twice).toEqual(once);
    });
  }

  it('round-trips every prefix of every fixture (no input can lose a byte)', () => {
    for (const name of files) {
      const source = readFileSync(new URL(name, dir), 'utf8');
      for (let cut = 0; cut <= source.length; cut += 7) {
        const part = source.slice(0, cut);
        expect(serializeMarkdown(parseMarkdown(part)), `${name} cut at ${cut}`).toBe(part);
      }
    }
  });
});

describe('filebridge: editing', () => {
  const find = (blocks: Block[], text: string): Block => {
    for (const block of blocks) {
      if (block.text === text) return block;
      const inner = block.children.length ? find(block.children, text) : undefined;
      if (inner) return inner;
    }
    return undefined as unknown as Block;
  };

  it('ticks a nested task without touching its neighbours or their indentation', () => {
    const source = '- [ ] parent\n\t- [ ] child\n\t\t- [ ] grandchild\n* other\n';
    const parsed = parseMarkdown(source);
    find(parsed.blocks, 'child').props.checked = true;
    expect(serializeMarkdown(parsed)).toBe(source.replace('\t- [ ] child', '\t- [x] child'));
  });

  it('keeps CRLF line endings when a block is rewritten', () => {
    const parsed = parseMarkdown('# Title\r\n\r\nbody\r\n');
    find(parsed.blocks, 'body').text = 'new body';
    expect(serializeMarkdown(parsed)).toBe('# Title\r\n\r\nnew body\r\n');
  });

  it('separates a new block from its neighbours with a blank line', () => {
    const parsed = parseMarkdown('# Title\n\nfirst\n');
    parsed.blocks.push({ type: 'paragraph', text: 'second', props: {}, children: [] });
    parsed.blocks.push({ type: 'task', text: 'a', props: { checked: false }, children: [] });
    parsed.blocks.push({ type: 'task', text: 'b', props: { checked: true }, children: [] });
    expect(serializeMarkdown(parsed)).toBe('# Title\n\nfirst\n\nsecond\n\n- [ ] a\n- [x] b\n');
  });

  it('puts a blank line back between blocks that were moved next to each other', () => {
    const parsed = parseMarkdown('one\n\ntwo\n\nthree\n');
    const [one, two, three] = parsed.blocks as [Block, Block, Block];
    const moved = (block: Block): Block => ({
      ...block,
      source: { ...block.source!, detached: true },
    });
    parsed.blocks = [moved(three), moved(one), two];
    // `two` still carries the blank line that followed it; dropping it is the caller's call.
    expect(serializeMarkdown(parsed)).toBe('three\n\none\n\ntwo\n\n');
  });

  it('adds a newline before appending to a file that had none', () => {
    const parsed = parseMarkdown('no newline');
    parsed.blocks.push({ type: 'paragraph', text: 'more', props: {}, children: [] });
    expect(serializeMarkdown(parsed)).toBe('no newline\n\nmore\n');
  });

  it('writes every block type from scratch', () => {
    const block = (
      type: Block['type'],
      text: string,
      props: Block['props'] = {},
      children: Block[] = [],
    ): Block => ({
      type,
      text,
      props,
      children,
    });
    const markdown = serializeMarkdown({
      meta: { title: 'New', pinned: true },
      blocks: [
        block('heading', 'Head', { level: 2 }),
        block('paragraph', 'para'),
        block('list-item', 'one', {}, [block('list-item', 'nested')]),
        block('list-item', 'first', { ordered: true, number: 1 }),
        block('task', 'todo', { checked: false }),
        block('quote', 'said\nthem'),
        block('callout', 'body', { kind: 'tip', title: 'Hint' }),
        block('code', 'x = 1', { language: 'py' }),
        block('image', '_media/a.png', { alt: 'A' }),
        block('divider', ''),
      ],
    });
    expect(markdown).toBe(
      '---\ntitle: New\npinned: true\n---\n\n## Head\n\npara\n\n- one\n  - nested\n\n1. first\n\n- [ ] todo\n\n' +
        '> said\n> them\n\n> [!tip] Hint\n> body\n\n```py\nx = 1\n```\n\n![A](_media/a.png)\n\n---\n',
    );
    // And what was written reads back as the same blocks.
    const again = parseMarkdown(markdown);
    expect(again.blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'list-item',
      'list-item',
      'task',
      'quote',
      'callout',
      'code',
      'image',
      'divider',
    ]);
    expect(again.blocks[2]?.children[0]?.text).toBe('nested');
  });
});

describe('filebridge: frontmatter', () => {
  const source =
    '---\ntitle:   Spaced\n# a comment\ntags: [a,  b]\naliases:\n- one\n- two\n---\nbody\n';

  it('changes one key and leaves every other line exactly as written', () => {
    const parsed = parseMarkdown(source);
    parsed.meta.pinned = true;
    parsed.meta.title = 'Renamed';
    expect(serializeMarkdown(parsed)).toBe(
      '---\ntitle: Renamed\n# a comment\ntags: [a,  b]\naliases:\n- one\n- two\npinned: true\n---\nbody\n',
    );
  });

  it('removes a key, including a multi-line value', () => {
    const parsed = parseMarkdown(source);
    delete parsed.meta.aliases;
    expect(serializeMarkdown(parsed)).toBe(
      '---\ntitle:   Spaced\n# a comment\ntags: [a,  b]\n---\nbody\n',
    );
  });

  it('adds frontmatter to a note that had none, and removes it when emptied', () => {
    const parsed = parseMarkdown('# Note\n');
    parsed.meta.color = 'blue';
    const withMeta = serializeMarkdown(parsed);
    expect(withMeta).toBe('---\ncolor: blue\n---\n\n# Note\n');
    const again = parseMarkdown(withMeta);
    delete again.meta.color;
    expect(serializeMarkdown(again)).toBe('\n# Note\n');
  });

  it('never rewrites frontmatter it could not parse', () => {
    const broken = '---\nnot: [valid\n---\n\nbody\n';
    const parsed = parseMarkdown(broken);
    expect(parsed.meta).toEqual({});
    expect(serializeMarkdown(parsed)).toBe(broken);
  });
});

describe('filebridge: inline markdown', () => {
  it('parses marks, links and wiki links', () => {
    expect(parseInline('a **b** *c* `d` ~~e~~ [f](http://x) [[G|h]]')).toEqual([
      { type: 'text', text: 'a ', marks: [] },
      { type: 'text', text: 'b', marks: ['strong'] },
      { type: 'text', text: ' ', marks: [] },
      { type: 'text', text: 'c', marks: ['em'] },
      { type: 'text', text: ' ', marks: [] },
      { type: 'text', text: 'd', marks: ['code'] },
      { type: 'text', text: ' ', marks: [] },
      { type: 'text', text: 'e', marks: ['strike'] },
      { type: 'text', text: ' ', marks: [] },
      { type: 'text', text: 'f', marks: [], href: 'http://x' },
      { type: 'text', text: ' ', marks: [] },
      { type: 'wikilink', target: 'G', alias: 'h' },
    ]);
  });

  it('leaves snake_case, lone asterisks and escapes as text', () => {
    expect(inlineToPlainText('snake_case_name 2 * 3 * 4 \\*not em\\*')).toBe(
      'snake_case_name 2 * 3 * 4 *not em*',
    );
  });

  it('is stable: serialise then parse gives the same tree', () => {
    const samples = [
      'plain text',
      'a **bold *both* bold** z',
      'code `a*b` and ``tick ` inside``',
      'link [**bold** label](https://example.com/a_b) end',
      'wiki [[Note]] and [[Folder/Note|alias]] and ![[pic.png]]',
      'line one\nline two',
      'snake_case and 5 * 3 and a_b_c',
      'literal \\* star and \\[\\[not a link]]',
      'https://example.com/path?q=1 bare url',
    ];
    for (const sample of samples) {
      const tree = parseInline(sample);
      expect(parseInline(serializeInline(tree)), sample).toEqual(tree);
    }
  });

  it('finds wiki links, with block anchors', () => {
    expect(extractWikiLinks('[[A]] ![[b.png]] [[C#Heading]] [[D#^blk|alias]] [[ ]]')).toEqual([
      { target: 'A' },
      { target: 'b.png' },
      { target: 'C' },
      { target: 'D', blockId: 'blk' },
    ]);
  });
});
