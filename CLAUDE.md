# Mosaic

A local-first note app: Keep's instant capture, OneNote's notebooks and desktop
stickies, Notion's typed databases, Obsidian's plain markdown files, plus an
infinite canvas with pen support. The full plan is `docs/plan.html`; the build
order is `docs/prompts.md` (one prompt per session). Read `docs/ARCHITECTURE.md`
before changing structure.

## Hard constraints

1. **Plain files on disk are the source of truth.** Markdown with YAML frontmatter
   for notes, JSON for canvases, a sibling folder for media. The app must work on
   a folder it has never seen, and the folder must stay usable without the app.
2. **Local-first and offline.** The network is an optimisation, never a requirement.
   No account is needed for anything on one device.
3. **TypeScript everywhere. No Rust in application code.** The owner does not write
   Rust. Tauri's scaffolded `src-tauri` is the only Rust in the repo.
4. **One core, many shells.** Platform differences live behind the adapter
   interfaces in `packages/core/src/platform` and nowhere else.

## Layout

```
packages/core/       pure TypeScript — no DOM, no React, no platform imports
  src/platform/      the adapter interfaces: Storage, FileSystem, Database, Crypto, Clock, Logger, Telemetry
  src/<module>/      store, crdt, filebridge, indexer, search, schema, crypto, sync, plugins, vault
  test/fixtures/     awkward markdown that must round-trip byte for byte (never reformat these)
  test/bench/        performance budgets; synthetic 10,000-note corpus
  src/testing/       in-memory platform for headless tests (pure TS)
  test/contracts/    behaviour every adapter must satisfy; run by each adapter
  test/modules/      one spec per core module
packages/adapters/   one folder per platform: node, web, tauri, extension, devserver, shared
packages/ui/         React components and design tokens shared by every shell
  src/editor/        the ProseMirror block editor (schema, block ↔ document conversion, commands)
  src/app/           the workspace: note list, search, note pane, vault hooks
apps/web/            Vite PWA — THE DEVELOPMENT SURFACE
apps/desktop/        Tauri v2 (Linux, Windows, macOS)
apps/mobile/         Tauri v2 mobile (Android first) + android-widgets/
apps/extension/      Chrome MV3 — sync client only, no file system
services/api/        placeholder until the sync session
tools/eslint-plugin-mosaic/   the import-boundary rule
dev-vault/           sample vault `pnpm dev` runs against
docs/                plan.html, prompts.md, ARCHITECTURE.md, ROADMAP.md, adr/
```

Workspace packages export TypeScript source directly (`exports` → `./src/*.ts`).
There is no build step between packages; Vite, vitest and tsc consume the source.

## Commands

