# 0009 — Lossless markdown by keeping the source, and a flat editor document

**Status:** accepted · **Departs from the plan:** no (it is how section 7's "round-trip without loss" is met)

## Decision

**Parsing keeps the source.** Every line of a file is assigned to exactly one block
as `source.raw` (its own lines) or `source.trailing` (the blank lines after it),
with a fingerprint of the block's fields at parse time. Serialising writes an
unedited block from its source and regenerates only a block whose fingerprint no
longer matches. Frontmatter is patched key by key; untouched lines, comments and
odd spacing stay as written.

The consequence is that `serializeMarkdown(parseMarkdown(s)) === s` holds for
every input by construction, not by having a parser that happens to agree with
every markdown dialect. The parser only has to be good enough to edit with. The
tests assert it on a 25-file corpus and on every prefix of every file.

**The editor document is flat.** ProseMirror holds a flat list of blocks; list
nesting is an `indent` attribute, converted to and from the block tree in
`packages/ui/src/editor/convert.ts`. Each node carries the key of the block it was
loaded from, and a node that still matches gets its original block back — source
and all. So opening a note and saving it writes nothing, and typing in one
paragraph rewrites one paragraph.

**`yaml` joins core's import allowlist.** It is pure JavaScript with no DOM or node
dependency. It is used to read frontmatter values and to write a single changed
key; it is never used to re-emit a whole frontmatter block.

## Why flat

Drag-to-reorder, Enter, Backspace and Tab are each a few lines on a flat document
and each a small project on nested lists. Markdown that the flat model cannot show
well (tables, embeds) is edited as source in a `raw` block rather than guessed at.

## Consequences

- A block someone edits is rewritten in Mosaic's canonical style (`-` bullets, `**`
  bold, ATX headings). Blocks nobody edits keep the author's style.
- Markdown has no empty paragraph, so an empty one in the editor is not written.
- When a block is moved, the blank lines it carried move with it; the serialiser
  re-inserts a separator where two blocks that were never neighbours now meet.
- Tables, callout titles and link targets have no dedicated editing UI yet.
- The file bridge's three-way merge with a CRDT (Prompt 4) builds on this: it will
  diff against a stored base text, which this representation makes cheap.

## Measured

Search on a 10,000-note vault: 11 ms median, 20 ms worst case, against a 120 ms
budget. Building the index for those notes: 2.8 s. Both on node's SQLite
(`pnpm test:bench`); the browser build has not been measured at that size yet.
