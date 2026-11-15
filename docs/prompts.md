# Prompt pack for Claude Code (cloud)

Build order for Mosaic. Paste one prompt per session, in order. Don't paste the whole pack at once — a prompt asking for everything produces a shallow skeleton of everything.

## Before you start

1. Create an empty GitHub repo (`mosaic`) and point Claude Code cloud at it.
2. Commit the plan file first: `docs/plan.html` (the architecture document). Every prompt below assumes it's there.
3. Claude Code cloud has no GUI, no emulator, no device. It cannot see your app run. So: **the web build is the development surface**, all core logic must be testable headlessly with `vitest`, and native builds are wired into CI rather than run locally. This is stated in Prompt 0 — don't remove it.

---

## Prompt 0 — Bootstrap, architecture, and the rules

```
Read docs/plan.html first. It is the full architecture and project plan for this
product. Follow it. Where this prompt and the document disagree, this prompt wins.

Build the repository skeleton and the development environment. No product features
yet — this session is about structure, interfaces, tooling and tests.

PRODUCT IN ONE LINE
A local-first note app that combines Google Keep's instant capture, OneNote's
notebooks and desktop sticky notes, Notion's typed databases, and Obsidian's plain
markdown files, with an infinite canvas and pen support.

HARD CONSTRAINTS
- Plain files on disk are the source of truth. Markdown with YAML frontmatter for
  notes, JSON for canvases, a sibling folder for media. The app must work on a
  folder it has never seen, and the folder must stay usable without the app.
- Everything local-first and offline. The network is an optimisation, never a
  requirement.
- TypeScript everywhere. No Rust in application code. I do not write Rust, so do
  not introduce it, and do not generate Rust beyond what Tauri scaffolds itself.
- One core, many shells. Platform differences live behind adapter interfaces only.

TARGETS (scaffold all of them now, even the empty ones)
- Desktop: Linux, Windows, macOS — Tauri v2
- Mobile: Android now, iOS later — Tauri v2 mobile
- Web: PWA — Vite
- Chrome extension: Manifest V3
- Android home-screen widgets: Kotlin + Glance, inside the Tauri Android project
- Server: Node or Bun, for sync and auth, added in a later session

REPOSITORY LAYOUT
mosaic/
  packages/core/        pure TypeScript, no DOM, no React, no platform imports
  packages/ui/          React components shared by every shell
  packages/adapters/    one folder per platform implementation
  apps/desktop/         Tauri v2
  apps/mobile/          Tauri v2 mobile (Android first)
  apps/web/             Vite PWA — the development surface
  apps/extension/       Chrome MV3
  services/api/         empty placeholder for now
  docs/                 plan.html, ARCHITECTURE.md, ADRs
Use pnpm workspaces and Turborepo. TypeScript strict mode on, everywhere.

THE INTERFACES — design these carefully, they are the whole point
packages/core must depend on nothing platform-specific. Define and export:
- Storage      key-value plus blob, for the index and the oplog
- FileSystem   read, write, list, watch, move, delete a vault folder
- Database     SQL execution for the SQLite index
- Crypto       random, derive key, encrypt, decrypt, hash
- Clock, Logger, Telemetry
Then implement them per platform in packages/adapters:
- desktop + mobile: Tauri fs and sql plugins
- web: Origin Private File System, wa-sqlite over OPFS
- extension: chrome.storage, no file system, talks to the relay only
- node (for tests): real fs in a temp dir, better-sqlite3
Core code importing anything platform-specific must fail the lint rule you write.

CORE MODULES (stubs with real types and real tests, no implementation yet)
store, crdt (Yjs), filebridge, index, search, schema, crypto, sync, plugins.
Each one gets its public interface, its types, and failing tests that describe
the behaviour the plan requires.

TOOLING
- vitest for unit tests, with a `test:core` task that runs with zero browser
- Playwright for the web app, headless
- eslint + prettier, the import-boundary rule above, strict TS
- GitHub Actions: lint, typecheck, test on every push; separate workflows that
  build the Tauri desktop app (Linux, Windows, macOS), the Android APK, the web
  bundle, and the extension zip. These may be scaffolded without being green yet.
- A `pnpm dev` that starts the web app against a local folder, because that is
  the only surface you can exercise in this environment.

DOCUMENTS TO WRITE
- CLAUDE.md: the constraints above, the layout, the commands, the testing rules,
  and an explicit "never do this" list (no Rust, no platform imports in core, no
  database as source of truth, no feature work without a test).
- docs/ARCHITECTURE.md: how the pieces fit, with the adapter boundaries drawn.
- docs/adr/0001..000N: one short record per decision you make, including the ones
  you make differently from the plan, with the reason.
- docs/ROADMAP.md: the phases from the plan, as checkboxes.

Finish by printing the commands I run to verify the skeleton, and what is
deliberately not working yet.
```

