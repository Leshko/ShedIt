/**
 * Nominal-to-actual lumber dimensions. A "2x4" is 1.5" x 3.5" in the real
 * world, and every framing calculation has to use the actual figure.
 */

export const NOMINAL_SIZES = [
  '2x4',
  '2x6',
  '2x8',
  '2x10',
  '2x12',
  '4x4',
  '4x6',
  '1x4',
  '1x6',
] as const;

export type NominalSize = (typeof NOMINAL_SIZES)[number];

export interface ActualDimensions {
  /** Thickness in inches (the smaller face dimension). */
  thickness: number;
  /** Width/depth in inches (the larger face dimension). */
  width: number;
}

const ACTUAL: Record<NominalSize, ActualDimensions> = {
  '2x4': { thickness: 1.5, width: 3.5 },
  '2x6': { thickness: 1.5, width: 5.5 },
  '2x8': { thickness: 1.5, width: 7.25 },
  '2x10': { thickness: 1.5, width: 9.25 },
  '2x12': { thickness: 1.5, width: 11.25 },
  '4x4': { thickness: 3.5, width: 3.5 },
  '4x6': { thickness: 3.5, width: 5.5 },
  '1x4': { thickness: 0.75, width: 3.5 },
  '1x6': { thickness: 0.75, width: 5.5 },
};

export function actualSize(nominal: NominalSize): ActualDimensions {
  return ACTUAL[nominal];
}

/** Stock lengths (in inches) a lumber yard actually sells. */
export const STOCK_LENGTHS_IN = [96, 120, 144, 192] as const;

/** Saw kerf consumed by each cut, in inches. */
export const KERF_IN = 0.125;

/** Sheet goods are 4' x 8'. */
export const SHEET_WIDTH_IN = 48;
export const SHEET_HEIGHT_IN = 96;

export type SheetMaterial =
  | 'osb-7/16'
  | 'plywood-1/2'
  | 'plywood-3/4-tg'
  | 't1-11';

export const SHEET_LABELS: Record<SheetMaterial, string> = {
  'osb-7/16': '7/16" OSB sheathing',
  'plywood-1/2': '1/2" plywood',
  'plywood-3/4-tg': '3/4" T&G plywood',
  't1-11': 'T1-11 siding',
};
