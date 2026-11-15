/**
 * Inline markdown: the text inside one block. The editor works on this tree; the
 * file keeps the markdown source. Only a block somebody edits is re-serialised.
 */
export type InlineMark = 'strong' | 'em' | 'strike' | 'code';

export type Inline =
  | { type: 'text'; text: string; marks: InlineMark[]; href?: string }
  | { type: 'break' }
  | { type: 'wikilink'; target: string; alias?: string; embed?: boolean };

const PUNCTUATION = /[!-/:-@[-`{-~]/;
const isWord = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

function pushText(
  out: Inline[],
  text: string,
  marks: InlineMark[],
  href: string | undefined,
): void {
  if (text === '') return;
  const last = out.at(-1);
  if (last?.type === 'text' && last.href === href && last.marks.join() === marks.join()) {
    last.text += text;
    return;
  }
  out.push({ type: 'text', text, marks: [...marks], ...(href === undefined ? {} : { href }) });
}

function parseInto(
  out: Inline[],
  src: string,
  marks: InlineMark[],
  href: string | undefined,
): void {
  let i = 0;
  let buffer = '';
  const flush = () => {
    pushText(out, buffer, marks, href);
    buffer = '';
  };

  while (i < src.length) {
    const ch = src[i]!;
    const rest = src.slice(i);

    if (ch === '\\' && src[i + 1] === '\n') {
      flush();
      out.push({ type: 'break' });
      i += 2;
      continue;
    }
    if (ch === '\\' && PUNCTUATION.test(src[i + 1] ?? '')) {
      buffer += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '\n') {
      buffer = buffer.replace(/ +$/, '');
      flush();
      out.push({ type: 'break' });
      i++;
      continue;
    }
    if (ch === '`') {
      const ticks = /^`+/.exec(rest)![0];
      const close = src.indexOf(ticks, i + ticks.length);
      if (close !== -1) {
        flush();
        pushText(
          out,
          src.slice(i + ticks.length, close).replace(/^ (.+) $/, '$1'),
          [...marks, 'code'],
          href,
        );
        i = close + ticks.length;
        continue;
      }
    }
    const wiki = /^(!?)\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/.exec(rest);
    if (wiki) {
      flush();
      out.push({
        type: 'wikilink',
        target: wiki[2]!.trim(),
        ...(wiki[3] ? { alias: wiki[3] } : {}),
        ...(wiki[1] ? { embed: true } : {}),
      });
      i += wiki[0].length;
      continue;
    }
    const link = /^\[((?:[^\]\\\n]|\\.)*)\]\(([^)\s]*)\)/.exec(rest);
    if (link && href === undefined) {
      flush();
      parseInto(out, link[1]!, marks, link[2]!);
      i += link[0].length;
      continue;
    }
    const bare =
      href === undefined && !isWord(src[i - 1])
        ? /^https?:\/\/[^\s<>)\]]+[^\s<>)\].,;:!?'"]/.exec(rest)
        : null;
    if (bare) {
      flush();
      pushText(out, bare[0], marks, bare[0]);
      i += bare[0].length;
      continue;
    }

    let matched = false;
    for (const [token, mark] of [
      ['**', 'strong'],
      ['__', 'strong'],
      ['~~', 'strike'],
      ['*', 'em'],
      ['_', 'em'],
    ] as const) {
      if (!rest.startsWith(token) || marks.includes(mark)) continue;
      const underscore = token[0] === '_';
      if (underscore && isWord(src[i - 1])) continue;
      if (/\s/.test(src[i + token.length] ?? ' ')) continue;
      let close = i + token.length;
      for (;;) {
        close = src.indexOf(token, close);
        if (close === -1) break;
        const escaped = src[close - 1] === '\\';
        const spaceBefore = /\s/.test(src[close - 1] ?? ' ');
        const intraword = underscore && isWord(src[close + token.length]);
        // `*` inside `**bold**` is not an em closer.
        const partOfLonger =
          token.length === 1 && (src[close + 1] === token || src[close - 1] === token);
        if (!escaped && !spaceBefore && !intraword && !partOfLonger && close > i + token.length - 1)
          break;
        close += 1;
      }
      if (close === -1 || close === i + token.length) continue;
      flush();
      parseInto(out, src.slice(i + token.length, close), [...marks, mark], href);
      i = close + token.length;
      matched = true;
      break;
    }
    if (matched) continue;

    buffer += ch;
    i++;
  }
  flush();
}

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  parseInto(out, source, [], undefined);
  return out;
}

const TOKENS: Record<Exclude<InlineMark, 'code'>, string> = { strong: '**', em: '*', strike: '~~' };

function escapeText(text: string): string {
  return text
    .replace(/\\(?=[!-/:-@[-`{-~])/g, '\\\\')
    .replace(/[*`]/g, '\\$&')
    .replace(/\[\[/g, '\\[[')
    .replace(/(^|[^\p{L}\p{N}])_(?=\S)/gu, '$1\\_')
    .replace(/(?<=\S)_(?![\p{L}\p{N}])/gu, '\\_');
}

function codeSpan(text: string): string {
  let ticks = '`';
  while (text.includes(ticks)) ticks += '`';
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

export function serializeInline(nodes: readonly Inline[]): string {
  let out = '';
  /** Currently open wrappers, outermost first: a link, then marks. */
  let open: string[] = [];
  const close = (keep: number) => {
    for (const wrapper of open.slice(keep).reverse()) {
      out += wrapper.startsWith('link:') ? `](${wrapper.slice(5)})` : TOKENS[wrapper as 'strong'];
    }
    open = open.slice(0, keep);
  };

  for (const node of nodes) {
    if (node.type === 'break') {
      close(0);
      out += '\n';
      continue;
    }
    if (node.type === 'wikilink') {
      close(0);
      out += `${node.embed ? '!' : ''}[[${node.target}${node.alias ? `|${node.alias}` : ''}]]`;
      continue;
    }
    const wanted = [
      ...(node.href === undefined ? [] : [`link:${node.href}`]),
      ...(['strong', 'em', 'strike'] as const).filter((mark) => node.marks.includes(mark)),
    ];
    let common = 0;
    while (common < open.length && open[common] === wanted[common]) common++;
    close(common);
    // Emphasis cannot open before whitespace: move it outside the marks.
    const lead = wanted.length > common ? (/^\s+/.exec(node.text)?.[0] ?? '') : '';
    out += lead;
    for (const wrapper of wanted.slice(common)) {
      out += wrapper.startsWith('link:') ? '[' : TOKENS[wrapper as 'strong'];
      open.push(wrapper);
    }
    const text = node.text.slice(lead.length);
    out += node.marks.includes('code') ? codeSpan(text) : escapeText(text);
  }
  close(0);
  return out;
}

/** The text a reader sees: no markers, links reduced to their label. */
export function inlineToPlainText(source: string): string {
  return parseInline(source)
    .map((node) =>
      node.type === 'text' ? node.text : node.type === 'break' ? ' ' : (node.alias ?? node.target),
    )
    .join('');
}

export interface WikiLinkRef {
  /** The note part of the link, without `#heading` or `^block`. */
  target: string;
  blockId?: string;
}

/** Every `[[wiki link]]` in a piece of markdown, including embeds. */
export function extractWikiLinks(source: string): WikiLinkRef[] {
  const refs: WikiLinkRef[] = [];
  for (const match of source.matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g)) {
    const [note = '', anchor] = match[1]!.split('#');
    const target = note.trim();
    if (!target) continue;
    const blockId = anchor?.startsWith('^') ? anchor.slice(1).trim() : undefined;
    refs.push({ target, ...(blockId ? { blockId } : {}) });
  }
  return refs;
}
