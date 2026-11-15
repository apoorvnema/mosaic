# Roadmap

The phases from [plan.html](plan.html) section 19, mapped to the build sessions in
[prompts.md](prompts.md). Tick a box when the work is merged **and** its test is green.

## Phase 0 — Prove the substrate

- [x] Monorepo: pnpm workspaces, Turborepo, strict TypeScript
- [x] Adapter interfaces: Storage, FileSystem, Database, Crypto, Clock, Logger, Telemetry
- [x] Adapters: node, web (OPFS + wa-sqlite), Tauri, extension — with shared contract tests
- [x] Import-boundary lint rule for core
- [x] Core module interfaces and behaviour specs (pending)
- [x] CI: lint, typecheck, test, headless Playwright
- [x] Design system foundations: tokens, twelve note colours, light and dark, app shell
- [x] CI builds proven green: desktop (Linux, Windows, macOS)
- [ ] Android: signed release APK installs and starts on a phone
- [ ] File format specification: markdown extensions, frontmatter rules, block ids
- [ ] Spike: markdown round-trip fidelity on a real corpus
- [ ] Spike: Yjs on a 50,000-word document and a 10,000-object board
- [ ] Spike: pen latency in a Tauri WebView on a mid-range Android tablet (needs hardware)
- [ ] Exit test: 1,000 randomised concurrent edits from three simulated devices converge byte-identically

## Phase 1 — A note app you would actually use, on one machine

Prompt 1 — vault and editor

- [x] Vault: open a folder, scan, parse markdown + frontmatter into the block tree
- [x] Round-trip: awkward-markdown corpus survives parse → serialise unchanged
- [x] Block tree with stable ids, materialised only when referenced
- [x] SQLite index with FTS5; wipe-and-rebuild test
- [x] File watcher: external edits update the open document
- [x] Block editor (ProseMirror): paragraphs, headings, lists, tasks, quotes, callouts, code, images, links
- [x] Wiki links with autocomplete, slash menu, drag to reorder
- [x] Search under 120 ms on 10,000 notes, benchmarked in CI — measured 20 ms worst case, 2.8 s to build the index
- [x] Backlinks panel, trash with undo, rename, new note
- [ ] Trash purge after 30 days
- [ ] Editor: tables, callout kind/title editing, link editing UI (currently edited as markdown source)
- [ ] Search in the browser measured on 10,000 notes (the benchmark runs on node's SQLite)

Prompt 2 — board, notebooks, stickies

- [ ] Board: masonry colour cards, pinned row, checklist previews, multi-select, archive with undo
- [ ] Notebooks: breadcrumb, section chips, colour spines, swipe between pages
- [ ] Stickies in twelve colours; pinning is a flag, never a copy
- [ ] Command bar: fuzzy search over notes and actions
- [ ] Responsive 360px to wide desktop, keyboard-complete, dark mode

Prompt 3 — desktop shell

- [ ] Folder picker, remembered between launches; multiple windows
- [ ] Global-hotkey capture window, under 400 ms to a typed character
- [ ] Sticky windows: frameless, pin, auto-collapse, edge docking, per-monitor position
- [ ] Wayland layer-shell, GNOME fallback, tray icon

## Phase 2 — It is on your phone, and it is the same notes

Prompt 4 — sync and accounts

- [ ] Identity: passkeys, email + TOTP, device list, pairing
- [ ] Sync relay: append-only update log, WebSocket + HTTP, snapshots, presence
- [ ] Blobs: content-addressed, deduplicated, resumable
- [ ] Sync client: offline queue, backoff, per-device status
- [ ] File bridge: base versions, three-way merge, timestamped copy first
- [ ] Chaos harness: three devices, skewed clocks, external edits, 1,000 rounds, nightly
- [ ] docker-compose for self-hosting

Prompt 5 — Android

- [ ] Board home with bottom capture row; notebook navigation
- [ ] Share target, quick-settings tile, lock-screen capture, ongoing notification
- [ ] Glance widgets: capture bar, single note, sticky stack, note list

Prompt 6 — Chrome extension

- [ ] Popup capture, context menus, side panel, keyboard command
- [ ] Clipper: readable article to markdown
- [ ] Offline queue flushed to the relay; works signed out

## Phase 3 — Structure and the canvas

Prompt 7 — collections, journal, bug tracker

- [ ] Collection schemas, typed fields, validation on write, repair queue
- [ ] Relations, rollups, formulas evaluated in core
- [ ] Table view with spreadsheet keyboard navigation; board, calendar, gallery, list
- [ ] Saved views as files; CSV round-trip
- [ ] Bug tracker template; grouping fast on 5,000 rows
- [ ] Daily journal: templates, roll-forward, stand-up view, week roll-up

Prompt 8 — canvas, ink, diagrams

- [ ] Tiled WebGL2 scene graph, 60 fps with 10,000 objects
- [ ] Shapes, connectors, frames, snapping; note cards as live transclusions
- [ ] Ink layer: pressure, tilt, prediction, palm rejection; under 30 ms measured
- [ ] Mermaid blocks; `.excalidraw` read and write; SVG, PNG, PDF export

## Phase 4 — Vault, plugins, and the browser

Prompt 9

- [ ] Vault: Argon2id, per-document XChaCha20-Poly1305 keys, auto-relock, 24-word recovery
- [ ] `docs/THREAT-MODEL.md`
- [ ] Plugin runtime: sandbox, capability manifests, budgets, three first-party plugins
- [ ] Importers: Obsidian, Keep (Takeout), Evernote (.enex), Notion (API), OneNote (Graph)
- [ ] Sharing by link with permissions and revocation

## Phase 5 — Apple platforms and 1.0

- [ ] macOS shell with menu-bar capture and notarisation
- [ ] iOS and iPadOS app with widgets and Apple Pencil
- [ ] Accessibility audit, five languages, store submissions
