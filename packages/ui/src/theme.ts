import { NOTE_COLORS, type NoteColor } from '@mosaic/core';

export { NOTE_COLORS, type NoteColor };

export type Theme = 'light' | 'dark' | 'system';

/** The CSS custom property holding a note colour, e.g. `var(--note-yellow)`. */
export function noteColorVar(color: NoteColor): string {
  return `var(--note-${color})`;
}

/** `data-theme` to set on <html>; `undefined` means "follow the system". */
export function themeAttribute(theme: Theme): 'light' | 'dark' | undefined {
  return theme === 'system' ? undefined : theme;
}

export function nextTheme(current: 'light' | 'dark'): 'light' | 'dark' {
  return current === 'dark' ? 'light' : 'dark';
}
