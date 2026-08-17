import {
  actualSize,
  degrees,
  type Issue,
  type Member,
  type Pt3,
  type RafterGeometry,
  type ResolvedShedConfig,
  type RoofSolution,
} from '@shedit/shared';
import { heightAt } from './roof.js';
import { studCenters } from './wall.js';

/**
 * Because the roof plane passes through the tops of the top plates, `run` and
 * `rise` are measured plate-face to plate-face and plate-top to plate-top. The
 * slope of the rafter is then exactly the slope of the plane — no fudging.
 */
export function rafterGeometry(
  config: ResolvedShedConfig,
  roof: RoofSolution,
  issues: Issue[],
): RafterGeometry {
  const rafterDepth = actualSize(config.framing.rafterSize).width;
  const plateWidth = actualSize(config.framing.studSize).width;
  const gable = roof.mode.startsWith('gable');

  const spanAxisLength = roof.rafterAxis === 'y' ? config.depth : config.width;
  const acrossLength = roof.rafterAxis === 'y' ? config.width : config.depth;

  const run = gable ? spanAxisLength / 2 - 0.75 : spanAxisLength;
  const slope = gable
    ? config.roof.gablePitch / 12
    : Math.abs(roof.rafterAxis === 'y' ? roof.plane.b : roof.plane.a);
  const rise = run * slope;
  const theta = Math.atan(slope);

  const lineLength = Math.hypot(run, rise);
  const overhang = config.roof.overhangEave;
  const overallLength = (run + overhang * (gable ? 1 : 2)) / Math.cos(theta);

  const heelPlumb = plateWidth * Math.tan(theta);
  const hap = rafterDepth / Math.cos(theta) - heelPlumb;

  if (heelPlumb > rafterDepth / 3) {
    issues.push({
      code: 'W_BIRDSMOUTH_TOO_DEEP',
      severity: 'warning',
      message:
        `At this pitch the birdsmouth removes more than a third of a ` +
        `${config.framing.rafterSize} rafter, which weakens it. Consider a deeper ` +
        `rafter or a shallower roof.`,
      path: 'framing.rafterSize',
    });
  }

  // Rule of thumb for shed-scale spans; not an engineered span table.
  const maxSpanFt = config.framing.rafterSize === '2x6' ? 12 : 16;
  if (lineLength / 12 > maxSpanFt) {
    issues.push({
      code: 'W_RAFTER_SPAN_LONG',
      severity: 'warning',
      message:
        `A ${config.framing.rafterSize} rafter spanning ${(lineLength / 12).toFixed(1)} ft ` +
        `is beyond the usual ${maxSpanFt} ft rule of thumb. Size it up or add a beam.`,
      path: 'framing.rafterSize',
    });
  }

  const spacing = config.framing.rafterSpacing;
  const perSide = Math.floor((acrossLength - 1.5) / spacing) + 2;

  return {
    angleDeg: degrees(theta),
    pitchPer12: slope * 12,
    plumbCutDeg: degrees(theta),
    seatCutDeg: 90 - degrees(theta),
    run,
    rise,
    lineLength,
    overallLength,
    hap,
    count: gable ? perSide * 2 : perSide,
  };
}

