/**
 * Validation feedback from the engine. Errors carry machine-applicable fixes
 * so the UI can render a "fix this" button generically, without per-error code.
 */

export const ISSUE_CODES = [
  'E_WARPED_ROOF',
  'E_FLAT_HEIGHT_MISMATCH',
  'E_GABLE_HEIGHT_MISMATCH',
  'E_OPENING_OVERLAP',
  'E_OPENING_OUT_OF_BOUNDS',
  'E_OPENING_TOO_TALL',
  'E_OPENING_TOO_CLOSE_TO_CORNER',
  'E_HEADER_SPAN_EXCEEDED',
  'W_LOW_SLOPE_DRAINAGE',
  'W_BIRDSMOUTH_TOO_DEEP',
  'W_RAFTER_SPAN_LONG',
  'W_HIGH_WASTE',
  'N_DERIVED_RAKE_HEIGHT',
  'N_PRECUT_STUD_AVAILABLE',
] as const;

export type IssueCode = (typeof ISSUE_CODES)[number];

export type IssueSeverity = 'error' | 'warning' | 'notice';

/** A single field assignment that would resolve an issue. */
export interface FixOp {
  /** Dot path into ShedConfig, e.g. `wallHeights.left`. */
  path: string;
  value: unknown;
}

export interface IssueFix {
  label: string;
  ops: FixOp[];
}

export interface Issue {
  code: IssueCode;
  severity: IssueSeverity;
  message: string;
  /** Dot path into ShedConfig identifying the offending field, when there is one. */
  path?: string;
  fixes?: IssueFix[];
}

export function severityOf(code: IssueCode): IssueSeverity {
  if (code.startsWith('E_')) return 'error';
  if (code.startsWith('W_')) return 'warning';
  return 'notice';
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
