// Write a synthetic vault to disk, for trying the app against a large folder.
//
//   pnpm corpus <dir> [count]        e.g.  pnpm corpus /tmp/big-vault 10000
//   MOSAIC_VAULT=/tmp/big-vault pnpm dev
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { generateCorpus } from '../packages/core/test/bench/corpus.ts';

const [dir, count = '10000'] = process.argv.slice(2);
if (!dir) {
  console.error('Usage: pnpm corpus <dir> [count]');
  process.exit(1);
}
const files = generateCorpus(Number(count));
for (const file of files) {
  const path = join(dir, file.path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, file.text);
}
console.log(`Wrote ${files.length} notes to ${dir}`);
