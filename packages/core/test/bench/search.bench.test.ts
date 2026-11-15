import { describe, expect, it } from 'vitest';
import { createSearchEngine, createVaultIndex, SEARCH_BUDGET_MS } from '../../src/index';
import { testPlatform } from '../support/platform';
import { BENCH_QUERIES, generateCorpus } from './corpus';

const NOTES = 10_000;
const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;

// The plan's quality bar: search results for a 10,000-note vault in under 120 ms.
// Runs against real SQLite (better-sqlite3) with an in-memory file system.
describe(`search benchmark: ${NOTES.toLocaleString('en')} notes`, () => {
  it(`answers every query in under ${SEARCH_BUDGET_MS} ms`, { timeout: 180_000 }, async () => {
    const platform = testPlatform();
    for (const file of generateCorpus(NOTES)) await platform.fs.write(file.path, file.text);

    const index = createVaultIndex(platform);
    const buildStarted = performance.now();
    const built = await index.rebuild();
    const buildMs = performance.now() - buildStarted;
    expect(built.notes).toBe(NOTES);

    const search = createSearchEngine(platform);
    const timings: number[] = [];
    let hits = 0;
    for (let round = 0; round < 10; round++) {
      for (const query of BENCH_QUERIES) {
        const started = performance.now();
        hits += (await search.search(query)).length;
        timings.push(performance.now() - started);
      }
    }
    timings.sort((a, b) => a - b);
    const suggestStarted = performance.now();
    await search.suggest('road');
    const suggestMs = performance.now() - suggestStarted;

    const report = {
      notes: NOTES,
      indexBuildMs: Math.round(buildMs),
      searchMedianMs: +percentile(timings, 0.5).toFixed(2),
      searchP95Ms: +percentile(timings, 0.95).toFixed(2),
      searchMaxMs: +timings.at(-1)!.toFixed(2),
      suggestMs: +suggestMs.toFixed(2),
      budgetMs: SEARCH_BUDGET_MS,
    };
    console.log(`SEARCH_BENCH ${JSON.stringify(report)}`);

    expect(hits).toBeGreaterThan(0);
    expect(report.searchMaxMs).toBeLessThan(SEARCH_BUDGET_MS);
    expect(report.suggestMs).toBeLessThan(SEARCH_BUDGET_MS);
  });
});
