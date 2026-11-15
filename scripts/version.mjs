// One version for the whole product. The root package.json is the source of truth;
// this script copies it everywhere else that needs it.
//
//   node scripts/version.mjs            check that everything matches (used by `pnpm lint`)
//   node scripts/version.mjs 0.2.0      set a new version everywhere
//
// Releases are tagged v<version>, so bumping this is how a new release is cut.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (file) => readFileSync(join(root, file), 'utf8');
const next = process.argv[2];
if (next && !/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`"${next}" is not a version. Use MAJOR.MINOR.PATCH, e.g. 0.2.0`);
  process.exit(1);
}
const version = next ?? JSON.parse(read('package.json')).version;

const workspaces = ['packages', 'apps', 'services', 'tools'].flatMap((dir) =>
  readdirSync(join(root, dir)).map((name) => `${dir}/${name}/package.json`),
);
const jsonVersion = (text) => text.replace(/^(\s*"version":\s*")[^"]*(")/m, `$1${version}$2`);
const cargoVersion = (crate) => (text) =>
  text.replace(new RegExp(`(name = "${crate}"\\nversion = ")[^"]*(")`), `$1${version}$2`);

/** [file, transform]. Tauri reads its version from the app's package.json. */
const targets = [
  ['package.json', jsonVersion],
  ...workspaces.map((file) => [file, jsonVersion]),
  ['apps/extension/public/manifest.json', jsonVersion],
  ...['desktop', 'mobile'].flatMap((app) => [
    [`apps/${app}/src-tauri/Cargo.toml`, cargoVersion(`mosaic-${app}`)],
    [`apps/${app}/src-tauri/Cargo.lock`, cargoVersion(`mosaic-${app}`)],
  ]),
];

const stale = [];
for (const [file, transform] of targets) {
  const before = read(file);
  const after = transform(before);
  if (!after.includes(`"${version}"`)) throw new Error(`No version field found in ${file}`);
  if (after === before) continue;
  if (next) writeFileSync(join(root, file), after);
  else stale.push(file);
}

if (stale.length) {
  console.error(`Version mismatch: expected ${version} in\n  ${stale.join('\n  ')}`);
  console.error('Run `pnpm version:set <version>` to bring them in line.');
  process.exit(1);
}
console.log(next ? `Version set to ${version}` : `All versions are ${version}`);
