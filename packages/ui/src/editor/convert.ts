import {
  parseInline,
  serializeInline,
  type Block,
  type BlockType,
  type Inline,
  type InlineMark,
} from '@mosaic/core';
import { Fragment, type Mark, type Node as PMNode } from 'prosemirror-model';
import { LIST_TYPES, schema } from './schema';

const { nodes, marks } = schema;
const MARKS: InlineMark[] = ['strong', 'em', 'strike', 'code'];
type OwnFields = Pick<Block, 'type' | 'text' | 'props'>;

/** What the editor remembers about each loaded block, by key. */
export interface Original {
  block: Block;
  /** The block as it comes back from an untouched editor node. */
  canon: OwnFields;
  depth: number;
  /** Key of the block that came right before it in the file, if any. */
  after: number | null;
}

export interface LoadedDoc {
  doc: PMNode;
  originals: Map<number, Original>;
}

function inlineToFragment(text: string): Fragment {
  const out: PMNode[] = [];
  for (const node of parseInline(text)) {
    if (node.type === 'break') out.push(nodes.hard_break.create());
    else if (node.type === 'wikilink') {
      out.push(
        nodes.wikilink.create({
          target: node.target,
          alias: node.alias ?? '',
          embed: node.embed ?? false,
        }),
      );
    } else if (node.text) {
      const set: Mark[] = node.marks.map((mark) => marks[mark]!.create());
      if (node.href !== undefined) set.push(marks.link.create({ href: node.href }));
      out.push(schema.text(node.text, set));
    }
  }
  return Fragment.fromArray(out);
}

function fragmentToInline(node: PMNode): string {
  const out: Inline[] = [];
  node.forEach((child) => {
    if (child.type === nodes.hard_break) out.push({ type: 'break' });
    else if (child.type === nodes.wikilink) {
      out.push({
        type: 'wikilink',
        target: child.attrs.target as string,
        ...(child.attrs.alias ? { alias: child.attrs.alias as string } : {}),
        ...(child.attrs.embed ? { embed: true } : {}),
      });
    } else if (child.isText) {
      const link = child.marks.find((mark) => mark.type === marks.link);
      out.push({
        type: 'text',
        text: child.text ?? '',
        marks: MARKS.filter((name) => child.marks.some((mark) => mark.type === marks[name])),
        ...(link ? { href: link.attrs.href as string } : {}),
      });
    }
  });
  return serializeInline(out);
}

const textNode = (text: string) => (text ? [schema.text(text)] : []);

function blockToNode(block: Block, key: number, depth: number): PMNode {
  const p = block.props;
  switch (block.type) {
    case 'paragraph':
      return nodes.paragraph.create({ key }, inlineToFragment(block.text));
    case 'heading':
      return nodes.heading.create(
        { key, level: Number(p.level) || 1 },
        inlineToFragment(block.text),
      );
    case 'list-item':
      return nodes.list_item.create(
        { key, ordered: p.ordered === true, number: Number(p.number) || 1, indent: depth },
        inlineToFragment(block.text),
      );
    case 'task':
      return nodes.task.create(
        { key, checked: p.checked === true, indent: depth },
        inlineToFragment(block.text),
      );
    case 'quote':
      return nodes.quote.create({ key }, inlineToFragment(block.text));
    case 'callout':
      return nodes.callout.create(
        { key, kind: String(p.kind ?? 'note'), title: String(p.title ?? '') },
        inlineToFragment(block.text),
      );
    case 'code':
    case 'mermaid':
      return nodes.code_block.create(
        { key, language: String(p.language ?? ''), info: String(p.info ?? ''), kind: block.type },
        textNode(block.text),
      );
    case 'image':
      return nodes.image.create({
        key,
        src: block.text,
        alt: String(p.alt ?? ''),
        embed: p.embed === true,
      });
    case 'divider':
      return nodes.divider.create({ key });
    default:
      return nodes.raw.create({ key, blockType: block.type }, textNode(block.text));
  }
}

