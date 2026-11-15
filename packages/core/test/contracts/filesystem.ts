import { describe, expect, it } from 'vitest';
import { FileNotFoundError, type FileChange, type FileSystem } from '../../src/index';

/**
 * The behaviour every FileSystem adapter must have. Each adapter package runs
 * this against its own implementation, so one contract covers all platforms.
 */
export function fileSystemContract(
  name: string,
  make: () => Promise<{ fs: FileSystem; cleanup?: () => Promise<void> }>,
  options: { watchSettleMs?: number } = {},
): void {
  describe(`FileSystem contract: ${name}`, () => {
    async function withFs(fn: (fs: FileSystem) => Promise<void>): Promise<void> {
      const { fs, cleanup } = await make();
      try {
        await fn(fs);
      } finally {
        await cleanup?.();
      }
    }

    it('round-trips bytes and text exactly', () =>
      withFs(async (fs) => {
        const bytes = new Uint8Array([0, 255, 13, 10, 226, 130, 172]);
        await fs.write('a.bin', bytes);
        expect(await fs.read('a.bin')).toEqual(bytes);
        const text = '---\ntitle: Ünïcode\r\n---\n\ttabs and trailing space  \n';
        await fs.write('note.md', text);
        expect(await fs.readText('note.md')).toBe(text);
      }));

    it('creates parent directories on write', () =>
      withFs(async (fs) => {
        await fs.write('Work/Research/Papers/one.md', 'x');
        expect(await fs.exists('Work/Research/Papers')).toBe(true);
        expect((await fs.stat('Work/Research'))?.kind).toBe('directory');
      }));

    it('throws FileNotFoundError when reading a missing file', () =>
      withFs(async (fs) => {
        await expect(fs.read('missing.md')).rejects.toBeInstanceOf(FileNotFoundError);
        expect(await fs.stat('missing.md')).toBeUndefined();
        expect(await fs.exists('missing.md')).toBe(false);
      }));

    it('lists one level, or the subtree, sorted by path', () =>
      withFs(async (fs) => {
        await fs.write('b.md', '1');
        await fs.write('a/x.md', '2');
        await fs.write('a/deep/y.md', '3');
        expect(await fs.list('')).toEqual([
          { path: 'a', kind: 'directory' },
          { path: 'b.md', kind: 'file' },
        ]);
        expect((await fs.list('', { recursive: true })).map((e) => e.path)).toEqual([
          'a',
          'a/deep',
          'a/deep/y.md',
          'a/x.md',
          'b.md',
        ]);
        expect((await fs.list('a')).map((e) => e.path)).toEqual(['a/deep', 'a/x.md']);
      }));

    it('reports size and a modification time', () =>
      withFs(async (fs) => {
        await fs.write('s.md', 'hello');
        const stat = await fs.stat('s.md');
        expect(stat?.kind).toBe('file');
        expect(stat?.size).toBe(5);
        expect(typeof stat?.modifiedAt).toBe('number');
      }));

    it('moves files and whole folders, refusing to overwrite', () =>
      withFs(async (fs) => {
        await fs.write('Inbox/idea.md', 'idea');
        await fs.move('Inbox/idea.md', 'Work/Notes/idea.md');
        expect(await fs.exists('Inbox/idea.md')).toBe(false);
        expect(await fs.readText('Work/Notes/idea.md')).toBe('idea');

        await fs.move('Work', 'Archive/Work');
        expect(await fs.readText('Archive/Work/Notes/idea.md')).toBe('idea');
        expect(await fs.exists('Work')).toBe(false);

        await fs.write('other.md', 'other');
        await expect(fs.move('other.md', 'Archive/Work/Notes/idea.md')).rejects.toThrow();
        expect(await fs.readText('Archive/Work/Notes/idea.md')).toBe('idea');
      }));

    it('deletes files and folders, and ignores missing paths', () =>
      withFs(async (fs) => {
        await fs.write('d/one.md', '1');
        await fs.write('d/sub/two.md', '2');
        await fs.delete('d/one.md');
        expect(await fs.exists('d/one.md')).toBe(false);
        await fs.delete('d');
        expect(await fs.exists('d')).toBe(false);
        await fs.delete('never-existed.md');
      }));

    it('rejects paths that escape the vault', () =>
      withFs(async (fs) => {
        await expect(fs.write('../outside.md', 'x')).rejects.toThrow();
        await expect(fs.read('a/../../outside.md')).rejects.toThrow();
      }));

    it('overwrites without leaving temp files behind', () =>
      withFs(async (fs) => {
        await fs.write('n.md', 'first');
        await fs.write('n.md', 'second');
        expect(await fs.readText('n.md')).toBe('second');
        expect((await fs.list('')).map((e) => e.path)).toEqual(['n.md']);
      }));

    it('notifies watchers of creates, edits and deletes', () =>
      withFs(async (fs) => {
        if (!fs.capabilities.watch) return;
        const settle = () => new Promise((r) => setTimeout(r, options.watchSettleMs ?? 0));
        const seen: FileChange[] = [];
        await fs.mkdir('w');
        const stop = fs.watch('', (change) => seen.push(change));
        await settle();
        await fs.write('w/live.md', 'one');
        await settle();
        await fs.write('w/live.md', 'two two');
        await settle();
        await fs.delete('w/live.md');
        await settle();
        stop();
        const forFile = seen.filter((c) => c.path === 'w/live.md').map((c) => c.kind);
        expect(forFile[0]).toBe('created');
        expect(forFile).toContain('modified');
        expect(forFile.at(-1)).toBe('deleted');

        seen.length = 0;
        await fs.write('w/after-stop.md', 'x');
        await settle();
        expect(seen).toEqual([]);
      }));
  });
}
