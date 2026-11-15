// A deterministic synthetic vault for benchmarks. No imports and only erasable
// TypeScript, so `scripts/generate-corpus.mjs` can load it directly with node.

const WORDS = (
  'note idea plan draft review meeting project design system index search vault file folder sync ' +
  'merge update relay device offline local first markdown block editor canvas ink pen stroke shape ' +
  'table board calendar journal task todo done blocked deploy release bug fix test build cache ' +
  'memory latency budget measure number query result rank title body link backlink graph plugin ' +
  'theme colour yellow green blue paper research reading attention transformer network model data ' +
  'schema field value select date number checkbox relation rollup formula template daily weekly ' +
  'quarter roadmap milestone alpha beta launch customer feedback interview survey metric growth'
).split(' ');

const FOLDERS = [
  'Inbox',
  'Journal',
  'Work/Specs',
  'Work/Research',
  'Work/Meetings',
  'Reading',
  'Personal',
  'Archive/2025',
];

/** mulberry32: small, fast, and the same sequence everywhere. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CorpusFile {
  path: string;
  text: string;
}

export function generateCorpus(count: number, seed = 1): CorpusFile[] {
  const random = prng(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const words = (n: number) => Array.from({ length: n }, () => pick(WORDS)).join(' ');
  const sentence = () => {
    const text = words(6 + Math.floor(random() * 14));
    return text[0]!.toUpperCase() + text.slice(1) + '.';
  };
  const titles: string[] = [];
  const files: CorpusFile[] = [];

  for (let n = 0; n < count; n++) {
    const title = `${words(2 + Math.floor(random() * 3))} ${n}`;
    titles.push(title);
    const lines: string[] = [];
    if (random() < 0.4) {
      lines.push('---');
      if (random() < 0.2) lines.push('pinned: true');
      if (random() < 0.1) lines.push('archived: true');
      lines.push(`labels: [${pick(WORDS)}, ${pick(WORDS)}]`, '---', '');
    }
    lines.push(`# ${title}`, '');
    const paragraphs = 2 + Math.floor(random() * 6);
    for (let p = 0; p < paragraphs; p++) {
      const kind = random();
      if (kind < 0.6) {
        lines.push(Array.from({ length: 1 + Math.floor(random() * 4) }, sentence).join(' '));
        if (random() < 0.3 && titles.length > 1)
          lines[lines.length - 1] += ` See [[${pick(titles)}]].`;
      } else if (kind < 0.8) {
        for (let t = 0; t < 3; t++) lines.push(`- [${random() < 0.5 ? 'x' : ' '}] ${words(4)}`);
      } else if (kind < 0.9) {
        lines.push(`## ${words(3)}`);
      } else {
        lines.push('```ts', `const ${pick(WORDS)} = ${Math.floor(random() * 100)};`, '```');
      }
      lines.push('');
    }
    files.push({ path: `${pick(FOLDERS)}/${title}.md`, text: lines.join('\n') });
  }
  return files;
}

export const BENCH_QUERIES = [
  'attention',
  'roadmap milestone',
  'sync',
  'local first',
  'trans',
  'bug fix release',
  'q',
  'markdown block editor',
  'customer feedback interview',
  'zzzznotfound',
];
