# 0005 — SQLite on each platform

**Status:** accepted · **Departs from the plan:** in detail

## Decision

| Platform        | Implementation                                                     |
| --------------- | ------------------------------------------------------------------ |
| node            | `better-sqlite3`                                                   |
| web             | `@journeyapps/wa-sqlite` (asyncify build) with `OPFSAnyContextVFS` |
| desktop, mobile | Tauri's sql plugin                                                 |
| extension       | none — it has no index                                             |

## Why these

- **`@journeyapps/wa-sqlite`, not `wa-sqlite`.** The original package's npm release
  is stale; this is the maintained fork, published with FTS5 compiled in. The
  Playwright suite proves FTS5 works in Chromium.
- **`OPFSAnyContextVFS` on the calling thread.** It needs no worker and no
  cross-origin isolation headers, which keeps the first version simple. The
  `Database` interface is fully async, so moving SQLite into a worker later — likely
  needed for the 120 ms search budget on 10,000 notes — changes nothing above the adapter.
- **Tauri sql plugin** as the prompt specifies, so no Rust has to be written.

## Risks to check

- The Tauri sql plugin uses a connection pool. `Database.transaction` issues
  `BEGIN`/`COMMIT` as separate calls, which is only correct with a pool of one.
  Verify on the first desktop build; if the pool cannot be pinned, the fallback is
  running wa-sqlite inside the WebView on desktop too.
- Whether the plugin's bundled SQLite has FTS5 is unverified. `databaseContract`
  tests it; run that contract in a desktop build before building the index.
- The Tauri adapters cannot run in the cloud dev environment at all.
