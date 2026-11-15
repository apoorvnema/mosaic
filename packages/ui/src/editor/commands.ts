import { splitBlockAs } from 'prosemirror-commands';
import { InputRule, inputRules, textblockTypeInputRule } from 'prosemirror-inputrules';
import type { MarkType, Node as PMNode } from 'prosemirror-model';
import { TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { LIST_TYPES, schema } from './schema';

const { nodes, marks } = schema;
const isList = (node: PMNode) => LIST_TYPES.has(node.type.name);

/** Position and node of the top-level block holding the cursor. */
export function currentBlock(state: EditorState): { pos: number; node: PMNode; index: number } {
  const { $from } = state.selection;
  const index = $from.index(0);
  const pos = $from.depth === 0 ? $from.pos : $from.before(1);
  return { pos, node: state.doc.child(Math.min(index, state.doc.childCount - 1)), index };
}

/** Enter: continue a list, leave a heading, or end an empty list item. */
export const enter: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const node = $from.parent;
  if (!node.isTextblock || node.type.spec.code) return false;
  if (isList(node) && node.content.size === 0) {
    const { pos } = currentBlock(state);
    const indent = node.attrs.indent as number;
    if (dispatch) {
      dispatch(
        indent > 0
          ? state.tr.setNodeAttribute(pos, 'indent', indent - 1)
          : state.tr.setBlockType(pos, pos + node.nodeSize, nodes.paragraph, {
              key: node.attrs.key as number,
            }),
      );
    }
    return true;
  }
  return splitBlockAs((current, atEnd) => {
    if (isList(current))
      return { type: current.type, attrs: { ...current.attrs, key: null, checked: false } };
    if (current.type === nodes.paragraph || atEnd) return { type: nodes.paragraph };
    return { type: current.type, attrs: { ...current.attrs, key: null } };
  })(state, dispatch);
};

/** Backspace at the start of a block: outdent, then turn it back into plain text. */
export const backspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const node = $from.parent;
  if (!empty || $from.parentOffset !== 0 || !node.isTextblock || node.type === nodes.paragraph)
    return false;
  if (node.type.spec.code && node.content.size > 0) return false;
  const { pos } = currentBlock(state);
  if (dispatch) {
    const indent = isList(node) ? (node.attrs.indent as number) : 0;
    dispatch(
      indent > 0
        ? state.tr.setNodeAttribute(pos, 'indent', indent - 1)
        : state.tr.setBlockType(pos, pos + node.nodeSize, nodes.paragraph, {
            key: node.attrs.key as number,
          }),
    );
  }
  return true;
};

export function indent(delta: 1 | -1): Command {
  return (state, dispatch) => {
    const { pos, node, index } = currentBlock(state);
    if (node.type.spec.code) {
      if (delta === 1 && dispatch) dispatch(state.tr.insertText('  '));
      return delta === 1;
    }
    if (!isList(node)) return false;
    const above = index > 0 ? state.doc.child(index - 1) : undefined;
    const max = above && isList(above) ? (above.attrs.indent as number) + 1 : 0;
    const next = Math.max(0, Math.min(max, (node.attrs.indent as number) + delta));
    if (dispatch && next !== node.attrs.indent)
      dispatch(state.tr.setNodeAttribute(pos, 'indent', next));
    return true;
  };
}

/** Move the current block above or below its neighbour (the keyboard's drag-to-reorder). */
export function moveBlock(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const { pos, node, index } = currentBlock(state);
    const target = index + direction;
    if (target < 0 || target >= state.doc.childCount) return false;
    if (dispatch) {
      const offset = state.selection.from - pos;
      const tr = state.tr.delete(pos, pos + node.nodeSize);
      const insertAt =
        direction === -1
          ? pos - state.doc.child(target).nodeSize
          : pos + state.doc.child(target).nodeSize;
      tr.insert(insertAt, node);
      const anchor = Math.min(insertAt + offset, tr.doc.content.size);
      dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(anchor))).scrollIntoView());
    }
    return true;
  };
}

/** Arrow down on the last line of a note that ends in code (or an image): add a line to type on. */
export const leaveLastBlock: Command = (state, dispatch) => {
  const { $to, empty } = state.selection;
  const last = state.doc.lastChild;
  if (!empty || !last || !(last.type.spec.code || last.isAtom)) return false;
  if ($to.depth > 0 && $to.node(1) !== last) return false;
  if ($to.depth === 0 && $to.pos < state.doc.content.size - last.nodeSize) return false;
  // Still lines below the caret inside the block: let the arrow key move normally.
  if (last.isTextblock && last.textContent.slice($to.parentOffset).includes('\n')) return false;
  if (dispatch) {
    const tr = state.tr.insert(state.doc.content.size, nodes.paragraph.create());
    dispatch(
      tr.setSelection(TextSelection.near(tr.doc.resolve(tr.doc.content.size - 1))).scrollIntoView(),
    );
  }
  return true;
};

