import { describe, expect, it } from 'vitest';
import { compactUpdates, createCrdtDoc, type CrdtDoc, type Note } from '../../src/index';

const note = (text: string): Note => ({
  path: 'n.md',
  meta: { title: 'N' },
  blocks: [{ type: 'paragraph', text, props: {}, children: [] }],
});

function sync(a: CrdtDoc, b: CrdtDoc): void {
  b.applyUpdate(a.encodeDiff(b.encodeStateVector()), 'remote');
  a.applyUpdate(b.encodeDiff(a.encodeStateVector()), 'remote');
}

describe('crdt', () => {
  it('round-trips a note through a document', () => {
    const doc = createCrdtDoc();
    doc.loadNote(note('hello'));
    expect(doc.toNote()).toEqual(note('hello'));
  });

  it('converges two devices typing in the same paragraph, with no conflict', () => {
    const a = createCrdtDoc({ clientId: 1 });
    a.loadNote(note('The quick fox'));
    const b = createCrdtDoc({ clientId: 2 });
    b.applyUpdate(a.encodeState(), 'remote');

    a.applyTextDiff('The quick brown fox\n', 'local');
    b.applyTextDiff('The quick fox jumps\n', 'local');
    sync(a, b);

    expect(a.toNote()).toEqual(b.toNote());
    expect(a.encodeState()).toEqual(b.encodeState());
    const text = a.toNote().blocks[0]?.text ?? '';
    expect(text).toContain('brown');
    expect(text).toContain('jumps');
  });

  it('applies updates idempotently and in any order', () => {
    const a = createCrdtDoc({ clientId: 1 });
    a.loadNote(note('x'));
    const updates: Uint8Array[] = [];
    a.onUpdate((u) => updates.push(u));
    a.applyTextDiff('xy\n', 'local');
    a.applyTextDiff('xyz\n', 'local');

    const b = createCrdtDoc({ clientId: 2 });
    b.applyUpdate(a.encodeState(), 'remote');
    const c = createCrdtDoc({ clientId: 3 });
    for (const u of [...updates].reverse()) c.applyUpdate(u, 'remote');
    for (const u of updates) c.applyUpdate(u, 'remote');
    c.applyUpdate(a.encodeState(), 'remote');
    expect(c.toNote()).toEqual(b.toNote());
  });

  it('resolves concurrent property writes per field, last writer wins', () => {
    const a = createCrdtDoc({ clientId: 1 });
    a.loadNote(note('x'));
    const b = createCrdtDoc({ clientId: 2 });
    b.applyUpdate(a.encodeState(), 'remote');
    a.setMeta('color', 'red', 'local');
    b.setMeta('pinned', true, 'local');
    sync(a, b);
    expect(a.toNote().meta).toEqual(b.toNote().meta);
    expect(a.toNote().meta.color).toBe('red');
    expect(a.toNote().meta.pinned).toBe(true);
  });

  it('tags updates with their origin so listeners can skip echoes', () => {
    const a = createCrdtDoc({ clientId: 1 });
    a.loadNote(note('x'));
    const b = createCrdtDoc({ clientId: 2 });
    const origins: string[] = [];
    b.onUpdate((_u, origin) => origins.push(origin));
    b.applyUpdate(a.encodeState(), 'remote');
    b.applyTextDiff('local edit\n', 'local');
    expect(origins).toEqual(['remote', 'local']);
  });

  it('compacts an update log into one snapshot with the same result', () => {
    const a = createCrdtDoc({ clientId: 1 });
    const log: Uint8Array[] = [];
    a.onUpdate((u) => log.push(u));
    a.loadNote(note('one'));
    for (let i = 0; i < 50; i++) a.applyTextDiff(`one ${i}\n`, 'local');
    const snapshot = compactUpdates(log);
    const b = createCrdtDoc({ clientId: 2 });
    b.applyUpdate(snapshot, 'remote');
    expect(b.toNote()).toEqual(a.toNote());
    expect(snapshot.byteLength).toBeLessThan(log.reduce((n, u) => n + u.byteLength, 0));
  });
});
