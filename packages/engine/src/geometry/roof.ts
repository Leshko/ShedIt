import {
  degrees,
  feet,
  formatFeetInches,
  type Issue,
  type ResolvedShedConfig,
  type RoofPlane,
  type RoofSolution,
  type WallId,
  type WallKind,
} from '@shedit/shared';

/**
 * The roof is modelled as a single plane `z = a*x + b*y + c` passing through
 * the TOP of every top plate. That one convention is what makes the rest of
 * the engine fall out cleanly: birdsmouth seat cuts land exactly on the plane,
 * and a rake wall's top profile is just the plane restricted to that wall line.
 *
 * Coordinates: x = width (0..W), y = depth (0..D), z = height above the floor
 * deck. The front wall sits at y=0, back at y=D, left at x=0, right at x=W.
 *
 * A wall's top edge is level exactly when the plane has no slope along it:
 *   front/back level  <=>  a == 0
 *   left/right level  <=>  b == 0
 *
 * So four level top plates plus one plane is over-determined — only a flat roof
 * satisfies it. Any unequal pair forces the perpendicular pair to become rake
 * walls, whose heights are derived rather than chosen. That is not a
 * limitation we invented; it is what "planar roof" means.
 */

/** Tolerance below which two heights count as equal: 1/8". */
export const EPS = 0.125;

export function heightAt(plane: RoofPlane, x: number, y: number): number {
  return plane.a * x + plane.b * y + plane.c;
}

export interface RoofDerivation {
  solution: RoofSolution;
  issues: Issue[];
}

const ALL_SQUARE: Record<WallId, WallKind> = {
  front: 'square',
  back: 'square',
  left: 'square',
  right: 'square',
};

function wallKinds(over: Partial<Record<WallId, WallKind>>): Record<WallId, WallKind> {
  return { ...ALL_SQUARE, ...over };
}

function cornersOf(plane: RoofPlane, w: number, d: number) {
  return {
    frontLeft: heightAt(plane, 0, 0),
    frontRight: heightAt(plane, w, 0),
    backLeft: heightAt(plane, 0, d),
    backRight: heightAt(plane, w, d),
  };
}

function planarRoofArea(plane: RoofPlane, w: number, d: number): number {
  const stretch = Math.sqrt(1 + plane.a * plane.a + plane.b * plane.b);
  return (w * d * stretch) / 144;
}

/**
 * Derive the roof from the configured heights, classifying the form and
 * reporting anything unbuildable. Always returns a usable solution so the
 * viewer never blanks — errors accompany a best-effort fallback.
 */
