import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Block, BlockSource, BlockType, NoteMeta, NoteSource } from '../store/types';

export interface ParsedMarkdown {
  meta: NoteMeta;
  blocks: Block[];
  source?: NoteSource;
}

interface Line {
  /** The whole line including its terminator. */
  raw: string;
  /** The line without its terminator. */
  text: string;
}

const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>/;
const TABLE = /^ {0,3}\|/;
const ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])(?:([ \t]+)(.*))?$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const CALLOUT = /^\[!([A-Za-z-]+)\][+-]?[ \t]*(.*)$/;
const TASK = /^\[( |x|X)\](?:[ \t]+(.*))?$/;
const BLOCK_ID = /(?:^|[ \t])\^([A-Za-z0-9-]+)$/;
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/;
const EMBED_IMAGE = /^!\[\[([^\]|]+\.(?:png|jpe?g|gif|webp|svg|avif|bmp))(?:\|[^\]]*)?\]\]$/i;

const isBlank = (line: Line | undefined) => line !== undefined && line.text.trim() === '';

function splitLines(source: string): Line[] {
  const lines: Line[] = [];
  const pattern = /[^\r\n]*(?:\r\n|\n|\r|$)/g;
  for (const match of source.matchAll(pattern)) {
    if (match[0] === '') continue;
    lines.push({ raw: match[0], text: match[0].replace(/[\r\n]+$/, '') });
  }
  return lines;
}

function indentWidth(whitespace: string): number {
  let width = 0;
  for (const ch of whitespace) width = ch === '\t' ? width + 4 - (width % 4) : width + 1;
  return width;
}

/** Remove up to `width` columns of leading whitespace. */
function dedent(text: string, width: number): string {
  let i = 0;
  let col = 0;
  while (i < text.length && col < width && (text[i] === ' ' || text[i] === '\t')) {
    col = text[i] === '\t' ? col + 4 - (col % 4) : col + 1;
    i++;
  }
  return text.slice(i);
}

function snapshotOf(block: Block): string {
  const props = Object.keys(block.props)
    .sort()
    .map((key) => [key, block.props[key]]);
  return JSON.stringify([block.type, block.text, block.id ?? null, props]);
}

/** Pull a trailing ` ^block-id` off the last line of a text block. */
function takeBlockId(text: string): { text: string; id?: string } {
  const match = BLOCK_ID.exec(text);
  if (!match) return { text };
  return { text: text.slice(0, match.index), id: match[1]! };
}

class Parser {
  private i = 0;
  private last: Block | undefined;
  leading = '';

  constructor(private lines: Line[]) {}

  private make(
    type: BlockType,
    text: string,
    props: Block['props'],
    from: number,
    to: number,
    extra: { indent?: string; marker?: string; id?: string } = {},
  ): Block {
    const block: Block = { type, text, props, children: [] };
    if (extra.id) block.id = extra.id;
    const source: BlockSource = {
      raw: this.lines
        .slice(from, to)
        .map((l) => l.raw)
        .join(''),
      trailing: '',
      snapshot: snapshotOf(block),
      indent: extra.indent ?? '',
    };
    if (extra.marker) source.marker = extra.marker;
    block.source = source;
    this.last = block;
    this.i = to;
    return block;
  }

  /** Blank lines belong to whichever block came before them in the file. */
  private takeBlanks(): void {
    while (isBlank(this.lines[this.i])) {
      const raw = this.lines[this.i]!.raw;
      if (this.last?.source) this.last.source.trailing += raw;
      else this.leading += raw;
      this.i++;
    }
  }

  parse(): Block[] {
    const blocks: Block[] = [];
    for (;;) {
      this.takeBlanks();
      if (this.i >= this.lines.length) return blocks;
      blocks.push(this.block());
    }
  }