function nodeToOwn(node: PMNode): OwnFields {
  const a = node.attrs;
  switch (node.type) {
    case nodes.heading:
      return { type: 'heading', text: fragmentToInline(node), props: { level: a.level as number } };
    case nodes.list_item:
      return {
        type: 'list-item',
        text: fragmentToInline(node),
        props: a.ordered ? { ordered: true, number: a.number as number } : {},
      };
    case nodes.task:
      return {
        type: 'task',
        text: fragmentToInline(node),
        props: { checked: a.checked as boolean },
      };
    case nodes.quote:
      return { type: 'quote', text: fragmentToInline(node), props: {} };
    case nodes.callout:
      return {
        type: 'callout',
        text: fragmentToInline(node),
        props: { kind: a.kind as string, ...(a.title ? { title: a.title as string } : {}) },
      };
    case nodes.code_block:
      return {
        type: a.kind === 'mermaid' ? 'mermaid' : 'code',
        text: node.textContent,
        props: {
          ...(a.language ? { language: a.language as string } : {}),
          ...(a.info ? { info: a.info as string } : {}),
        },
      };
    case nodes.image:
      return {
        type: 'image',
        text: a.src as string,
        props: a.embed ? { embed: true } : a.alt ? { alt: a.alt as string } : {},
      };
    case nodes.divider:
      return { type: 'divider', text: '', props: {} };
    case nodes.raw:
      return { type: a.blockType as BlockType, text: node.textContent, props: {} };
    default:
      return { type: 'paragraph', text: fragmentToInline(node), props: {} };
  }
}

const same = (a: OwnFields, b: OwnFields) =>
  a.type === b.type && a.text === b.text && JSON.stringify(a.props) === JSON.stringify(b.props);

/** The block tree as an editor document. */
export function blocksToDoc(blocks: readonly Block[]): LoadedDoc {
  const originals = new Map<number, Original>();
  const out: PMNode[] = [];
  const walk = (list: readonly Block[], depth: number) => {
    for (const block of list) {
      const key = originals.size + 1;
      const node = blockToNode(block, key, depth);
      originals.set(key, { block, canon: nodeToOwn(node), depth, after: key > 1 ? key - 1 : null });
      out.push(node);
      walk(block.children, block.type === 'list-item' || block.type === 'task' ? depth + 1 : depth);
    }
  };
  walk(blocks, 0);
  if (out.length === 0) out.push(nodes.paragraph.create());
  return { doc: nodes.doc.create(null, out), originals };
}

/**
 * The editor document back to a block tree. A node that still matches the block it
 * was loaded from returns that very block — source text and all — so the file bridge
 * rewrites only what was actually edited.
 */
export function docToBlocks(doc: PMNode, originals: ReadonlyMap<number, Original>): Block[] {
  const roots: Block[] = [];
  const stack: { block: Block; depth: number }[] = [];
  const used = new Set<number>();
  const numbering: number[] = [];
  let previousKey: number | null = null;
  let lastBlock: Block | undefined;
  let lastKey: number | null = null;

  doc.forEach((node) => {
    // Markdown has no empty paragraph: one in the editor is just a place to type.
    if (node.type === nodes.paragraph && node.content.size === 0) return;
    const isList = LIST_TYPES.has(node.type.name);
    const wanted = isList ? (node.attrs.indent as number) : 0;
    // A list item can be at most one level deeper than the item above it.
    while (stack.length && stack.at(-1)!.depth >= wanted) stack.pop();
    const depth = isList ? stack.length : 0;
    if (!isList) stack.length = 0;

    const own = nodeToOwn(node);
    const key = node.attrs.key as number | null;
    const original = key !== null && !used.has(key) ? originals.get(key) : undefined;
    if (key !== null) used.add(key);

    // New ordered items continue the count of the item above them.
    if (own.type === 'list-item' && own.props.ordered) {
      numbering.length = depth + 1;
      if (!original) own.props.number = (numbering[depth] ?? 0) + 1;
      numbering[depth] = Number(own.props.number);
    } else numbering.length = depth;

    // A block that no longer follows its old neighbour cannot rely on the old spacing.
    const moved = original !== undefined && original.after !== previousKey;
    previousKey = original ? key : null;

    let block: Block;
    if (original && original.depth === depth && same(own, original.canon)) {
      block = { ...original.block, children: [] };
      if (moved && block.source) block.source = { ...block.source, detached: true };
    } else {
      block = { ...own, children: [] };
      if (original?.block.id) block.id = original.block.id;
      // Same depth: keep the original's indentation, marker and trailing blank lines.
      if (original?.block.source && original.depth === depth) {
        block.source = moved ? { ...original.block.source, detached: true } : original.block.source;
      }
    }

    lastBlock = block;
    lastKey = original ? key : null;
    if (depth === 0) roots.push(block);
    else stack.at(-1)!.block.children.push(block);
    if (isList) stack.push({ block, depth });
  });

  // An editor always holds at least one paragraph; an empty one is an empty note.
  if (
    roots.length === 1 &&
    roots[0]!.type === 'paragraph' &&
    roots[0]!.text === '' &&
    !roots[0]!.source
  )
    return [];
  // If the block that ends the note is not the one that ended the file, the blank
  // lines it carries were a gap between blocks, not something to leave at the end.
  if (lastBlock?.source?.trailing && lastKey !== originals.size) {
    lastBlock.source = { ...lastBlock.source, trailing: '' };
  }
  return roots;
}