export function deriveRoof(config: ResolvedShedConfig): RoofDerivation {
  const { width: w, depth: d } = config;
  const issues: Issue[] = [];

  if (config.heightMode === 'corners' && config.cornerHeights) {
    return deriveFromCorners(config, issues);
  }

  const h = config.wallHeights;

  if (config.roof.style === 'gable') return deriveGable(config, issues);

  const dFB = h.back - h.front;
  const dLR = h.right - h.left;
  const slopedDepth = Math.abs(dFB) >= EPS;
  const slopedWidth = Math.abs(dLR) >= EPS;

  if (slopedDepth && slopedWidth) {
    // Two independent slopes cannot both be carried by level perpendicular
    // plates. The surface the numbers describe is warped, not planar.
    issues.push({
      code: 'E_WARPED_ROOF',
      severity: 'error',
      message:
        `Front/back differ by ${formatFeetInches(Math.abs(dFB))} and left/right by ` +
        `${formatFeetInches(Math.abs(dLR))}. A roof cannot slope both ways at once ` +
        `over level plates — that surface is warped and cannot be framed with ` +
        `straight rafters.`,
      path: 'wallHeights',
      fixes: [
        {
          label: 'Slope front-to-back (lean-to)',
          ops: [
            { path: 'wallHeights.left', value: h.front },
            { path: 'wallHeights.right', value: h.front },
          ],
        },
        {
          label: 'Slope left-to-right (lean-to)',
          ops: [
            { path: 'wallHeights.front', value: h.left },
            { path: 'wallHeights.back', value: h.left },
          ],
        },
        {
          label: 'Use corner heights instead',
          ops: [
            { path: 'heightMode', value: 'corners' },
            {
              path: 'cornerHeights',
              value: {
                frontLeft: (h.front + h.left) / 2,
                frontRight: (h.front + h.right) / 2,
                backLeft: (h.back + h.left) / 2,
              },
            },
          ],
        },
      ],
    });

    // Fall back to the dominant slope so the rest of the plan still renders.
    const plane: RoofPlane =
      Math.abs(dFB) >= Math.abs(dLR)
        ? { a: 0, b: dFB / d, c: h.front }
        : { a: dLR / w, b: 0, c: h.left };
    return {
      solution: buildSolution(plane, w, d, Math.abs(dFB) >= Math.abs(dLR)),
      issues,
    };
  }

  if (slopedDepth) {
    const plane: RoofPlane = { a: 0, b: dFB / d, c: h.front };
    noteDerivedRake(issues, ['left', 'right'], h.front, h.back);
    const solution = buildSolution(plane, w, d, true);
    checkDrainage(issues, solution);
    return { solution, issues };
  }

  if (slopedWidth) {
    const plane: RoofPlane = { a: dLR / w, b: 0, c: h.left };
    noteDerivedRake(issues, ['front', 'back'], h.left, h.right);
    const solution = buildSolution(plane, w, d, false);
    checkDrainage(issues, solution);
    return { solution, issues };
  }

  // All four pairs level. They still have to agree with each other.
  if (Math.abs(h.front - h.left) >= EPS) {
    issues.push({
      code: 'E_FLAT_HEIGHT_MISMATCH',
      severity: 'error',
      message:
        `Front/back are level at ${formatFeetInches(h.front)} and left/right are ` +
        `level at ${formatFeetInches(h.left)}. All four must match for a flat roof.`,
      path: 'wallHeights',
      fixes: [
        {
          label: `Set all walls to ${formatFeetInches(h.front)}`,
          ops: [
            { path: 'wallHeights.left', value: h.front },
            { path: 'wallHeights.right', value: h.front },
          ],
        },
        {
          label: `Set all walls to ${formatFeetInches(h.left)}`,
          ops: [
            { path: 'wallHeights.front', value: h.left },
            { path: 'wallHeights.back', value: h.left },
          ],
        },
      ],
    });
  }

  const plane: RoofPlane = { a: 0, b: 0, c: h.front };
  const solution = buildSolution(plane, w, d, true);
  checkDrainage(issues, solution);
  return { solution, issues };
}

function deriveFromCorners(
  config: ResolvedShedConfig,
  issues: Issue[],
): RoofDerivation {
  const { width: w, depth: d } = config;
  const c = config.cornerHeights!;
  // Three corners determine a plane exactly; the fourth is forced. This mode
  // has precisely the plane's three degrees of freedom, so it can never be
  // over-determined and never produces a warped-roof error.
  const plane: RoofPlane = {
    a: (c.frontRight - c.frontLeft) / w,
    b: (c.backLeft - c.frontLeft) / d,
    c: c.frontLeft,
  };
  const solution = buildSolution(plane, w, d, Math.abs(plane.b) >= Math.abs(plane.a));
  checkDrainage(issues, solution);
  return { solution, issues };
}

function deriveGable(config: ResolvedShedConfig, issues: Issue[]): RoofDerivation {
  const { width: w, depth: d } = config;
  const h = config.wallHeights;
  const heights = [h.front, h.back, h.left, h.right];
  const base = h.front;

  if (heights.some((v) => Math.abs(v - base) >= EPS)) {
    issues.push({
      code: 'E_GABLE_HEIGHT_MISMATCH',
      severity: 'error',
      message:
        'A gable roof needs all four top plates at the same height; the ridge ' +
        'creates the slope. Level the walls, or switch the roof style to Auto ' +
        'for a lean-to.',
      path: 'wallHeights',
      fixes: [
        {
          label: `Level all walls to ${formatFeetInches(base)}`,
          ops: [
            { path: 'wallHeights.back', value: base },
            { path: 'wallHeights.left', value: base },
            { path: 'wallHeights.right', value: base },
          ],
        },
        { label: 'Switch to a lean-to roof', ops: [{ path: 'roof.style', value: 'auto' }] },
      ],
    });
  }

  const ridgeAlongWidth = config.roof.ridgeAxis === 'width';
  // Rafters run perpendicular to the ridge; the span they cross is halved.
  const span = ridgeAlongWidth ? d : w;
  const slope = config.roof.gablePitch / 12;
  const rise = (span / 2) * slope;
  const plane: RoofPlane = { a: 0, b: 0, c: base };

  const pitchLen = Math.sqrt(1 + slope * slope);
  const solution: RoofSolution = {
    mode: ridgeAlongWidth ? 'gable-width' : 'gable-depth',
    plane,
    pitchPer12: config.roof.gablePitch,
    slopeAngleDeg: degrees(Math.atan(slope)),
    rafterAxis: ridgeAlongWidth ? 'y' : 'x',
    wallKinds: ridgeAlongWidth
      ? wallKinds({ left: 'gableEnd', right: 'gableEnd' })
      : wallKinds({ front: 'gableEnd', back: 'gableEnd' }),
    cornerHeights: cornersOf(plane, w, d),
    ridgeHeight: base + rise,
    roofAreaSqFt: (w * d * pitchLen) / 144,
  };

  return { solution, issues };
}