  private startsBlock(text: string): boolean {
    return (
      FENCE.test(text) ||
      ATX.test(text) ||
      QUOTE.test(text) ||
      RULE.test(text) ||
      this.isItem(text, 3)
    );
  }

  private isItem(text: string, maxIndent = Infinity): boolean {
    const match = ITEM.exec(text);
    return match !== null && indentWidth(match[1]!) <= maxIndent;
  }

  private block(): Block {
    const start = this.i;
    const text = this.lines[start]!.text;

    const fence = FENCE.exec(text);
    if (fence) return this.fenced(fence);

    const atx = ATX.exec(text);
    if (atx) {
      const { text: content, id } = takeBlockId(
        (atx[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trimEnd(),
      );
      return this.make(
        'heading',
        content,
        { level: atx[1]!.length },
        start,
        start + 1,
        id ? { id } : {},
      );
    }

    if (RULE.test(text)) return this.make('divider', '', {}, start, start + 1);
    if (QUOTE.test(text)) return this.quote();
    if (TABLE.test(text)) return this.make('table-row', text.trim(), {}, start, start + 1);
    if (this.isItem(text, 3)) return this.item();
    return this.paragraph();
  }

  private fenced(open: RegExpExecArray): Block {
    const start = this.i;
    const marker = open[2]!;
    const info = open[3]!.trim();
    let end = start + 1;
    let closed = false;
    while (end < this.lines.length) {
      const close = FENCE.exec(this.lines[end]!.text);
      end++;
      if (
        close &&
        close[2]![0] === marker[0] &&
        close[2]!.length >= marker.length &&
        close[3]!.trim() === ''
      ) {
        closed = true;
        break;
      }
    }
    const body = this.lines
      .slice(start + 1, closed ? end - 1 : end)
      .map((l) => dedent(l.text, open[1]!.length));
    const language = info.split(/\s+/)[0] ?? '';
    const props: Block['props'] = {};
    if (language) props.language = language;
    if (info !== language) props.info = info;
    return this.make(
      language === 'mermaid' ? 'mermaid' : 'code',
      body.join('\n'),
      props,
      start,
      end,
      {
        marker,
      },
    );
  }

  private quote(): Block {
    const start = this.i;
    let end = start;
    const body: string[] = [];
    while (end < this.lines.length && QUOTE.test(this.lines[end]!.text)) {
      body.push(this.lines[end]!.text.replace(/^ {0,3}> ?/, ''));
      end++;
    }
    const callout = CALLOUT.exec(body[0] ?? '');
    if (callout) {
      const props: Block['props'] = { kind: callout[1]!.toLowerCase() };
      if (callout[2]) props.title = callout[2];
      return this.make('callout', body.slice(1).join('\n'), props, start, end);
    }
    const { text, id } = takeBlockId(body.join('\n'));
    return this.make('quote', text, {}, start, end, id ? { id } : {});
  }

  private item(): Block {
    const start = this.i;
    const match = ITEM.exec(this.lines[start]!.text)!;
    const indent = match[1]!;
    const marker = match[2]!;
    const width = indentWidth(indent);
    const gap = match[3] ?? ' ';
    const contentIndent = width + marker.length + (gap.length > 4 ? 1 : indentWidth(gap));
    const body = [match[4] ?? ''];

    // Continuation: lazy lines directly below, and indented lines even after a blank.
    let end = start + 1;
    for (;;) {
      const line = this.lines[end];
      if (!line) break;
      if (isBlank(line)) {
        let next = end;
        while (isBlank(this.lines[next])) next++;
        const after = this.lines[next];
        if (
          !after ||
          this.isItem(after.text) ||
          indentWidth(/^[ \t]*/.exec(after.text)![0]) < contentIndent
        )
          break;
        for (; end < next; end++) body.push('');
        continue;
      }
      if (this.isItem(line.text)) break;
      const lineIndent = indentWidth(/^[ \t]*/.exec(line.text)![0]);
      if (lineIndent < contentIndent && this.startsBlock(line.text)) break;
      if (lineIndent < contentIndent && TABLE.test(line.text)) break;
      body.push(dedent(line.text, contentIndent));
      end++;
    }

    const props: Block['props'] = {};
    if (/\d/.test(marker)) {
      props.ordered = true;
      props.number = Number.parseInt(marker, 10);
    }
    let type: BlockType = 'list-item';
    const task = TASK.exec(body[0]!);
    if (task) {
      type = 'task';
      props.checked = task[1] !== ' ';
      body[0] = task[2] ?? '';
    }
    const { text, id } = takeBlockId(body.join('\n'));
    const block = this.make(type, text, props, start, end, {
      indent,
      marker,
      ...(id ? { id } : {}),
    });

    // Children: following items indented further than this one.
    for (;;) {
      let next = this.i;
      while (isBlank(this.lines[next])) next++;
      const candidate = this.lines[next];
      const child = candidate && ITEM.exec(candidate.text);
      if (!child || indentWidth(child[1]!) <= width) break;
      this.takeBlanks();
      block.children.push(this.item());
    }
    return block;
  }

  private paragraph(): Block {
    const start = this.i;
    let end = start + 1;
    while (end < this.lines.length) {
      const line = this.lines[end]!;
      if (isBlank(line)) break;
      if (SETEXT.test(line.text)) {
        const body = this.lines.slice(start, end).map((l) => l.text.trim());
        const { text, id } = takeBlockId(body.join('\n'));
        const level = line.text.trim()[0] === '=' ? 1 : 2;
        return this.make('heading', text, { level }, start, end + 1, id ? { id } : {});
      }
      if (this.startsBlock(line.text) || TABLE.test(line.text)) break;
      end++;
    }
    const body = this.lines.slice(start, end).map((l, n) => (n === 0 ? dedent(l.text, 3) : l.text));
    if (body.length === 1) {
      const image = IMAGE.exec(body[0]!.trim());
      if (image)
        return this.make('image', image[2]!, image[1] ? { alt: image[1] } : {}, start, end);
      const embed = EMBED_IMAGE.exec(body[0]!.trim());
      if (embed) return this.make('image', embed[1]!, { embed: true }, start, end);
    }
    const { text, id } = takeBlockId(body.join('\n'));
    return this.make('paragraph', text, {}, start, end, id ? { id } : {});
  }
}

/**
 * Markdown (CommonMark-ish, frontmatter, wiki links, callouts, tasks, block ids)
 * to the block tree. Every source line is remembered on exactly one block, so
 * `serializeMarkdown(parseMarkdown(s)) === s` holds for any input by construction.
 */
export function parseMarkdown(source: string): ParsedMarkdown {
  const lines = splitLines(source);
  const eol = /\r\n/.test(source) ? '\r\n' : '\n';
  let frontmatter = '';
  let meta: NoteMeta = {};
  let bodyStart = 0;

  if (lines[0]?.text === '---') {
    const close = lines.findIndex(
      (line, n) => n > 0 && (line.text === '---' || line.text === '...'),
    );
    if (close !== -1) {
      const yaml = lines
        .slice(1, close)
        .map((l) => l.raw)
        .join('');
      try {
        const parsed: unknown = parseYaml(yaml);
        if (parsed === null || parsed === undefined) meta = {};
        else if (typeof parsed === 'object' && !Array.isArray(parsed)) meta = parsed as NoteMeta;
        else throw new Error('frontmatter is not a mapping');
        frontmatter = lines
          .slice(0, close + 1)
          .map((l) => l.raw)
          .join('');
        bodyStart = close + 1;
      } catch {
        // Not valid YAML: leave it alone and treat the whole file as body text.
        meta = {};
      }
    }
  }

  const parser = new Parser(lines.slice(bodyStart));
  const blocks = parser.parse();
  return {
    meta,
    blocks,
    source: { frontmatter, metaSnapshot: JSON.stringify(meta), leading: parser.leading, eol },
  };
}

// ── Serialising ──────────────────────────────────────────────────────────────

const TIGHT = new Set<BlockType>(['list-item', 'task', 'table-row']);

function generate(block: Block, indent: string, eol: string): string {
  const withId = (text: string) => (block.id ? `${text} ^${block.id}` : text);
  const lines = (text: string) => text.split('\n');
  let out: string[];
  switch (block.type) {
    case 'heading':
      out = [
        `${'#'.repeat(Math.min(6, Math.max(1, Number(block.props.level) || 1)))} ${withId(block.text.replace(/\n/g, ' '))}`,
      ];
      break;
    case 'list-item':
    case 'task': {
      const previous = block.source?.marker;
      const ordered = block.props.ordered === true;
      const marker = ordered
        ? previous && /\d/.test(previous)
          ? previous
          : `${Number(block.props.number) || 1}.`
        : previous && !/\d/.test(previous)
          ? previous
          : '-';
      const box = block.type === 'task' ? `[${block.props.checked === true ? 'x' : ' '}] ` : '';
      const pad = ' '.repeat(marker.length + 1);
      out = lines(withId(block.text)).map((line, n) =>
        n === 0 ? `${indent}${marker} ${box}${line}` : line === '' ? '' : `${indent}${pad}${line}`,
      );
      break;
    }
    case 'quote':
      out = lines(withId(block.text)).map((line) => (line ? `> ${line}` : '>'));
      break;
    case 'callout': {
      const title = block.props.title ? ` ${String(block.props.title)}` : '';
      out = [`> [!${String(block.props.kind ?? 'note')}]${title}`];
      if (block.text) out.push(...lines(block.text).map((line) => (line ? `> ${line}` : '>')));
      break;
    }
    case 'code':
    case 'mermaid': {
      const char = block.source?.marker?.[0] === '~' ? '~' : '`';
      let fence = char.repeat(3);
      while (block.text.includes(fence)) fence += char;
      const info =
        block.type === 'mermaid'
          ? 'mermaid'
          : String(block.props.info ?? block.props.language ?? '');
      out = [`${fence}${info}`, ...(block.text === '' ? [] : lines(block.text)), fence];
      break;
    }
    case 'image':
      out = [
        block.props.embed === true
          ? `![[${block.text}]]`
          : `![${String(block.props.alt ?? '')}](${block.text})`,
      ];
      break;
    case 'divider':
      out = ['---'];
      break;
    default:
      out = lines(withId(block.text));
  }
  return out.join(eol) + eol;
}

function emit(
  blocks: readonly Block[],
  parentIndent: string,
  eol: string,
  out: { text: string },
  top: boolean,
): void {
  let previous: Block | undefined;
  for (const block of blocks) {
    const unchanged = block.source !== undefined && block.source.snapshot === snapshotOf(block);
    // Glue: a missing final newline, or a missing blank line next to new content.
    if (out.text !== '' && !out.text.endsWith('\n')) out.text += eol;
    if (previous) {
      const fresh = !previous.source || !block.source || block.source.detached === true;
      // List items sit tight against each other, unless a bullet list meets a numbered one.
      const tight =
        TIGHT.has(previous.type) &&
        TIGHT.has(block.type) &&
        (previous.type === 'table-row') === (block.type === 'table-row') &&
        (previous.props.ordered === true) === (block.props.ordered === true);
      const separated = /\n\r?\n$/.test(out.text) || out.text === '';
      if (fresh && !tight && !separated && top) out.text += eol;
    }

    if (unchanged) {
      out.text += block.source!.raw;
    } else {
      const indent = block.source?.indent ?? parentIndent;
      let text = generate(block, TIGHT.has(block.type) ? indent : '', eol);
      // Keep a file that had no final newline that way.
      if (block.source && block.source.raw !== '' && !/[\r\n]$/.test(block.source.raw))
        text = text.slice(0, -eol.length);
      out.text += text;
    }
    if (block.source?.trailing) {
      if (!out.text.endsWith('\n')) out.text += eol;
      out.text += block.source.trailing;
    }

    if (block.children.length) {
      const own = block.source?.indent ?? parentIndent;
      const markerWidth = (block.source?.marker ?? '-').length + 1;
      emit(block.children, own + ' '.repeat(markerWidth), eol, out, false);
    }
    previous = block;
  }
}

/** Top-level keys of a YAML mapping, with the line range each one occupies. */
function keyRanges(lines: string[]): { key: string; from: number; to: number }[] {
  const ranges: { key: string; from: number; to: number }[] = [];
  lines.forEach((line, n) => {
    const match = /^(?:"([^"]+)"|'([^']+)'|([^\s#'"-][^:#]*?))\s*:(?:\s|$)/.exec(line);
    if (match) ranges.push({ key: (match[1] ?? match[2] ?? match[3])!, from: n, to: n + 1 });
    else if (ranges.length && n === ranges.at(-1)!.to && /^(?:[ \t]+\S|-[ \t]|-$)/.test(line))
      ranges.at(-1)!.to = n + 1;
  });
  return ranges;
}

function serializeFrontmatter(meta: NoteMeta, source: NoteSource | undefined, eol: string): string {
  const entries = Object.entries(meta).filter(([, value]) => value !== undefined);
  if (source && JSON.stringify(meta) === source.metaSnapshot) return source.frontmatter;
  const yamlFor = (key: string, value: unknown) =>
    stringifyYaml({ [key]: value }, { lineWidth: 0 })
      .replace(/\n$/, '')
      .split('\n');

  if (!source?.frontmatter) {
    if (entries.length === 0) return '';
    return ['---', ...entries.flatMap(([k, v]) => yamlFor(k, v)), '---'].join(eol) + eol;
  }

  // Patch only the keys that changed; every other line stays exactly as written.
  const all = source.frontmatter.split(/\r\n|\n|\r/);
  if (all.at(-1) === '') all.pop();
  const body = all.slice(1, -1);
  const before = JSON.parse(source.metaSnapshot) as Record<string, unknown>;
  const ranges = keyRanges(body);
  const edits: { from: number; to: number; lines: string[] }[] = [];
  const appended: string[] = [];
  for (const key of new Set([...Object.keys(before), ...entries.map(([k]) => k)])) {
    const value = meta[key];
    if (JSON.stringify(value) === JSON.stringify(before[key])) continue;
    const range = ranges.find((r) => r.key === key);
    const lines = value === undefined ? [] : yamlFor(key, value);
    if (range) edits.push({ from: range.from, to: range.to, lines });
    else appended.push(...lines);
  }
  for (const edit of edits.sort((a, b) => b.from - a.from))
    body.splice(edit.from, edit.to - edit.from, ...edit.lines);
  body.push(...appended);
  if (body.every((line) => line.trim() === '')) return '';
  return [all[0]!, ...body, all.at(-1)!].join(eol) + eol;
}

/**
 * The block tree back to markdown. Blocks nobody edited are written from their
 * remembered source; only an edited block is regenerated, so an edit to one
 * paragraph never reformats the rest of somebody's file.
 */
export function serializeMarkdown(parsed: ParsedMarkdown): string {
  const eol = parsed.source?.eol ?? '\n';
  const frontmatter = serializeFrontmatter(parsed.meta, parsed.source, eol);
  const out = { text: frontmatter + (parsed.source?.leading ?? '') };
  // Frontmatter that was just added needs a blank line before the body.
  if (frontmatter && !parsed.source?.frontmatter && parsed.blocks.length && !parsed.source?.leading)
    out.text += eol;
  emit(parsed.blocks, '', eol, out, true);
  return out.text;
}
