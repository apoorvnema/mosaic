// Packages dist/ as an unpacked-extension zip. Run after `pnpm build`.
import { zipSync } from 'fflate';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = join(import.meta.dirname, '..', 'dist');
const files = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files[relative(dist, path).split('\\').join('/')] = new Uint8Array(readFileSync(path));
  }
})(dist);

if (!files['manifest.json']) throw new Error('dist/manifest.json missing — run `pnpm build` first');
const out = join(import.meta.dirname, '..', 'mosaic-extension.zip');
writeFileSync(out, zipSync(files, { level: 9 }));
console.log(`${out} (${Object.keys(files).length} files)`);