function buildSolution(
  plane: RoofPlane,
  w: number,
  d: number,
  raftersAlongDepth: boolean,
): RoofSolution {
  const flat = Math.abs(plane.a) < 1e-9 && Math.abs(plane.b) < 1e-9;
  const slopedDepth = Math.abs(plane.b) > 1e-9;
  const slopedWidth = Math.abs(plane.a) > 1e-9;

  let mode: RoofSolution['mode'];
  let kinds: Record<WallId, WallKind>;

  if (flat) {
    mode = 'flat';
    kinds = wallKinds({});
  } else if (slopedDepth && slopedWidth) {
    // A diagonal plane. Every wall rakes, but the framing stays uniform:
    // a rafter running along +y has slope b regardless of a, so all rafters
    // are identical and simply sit at different heights.
    mode = 'diagonal';
    kinds = { front: 'rake', back: 'rake', left: 'rake', right: 'rake' };
  } else if (slopedDepth) {
    mode = 'skillion-depth';
    kinds = wallKinds({ left: 'rake', right: 'rake' });
  } else {
    mode = 'skillion-width';
    kinds = wallKinds({ front: 'rake', back: 'rake' });
  }

  // Rafters follow the sloping direction so they shed water down the fall.
  const rafterAxis: 'x' | 'y' =
    mode === 'skillion-width' ? 'x' : mode === 'diagonal' ? 'y' : raftersAlongDepth ? 'y' : 'x';
  const rafterSlope = rafterAxis === 'y' ? plane.b : plane.a;

  return {
    mode,
    plane,
    pitchPer12: Math.abs(rafterSlope) * 12,
    slopeAngleDeg: degrees(Math.atan(Math.abs(rafterSlope))),
    rafterAxis,
    wallKinds: kinds,
    cornerHeights: cornersOf(plane, w, d),
    roofAreaSqFt: planarRoofArea(plane, w, d),
  };
}

function noteDerivedRake(
  issues: Issue[],
  walls: WallId[],
  low: number,
  high: number,
): void {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  issues.push({
    code: 'N_DERIVED_RAKE_HEIGHT',
    severity: 'notice',
    message:
      `${walls.map(titleCase).join(' and ')} walls slope from ` +
      `${formatFeetInches(lo)} to ${formatFeetInches(hi)}. Their heights follow the ` +
      `roof, so they are calculated rather than entered.`,
    path: 'wallHeights',
  });
}

function checkDrainage(issues: Issue[], solution: RoofSolution): void {
  // A dead-flat roof does not drain. The usual minimum is 1/4" per foot.
  if (solution.pitchPer12 < 0.25) {
    issues.push({
      code: 'W_LOW_SLOPE_DRAINAGE',
      severity: 'warning',
      message:
        `The roof slopes ${solution.pitchPer12.toFixed(2)} in 12, which is too flat ` +
        `to drain reliably. Aim for at least 1/4 in 12 — raise one wall a few inches.`,
      path: 'wallHeights',
    });
  }
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Convenience for callers that just want the pitch of a slope ratio. */
export function pitchToAngleDeg(pitchPer12: number): number {
  return degrees(Math.atan(pitchPer12 / 12));
}

export const MIN_WALL_HEIGHT = feet(4);
