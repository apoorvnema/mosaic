import type { Block } from '@mosaic/core';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState, NodeSelection, Plugin, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  applyBlockChoice,
  backspace,
  enter,
  hardBreak,
  indent,
  leaveLastBlock,
  markdownInputRules,
  moveBlock,
  toggleTask,
  type BlockChoice,
} from './commands';
import { blocksToDoc, docToBlocks, type Original } from './convert';
import { LIST_TYPES, schema } from './schema';

export interface NoteSuggestion {
  path: string;
  title: string;
}

export interface EditorProps {
  /** Changing this replaces the document (a different note, or an external edit). */
  docKey: string;
  blocks: readonly Block[];
  onChange(blocks: Block[]): void;
  /** Notes matching what was typed after `[[`. */
  suggestNotes(query: string): Promise<NoteSuggestion[]>;
  /** A wiki link was clicked. */
  onOpenLink(target: string): void;
  /** Turn an image path from the note into something an <img> can load. */
  resolveMedia(src: string): Promise<string | undefined>;
  /** Store a picked image in the vault and return its path. */
  addMedia(file: File): Promise<string>;
  autoFocus?: boolean;
}

interface MenuItem {
  id: string;
  label: string;
  hint?: string;
}

interface MenuState {
  kind: 'slash' | 'wiki';
  from: number;
  to: number;
  query: string;
  left: number;
  top: number;
}

const SLASH_ITEMS: (MenuItem & { id: BlockChoice | 'image' })[] = [
  { id: 'paragraph', label: 'Text' },
  { id: 'heading1', label: 'Heading 1', hint: '#' },
  { id: 'heading2', label: 'Heading 2', hint: '##' },
  { id: 'heading3', label: 'Heading 3', hint: '###' },
  { id: 'bullet', label: 'Bullet list', hint: '-' },
  { id: 'numbered', label: 'Numbered list', hint: '1.' },
  { id: 'task', label: 'To-do', hint: '[ ]' },
  { id: 'quote', label: 'Quote', hint: '>' },
  { id: 'callout', label: 'Callout' },
  { id: 'code', label: 'Code', hint: '```' },
  { id: 'divider', label: 'Divider', hint: '---' },
  { id: 'image', label: 'Image' },
];

