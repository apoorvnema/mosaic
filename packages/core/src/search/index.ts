import type { VaultPath } from '../platform/filesystem';
import type { Platform } from '../platform/index';

export interface SearchOptions {
  limit?: number;
  folder?: VaultPath;
  label?: string;
  includeArchived?: boolean;
}

export interface SearchHit {
  path: VaultPath;
  title: string;
  /** Matching excerpt with `<mark>` around hits. Everything else is HTML-escaped. */
  snippet: string;
  score: number;
}

/** Budget from the plan: results in under 120 ms on a 10,000-note vault. */
export const SEARCH_BUDGET_MS = 120;

/** Full-text search over the FTS5 tables the indexer maintains. */
export interface SearchEngine {
  search(text: string, options?: SearchOptions): Promise<SearchHit[]>;
  /** Notes whose title or file name matches, for wiki-link autocomplete and the command bar. */
  suggest(prefix: string, limit?: number): Promise<{ path: VaultPath; title: string }[]>;
}

/**
 * Turn whatever the user typed into a safe FTS5 query: every word becomes a quoted
 * prefix term, so query syntax in the input is text and can never be an error.
 */
export function toFtsQuery(text: string): string {
  const words = text.match(/[\p{L}\p{N}_]+/gu) ?? [];
  return words.map((word) => `"${word}"*`).join(' ');
}

// Private-use characters stand in for <mark> until the excerpt has been escaped.
const OPEN = '\uE000';
const CLOSE = '\uE001';
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  );
const likeEscape = (text: string) => text.replace(/[\\%_]/g, '\\$&');

export function createSearchEngine(platform: Platform): SearchEngine {
  const { db } = platform;

  return {
    async search(text, options = {}) {
      const query = toFtsQuery(text);
      if (!query) return [];
      const where = ['notes_fts match ?'];
      const params: (string | number)[] = [OPEN, CLOSE, query];
      if (!options.includeArchived) where.push('n.archived = 0');
      if (options.folder) {
        where.push("(n.folder = ? or n.folder like ? escape '\\')");
        params.push(options.folder, `${likeEscape(options.folder)}/%`);
      }
      if (options.label) {
        where.push('n.path in (select path from labels where label = ?)');
        params.push(options.label);
      }
      params.push(Math.max(1, Math.floor(options.limit ?? 50)));
      // bm25 weights: title, body. A title hit outranks a body hit.
      const rows = await db.query<{ path: string; title: string; snippet: string; score: number }>(
        `select n.path as path, n.title as title,
                snippet(notes_fts, -1, ?, ?, '…', 16) as snippet,
                bm25(notes_fts, 10.0, 1.0) as score
           from notes_fts join notes n on n.id = notes_fts.rowid
          where ${where.join(' and ')}
          order by score, n.path
          limit ?`,
        params,
      );
      return rows.map((row) => ({
        path: row.path,
        title: row.title,
        snippet: escapeHtml(row.snippet).replaceAll(OPEN, '<mark>').replaceAll(CLOSE, '</mark>'),
        score: -row.score,
      }));
    },

    async suggest(prefix, limit = 8) {
      const term = likeEscape(prefix.trim().toLowerCase());
      const rows = await db.query<{ path: string; title: string }>(
        `select path, title from notes
          where archived = 0 and (lower(title) like ? escape '\\' or name like ? escape '\\')
          order by (lower(title) like ? escape '\\' or name like ? escape '\\') desc, length(title), path
          limit ?`,
        [`%${term}%`, `%${term}%`, `${term}%`, `${term}%`, Math.max(1, Math.floor(limit))],
      );
      return rows;
    },
  };
}