/** Emit the roof members: rafters, a ridge for gables, and blocking. */
export function buildRoof(
  config: ResolvedShedConfig,
  roof: RoofSolution,
  geom: RafterGeometry,
): Member[] {
  const members: Member[] = [];
  const rafterDepth = actualSize(config.framing.rafterSize).width;
  const gable = roof.mode.startsWith('gable');
  const alongY = roof.rafterAxis === 'y';
  const acrossLength = alongY ? config.width : config.depth;
  const spacing = config.framing.rafterSpacing;
  const overhang = config.roof.overhangEave;
  const theta = (geom.angleDeg * Math.PI) / 180;

  const positions = studCenters(acrossLength, spacing, 1.5);
  let seq = 0;

  const plumbCut = { angleDeg: geom.plumbCutDeg, kind: 'miter' as const };

  if (!gable) {
    // A skillion rafter runs the full span, birdsmouthed over both walls.
    const slopeSigned = alongY ? roof.plane.b : roof.plane.a;
    for (const across of positions) {
      const startAlong = -overhang;
      const [x0, y0] = alongY ? [across, startAlong] : [startAlong, across];
      const z0 = heightAt(roof.plane, x0, y0);
      const dirVec: Pt3 = alongY
        ? normalize([0, 1, slopeSigned])
        : normalize([1, 0, slopeSigned]);
      const upVec: Pt3 = alongY
        ? normalize([0, -slopeSigned, 1])
        : normalize([-slopeSigned, 0, 1]);

      members.push({
        id: `roof.rafter.${seq++}`,
        role: 'roof.rafter',
        category: 'roof',
        label: 'Rafter',
        size: config.framing.rafterSize,
        species: 'SPF',
        cut: {
          length: geom.overallLength,
          endA: plumbCut,
          endB: plumbCut,
          notches: [
            {
              kind: 'birdsmouth',
              fromEnd: 'a',
              distance: overhang / Math.cos(theta),
              seatDepth: actualSize(config.framing.studSize).width,
              heelPlumb: rafterDepth / Math.cos(theta) - geom.hap,
            },
            {
              kind: 'birdsmouth',
              fromEnd: 'b',
              distance: overhang / Math.cos(theta),
              seatDepth: actualSize(config.framing.studSize).width,
              heelPlumb: rafterDepth / Math.cos(theta) - geom.hap,
            },
          ],
        },
        placement: {
          // Sit the rafter's underside on the roof plane by lifting its
          // section centre half a depth along the rafter's own normal.
          origin: [
            x0 + upVec[0] * (rafterDepth / 2),
            y0 + upVec[1] * (rafterDepth / 2),
            z0 + upVec[2] * (rafterDepth / 2),
          ],
          dir: dirVec,
          up: upVec,
          sectionW: 1.5,
          sectionH: rafterDepth,
        },
      });
    }
    return members;
  }

  /* ------------------------------------------------------------- gable */

  const ridgeZ = roof.ridgeHeight!;
  const eaveZ = roof.cornerHeights.frontLeft;
  const spanLen = alongY ? config.depth : config.width;
  const slope = config.roof.gablePitch / 12;

  for (const across of positions) {
    for (const side of [-1, 1] as const) {
      const mid = spanLen / 2;
      const startAlong = side === -1 ? -overhang : spanLen + overhang;
      const [x0, y0] = alongY ? [across, startAlong] : [startAlong, across];
      const z0 = eaveZ - overhang * slope;
      const towardRidge = side === -1 ? 1 : -1;
      const dirVec: Pt3 = alongY
        ? normalize([0, towardRidge, slope])
        : normalize([towardRidge, 0, slope]);
      const upVec: Pt3 = alongY
        ? normalize([0, -towardRidge * slope, 1])
        : normalize([-towardRidge * slope, 0, 1]);
      void mid;

      members.push({
        id: `roof.rafter.${seq++}`,
        role: 'roof.rafter',
        category: 'roof',
        label: `Common rafter (${side === -1 ? 'near' : 'far'} slope)`,
        size: config.framing.rafterSize,
        species: 'SPF',
        cut: {
          length: geom.overallLength,
          endA: plumbCut,
          endB: plumbCut,
          notches: [
            {
              kind: 'birdsmouth',
              fromEnd: 'a',
              distance: overhang / Math.cos(theta),
              seatDepth: actualSize(config.framing.studSize).width,
              heelPlumb: rafterDepth / Math.cos(theta) - geom.hap,
            },
          ],
        },
        placement: {
          origin: [x0, y0, z0],
          dir: dirVec,
          up: upVec,
          sectionW: 1.5,
          sectionH: rafterDepth,
        },
      });
    }
  }

  // Ridge board, one size deeper than the rafters.
  const ridgeSize = config.framing.rafterSize === '2x6' ? '2x8' : '2x10';
  const ridgeLength = alongY ? config.width : config.depth;
  members.push({
    id: 'roof.ridge.0',
    role: 'roof.ridge',
    category: 'roof',
    label: 'Ridge board',
    size: ridgeSize,
    species: 'SPF',
    cut: {
      length: ridgeLength,
      endA: { angleDeg: 0, kind: 'square' },
      endB: { angleDeg: 0, kind: 'square' },
      notches: [],
    },
    placement: {
      origin: alongY
        ? [0, config.depth / 2, ridgeZ - actualSize(ridgeSize).width / 2]
        : [config.width / 2, 0, ridgeZ - actualSize(ridgeSize).width / 2],
      dir: alongY ? [1, 0, 0] : [0, 1, 0],
      up: [0, 0, 1],
      sectionW: 1.5,
      sectionH: actualSize(ridgeSize).width,
    },
  });

  return members;
}

function normalize(v: Pt3): Pt3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}