| Command             | What it does                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`          | Web app at http://localhost:5173 against `dev-vault/`. `MOSAIC_VAULT=/path pnpm dev` for another folder, `MOSAIC_VAULT=opfs` for the browser's private file system |
| `pnpm verify`       | lint + typecheck + test — run before every commit                                                                                                                  |
| `pnpm lint`         | eslint (including the boundary rule) + prettier check. `pnpm format` to fix formatting                                                                             |
| `pnpm typecheck`    | `tsc` in every package, strict                                                                                                                                     |
| `pnpm test`         | all green unit tests (vitest, node, no browser)                                                                                                                    |
| `pnpm test:core`    | core only, zero browser                                                                                                                                            |
| `pnpm test:pending` | specs for unbuilt modules — **expected to fail**                                                                                                                   |
| `pnpm test:bench`   | performance budgets; prints the numbers (search on 10,000 notes)                                                                                                   |
| `pnpm corpus`       | write a synthetic vault to disk: `pnpm corpus /tmp/big 10000`                                                                                                      |
| `pnpm test:e2e`     | Playwright against the web app, headless, on a fresh temp vault                                                                                                    |
| `pnpm version:set`  | set the product version everywhere, e.g. `pnpm version:set 0.2.0`                                                                                                  |
| `pnpm build`        | build every app                                                                                                                                                    |

## Versions and releases

- **One version for the whole product**, set in the root `package.json`. Never edit
  a version by hand anywhere else: run `pnpm version:set 0.2.0`, which updates every
  package, the extension manifest and both Tauri crates. `pnpm lint` fails if any drift.
- Tauri reads its version from the app's `package.json` (`"version": "../package.json"`).
  Android rejects `0.0.0`, so the version must stay at `0.0.1` or above.
- Every build on `main` (desktop, Android, web, extension) attaches its output to the
  GitHub release tagged `v<version>` via `.github/scripts/publish-release.sh`. The
  release is created on first use; rebuilding the same version replaces its files.
  **To cut a new release, bump the version** and merge to `main`.
- Builds are clean every time: no Rust build cache, and Linux runners free disk space
  first. Build workflows install with `--ignore-scripts` because `better-sqlite3`
  (test-only) cannot compile on the Windows runner.

## This environment cannot see the app

Claude Code cloud has no GUI, emulator or device. Therefore:

- **The web build is the development surface.** Build and verify features there.
- **All core logic must be testable headlessly** with vitest against the in-memory
  platform (`@mosaic/core/testing`) or the node adapter.
- UI behaviour is verified with Playwright (Chromium is preinstalled; do not run
  `playwright install` locally). To look at the UI, screenshot it with Playwright.
- Native builds (Tauri desktop, Android) are wired into CI, not run locally. Code
  that only runs there (`packages/adapters/src/tauri`) is **unverified until a CI
  build or a human runs it** — say so when you touch it.

## Testing rules

- **No feature work without a test.** Write or un-pend the test first.
- **Pending specs:** every unbuilt core module has `test/modules/<module>.pending.test.ts`
  describing the behaviour the plan requires. To implement a module: make its spec
  pass, then rename it to `<module>.test.ts` so it joins the required suite. Do not
  weaken a pending spec to make it pass; if the spec is wrong, fix it and say why.
- **Adapter contracts:** a new adapter runs the suites in `@mosaic/core/contracts`.
  A new adapter capability goes into the contract first, then into every adapter.
- **Performance budgets get a number.** "It works" is not accepted for anything in
  the plan's quality bar (section 24): measure it and record the result.
- Time and randomness in core come from `Clock` and `Crypto` so tests can control them.

## Design

Clean and modern: neutral surfaces, one accent, soft radii, Inter, generous space.
No skeuomorphism (no paper textures, pins or tilted notes — the plan's pinboard
header is illustration, not the product's look).

- Every colour, radius, shadow and size is a token in `packages/ui/src/styles/tokens.css`.
  Components never hard-code a value.
- Twelve stable note colours (`NOTE_COLORS` in core). Dark mode desaturates them;
  it does not invert them.
- Elevation only for things that float (pinned, dragging, menus), never decoration.
- Responsive from 360px to wide desktop: sidebar on wide screens, bottom tabs on a phone.
- Keyboard-complete, visible focus rings, WCAG AA contrast.
- `packages/ui` is shared unchanged by every shell. A component that needs forking
  for one platform is a bug in the component.

## Never do this

- **No Rust** beyond what Tauri scaffolds. If something truly cannot be done
  without it: the smallest possible command, in its own file, documented here and
  in an ADR, and tell the owner explicitly what it does.
- **No platform imports in core.** No `node:*`, DOM globals, React, `@tauri-apps/*`,
  `chrome.*`, `fetch`, `Date`, `setTimeout` in `packages/core/src`. The lint rule is
  an allowlist (`eslint.config.js`); adding a package to it needs an ADR.
- **No database as source of truth.** The SQLite index is derived. Deleting
  `.mosaic/index.sqlite` must cost a rebuild and nothing else. No cache that cannot
  be rebuilt, no second store, no copy of a note. If you need one, stop and write an ADR.
- **No feature work without a test.**
- No pin, sticky or board membership as a separate object — they are flags in the
  note's frontmatter.
- No destroying user text to satisfy a schema: preserve it verbatim and queue a repair.
- No hand-rolled cryptography. libsodium through the `Crypto` adapter only.
- No adapter imports in `packages/ui`; shells pass a `Platform` in.
- No network call that blocks writing a note. No spinner in front of local content.
- No skipping, deleting or weakening a test to get green.

## Rust in this repo (complete list)

`apps/desktop/src-tauri` and `apps/mobile/src-tauri`: `build.rs`, `src/main.rs`,
`src/lib.rs` — Tauri's standard scaffold, registering the fs, sql and dialog
plugins. No custom commands exist. Update this list if that ever changes.

## How notes are read and written (do not break this)

- `parseMarkdown` keeps every source line on exactly one block (`block.source.raw`
  and `.trailing`). `serializeMarkdown` writes an unedited block from that source and
  regenerates only a block whose fields changed. So `serialize(parse(s)) === s` for
  any input, and an edit to one paragraph never reformats the rest of a file.
- The editor document is a **flat** list of blocks; list nesting is an `indent`
  attribute. `packages/ui/src/editor/convert.ts` maps it to the block tree and hands
  back the original block object for every node that was not touched.
- Markdown has no empty paragraph, so an empty one in the editor is never written.
- The store tells its own writes from another program's by content, not timing alone.
- The editor never touches files: it gets blocks in and calls `onChange` with blocks.
- SQLite calls on the web adapter are serialised; never re-enter the connection.

## Decisions and status

- ADRs: `docs/adr/`. Write one for every decision, including departures from the plan.
- `docs/ROADMAP.md` tracks phases as checkboxes; update it when something lands.
- **Update this file at the end of every session** with what was learned or changed.

### Learned so far

- Node's `fs.watch(..., { recursive: true })` on Linux stops reporting a file after
  an atomic rename-replace (it never reports the later delete). The node adapter
  uses chokidar instead.
- TypeScript is pinned to 6.0.x: typescript-eslint 8 does not yet support TS 7.
- Vite config files run under Node's native TS loader: relative imports in
  `vite.config.ts` need the `.ts` extension, and workspace TS source must be loaded
  with `server.ssrLoadModule`, not imported at the top of the config.
- wa-sqlite: `@journeyapps/wa-sqlite` (maintained fork, FTS5 included) with
  `OPFSAnyContextVFS`, verified in Chromium by the Playwright suite.
- `@playwright/test` is pinned to the version of the preinstalled browser (1.63.0).
- FTS5 rows must share the note's rowid: deleting by an unindexed FTS column is a
  full scan per note (it made a 10,000-note index build take 18 s instead of 3 s).
- Browsers will not start a native drag from a `<button>`; the block drag handle is a div.
- In Playwright, drag with stepped `mouse.move` calls; `dragTo` does not start the drag.
  After a mouse click, wait ~80 ms before sending Enter: ProseMirror reads a
  mouse-placed caret on a short timer and a script can out-type it.
- `git commit` commits everything staged, including earlier `git rm --cached` and
  `git mv`. When committing a small fix beside unfinished work, check `git status` first.
- Tauri's fs scope wildcards skip dot-folders unless `plugins.fs.requireLiteralLeadingDot`
  is false. The vault's `.mosaic/` folder needs that (found on a real Android phone).
- Android only installs signed APKs. CI signs with the `ANDROID_KEYSTORE_*` secrets,
  or a throwaway key when they are absent (see `.github/workflows/android.yml`).
