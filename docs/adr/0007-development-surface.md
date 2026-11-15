# 0007 — The web app against a local folder is the development surface

**Status:** accepted · **Departs from the plan:** adds a dev-only adapter

## Context

Development happens in a cloud environment with no GUI, emulator or device. The
only shell that can be run and observed is the web app, in headless Chromium. But a
browser cannot open an arbitrary folder without a user gesture, and the product is
about folders on disk — including edits made by other programs.

## Decision

- `pnpm dev` runs `apps/web`. A Vite plugin serves one local folder over HTTP
  (`packages/adapters/src/devserver`), and the app uses `HttpFileSystem`, a
  `FileSystem` adapter that talks to it. The folder is `dev-vault/` by default, or
  `MOSAIC_VAULT=/any/path`. `MOSAIC_VAULT=opfs` uses the real web adapter instead.
- The bridge passes the same `fileSystemContract` as every other adapter, so the
  app is never developed against something no shipped platform resembles.
- It is development only: the plugin has `apply: 'serve'`, the adapter is imported
  dynamically behind `import.meta.env.DEV`, and it is absent from production bundles.
- Playwright runs against this setup on a fresh temp folder, and writes files from
  the test process to simulate another editor.

## Native targets

- Desktop and Android are built in CI. Their workflows are scaffolded and not yet
  proven green.
- `apps/mobile` is a separate Tauri project from `apps/desktop`, as the layout
  requires, sharing `packages/ui` and the `tauri` adapter.
- The generated Android project (`src-tauri/gen/android`) is not committed: creating
  it needs the Android SDK and NDK. CI runs `tauri android init` for now. It will be
  committed in the Android session, because the Glance widgets must live inside it.
  Until then `apps/mobile/android-widgets/` holds the place.
