/**
 * Everything in ShedIt is stored and computed in decimal inches. These helpers
 * exist purely to move between that internal representation and the
 * feet-inches-fractions that people actually read off a tape measure.
 */

export const INCHES_PER_FOOT = 12;

export const feet = (ft: number): number => ft * INCHES_PER_FOOT;

/** Round to the nearest 1/`denominator` inch. */
export function roundToFraction(inches: number, denominator = 16): number {
  return Math.round(inches * denominator) / denominator;
}

function reduce(numerator: number, denominator: number): [number, number] {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(numerator, denominator) || 1;
  return [numerator / d, denominator / d];
}

/**
 * Format decimal inches the way a cut list should read: `9' 4-1/2"`.
 * Values are snapped to the nearest 1/16" first, since that is the finest
 * graduation on a standard tape.
 */
export function formatFeetInches(inches: number, denominator = 16): string {
  const negative = inches < 0;
  const snapped = roundToFraction(Math.abs(inches), denominator);

  const totalWhole = Math.floor(snapped);
  const ft = Math.floor(totalWhole / INCHES_PER_FOOT);
  const inch = totalWhole % INCHES_PER_FOOT;

  const remainder = snapped - totalWhole;
  let fraction = '';
  if (remainder > 0) {
    const [n, d] = reduce(Math.round(remainder * denominator), denominator);
    fraction = `${n}/${d}`;
  }

  const parts: string[] = [];
  if (ft > 0) parts.push(`${ft}'`);

  if (inch > 0 && fraction) parts.push(`${inch}-${fraction}"`);
  else if (inch > 0) parts.push(`${inch}"`);
  else if (fraction) parts.push(`${fraction}"`);
  else if (ft === 0) parts.push(`0"`);

  return (negative ? '-' : '') + parts.join(' ');
}

/** Format inches as a decimal foot count, e.g. 96 -> `8 ft`. */
export function formatFeet(inches: number): string {
  const ft = inches / INCHES_PER_FOOT;
  return `${Number.isInteger(ft) ? ft : ft.toFixed(2)} ft`;
}

export const degrees = (radians: number): number => (radians * 180) / Math.PI;
export const radians = (deg: number): number => (deg * Math.PI) / 180;

/** Format an angle for a cut list; `0°` means a square cut. */
export function formatAngle(deg: number): string {
  return `${deg.toFixed(1)}°`;
}