export const toggleTask: Command = (state, dispatch) => {
  const { pos, node } = currentBlock(state);
  if (node.type !== nodes.task) return false;
  if (dispatch) dispatch(state.tr.setNodeAttribute(pos, 'checked', !node.attrs.checked));
  return true;
};

export const hardBreak: Command = (state, dispatch) => {
  const node = state.selection.$from.parent;
  if (!node.isTextblock) return false;
  if (dispatch) {
    dispatch(
      node.type.spec.code
        ? state.tr.insertText('\n')
        : state.tr.replaceSelectionWith(nodes.hard_break.create()).scrollIntoView(),
    );
  }
  return true;
};

/** What the slash menu can turn a block into. */
export type BlockChoice =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'numbered'
  | 'task'
  | 'quote'
  | 'callout'
  | 'code'
  | 'divider';

/** Replace `[from, to)` (the typed `/query`) and turn the block into `choice`. */
export function applyBlockChoice(
  state: EditorState,
  choice: BlockChoice,
  from: number,
  to: number,
): Transaction {
  const tr = state.tr.delete(from, to);
  const $pos = tr.doc.resolve(from);
  const pos = $pos.before(1);
  const node = $pos.node(1);
  const keep = { key: node.attrs.key as number | null };
  const indentAttr = isList(node) ? (node.attrs.indent as number) : 0;
  const set = (type: (typeof nodes)[string], attrs: Record<string, unknown> = {}) =>
    tr.setBlockType(pos, pos + node.nodeSize, type, { ...keep, ...attrs });
  switch (choice) {
    case 'heading1':
    case 'heading2':
    case 'heading3':
      return set(nodes.heading, { level: Number(choice.at(-1)) });
    case 'bullet':
      return set(nodes.list_item, { indent: indentAttr });
    case 'numbered':
      return set(nodes.list_item, { ordered: true, indent: indentAttr });
    case 'task':
      return set(nodes.task, { indent: indentAttr });
    case 'quote':
      return set(nodes.quote);
    case 'callout':
      return set(nodes.callout, { kind: 'note' });
    case 'code':
      return node.content.size - (to - from) > 0 && !node.type.spec.code
        ? tr.setBlockType(pos, pos + node.nodeSize, nodes.code_block, keep)
        : set(nodes.code_block);
    case 'divider': {
      const end = pos + tr.doc.nodeAt(pos)!.nodeSize;
      tr.replaceWith(pos, end, [nodes.divider.create(), nodes.paragraph.create()]);
      return tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 2)));
    }
    default:
      return set(nodes.paragraph);
  }
}

function markRule(pattern: RegExp, mark: MarkType): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    const [whole, token = '', inner = ''] = match;
    const from = start + (whole!.length - token.length);
    if (!inner) return null;
    return state.tr
      .replaceWith(from, end, schema.text(inner, [mark.create()]))
      .removeStoredMark(mark);
  });
}

/** Markdown typed at the keyboard becomes structure as you go. */
export const markdownInputRules = inputRules({
  rules: [
    textblockTypeInputRule(/^(#{1,6})\s$/, nodes.heading, (match) => ({ level: match[1]!.length })),
    textblockTypeInputRule(/^[-+*]\s$/, nodes.list_item),
    textblockTypeInputRule(/^(\d+)[.)]\s$/, nodes.list_item, (match) => ({
      ordered: true,
      number: Number(match[1]),
    })),
    textblockTypeInputRule(/^>\s$/, nodes.quote),
    textblockTypeInputRule(/^```([\w+#-]*)\s$/, nodes.code_block, (match) => ({
      language: match[1] ?? '',
    })),
    // `[ ] ` makes a task, also inside a list item ("- [ ] " typed in full).
    new InputRule(/^\[([ xX]?)\]\s$/, (state, match, start, end) => {
      const parent = state.doc.resolve(start).parent;
      const keepIndent = isList(parent) ? (parent.attrs.indent as number) : 0;
      return state.tr.delete(start, end).setBlockType(start, start, nodes.task, {
        checked: /x/i.test(match[1] ?? ''),
        indent: keepIndent,
      });
    }),
    new InputRule(/^---$/, (state, _match, start) => {
      const $start = state.doc.resolve(start);
      if ($start.parent.type !== nodes.paragraph) return null;
      const pos = $start.before(1);
      const tr = state.tr.replaceWith(pos, pos + $start.parent.nodeSize, [
        nodes.divider.create(),
        nodes.paragraph.create(),
      ]);
      return tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 2)));
    }),
    new InputRule(/\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]$/, (state, match, start, end) =>
      state.tr.replaceWith(
        start,
        end,
        nodes.wikilink.create({ target: match[1]!.trim(), alias: match[2] ?? '' }),
      ),
    ),
    markRule(/(?:^|[\s(])(\*\*([^*\s][^*]*)\*\*)$/, marks.strong),
    markRule(/(?:^|[^*])(\*([^*\s][^*]*)\*)$/, marks.em),
    markRule(/(~~([^~\s][^~]*)~~)$/, marks.strike),
    markRule(/(`([^`]+)`)$/, marks.code),
  ],
});
