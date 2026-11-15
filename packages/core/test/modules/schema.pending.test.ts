import { describe, expect, it } from 'vitest';
import {
  evaluateFormula,
  findRepairs,
  parseCollectionSchema,
  validateField,
  type FieldDef,
} from '../../src/index';

const BUGS = `name: Bugs
folder: Tracker/Bugs
fields:
  - { name: title, type: text, required: true }
  - { name: severity, type: select, options: [low, medium, high] }
  - { name: device, type: multi-select, options: [pixel, galaxy, tablet] }
  - { name: reproducible, type: checkbox }
  - { name: found, type: date }
  - { name: count, type: number }
  - { name: pr, type: url }
`;

const field = (type: FieldDef['type'], extra: Partial<FieldDef> = {}): FieldDef => ({
  name: 'f',
  type,
  ...extra,
});

describe('schema', () => {
  it('parses a collection schema file', () => {
    const schema = parseCollectionSchema(BUGS);
    expect(schema.name).toBe('Bugs');
    expect(schema.folder).toBe('Tracker/Bugs');
    expect(schema.fields.map((f) => f.type)).toEqual([
      'text',
      'select',
      'multi-select',
      'checkbox',
      'date',
      'number',
      'url',
    ]);
  });

  it('refuses a word typed into a number field', () => {
    expect(validateField(field('number'), 'twelve')).toMatchObject({ ok: false, raw: 'twelve' });
    expect(validateField(field('number'), '12.5')).toEqual({ ok: true, value: 12.5 });
    expect(validateField(field('number'), 12)).toEqual({ ok: true, value: 12 });
  });

  it('validates dates, checkboxes, urls and selects', () => {
    expect(validateField(field('date'), '2026-09-10')).toEqual({ ok: true, value: '2026-09-10' });
    expect(validateField(field('date'), '2026-13-40').ok).toBe(false);
    expect(validateField(field('checkbox'), true)).toEqual({ ok: true, value: true });
    expect(validateField(field('checkbox'), 'maybe').ok).toBe(false);
    expect(validateField(field('url'), 'https://example.com/pr/1').ok).toBe(true);
    expect(validateField(field('url'), 'not a url').ok).toBe(false);
    const severity = field('select', { options: ['low', 'high'] });
    expect(validateField(severity, 'high')).toEqual({ ok: true, value: 'high' });
    expect(validateField(severity, 'urgent').ok).toBe(false);
    const device = field('multi-select', { options: ['pixel', 'tablet'] });
    expect(validateField(device, ['pixel', 'tablet'])).toEqual({
      ok: true,
      value: ['pixel', 'tablet'],
    });
    expect(validateField(device, ['pixel', 'toaster']).ok).toBe(false);
  });

  it('allows empty values unless the field is required', () => {
    expect(validateField(field('number'), null)).toEqual({ ok: true, value: null });
    expect(validateField(field('text', { required: true }), '').ok).toBe(false);
  });

  it('never destroys: a value broken by an external edit is reported verbatim', () => {
    const schema = parseCollectionSchema(BUGS);
    const frontmatter = {
      title: 'Crash on rotate',
      severity: 'catastrophic',
      count: 'lots',
      found: '2026-09-10',
    };
    const snapshot = structuredClone(frontmatter);
    const repairs = findRepairs(schema, 'Tracker/Bugs/1.md', frontmatter);
    expect(repairs.map((r) => [r.field, r.raw])).toEqual([
      ['severity', 'catastrophic'],
      ['count', 'lots'],
    ]);
    expect(repairs.every((r) => r.path === 'Tracker/Bugs/1.md' && r.reason.length > 0)).toBe(true);
    expect(frontmatter).toEqual(snapshot);
  });

  it('evaluates formulas in core so every platform agrees', () => {
    expect(evaluateFormula('count * 2 + 1', { count: 4 })).toBe(9);
    expect(evaluateFormula('if(reproducible, "yes", "no")', { reproducible: true })).toBe('yes');
    expect(
      evaluateFormula('days(fixed, found)', { found: '2026-09-10', fixed: '2026-09-13' }),
    ).toBe(3);
    expect(evaluateFormula('count / 0', { count: 1 })).toBeNull();
  });
});