---

## Prompt 1 — The vault and the editor

```
Read CLAUDE.md and docs/ARCHITECTURE.md.

Implement the local vault and a working block editor, on the web app only.
No accounts, no sync, no network calls of any kind this session.

1. Vault: open a folder, scan it, parse markdown with frontmatter into the block
   tree, write it back byte-identically when nothing changed. Round-tripping is
   the headline test — a corpus of awkward markdown files in test/fixtures must
   survive parse → serialise unchanged.
2. Block tree: ordered tree, stable ids, the block types listed in the plan's
   data model section. Ids are only materialised for blocks something references.
3. Index: SQLite with FTS5 over the adapter. Derived, never authoritative. Write
   the test that deletes the index, rebuilds, and asserts the app state matches.
4. File watcher: external edits re-parse and update the open document.
5. Editor: ProseMirror-based block editor in packages/ui — paragraphs, headings,
   lists, tasks, quotes, callouts, code, images, links, wiki links with
   autocomplete, slash menu, drag to reorder.
6. Search: full-text across the vault in under 120ms on 10,000 notes. Generate
   that corpus in a script and benchmark it in CI.

Everything through the core interfaces. The editor must not touch the file system.
```

---

## Prompt 2 — Board, notebooks, stickies

```
Read CLAUDE.md and section 12 of docs/plan.html, which describes the mobile and
desktop layouts in detail. Build the three surfaces, in packages/ui, rendered by
the web app.

- Board: Keep-style two-column masonry of colour cards, pinned row on top,
  checklist previews, image thumbnails, long-press multi-select, archive with undo.
- Notebooks: OneNote-style breadcrumb, horizontal section chips carrying their
  colour, colour spine down each page row, swipe between pages in a section.
- Stickies: a note rendered small, with twelve stable colours.
- Command bar: fuzzy search over notes and actions.

Pinning is a flag on a note, never a separate object or a copy. A note filed in a
section can still be pinned to the board. Write the tests that prove a note moved
between surfaces is still the same file on disk.

Responsive from 360px to wide desktop. Keyboard-complete. Dark mode via tokens.
```

---

## Prompt 3 — Desktop shell and real sticky windows

```
Read CLAUDE.md. Wire up apps/desktop with Tauri v2 for Linux, Windows and macOS.

- Native folder picker for choosing a vault, remembered between launches.
- Multiple windows over the same vault, staying consistent.
- Global hotkey that opens a small always-on-top capture window, pre-warmed, which
  writes the note and closes. Target under 400ms from hotkey to typed character.
- Sticky windows: frameless, coloured, resizable, position remembered per monitor.
  On Wayland use the layer-shell protocol, on X11 the window-manager hints, on
  Windows a topmost tool window.
- A pin control on every sticky. Pinned means always on top of every application
  and across workspaces; unpinned behaves as an ordinary window. The state lives
  on the note and survives a restart.
- Auto-collapse: when the pointer leaves, roll the sticky up to its title strip
  after an adjustable delay, default 600ms. Hover peeks it open where it sits,
  click keeps it open. It must NEVER collapse while the caret is in it, while
  text is selected, or during a drag. Collapse on focus loss too, so the feature
  works for someone using the keyboard.
- Collapsed appearance configurable: title strip, a colour tab docked to a screen
  edge, or a drop in opacity. Optional click-through while collapsed.
- Global shortcuts to summon every sticky to the front and to hide them all.
- Note that GNOME's Wayland compositor does not expose layer-shell to ordinary
  apps. Detect it, fall back to a plain always-on-top window, and hide the edge
  docking setting there rather than shipping it broken.
- Tray icon with new note, open board, and the sticky list.

Configure the Tauri side through its config and existing plugins. If something
genuinely cannot be done without Rust, write the smallest possible command, put it
in its own file, document it in CLAUDE.md, and tell me explicitly what it does.
```

---

## Prompt 4 — Sync and accounts

