import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NOTE_COLORS, nextTheme, noteColorVar, themeAttribute } from '../src/theme';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

/** The declarations inside the first block whose selector matches. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`No block for ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return new Map([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

describe('design tokens', () => {
  const light = block(':root {');
  const dark = block(":root[data-theme='dark']");
  const system = block(":root:not([data-theme='light'])");

  it('defines all twelve note colours, in light and dark', () => {
    expect(NOTE_COLORS).toHaveLength(12);
    for (const color of NOTE_COLORS) {
      expect(light.has(`--note-${color}`), `light --note-${color}`).toBe(true);
      expect(dark.has(`--note-${color}`), `dark --note-${color}`).toBe(true);
      expect(noteColorVar(color)).toBe(`var(--note-${color})`);
    }
  });

  it('gives every note colour a distinct value, so twelve colours stay twelve', () => {
    for (const theme of [light, dark]) {
      const values = NOTE_COLORS.map((c) => theme.get(`--note-${c}`));
      expect(new Set(values).size).toBe(12);
    }
  });

  it('keeps the explicit dark theme and the system dark theme identical', () => {
    expect([...system.entries()]).toEqual([...dark.entries()]);
  });

  it('overrides only tokens that exist in the light theme', () => {
    for (const name of dark.keys()) expect(light.has(name), name).toBe(true);
  });

  it('maps theme choices to the data-theme attribute', () => {
    expect(themeAttribute('system')).toBeUndefined();
    expect(themeAttribute('dark')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });
});
