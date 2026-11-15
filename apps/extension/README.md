# Mosaic for Chrome

Manifest V3. A sync client only: the extension has no file system, so it never
touches a vault folder. It holds captured notes in `chrome.storage` and talks to
the relay. That boundary is enforced by types — `createExtensionPlatform()`
returns `RelayOnlyPlatform`, which has no `fs` and no `db`.

## Install locally

```bash
pnpm --filter @mosaic/extension build
```

Then open `chrome://extensions`, turn on **Developer mode**, choose
**Load unpacked**, and select `apps/extension/dist`.

To produce the zip CI uploads: `pnpm --filter @mosaic/extension zip`.
