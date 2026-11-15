# 0004 — The adapter boundary, and how it is enforced

**Status:** accepted · **Departs from the plan:** no (makes section 6's "narrow interface" concrete)

## Decision

Core reaches the outside world only through seven interfaces in
`packages/core/src/platform`: `FileSystem`, `Database`, `Storage`, `Crypto`,
`Clock`, `Logger`, `Telemetry`. A shell bundles implementations into a `Platform`.
A shell with no file system provides `RelayOnlyPlatform` (no `fs`, no `db`).

The boundary is enforced three ways:

1. A custom ESLint rule, `mosaic/no-platform-imports-in-core`, written as an
   **allowlist**. Core may import relative paths within `packages/core/src` and the
   pure packages listed in `eslint.config.js` (`yjs`, `lib0`). A blocklist would
   miss whatever nobody thought to ban.
2. `no-restricted-globals` in core for platform globals, including `Date` and
   timers, which must come from `Clock` so tests can skew time.
3. Core's `tsconfig.json` has `lib: ["ES2022"]` and `types: []`. `TextEncoder` and
   `TextDecoder` are declared by hand in `src/env.d.ts`; nothing else is available.

## Consequences

- Adding a package to the allowlist needs an ADR saying why it is pure.
- Core's tests live in `packages/core/test`, outside `src`, so they may use vitest
  and a real SQLite without loosening the rule.
- Every adapter is checked by the same contract suites (`@mosaic/core/contracts`),
  and so are the in-memory fakes core's own tests use.
- `Storage` is implemented once on top of `FileSystem` for every platform that has
  a folder, and separately on `chrome.storage` for the extension.
- One libsodium-backed `Crypto` serves every platform, so all devices agree.
