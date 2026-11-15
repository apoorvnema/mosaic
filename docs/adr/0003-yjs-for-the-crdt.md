# 0003 — Yjs for the CRDT

**Status:** accepted, to be confirmed by the phase 0 spike · **Departs from the plan:** resolves an open choice (Loro or Yjs)

## Decision

Use Yjs. One Yjs document per note; text as a sequence CRDT, frontmatter
properties as a last-writer-wins map. Updates are opaque binary blobs.

## Why

It is TypeScript, mature, and has the surrounding pieces already written
(`y-prosemirror` for the editor binding). The relay can store and forward updates
without parsing them, which is what makes end-to-end encryption cheap later.

## Consequences

- `yjs` and `lib0` are on core's import allowlist: both are pure, with no DOM or
  node dependency.
- Core exposes its own `CrdtDoc` interface rather than Yjs types, so the library
  could be swapped without touching callers.
- Documents above a few megabytes need snapshotting (`compactUpdates`).
- The plan's spike — a 50,000-word document and a 10,000-object board — still has
  to be run and its numbers recorded here before sync is built on top.
