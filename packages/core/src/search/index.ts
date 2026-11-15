import { NotImplementedError } from '../errors';
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
  /** Matching excerpt with `<mark>` around hits. */
  snippet: string;
  score: number;
}

/** Budget from the plan: results in under 120 ms on a 10,000-note vault. */
export const SEARCH_BUDGET_MS = 120;

/** Full-text search over the FTS5 tables the indexer maintains. */
export interface SearchEngine {
  search(text: string, options?: SearchOptions): Promise<SearchHit[]>;
  /** Fuzzy match over note titles and paths, for wiki-link autocomplete and the command bar. */
  suggest(prefix: string, limit?: number): Promise<{ path: VaultPath; title: string }[]>;
}

export function createSearchEngine(_platform: Platform): SearchEngine {
  throw new NotImplementedError('search');
}
