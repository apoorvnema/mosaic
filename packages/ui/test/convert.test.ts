import { parseMarkdown, serializeMarkdown } from '@mosaic/core';
import { readdirSync, readFileSync } from 'node:fs';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { blocksToDoc, docToBlocks } from '../src/editor/convert';
import { schema } from '../src/editor/schema';

const throughEditor = (source: string) => {
  const parsed = parseMarkdown(source);
  const { doc, originals } = blocksToDoc(parsed.blocks);
  return serializeMarkdown({ ...parsed, blocks: docToBlocks(doc, originals) });
};

// Opening a note in the editor and saving it without typing must not change the file.
describe('editor conversion', () => {
  const dir = new URL('../../core/test/fixtures/', import.meta.url);
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.md'))) {
    it(`an untouched note is saved byte-identically: ${name}`, () => {
      const source = readFileSync(new URL(name, dir), 'utf8');
      expect(throughEditor(source)).toBe(source);
    });
  }

  it('rewrites only the block that was edited', () => {
    const source =
      '# Title\n\n* keep  this   spacing\n* and __this__ style\n\nedit me\n\n1) last\n';
    const parsed = parseMarkdown(source);
    const { doc, originals } = blocksToDoc(parsed.blocks);
    let from = 0;
    doc.forEach((node, offset) => {
      if (node.textContent === 'edit me') from = offset + 1;
    });
    // Replace the word "edit" the way typing would.
    const next = EditorState.create({ doc }).tr.insertText('changed', from, from + 4).doc;
    expect(serializeMarkdown({ ...parsed, blocks: docToBlocks(next, originals) })).toBe(
      source.replace('edit me', 'changed me'),
    );
  });

  it('turns indentation back into nesting', () => {
    const { nodes } = schema;
    const doc = nodes.doc.create(null, [
      nodes.list_item.create({ indent: 0 }, schema.text('a')),
      nodes.list_item.create({ indent: 1 }, schema.text('b')),
      nodes.task.create({ indent: 2, checked: true }, schema.text('c')),
      nodes.list_item.create({ indent: 5 }, schema.text('too deep')),
      nodes.list_item.create({ indent: 0 }, schema.text('d')),
      nodes.paragraph.create(null, schema.text('after')),
    ]);
    const blocks = docToBlocks(doc, new Map());
    expect(serializeMarkdown({ meta: {}, blocks })).toBe(
      '- a\n  - b\n    - [x] c\n      - too deep\n- d\n\nafter\n',
    );
  });

  it('numbers new ordered items after the one above', () => {
    const { nodes } = schema;
    const item = (text: string) =>
      nodes.list_item.create({ ordered: true, indent: 0 }, schema.text(text));
    const blocks = docToBlocks(
      nodes.doc.create(null, [item('one'), item('two'), item('three')]),
      new Map(),
    );
    expect(serializeMarkdown({ meta: {}, blocks })).toBe('1. one\n2. two\n3. three\n');
  });

  it('keeps inline formatting through the editor model', () => {
    const { doc, originals } = blocksToDoc(
      parseMarkdown('a **b** [[Note|alias]] `c` [d](http://e)\n').blocks,
    );
    const paragraph = doc.firstChild!;
    expect(paragraph.childCount).toBe(8);
    expect(paragraph.child(3).type.name).toBe('wikilink');
    // Force regeneration by dropping the originals: the markdown must come out the same.
    expect(serializeMarkdown({ meta: {}, blocks: docToBlocks(doc, new Map()) })).toBe(
      'a **b** [[Note|alias]] `c` [d](http://e)\n',
    );
    expect(originals.size).toBe(1);
  });

  it('treats an empty editor as an empty note', () => {
    const { doc, originals } = blocksToDoc([]);
    expect(docToBlocks(doc, originals)).toEqual([]);
  });
});