```
Read CLAUDE.md and sections 8 and 9 of docs/plan.html.

services/api — Hono on Node, Postgres, S3-compatible blob storage:
- Identity: passkeys first, email and password with TOTP as fallback, OAuth later.
  Short-lived access tokens, rotating device-bound refresh tokens, device list
  with remote revoke, device pairing by code.
- Sync relay: append-only update log per document, Yjs binary updates, WebSocket
  for live and HTTP for cold start, presence, snapshot compaction. The server must
  never need to parse note content — this is what makes the vault possible later.
- Blobs: content-addressed, deduplicated, presigned, resumable.
- docker-compose for self-hosting, and a documented upgrade path.

packages/core/sync — client, offline queue, reconnect with backoff, per-device
status. Implement the file bridge properly: store a base version per file, diff
external changes against it, convert the diff to CRDT operations, and always copy
the original to a timestamped file before merging.

The release test: a chaos harness with three simulated devices going offline mid
edit, with skewed clocks and an external editor rewriting files, run for a
thousand randomised rounds, ending in byte-identical convergence and zero lost
acknowledged updates. Put it in CI as a nightly job.
```

---

## Prompt 5 — Android app and widgets

```
Read CLAUDE.md and section 12 of docs/plan.html.

apps/mobile with Tauri v2 Android. Reuse packages/ui unchanged — any component
that needs forking is a bug in the component, fix it there.

- Board as the home screen, capture row fixed at the bottom within thumb reach:
  text, checklist, ink, photo, voice.
- Notebook navigation with section chips and swipe between pages.
- Share target from any app. Quick-settings tile. Lock-screen capture into a
  staging area that syncs after unlock.
- Ongoing notification with inline reply.

Widgets in Kotlin with Glance, reading from the local store, never waiting on the
network, never showing a spinner:
- capture bar 4x1, five one-tap targets
- single note 2x2 to 4x4, live, with tickable checkboxes
- sticky stack 2x2, swipeable
- note list 4x2, filtered by label

You cannot run an emulator here. Make every widget's data layer a plain Kotlin
class with JVM unit tests, keep the UI thin, and wire an assembleDebug job in CI.
List exactly what I need to verify by hand on a device.
```

---

## Prompt 6 — Chrome extension

```
Read CLAUDE.md. Build apps/extension as Manifest V3, sharing packages/core
through the extension adapter.

- Popup: capture a note in one keystroke, with the page title and URL attached.
  Opens pre-focused. Under 400ms to typing.
- Context menu: save selection, save link, save image, each into a chosen notebook.
- Side panel: the board and search, so notes are readable without leaving the tab.
- Keyboard command for capture, configurable.
- Clipper: readable article extraction into markdown, images fetched and stored.
- Offline queue in chrome.storage, flushed to the relay when signed in.
- Signed out it still works, holding notes locally until an account exists.

The extension has no file system, so it is a sync client only — it talks to the
relay, never to a vault folder. Make that boundary explicit in the adapter.

Package as an unpacked zip in CI, with a README covering local install.
```

---

## Prompt 7 — Collections, the spreadsheet view, journal and bug tracker

```
Read CLAUDE.md, section 7 (data model) and section 13 (workflows) of
docs/plan.html. This session builds the structured half of the product and the
two workflows it exists to serve.

1. COLLECTIONS
   A collection is a schema file claiming a folder or a query. Fields: text,
   number, date, select, multi-select, checkbox, url, relation, rollup, formula.
   Note properties live in YAML frontmatter and stay human-readable.
   - Validate on write: a word typed into a number field is refused in the editor.
   - Never destroy: a value broken by an external edit is preserved verbatim and
     flagged in a repair queue. Structure is not a licence to delete someone's text.
   - Relations are links plus an index; rollups and formulas evaluate in core so
     every platform agrees on the result.

2. VIEWS over the index, not over copies of the data
   - Table with inline editing, full keyboard navigation (tab, enter, arrows),
     fill-down, multi-row select, column resize and reorder. It must feel like a
     spreadsheet. Test it with the keyboard only, no mouse events at all.
   - Board grouped by any select field, calendar on any date field, gallery, list.
   - Saved views with filters, sorts and grouping, stored as files like everything
     else.
   - CSV import and export that round-trips: export, edit in a spreadsheet,
     re-import, and the result must be byte-identical where nothing changed.

3. THE BUG TRACKER as the proving case
   Ship a built-in collection template: id, title, repo (select), device
   (multi-select), severity, status, version found, reproducible, date found,
   date fixed, commit or PR url.
   - Every row opens as a full note: reproduction steps, pasted screenshots,
     attached logs.
   - Status history derived from the existing edit log, giving time-in-status and
     time-to-fix with no extra storage.
   - Grouping by repo and by device must stay fast on 5,000 rows — benchmark it.
   - Do not integrate with GitHub, GitLab or Jira. That is a plugin, later.

4. THE DAILY JOURNAL
   - A journal is a collection with a date field and a per-project template.
   - One shortcut opens today's page for the active project, creating it from the
     template if it does not exist.
   - Unticked tasks roll forward to the next day, marked with the date they came
     from. Completed items stay on the day they were finished.
   - Stand-up view: yesterday, today and blockers across every project, computed
     on open, never stored.
   - Week roll-up that collects every "to discuss" line into one exportable page.
   - Bidirectional links: a bug id typed in a journal entry appears on that bug.

Every one of these is a query or a template over the files that already exist.
If you find yourself adding a second store, a cache that cannot be rebuilt, or a
copy of a note, stop and write an ADR instead.
```