/** Where a `/` or `[[` menu should open, if the cursor is in one. */
function findTrigger(view: EditorView): MenuState | null {
  const { selection } = view.state;
  const { $from, empty } = selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
  const wiki = /\[\[([^\][\n￼]*)$/.exec(before);
  const slash = wiki ? null : /^\/([\w ]*)$/.exec(before);
  const match = wiki ?? slash;
  if (!match) return null;
  const from = $from.pos - match[0].length;
  const coords = view.coordsAtPos(from);
  return {
    kind: wiki ? 'wiki' : 'slash',
    from,
    to: $from.pos,
    query: match[1] ?? '',
    left: coords.left,
    top: coords.bottom,
  };
}

/** Running numbers for ordered items, and the placeholder on an empty note. */
const decorations = new Plugin({
  props: {
    decorations(state) {
      const out: Decoration[] = [];
      const counters: number[] = [];
      state.doc.forEach((node, pos) => {
        if (node.type.name === 'list_item' && node.attrs.ordered) {
          const depth = node.attrs.indent as number;
          const number =
            counters[depth] === undefined ? (node.attrs.number as number) : counters[depth] + 1;
          counters.length = depth + 1;
          counters[depth] = number;
          out.push(Decoration.node(pos, pos + node.nodeSize, { 'data-number': String(number) }));
        } else if (LIST_TYPES.has(node.type.name))
          counters.length = (node.attrs.indent as number) + 1;
        else counters.length = 0;
      });
      const only = state.doc.childCount === 1 ? state.doc.firstChild! : undefined;
      if (only?.type.name === 'paragraph' && only.content.size === 0) {
        out.push(
          Decoration.node(0, only.nodeSize, {
            class: 'is-empty',
            'data-placeholder': 'Write, or type / for blocks',
          }),
        );
      }
      return DecorationSet.create(state.doc, out);
    },
  },
});

/**
 * The block editor. It works on blocks only: reading and writing files is the
 * caller's business, through core. Nothing in here touches a file system.
 */
export function Editor(props: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latest = useRef(props);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [found, setFound] = useState<{ query: string; items: MenuItem[] }>();
  const [active, setActive] = useState(0);
  const dismissed = useRef<number | null>(null);

  const items = useMemo<MenuItem[]>(() => {
    if (!menu) return [];
    if (menu.kind === 'wiki') return found?.query === menu.query ? found.items : [];
    const query = menu.query.trim().toLowerCase();
    return SLASH_ITEMS.filter((item) => item.label.toLowerCase().includes(query));
  }, [menu, found]);

  const menuRef = useRef<{ menu: MenuState | null; items: MenuItem[]; active: number }>({
    menu: null,
    items: [],
    active: 0,
  });
  useLayoutEffect(() => {
    latest.current = props;
    menuRef.current = { menu, items, active };
  });

  // Look up notes for what was typed after `[[`.
  const wikiQuery = menu?.kind === 'wiki' ? menu.query : undefined;
  useEffect(() => {
    if (wikiQuery === undefined) return;
    let live = true;
    void latest.current.suggestNotes(wikiQuery).then((notes) => {
      if (!live) return;
      const query = wikiQuery.trim();
      const list: MenuItem[] = notes.map((note) => ({
        id: note.path,
        label: note.title,
        hint: note.path,
      }));
      const exact = notes.some((note) => note.title.toLowerCase() === query.toLowerCase());
      if (query && !exact) list.push({ id: `new:${query}`, label: `Link to “${query}”` });
      setFound({ query: wikiQuery, items: list });
    });
    return () => {
      live = false;
    };
  }, [wikiQuery]);

  function choose(item: MenuItem | undefined): void {
    const view = viewRef.current;
    const current = menuRef.current.menu;
    if (!view || !current || !item) return;
    if (current.kind === 'wiki') {
      // Link by file name: that is what resolves, here and in any other markdown tool.
      const target = item.id.startsWith('new:')
        ? item.id.slice(4)
        : item.id.slice(item.id.lastIndexOf('/') + 1).replace(/\.(md|markdown)$/i, '');
      view.dispatch(
        view.state.tr.replaceWith(
          current.from,
          current.to,
          schema.nodes.wikilink.create({ target }),
        ),
      );
    } else if (item.id === 'image') {
      view.dispatch(view.state.tr.delete(current.from, current.to));
      fileInput.current?.click();
    } else {
      view.dispatch(applyBlockChoice(view.state, item.id as BlockChoice, current.from, current.to));
    }
    setMenu(null);
    view.focus();
  }

  async function insertImage(file: File | undefined): Promise<void> {
    const view = viewRef.current;
    if (!view || !file) return;
    const src = await latest.current.addMedia(file);
    const { $from } = view.state.selection;
    const image = schema.nodes.image.create({ src, alt: file.name.replace(/\.[^.]+$/, '') });
    const empty = $from.parent.isTextblock && $from.parent.content.size === 0;
    const pos = $from.depth === 0 ? $from.pos : empty ? $from.before(1) : $from.after(1);
    const tr = empty
      ? view.state.tr.replaceWith(pos, pos + $from.parent.nodeSize, image)
      : view.state.tr.insert(pos, image);
    if (!tr.doc.nodeAt(pos + 1)) tr.insert(pos + 1, schema.nodes.paragraph.create());
    view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1))).scrollIntoView());
    view.focus();
  }

  useEffect(() => {
    const loaded = blocksToDoc(latest.current.blocks);
    const originals: ReadonlyMap<number, Original> = loaded.originals;
    let hovered: number | null = null;
    let draggingBlock = false;

    const menuKeys = new Plugin({
      props: {
        handleKeyDown(_view, event) {
          const { menu: open, items: list, active: index } = menuRef.current;
          if (!open || list.length === 0) return false;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            setActive((index + (event.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length);
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            choose(list[index]);
            return true;
          }
          if (event.key === 'Escape') {
            dismissed.current = open.from;
            setMenu(null);
            return true;
          }
          return false;
        },
      },
    });

    const view = new EditorView(host.current!, {
      state: EditorState.create({
        doc: loaded.doc,
        plugins: [
          menuKeys,
          markdownInputRules,
          keymap({
            Enter: enter,
            'Shift-Enter': hardBreak,
            Backspace: backspace,
            Tab: indent(1),
            'Shift-Tab': indent(-1),
            'Alt-ArrowUp': moveBlock(-1),
            'Alt-ArrowDown': moveBlock(1),
            ArrowDown: leaveLastBlock,
            'Mod-Enter': toggleTask,
            'Mod-b': toggleMark(schema.marks.strong),
            'Mod-i': toggleMark(schema.marks.em),
            'Mod-e': toggleMark(schema.marks.code),
            'Mod-Shift-x': toggleMark(schema.marks.strike),
            'Mod-z': undo,
            'Mod-y': redo,
            'Mod-Shift-z': redo,
          }),
          keymap(baseKeymap),
          history(),
          dropCursor({ color: 'var(--accent)', width: 2 }),
          gapCursor(),
          decorations,
        ],
      }),
      attributes: {
        class: 'm-editor',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Note',
      },
      dispatchTransaction(tr) {
        const state = view.state.apply(tr);
        view.updateState(state);
        if (tr.docChanged) latest.current.onChange(docToBlocks(state.doc, originals));
        const trigger = view.hasFocus() ? findTrigger(view) : null;
        if (!trigger) dismissed.current = null;
        const next = trigger && dismissed.current !== trigger.from ? trigger : null;
        if (next?.query !== menuRef.current.menu?.query) setActive(0);
        setMenu(next);
      },
      nodeViews: {
        image(node) {
          const figure = document.createElement('figure');
          figure.className = 'b b-image';
          const img = document.createElement('img');
          img.alt = node.attrs.alt as string;
          img.draggable = false;
          figure.append(img);
          const src = node.attrs.src as string;
          if (/^(https?:|data:|blob:)/.test(src)) img.src = src;
          else {
            void latest.current.resolveMedia(src).then((url) => {
              if (url) img.src = url;
              else figure.dataset.missing = src;
            });
          }
          return { dom: figure };
        },
      },
      // A block dragged by its handle lands above or below the block it is dropped on,
      // decided by which half of that block the pointer is over.
      handleDrop(v, event) {
        const { selection, doc } = v.state;
        if (!draggingBlock || !(selection instanceof NodeSelection)) return false;
        draggingBlock = false;
        let insertAt = doc.content.size;
        let decided = false;
        doc.forEach((_child, offset) => {
          const box = (v.nodeDOM(offset) as HTMLElement | null)?.getBoundingClientRect();
          if (decided || !box || event.clientY >= box.top + box.height / 2) return;
          insertAt = offset;
          decided = true;
        });
        const { from, node } = selection;
        if (insertAt !== from && insertAt !== from + node.nodeSize) {
          const tr = v.state.tr.delete(from, from + node.nodeSize);
          const at = tr.mapping.map(insertAt);
          tr.insert(at, node);
          v.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView());
        }
        event.preventDefault();
        return true;
      },
      handleDOMEvents: {
        mousedown(v, event) {
          const target = event.target as HTMLElement;
          if (target.classList.contains('b-check')) {
            const pos = v.state.doc.resolve(v.posAtDOM(target.parentElement!, 0)).before(1);
            const node = v.state.doc.nodeAt(pos);
            if (node) v.dispatch(v.state.tr.setNodeAttribute(pos, 'checked', !node.attrs.checked));
            event.preventDefault();
            return true;
          }
          return false;
        },
        click(_v, event) {
          const link = (event.target as HTMLElement).closest('a');
          if (!link) return false;
          event.preventDefault();
          if (link.classList.contains('wikilink'))
            latest.current.onOpenLink(link.dataset.target ?? '');
          else if (event.ctrlKey || event.metaKey)
            window.open(link.getAttribute('href') ?? '', '_blank', 'noopener');
          return true;
        },
        mousemove(v, event) {
          // Float the drag handle beside whichever block the pointer is over.
          const grip = handle.current;
          const box = host.current?.getBoundingClientRect();
          if (!grip || !box) return false;
          const found = v.posAtCoords({ left: box.left + 40, top: event.clientY });
          if (!found) return false;
          const $pos = v.state.doc.resolve(found.pos);
          const pos = $pos.depth === 0 ? found.inside : $pos.before(1);
          const dom = pos >= 0 ? (v.nodeDOM(pos) as HTMLElement | null) : null;
          if (!dom?.getBoundingClientRect) return false;
          hovered = pos;
          grip.style.top = `${dom.getBoundingClientRect().top - box.top + 2}px`;
          grip.dataset.visible = 'true';
          return false;
        },
      },
    });
    viewRef.current = view;
    if (latest.current.autoFocus) view.focus();

    const grip = handle.current!;
    const selectHovered = () => {
      if (hovered === null || !view.state.doc.nodeAt(hovered)) return false;
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, hovered)));
      return true;
    };
    const onDragStart = (event: DragEvent) => {
      if (!selectHovered() || !event.dataTransfer) return;
      const dom = view.nodeDOM(hovered!) as HTMLElement;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', dom.textContent ?? '');
      event.dataTransfer.setDragImage(dom, 0, 0);
      // Tell ProseMirror this is a move of the selected block; it handles the drop.
      view.dragging = { slice: view.state.selection.content(), move: true };
      draggingBlock = true;
    };
    const onClick = () => {
      if (selectHovered()) view.focus();
    };
    grip.addEventListener('dragstart', onDragStart);
    grip.addEventListener('click', onClick);

    return () => {
      grip.removeEventListener('dragstart', onDragStart);
      grip.removeEventListener('click', onClick);
      view.destroy();
      viewRef.current = null;
      setMenu(null);
    };
  }, [props.docKey]);

  return (
    <div
      className="m-editor-wrap"
      onMouseLeave={() => handle.current?.removeAttribute('data-visible')}
    >
      {/* A div, not a button: browsers will not start a native drag from a <button>. */}
      <div
        ref={handle}
        className="m-drag-handle"
        draggable
        role="button"
        aria-label="Drag to move this block. From the keyboard, use Alt with the up or down arrow."
      >
        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
          {[2, 8, 14].flatMap((y) =>
            [2, 8].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />),
          )}
        </svg>
      </div>
      <div ref={host} />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        data-testid="image-input"
        onChange={(event) => {
          void insertImage(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {menu && items.length > 0 && (
        <div
          className="m-menu"
          role="listbox"
          aria-label={menu.kind === 'slash' ? 'Insert block' : 'Link to note'}
          style={{ left: menu.left, top: menu.top + 6 }}
        >
          {items.map((item, index) => (
            <div
              key={item.id}
              role="option"
              aria-selected={index === active}
              className="m-menu-item"
              onMouseDown={(event) => {
                event.preventDefault();
                choose(item);
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span>{item.label}</span>
              {item.hint && <span className="m-menu-hint">{item.hint}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
