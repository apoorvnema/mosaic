# Architecture

One core, many shells. Everything that could ever disagree between two devices —
parsing, merging, indexing, validation, encryption — is written once in
`packages/core`. A shell owns only what is genuinely native: windows, widgets,
pens, permissions. The full reasoning is in [plan.html](plan.html), sections 4–8.
This repository follows the plan's **Path B**: a TypeScript core (see ADR 0001).

## The pieces

```
┌──────────────────────────────── SHELLS (thin, replaceable) ───────────────────────────────┐
│  apps/web        apps/desktop      apps/mobile        apps/extension      tests / CLI     │
│  Vite PWA        Tauri v2          Tauri v2 Android   Chrome MV3          vitest          │
└─────┬──────────────┬─────────────────┬──────────────────┬──────────────────┬──────────────┘
      │ builds a Platform from its adapter, then renders the shared app      │
      ▼              ▼                 ▼                  ▼                  ▼
┌──────────────────────────────── packages/adapters ────────────────────────────────────────┐
│  web/            tauri/ (desktop + mobile)            extension/          node/           │
│  OPFS            Tauri fs plugin                      — no file system —  real folder     │
│  wa-sqlite       Tauri sql plugin                     — no database —     better-sqlite3  │
│  shared/: libsodium Crypto · Storage-on-FileSystem · system Clock · Logger · Telemetry    │
│  devserver/: HTTP bridge to a local folder (development only)                             │
└─────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                          │ implements
════════════════════ THE BOUNDARY: packages/core/src/platform ═══════════════════════════════
   FileSystem · Database · Storage · Crypto · Clock · Logger · Telemetry
   Platform = all seven          RelayOnlyPlatform = no FileSystem, no Database
═════════════════════════════════════════╤═══════════════════════════════════════════════════
                                          │ is all core knows about the outside world
┌──────────────────────────────── packages/core (pure TypeScript) ──────────────────────────┐
│  store        notes as block trees over files          filebridge   markdown ⇄ blocks,    │
│  crdt         Yjs documents, opaque binary updates                  three-way merge       │
│  indexer      SQLite index, derived, rebuildable       search       FTS5 queries          │
│  schema       collections, typed fields, repair queue  crypto       vault keys and policy │
│  sync         offline queue, relay client              plugins      capabilities, budgets │
└───────────────────────────────────────────────────────────────────────────────────────────┘
                                          ▲
┌──────────────────────────────── packages/ui (React) ──────────────────────────────────────┐
│  Design tokens, the app shell, and every screen. Receives a Platform as a prop.           │
│  Imports core. Never imports an adapter, Tauri, or node.                                  │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

Dependencies point one way: `apps → ui → core` and `apps → adapters → core`.
Core depends on nothing in the repo and on no platform.

## The adapter boundary

| Interface    | Purpose                                                        | web                        | desktop + mobile       | extension              | node (tests, dev)               |
| ------------ | -------------------------------------------------------------- | -------------------------- | ---------------------- | ---------------------- | ------------------------------- |
| `FileSystem` | read, write, list, watch, move, delete inside one vault folder | Origin Private File System | Tauri fs plugin        | **none**               | real folder, chokidar           |
| `Database`   | SQL for the SQLite index (FTS5)                                | wa-sqlite over OPFS        | Tauri sql plugin       | **none**               | better-sqlite3                  |
| `Storage`    | key-value + blobs for the oplog and index bookkeeping          | files under `.mosaic/`     | files under `.mosaic/` | `chrome.storage.local` | files under `.mosaic/`          |
| `Crypto`     | random, derive key, encrypt, decrypt, hash                     | libsodium                  | libsodium              | libsodium              | libsodium                       |
| `Clock`      | time and timers                                                | system                     | system                 | system                 | system (`ManualClock` in tests) |
| `Logger`     | structured logs                                                | console                    | console                | console                | console                         |
| `Telemetry`  | opt-in events and timings                                      | no-op                      | no-op                  | no-op                  | no-op                           |

Three things enforce the boundary, so it does not depend on anyone remembering it:

1. **Lint.** `mosaic/no-platform-imports-in-core` is an allowlist: a file in
   `packages/core/src` may import relative paths inside that directory and the
   pure packages named in `eslint.config.js`. Everything else is an error.
   Platform globals (`window`, `process`, `fetch`, `Date`, `setTimeout`, …) are
   banned there too.
2. **Types.** Core compiles with `lib: ["ES2022"]` and `types: []`. DOM and node
   APIs do not exist as far as the compiler is concerned.
3. **The extension's platform type.** `createExtensionPlatform()` returns
   `RelayOnlyPlatform`. Vault code takes `Platform`, so it cannot be handed the
   extension's platform. The extension is a sync client only.

## Data: three roles, kept straight

- **Files are what you own.** The vault folder is the source of truth. Notes are
  markdown with YAML frontmatter; canvases are JSON; media sits in a sibling folder.
- **Blocks are what the app edits.** `store` and `filebridge` turn a file into an
  ordered tree of blocks and back, byte-identically when nothing changed.
- **The index is disposable.** `.mosaic/index.sqlite` holds full text, links, tags
  and properties. Deleting it costs a rebuild and nothing else.

Everything Mosaic adds to a folder lives in frontmatter or under `.mosaic/`:

```
MyNotes/
  Inbox/idea.md                 a note — pinned, colour, labels are frontmatter flags
  Work/Research/Papers.md       notebook / section / page are just folders and a file
  _media/2026/09/photo.jpg
  .mosaic/index.sqlite          rebuildable
  .mosaic/store/                oplog and blobs (Storage adapter)
  .mosaic/backups/              originals copied before any external merge
  .mosaic/trash/                30-day recovery
```

Pinning, sticky windows, board membership and colour are **flags on one note**,
never separate objects. A view (board, table, calendar) is a query over the index.

## How an edit flows

1. The editor (ui) changes a block and calls core.
2. `crdt` applies it to the note's Yjs document and emits a binary update.
3. `filebridge` writes the markdown file atomically and advances its base version.
4. The update is appended to the oplog through `Storage`; `sync` queues it for the relay.
5. `indexer` refreshes that one file's rows.

An edit from **another program** enters at step 3 in reverse: the watcher fires,
`filebridge` copies the file to `.mosaic/backups/`, diffs it against the stored
base, and applies the difference to the CRDT as if a peer had made it.

## The development surface

The cloud environment has no GUI, so the web app is where features are built and
verified. `pnpm dev` serves `apps/web` and, through `packages/adapters/src/devserver`,
bridges the browser to a real folder on disk — external edits included. Core logic
runs headlessly under vitest; UI runs under headless Playwright. Native shells are
compiled in CI. See ADR 0007.

## What exists today

The skeleton: interfaces, adapters, tooling and tests. No product features. Each
core module has its public types, a stub that throws `NotImplementedError`, and a
spec in `packages/core/test/modules/*.pending.test.ts` describing the behaviour
the plan requires. [ROADMAP.md](ROADMAP.md) tracks what lands when.