---

## Prompt 8 — Canvas, ink and diagrams

```
Read CLAUDE.md and section 14 of docs/plan.html.

One engine serving the infinite whiteboard, the freeform page, and the drawing
embedded in a note — different bounds, same scene graph.

- Tiled scene graph over WebGL2, only visible tiles rasterised. 60fps while panning
  a board of 10,000 objects, benchmarked in CI with a synthetic board.
- Shapes, arrows, connectors that stay attached when a shape moves, frames,
  grouping, alignment guides, snapping.
- Note cards on the canvas as live transclusions of real notes, not copies.
- A separate low-latency ink layer: pointer events with pressure and tilt, motion
  prediction, curve fitting on stroke end, palm rejection, pen-only mode.
  Target under 30ms pen-down to first ink. Instrument it and log the number.
- Mermaid blocks rendered from text in the markdown file.
- Read and write the .excalidraw format so the same file opens in Excalidraw.
- Export to SVG, PNG and PDF with vector text preserved.

If the ink latency target cannot be met inside the WebView, say so with the
measurement, and write an ADR proposing a native composited ink surface instead of
quietly shipping something slow.
```

---

## Prompt 9 — Vault, plugins, importers

```
Read CLAUDE.md and sections 10, 15 and 18 of docs/plan.html. Three features, in
this order, each fully finished before the next.

1. Vault. Separate passphrase, never transmitted. Argon2id derivation, per-document
   keys under XChaCha20-Poly1305 via libsodium — use the library, never hand-roll.
   Biometric unlock, auto-relock on timer and on sleep, 24-word recovery phrase,
   local-only encrypted index, attachment size padding. Vault content is excluded
   from plugins unless explicitly granted. Write docs/THREAT-MODEL.md stating in
   plain language what the server can and cannot see.

2. Plugins. Sandboxed iframe plus worker, message-port API, capability manifests
   declared and shown in plain language at install, time and memory budgets, a
   suspended-plugin notice naming the culprit. Ship three first-party plugins built
   on the same public API to prove it is real.

3. Importers. File-based first, APIs second:
   - Obsidian: point at the folder, nothing to convert
   - Google Keep: Takeout archive, parse the JSON not the HTML
   - Evernote: .enex
   - Notion: official API, markdown endpoint where possible, roughly three requests
     per second, signed file URLs expire in about an hour so download during the
     crawl, resumable with a checkpoint after every page
   - OneNote: Microsoft Graph, notebooks/sections/pages, HTML content, ink with the
     InkML flag where the page supports it
   Every import lands in a dated folder, keeps originals verbatim in _original/,
   and ends with a fidelity report listing everything that did not convert cleanly.
```

---

## Keeping it on the rails

- **One prompt per session.** Let it finish, review the diff, merge, then move on.
- **Make it update CLAUDE.md** at the end of each session with anything it learned or changed. That file is the memory between sessions.
- **Reject the first "it works".** Ask for the test that proves it, and the number for anything with a performance budget.
- **Watch for Rust creeping in.** Tauri will scaffold some. Anything beyond scaffolding needs a reason in an ADR.
- **Watch for the index becoming the source of truth.** It's the most likely architectural drift, and the nightly wipe-and-rebuild test is what catches it.
- When a session goes sideways, revert rather than patching. The prompt is cheap to run again.
