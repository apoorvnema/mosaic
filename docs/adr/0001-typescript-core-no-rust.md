# 0001 — TypeScript core, no Rust in application code

**Status:** accepted · **Departs from the plan:** yes (plan section 5 picks a Rust core)

## Decision

Follow the plan's Path B (section 6): the core is TypeScript running in the WebView
on every platform. The only Rust in the repository is what Tauri scaffolds in
`src-tauri` — `build.rs`, `main.rs`, `lib.rs` — which registers plugins and starts
the WebView. The server will be Node (Hono), not Rust with axum.

## Why

The owner does not write Rust and must be able to read, review and maintain every
line of application code. The plan itself states the architecture survives the
language change, and names this path as right for a team of one to three.

## Consequences

- Indexing must run against SQLite, never as a JavaScript loop on the main thread.
- Ink latency stays the riskiest item; the plan's native-ink-surface fallback applies.
- Plugin sandboxing is enforced by the host (iframe + worker + message port), not by a WASM runtime.
- The door stays open: core sits behind narrow interfaces, so the index, the ink
  pipeline or the file diff could later be ported without touching the rest.
- If something genuinely needs Rust: the smallest possible command, in its own file,
  recorded in CLAUDE.md and a new ADR, and the owner is told what it does.
