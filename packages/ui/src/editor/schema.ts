import { Schema, type NodeSpec } from 'prosemirror-model';

/**
 * The editor's document: a flat list of blocks. Nesting (lists inside lists) is an
 * `indent` attribute rather than a nested node, which keeps drag-to-reorder and
 * keyboard handling simple; convert.ts turns it back into the block tree.
 *
 * `key` ties a node to the block it was loaded from, so an untouched block is
 * written back from its original source text.
 */
const key = { key: { default: null } };

const block = (spec: NodeSpec): NodeSpec => ({ group: 'block', ...spec });

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: block({
      content: 'inline*',
      attrs: key,
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', { class: 'b b-paragraph' }, 0],
    }),
    heading: block({
      content: 'inline*',
      attrs: { ...key, level: { default: 1 } },
      defining: true,
      parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
      toDOM: (node) => [`h${node.attrs.level as number}`, { class: 'b b-heading' }, 0],
    }),
    list_item: block({
      content: 'inline*',
      attrs: {
        ...key,
        ordered: { default: false },
        number: { default: 1 },
        indent: { default: 0 },
      },
      defining: true,
      parseDOM: [{ tag: 'li' }],
      toDOM: (node) => [
        'div',
        {
          class: 'b b-list',
          'data-ordered': String(node.attrs.ordered),
          style: `--indent:${node.attrs.indent as number}`,
        },
        0,
      ],
    }),
    task: block({
      content: 'inline*',
      attrs: { ...key, checked: { default: false }, indent: { default: 0 } },
      defining: true,
      toDOM: (node) => [
        'div',
        {
          class: 'b b-task',
          'data-checked': String(node.attrs.checked),
          style: `--indent:${node.attrs.indent as number}`,
        },
        [
          'span',
          {
            class: 'b-check',
            contenteditable: 'false',
            role: 'checkbox',
            'aria-checked': String(node.attrs.checked),
            'aria-label': 'Done',
          },
        ],
        ['div', { class: 'b-content' }, 0],
      ],
    }),
    quote: block({
      content: 'inline*',
      attrs: key,
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: () => ['blockquote', { class: 'b b-quote' }, 0],
    }),
    callout: block({
      content: 'inline*',
      attrs: { ...key, kind: { default: 'note' }, title: { default: '' } },
      defining: true,
      toDOM: (node) => [
        'div',
        { class: 'b b-callout', 'data-kind': node.attrs.kind as string },
        [
          'div',
          { class: 'b-callout-title', contenteditable: 'false' },
          (node.attrs.title as string) || (node.attrs.kind as string),
        ],
        ['div', { class: 'b-content' }, 0],
      ],
    }),
    code_block: block({
      content: 'text*',
      marks: '',
      code: true,
      defining: true,
      attrs: {
        ...key,
        language: { default: '' },
        info: { default: '' },
        kind: { default: 'code' },
      },
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
      toDOM: (node) => [
        'pre',
        { class: 'b b-code', 'data-language': (node.attrs.language as string) || 'text' },
        ['code', 0],
      ],
    }),
    /** Markdown the editor has no dedicated view for (tables, embeds): edited as source. */
    raw: block({
      content: 'text*',
      marks: '',
      code: true,
      attrs: { ...key, blockType: { default: 'table-row' } },
      toDOM: (node) => [
        'pre',
        { class: 'b b-raw', 'data-type': node.attrs.blockType as string },
        0,
      ],
    }),
    image: block({
      atom: true,
      attrs: { ...key, src: { default: '' }, alt: { default: '' }, embed: { default: false } },
      toDOM: (node) => ['figure', { class: 'b b-image', 'data-src': node.attrs.src as string }],
    }),
    divider: block({
      atom: true,
      attrs: key,
      parseDOM: [{ tag: 'hr' }],
      toDOM: () => ['div', { class: 'b b-divider' }, ['hr']],
    }),
    text: { group: 'inline' },
    hard_break: {
      group: 'inline',
      inline: true,
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
    },
    wikilink: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { target: { default: '' }, alias: { default: '' }, embed: { default: false } },
      toDOM: (node) => [
        'a',
        {
          class: 'wikilink',
          'data-target': node.attrs.target as string,
          href: '#',
          draggable: 'false',
        },
        (node.attrs.alias as string) || (node.attrs.target as string),
      ],
    },
  },
  marks: {
    link: {
      attrs: { href: { default: '' } },
      inclusive: false,
      parseDOM: [{ tag: 'a[href]', getAttrs: (dom) => ({ href: dom.getAttribute('href') }) }],
      toDOM: (mark) => [
        'a',
        {
          href: mark.attrs.href as string,
          class: 'link',
          rel: 'noreferrer noopener',
          target: '_blank',
        },
        0,
      ],
    },
    strong: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }], toDOM: () => ['strong', 0] },
    em: { parseDOM: [{ tag: 'em' }, { tag: 'i' }], toDOM: () => ['em', 0] },
    strike: { parseDOM: [{ tag: 's' }, { tag: 'del' }], toDOM: () => ['s', 0] },
    code: { parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] },
  },
});

export const LIST_TYPES = new Set(['list_item', 'task']);
