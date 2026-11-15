# 0002 — Files are the source of truth; the index is derived

**Status:** accepted · **Departs from the plan:** no

## Decision

The vault folder holds the truth: markdown with YAML frontmatter, JSON canvases,
media in a sibling folder. Everything Mosaic adds lives in frontmatter or under
`.mosaic/`. The SQLite index is derived data and may be deleted at any time.

## Why

It is the product's reason to exist: delete the app, keep the folder. It is also
what lets an existing Obsidian folder open with nothing to convert.

## Consequences

- No second store, no cache that cannot be rebuilt, no copy of a note. Needing one
  means stopping to write an ADR.
- Pin, sticky, archive, colour and labels are frontmatter flags on one note.
- `VaultIndex.fingerprint()` exists so a test can wipe the index, rebuild, and
  assert the state is identical. That test is the guard against the most likely
  drift — the index quietly becoming authoritative.
- App-private state (oplog, blobs, backups, trash) goes through the `Storage` and
  `FileSystem` adapters into `.mosaic/`, so it travels with the folder.
- The cost is the file bridge: two sources of change (the app and other programs)
  must be merged. That is paid deliberately.
