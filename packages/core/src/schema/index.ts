import { NotImplementedError } from '../errors';
import type { VaultPath } from '../platform/filesystem';

export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'multi-select'
  | 'checkbox'
  | 'url'
  | 'relation'
  | 'rollup'
  | 'formula';

export interface FieldDef {
  name: string;
  type: FieldType;
  /** For select and multi-select. */
  options?: string[];
  /** For relation: the collection the linked notes belong to. */
  collection?: string;
  /** For rollup: `{ relation, field, aggregate }`. For formula: the expression. */
  rollup?: { relation: string; field: string; aggregate: 'count' | 'sum' | 'min' | 'max' | 'avg' };
  formula?: string;
  required?: boolean;
}

/** A `*.collection.yaml` file: a schema claiming a folder or a query. */
export interface CollectionSchema {
  name: string;
  /** The folder whose notes are rows… */
  folder?: VaultPath;
  /** …or a query selecting them. */
  query?: string;
  fields: FieldDef[];
}

export type FieldValue = string | number | boolean | string[] | null;

export type ValidationResult =
  | { ok: true; value: FieldValue }
  /** Refused in the editor. `raw` is never dropped: an invalid value arriving from an
   *  external edit is preserved verbatim and reported through the repair queue. */
  | { ok: false; raw: unknown; reason: string };

export interface RepairItem {
  path: VaultPath;
  field: string;
  raw: unknown;
  reason: string;
}

export function parseCollectionSchema(_yaml: string): CollectionSchema {
  throw new NotImplementedError('schema.parseCollectionSchema');
}

export function validateField(_field: FieldDef, _raw: unknown): ValidationResult {
  throw new NotImplementedError('schema.validateField');
}

/** Check a note's frontmatter against a schema. Reports problems; never mutates. */
export function findRepairs(
  _schema: CollectionSchema,
  _path: VaultPath,
  _frontmatter: Record<string, unknown>,
): RepairItem[] {
  throw new NotImplementedError('schema.findRepairs');
}

/** Evaluate a formula against one row. Lives in core so every platform agrees. */
export function evaluateFormula(_expression: string, _row: Record<string, FieldValue>): FieldValue {
  throw new NotImplementedError('schema.evaluateFormula');
}
