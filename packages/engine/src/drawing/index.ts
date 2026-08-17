import {
  SHEET_HEIGHT_IN,
  SHEET_LABELS,
  SHEET_WIDTH_IN,
  formatFeetInches,
  type DrawEntity,
  type Drawing,
  type DrawingSet,
  type Member,
  type Pt2,
  type ResolvedShedConfig,
  type RoofSolution,
  type SheetPlan,
  type WallId,
  type WallSummary,
} from '@shedit/shared';
import { heightAt } from '../geometry/roof.js';
import { wallAxis } from '../geometry/wall.js';

const FRAMING = { layer: 'framing' as const, weight: 'thin' as const };
const OUTLINE = { layer: 'outline' as const, weight: 'thick' as const };
const HIDDEN = { layer: 'hidden' as const, dash: 'dashed' as const };
const DIM = { layer: 'dim' as const };
const TEXT = { layer: 'text' as const };

export function buildDrawings(
  config: ResolvedShedConfig,
  roof: RoofSolution,
  walls: WallSummary[],
  members: Member[],
  sheetPlan: SheetPlan,
): DrawingSet {
  const sheets: Drawing[] = [floorPlan(config, members)];

  for (const wall of walls) sheets.push(elevation(config, roof, wall));
  for (const wall of walls) sheets.push(framingElevation(config, roof, wall, members));

  sheets.push(roofFramingPlan(config, members));
  sheets.push(...sheetLayouts(sheetPlan));

  return { sheets };
}

/* ------------------------------------------------------------- floor plan */

function floorPlan(config: ResolvedShedConfig, members: Member[]): Drawing {
  const e: DrawEntity[] = [];
  const { width: w, depth: d } = config;

  e.push({ t: 'polyline', pts: rect(0, 0, w, d), closed: true, s: OUTLINE });
  e.push({ t: 'polyline', pts: rect(3.5, 3.5, w - 7, d - 7), closed: true, s: FRAMING });

  for (const m of members) {
    if (m.role !== 'floor.joist' && m.role !== 'foundation.skid') continue;
    const [x, y] = [m.placement.origin[0], m.placement.origin[1]];
    const along: Pt2 = [m.placement.dir[0], m.placement.dir[1]];
    e.push({
      t: 'line',
      a: [x, y],
      b: [x + along[0] * m.cut.length, y + along[1] * m.cut.length],
      s: m.role === 'floor.joist' ? HIDDEN : { layer: 'framing', weight: 'medium' },
    });
  }

  e.push({ t: 'dim', a: [0, 0], b: [w, 0], offset: -18, text: formatFeetInches(w), s: DIM });
  e.push({ t: 'dim', a: [0, 0], b: [0, d], offset: 18, text: formatFeetInches(d), s: DIM });

  return {
    id: 'plan',
    title: 'Floor & Foundation Plan',
    bounds: { min: [-30, -30], max: [w + 30, d + 30] },
    entities: e,
  };
}

/* ------------------------------------------------------------- elevations */

function wallProfile(config: ResolvedShedConfig, roof: RoofSolution, id: WallId) {
  const axis = wallAxis(id, config.width, config.depth);
  const topAt = (s: number) => {
    const x = axis.origin[0] + axis.dir[0] * s;
    const y = axis.origin[1] + axis.dir[1] * s;
    return heightAt(roof.plane, x, y);
  };
  return { axis, topAt };
}

function elevation(
  config: ResolvedShedConfig,
  roof: RoofSolution,
  wall: WallSummary,
): Drawing {
  const { axis, topAt } = wallProfile(config, roof, wall.id);
  const L = axis.length;
  const zL = topAt(0);
  const zR = topAt(L);
  const e: DrawEntity[] = [];

  e.push({
    t: 'polyline',
    pts: [
      [0, 0],
      [L, 0],
      [L, zR],
      [0, zL],
    ],
    closed: true,
    s: OUTLINE,
  });

  // Ground line.
  e.push({ t: 'line', a: [-12, 0], b: [L + 12, 0], s: { layer: 'outline', weight: 'medium' } });

  for (const o of config.openings.filter((x) => x.wall === wall.id)) {
    e.push({
      t: 'polyline',
      pts: rect(o.offset, o.sill, o.width, o.height),
      closed: true,
      s: { layer: 'symbol', weight: 'medium' },
    });
    e.push({
      t: 'text',
      at: [o.offset + o.width / 2, o.sill + o.height / 2],
      text: o.kind === 'door' ? 'DOOR' : 'WINDOW',
      h: 4,
      anchor: 'middle',
      s: TEXT,
    });
  }

  // The offset runs perpendicular to the measured span, so the sign has to
  // flip between the horizontal and vertical dimensions to keep both outside
  // the building.
  e.push({ t: 'dim', a: [0, 0], b: [L, 0], offset: -16, text: formatFeetInches(L), s: DIM });
  e.push({ t: 'dim', a: [0, 0], b: [0, zL], offset: 16, text: formatFeetInches(zL), s: DIM });
  if (Math.abs(zL - zR) > 0.125) {
    e.push({ t: 'dim', a: [L, 0], b: [L, zR], offset: -16, text: formatFeetInches(zR), s: DIM });
  }

  return {
    id: `elev-${wall.id}`,
    title: `${titleCase(wall.id)} Elevation${wall.kind === 'rake' ? ' (sloped)' : ''}`,
    bounds: { min: [-30, -20], max: [L + 30, Math.max(zL, zR) + 20] },
    entities: e,
  };
}

