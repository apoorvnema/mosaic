# 0008 — Small departures from the plan and the bootstrap prompt

**Status:** accepted

Each of these is minor; they are recorded together so none is a surprise.

| Departure                                                                    | Reason                                                                                                                                                                                         |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The index module's folder is `packages/core/src/indexer`, not `index`        | A folder named `index` beside `index.ts` makes `./index` ambiguous to every resolver and reader                                                                                                |
| File watching in the node adapter uses `chokidar`                            | Node's built-in recursive watcher on Linux loses a file after an atomic rename-replace and never reports its deletion. Found by the adapter contract test                                      |
| TypeScript is pinned to 6.0.x rather than the latest 7                       | typescript-eslint 8 does not support TypeScript 7 yet. Revisit when it does                                                                                                                    |
| Workspace packages export TypeScript source, with no build step between them | One fewer thing to keep in sync; Vite, vitest and tsc all consume source. Revisit only if build times demand it                                                                                |
| `Storage` is files under `.mosaic/store/`, not rows in SQLite                | The oplog must survive the index being deleted (ADR 0002), so it cannot live in the index database                                                                                             |
| `Crypto.hash` is SHA-256                                                     | Content-addressed blobs need a hash every S3-compatible store and every platform can verify                                                                                                    |
| The skeleton renders a "Foundation" status screen                            | Not a product feature. It exercises every adapter through the real interfaces in a real browser, which is what the Playwright suite asserts. The Board replaces it                             |
| Server stack will be Node + Hono, not Rust + axum                            | Follows ADR 0001                                                                                                                                                                               |
| Design: clean and modern, not the plan's pinboard look                       | Owner's direction. The plan's cork board and tilted notes are illustration; the product uses neutral surfaces, one accent and flat colour cards. Tokens in `packages/ui/src/styles/tokens.css` |