function framingElevation(
  config: ResolvedShedConfig,
  roof: RoofSolution,
  wall: WallSummary,
  members: Member[],
): Drawing {
  const { axis, topAt } = wallProfile(config, roof, wall.id);
  const L = axis.length;
  const e: DrawEntity[] = [];

  const toS = (p: readonly number[]): number =>
    (p[0]! - axis.origin[0]) * axis.dir[0] + (p[1]! - axis.origin[1]) * axis.dir[1];

  for (const m of members) {
    if (m.wall !== wall.id) continue;
    const a: Pt2 = [toS(m.placement.origin), m.placement.origin[2]];
    const end = [
      m.placement.origin[0] + m.placement.dir[0] * m.cut.length,
      m.placement.origin[1] + m.placement.dir[1] * m.cut.length,
      m.placement.origin[2] + m.placement.dir[2] * m.cut.length,
    ];
    const b: Pt2 = [toS(end), end[2]!];
    // The elevation plane contains the wall's s and z axes; the wall normal
    // points out of it. Whichever section axis lies along that normal is the
    // one we cannot see, so the other gives the visible thickness.
    const upAlongNormal = Math.abs(
      m.placement.up[0] * axis.normal[0] + m.placement.up[1] * axis.normal[1],
    );
    const thickness = upAlongNormal > 0.5 ? m.placement.sectionW : m.placement.sectionH;
    e.push({ t: 'polyline', pts: thickLine(a, b, thickness), closed: true, s: FRAMING });
  }

  e.push({
    t: 'polyline',
    pts: [
      [0, 0],
      [L, 0],
      [L, topAt(L)],
      [0, topAt(0)],
    ],
    closed: true,
    s: OUTLINE,
  });

  const label =
    wall.kind === 'rake'
      ? `Rake wall — ${wall.slopeAngleDeg.toFixed(1)}° slope, studs stepped ${formatFeetInches(
          Math.abs(topAt(L) - topAt(0)) / Math.max(1, wall.studCount - 1),
        )} apart`
      : `${wall.studCount} studs at ${config.framing.studSpacing}" on centre`;
  e.push({ t: 'text', at: [L / 2, -12], text: label, h: 5, anchor: 'middle', s: TEXT });

  return {
    id: `framing-${wall.id}`,
    title: `${titleCase(wall.id)} Wall Framing`,
    bounds: { min: [-24, -24], max: [L + 24, Math.max(topAt(0), topAt(L)) + 20] },
    entities: e,
  };
}

function roofFramingPlan(config: ResolvedShedConfig, members: Member[]): Drawing {
  const e: DrawEntity[] = [];
  const { width: w, depth: d } = config;
  e.push({ t: 'polyline', pts: rect(0, 0, w, d), closed: true, s: HIDDEN });

  for (const m of members) {
    if (m.role !== 'roof.rafter' && m.role !== 'roof.ridge') continue;
    const a: Pt2 = [m.placement.origin[0], m.placement.origin[1]];
    const b: Pt2 = [
      m.placement.origin[0] + m.placement.dir[0] * m.cut.length,
      m.placement.origin[1] + m.placement.dir[1] * m.cut.length,
    ];
    e.push({
      t: 'polyline',
      pts: thickLine(a, b, m.role === 'roof.ridge' ? 3 : 1.5),
      closed: true,
      s: FRAMING,
    });
  }

  const oh = config.roof.overhangEave;
  return {
    id: 'roof-framing',
    title: 'Roof Framing Plan',
    bounds: { min: [-oh - 20, -oh - 20], max: [w + oh + 20, d + oh + 20] },
    entities: e,
  };
}

/**
 * Sheets cut the same way get one drawing labelled with how many to cut.
 * A shed typically needs a dozen identical siding sheets, and a dozen
 * identical diagrams is noise on screen and wasted paper in the plan book.
 */
function sheetLayouts(plan: SheetPlan): Drawing[] {
  const groups = new Map<string, { first: SheetPlan['sheets'][number]; count: number }>();

  for (const sheet of plan.sheets) {
    const signature = [
      sheet.material,
      ...sheet.placed.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.w.toFixed(2)},${p.h.toFixed(2)}`),
    ].join('|');
    const existing = groups.get(signature);
    if (existing) existing.count += 1;
    else groups.set(signature, { first: sheet, count: 1 });
  }

  return [...groups.values()].map(({ first, count }, i) => {
    const e: DrawEntity[] = [
      { t: 'polyline', pts: rect(0, 0, SHEET_WIDTH_IN, SHEET_HEIGHT_IN), closed: true, s: OUTLINE },
    ];
    for (const p of first.placed) {
      e.push({ t: 'polyline', pts: rect(p.x, p.y, p.w, p.h), closed: true, s: FRAMING });
      e.push({
        t: 'text',
        at: [p.x + p.w / 2, p.y + p.h / 2],
        text: `${p.w.toFixed(0)}" x ${p.h.toFixed(0)}"`,
        h: 3,
        anchor: 'middle',
        s: TEXT,
      });
    }

    const material = SHEET_LABELS[first.material] ?? first.material;
    return {
      id: `sheet-${i}`,
      title:
        `${material} — cut ${count} sheet${count > 1 ? 's' : ''} this way ` +
        `(${first.wastePct.toFixed(0)}% waste each)`,
      bounds: { min: [-6, -6], max: [SHEET_WIDTH_IN + 6, SHEET_HEIGHT_IN + 6] },
      entities: e,
    };
  });
}

/* ------------------------------------------------------------------ utils */

function rect(x: number, y: number, w: number, h: number): Pt2[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/** Expand a centreline into a rectangle of the given thickness. */
function thickLine(a: Pt2, b: Pt2, thickness: number): Pt2[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (thickness / 2);
  const ny = (dx / len) * (thickness / 2);
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ];
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
