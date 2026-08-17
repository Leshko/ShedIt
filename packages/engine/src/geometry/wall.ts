import {
  actualSize,
  degrees,
  type EndCut,
  type Issue,
  type Member,
  type NominalSize,
  type Opening,
  type Pt3,
  type ResolvedShedConfig,
  type RoofSolution,
  type WallId,
  type WallKind,
  type WallSummary,
  formatFeetInches,
} from '@shedit/shared';
import { heightAt } from './roof.js';

const PLATE_T = 1.5;

/**
 * Each wall has a local `s` axis running left-to-right as seen from OUTSIDE
 * the shed. Opening positions are measured on that axis, so what the user
 * types matches what they see on the elevation drawing.
 */
export interface WallAxis {
  id: WallId;
  /** Plan-space point at s = 0, on the wall's outside face. */
  origin: [number, number];
  /** Unit vector along the wall in plan. */
  dir: [number, number];
  /** Outward-facing unit normal in plan. */
  normal: [number, number];
  length: number;
}

/**
 * Front and back plates run the full width; the left and right walls tuck
 * between them. This has to be an explicit choice because it changes plate
 * lengths and the corner detail.
 */
export function wallAxis(
  id: WallId,
  width: number,
  depth: number,
  studThickness = PLATE_T,
): WallAxis {
  const inset = studThickness;
  switch (id) {
    case 'front':
      return { id, origin: [0, 0], dir: [1, 0], normal: [0, -1], length: width };
    case 'back':
      return { id, origin: [width, depth], dir: [-1, 0], normal: [0, 1], length: width };
    case 'right':
      return {
        id,
        origin: [width, inset],
        dir: [0, 1],
        normal: [1, 0],
        length: depth - 2 * inset,
      };
    case 'left':
      return {
        id,
        origin: [0, depth - inset],
        dir: [0, -1],
        normal: [-1, 0],
        length: depth - 2 * inset,
      };
  }
}

/** Plan-space point at distance `s` along the wall, offset `inward` inches into the shed. */
function planPoint(axis: WallAxis, s: number, inward: number): [number, number] {
  return [
    axis.origin[0] + axis.dir[0] * s - axis.normal[0] * inward,
    axis.origin[1] + axis.dir[1] * s - axis.normal[1] * inward,
  ];
}

/** Header sizing for shed-scale spans. Deliberately conservative. */
export function headerSizeFor(roughWidth: number): NominalSize | null {
  if (roughWidth <= 48) return '2x6';
  if (roughWidth <= 72) return '2x8';
  if (roughWidth <= 96) return '2x10';
  if (roughWidth <= 120) return '2x12';
  return null;
}

export interface WallFraming {
  summary: WallSummary;
  members: Member[];
  issues: Issue[];
}

interface BuildWallArgs {
  config: ResolvedShedConfig;
  roof: RoofSolution;
  id: WallId;
}

export function buildWall({ config, roof, id }: BuildWallArgs): WallFraming {
  const members: Member[] = [];
  const issues: Issue[] = [];

  const kind: WallKind = roof.wallKinds[id];
  const studDims = actualSize(config.framing.studSize);
  const studW = studDims.width; // through-wall depth, 3.5 or 5.5
  const studT = studDims.thickness; // 1.5 along the wall
  const axis = wallAxis(id, config.width, config.depth, studT);
  const nTop = config.framing.doubleTopPlate ? 2 : 1;

  // Top-of-plate height anywhere along the wall, straight off the roof plane.
  const topZ = (s: number): number => {
    const [x, y] = planPoint(axis, s, 0);
    return heightAt(roof.plane, x, y);
  };

  const zStart = topZ(0);
  const zEnd = topZ(axis.length);
  const slope = kind === 'rake' ? (zEnd - zStart) / axis.length : 0;
  const theta = Math.atan(slope);
  const thetaDeg = degrees(Math.abs(theta));

  // Top plates laid perpendicular to the slope are thicker measured plumb.
  const plateStackPlumb = (nTop * PLATE_T) / Math.cos(theta);
  /** Underside of the top plate stack — where studs and cripples stop. */
  const studTopZ = (s: number): number =>
    kind === 'rake' ? topZ(s) - plateStackPlumb : zStart - nTop * PLATE_T;

  const mid = (s: number) => planPoint(axis, s, studW / 2);
  const up3: Pt3 = [0, 0, 1];
  const normal3: Pt3 = [axis.normal[0], axis.normal[1], 0];
  const dir3: Pt3 = [axis.dir[0], axis.dir[1], 0];

  const verticalPlacement = (s: number, z: number) => {
    const [x, y] = mid(s);
    return {
      origin: [x, y, z] as Pt3,
      dir: up3,
      up: normal3,
      sectionW: studT,
      sectionH: studW,
    };
  };

  /**
   * `origin` is the CENTRE of the cross-section at end A, so `centreZ` is the
   * middle of the member's depth, not its underside.
   */
  const horizontalPlacement = (
    s: number,
    centreZ: number,
    opts: { inward?: number; sectionW?: number; sectionH?: number } = {},
  ) => {
    const [x, y] = planPoint(axis, s, opts.inward ?? studW / 2);
    return {
      origin: [x, y, centreZ] as Pt3,
      dir: dir3,
      up: up3,
      sectionW: opts.sectionW ?? studW,
      sectionH: opts.sectionH ?? PLATE_T,
    };
  };

  const label = titleCase(id);
  let seq = 0;
  const nextId = (role: string) => `${id}.${role}.${seq++}`;

  /* ------------------------------------------------------------- plates */

  members.push({
    id: nextId('bottomPlate'),
    role: 'wall.bottomPlate',
    category: 'walls',
    label: `${label} wall bottom plate (PT)`,
    size: config.framing.studSize,
    species: 'PT',
    cut: {
      length: axis.length,
      endA: square(),
      endB: square(),
      notches: [],
    },
    placement: horizontalPlacement(0, PLATE_T / 2),
    wall: id,
  });

  for (let i = 0; i < nTop; i++) {
    // A raked plate follows the slope, so it is longer than the plan run, its
    // ends are mitered where they die into the square walls, and — crucially —
    // it must be PLACED on the slope too, not laid flat at the low end.
    const raked = kind === 'rake';
    const plateLength = raked ? axis.length / Math.cos(theta) : axis.length;
    const endCut = (): EndCut => (raked ? { angleDeg: thetaDeg, kind: 'miter' } : square());

    // Ply 1 is the topmost, its top face on the roof plane. A vertical line
    // through a sloped slab of perpendicular thickness t traverses t/cos0,
    // so plumb offsets are divided by cos0, not multiplied.
    const perpToCentre = i * PLATE_T + PLATE_T / 2;
    const originZ = raked
      ? zStart - perpToCentre / Math.cos(theta)
      : zStart - perpToCentre;

    const placement = raked
      ? {
          origin: [
            ...planPoint(axis, 0, studW / 2),
            originZ,
          ] as Pt3,
          dir: normalize([axis.dir[0], axis.dir[1], slope]),
          up: normalize([-slope * axis.dir[0], -slope * axis.dir[1], 1]),
          sectionW: studW,
          sectionH: PLATE_T,
        }
      : horizontalPlacement(0, originZ);

    members.push({
      id: nextId('topPlate'),
      role: 'wall.topPlate',
      category: 'walls',
      label: `${label} wall top plate${nTop > 1 ? ` (ply ${i + 1})` : ''}`,
      size: config.framing.studSize,
      species: 'SPF',
      cut: { length: plateLength, endA: endCut(), endB: endCut(), notches: [] },
      placement,
      wall: id,
    });
  }

  /* ----------------------------------------------------------- openings */

  const wallOpenings = config.openings.filter((o) => o.wall === id);
  const blocked: { from: number; to: number }[] = [];

  for (const opening of wallOpenings) {
    const res = frameOpening({
      opening,
      axis,
      kind,
      studT,
      studW,
      studTopZ,
      theta,
      thetaDeg,
      config,
      nextId,
      label,
      verticalPlacement,
      horizontalPlacement,
      issues,
    });
    members.push(...res.members);
    if (res.blocked) blocked.push(res.blocked);
  }

  /* -------------------------------------------------------------- studs */

  const centers = studCenters(axis.length, config.framing.studSpacing, studT);
  let studCount = 0;

  for (const s of centers) {
    if (blocked.some((b) => s > b.from - studT / 2 && s < b.to + studT / 2)) continue;
    const top = studTopZ(s);
    const length = top - PLATE_T;
    if (length <= 0) continue;
    studCount++;

    if (kind === 'rake') {
      // Report the LONG point: the stud is cut with a bevel across its 1.5"
      // thickness, and the long point is what you set the saw to.
      const longPoint = length + Math.abs(slope) * studT;
      members.push({
        id: nextId('rakeStud'),
        role: 'wall.rakeStud',
        category: 'walls',
        label: `${label} wall rake stud`,
        size: config.framing.studSize,
        species: 'SPF',
        cut: {
          length: longPoint,
          endA: square(),
          endB: { angleDeg: thetaDeg, kind: 'bevel' },
          notches: [],
        },
        placement: verticalPlacement(s, PLATE_T),
        wall: id,
      });
    } else {
      members.push({
        id: nextId('stud'),
        role: 'wall.stud',
        category: 'walls',
        label: `${label} wall stud`,
        size: config.framing.studSize,
        species: 'SPF',
        cut: { length, endA: square(), endB: square(), notches: [] },
        placement: verticalPlacement(s, PLATE_T),
        wall: id,
      });
    }
  }

  /* -------------------------------------------------------- gable ends */

  if (kind === 'gableEnd' && roof.ridgeHeight !== undefined) {
    members.push(
      ...buildGableEnd({
        axis,
        config,
        roof,
        eaveZ: zStart,
        studT,
        studW,
        nextId,
        label,
        verticalPlacement,
        horizontalPlacement,
      }),
    );
  }

  const lowHeight = Math.min(zStart, zEnd);
  const highHeight = Math.max(zStart, zEnd);

  return {
    summary: {
      id,
      kind,
      length: axis.length,
      loadBearing: isLoadBearing(id, roof),
      lowHeight,
      highHeight,
      slopeAngleDeg: thetaDeg,
      studCount,
    },
    members,
    issues,
  };
}

/* -------------------------------------------------------------- openings */

interface FrameOpeningArgs {
  opening: Opening;
  axis: WallAxis;
  kind: WallKind;
  studT: number;
  studW: number;
  studTopZ: (s: number) => number;
  theta: number;
  thetaDeg: number;
  config: ResolvedShedConfig;
  nextId: (role: string) => string;
  label: string;
  verticalPlacement: (s: number, z: number) => Member['placement'];
  horizontalPlacement: (
    s: number,
    centreZ: number,
    opts?: { inward?: number; sectionW?: number; sectionH?: number },
  ) => Member['placement'];
  issues: Issue[];
}

function frameOpening(args: FrameOpeningArgs): {
  members: Member[];
  blocked?: { from: number; to: number };
} {
  const {
    opening,
    axis,
    kind,
    studT,
    studTopZ,
    thetaDeg,
    config,
    nextId,
    label,
    verticalPlacement,
    horizontalPlacement,
    issues,
  } = args;

  const members: Member[] = [];
  const roLeft = opening.offset;
  const roRight = opening.offset + opening.width;
  const roTop = opening.sill + opening.height;

  if (roLeft < studT || roRight > axis.length - studT) {
    issues.push({
      code: 'E_OPENING_OUT_OF_BOUNDS',
      severity: 'error',
      message:
        `The ${opening.kind} on the ${opening.wall} wall runs past the end of the ` +
        `wall. The wall is ${formatFeetInches(axis.length)} long.`,
      path: `openings.${opening.id}.offset`,
      fixes: [
        {
          label: 'Move it inside the wall',
          ops: [
            {
              path: `openings.${opening.id}.offset`,
              value: Math.max(studT, Math.min(roLeft, axis.length - studT - opening.width)),
            },
          ],
        },
      ],
    });
    return { members };
  }

  const headerSize = headerSizeFor(opening.width);
  if (!headerSize) {
    issues.push({
      code: 'E_HEADER_SPAN_EXCEEDED',
      severity: 'error',
      message:
        `A ${formatFeetInches(opening.width)} opening is wider than this planner will ` +
        `size a header for. Keep openings to 10 ft or less, or split it in two.`,
      path: `openings.${opening.id}.width`,
    });
    return { members };
  }

  const headerDepth = actualSize(headerSize).width;
  const jacksPerSide = opening.width > 48 ? 2 : 1;
  const headerLength = opening.width + 2 * studT * jacksPerSide;
  const headerBottomZ = roTop;
  const headerTopZ = roTop + headerDepth;

  // Clearance is tightest at the low edge of a rake wall, so check both ends.
  const availTop = Math.min(studTopZ(roLeft), studTopZ(roRight));
  if (headerTopZ > availTop) {
    const maxHeight = availTop - headerDepth - opening.sill;
    issues.push({
      code: 'E_OPENING_TOO_TALL',
      severity: 'error',
      message:
        `The ${opening.kind} on the ${opening.wall} wall needs ` +
        `${formatFeetInches(headerTopZ)} of wall but only ` +
        `${formatFeetInches(availTop)} is available` +
        (kind === 'rake' ? ' at its low edge' : '') +
        `. Maximum opening height here is ${formatFeetInches(Math.max(0, maxHeight))}.`,
      path: `openings.${opening.id}.height`,
      fixes:
        maxHeight > 12
          ? [
              {
                label: `Shrink to ${formatFeetInches(Math.floor(maxHeight))}`,
                ops: [
                  { path: `openings.${opening.id}.height`, value: Math.floor(maxHeight) },
                ],
              },
            ]
          : undefined,
    });
    return { members };
  }

  const jackLength = roTop - PLATE_T;

  // Jacks and kings on both sides.
  for (const [side, sJackOuter] of [
    ['left', roLeft],
    ['right', roRight],
  ] as const) {
    const sign = side === 'left' ? -1 : 1;
    for (let j = 0; j < jacksPerSide; j++) {
      const s = sJackOuter + sign * (studT / 2 + j * studT);
      members.push({
        id: nextId('jack'),
        role: 'wall.jack',
        category: 'walls',
        label: `${label} wall jack stud (${opening.kind})`,
        size: config.framing.studSize,
        species: 'SPF',
        cut: { length: jackLength, endA: square(), endB: square(), notches: [] },
        placement: verticalPlacement(s, PLATE_T),
        wall: opening.wall,
        openingId: opening.id,
      });
    }

    const sKing = sJackOuter + sign * (studT / 2 + jacksPerSide * studT);
    const kingTop = studTopZ(sKing);
    const kingLength = kingTop - PLATE_T;
    const raked = kind === 'rake';
    members.push({
      id: nextId('king'),
      role: 'wall.king',
      category: 'walls',
      label: `${label} wall king stud (${opening.kind})`,
      size: config.framing.studSize,
      species: 'SPF',
      cut: {
        length: raked ? kingLength + Math.tan((thetaDeg * Math.PI) / 180) * studT : kingLength,
        endA: square(),
        endB: raked ? { angleDeg: thetaDeg, kind: 'bevel' } : square(),
        notches: [],
      },
      placement: verticalPlacement(sKing, PLATE_T),
      wall: opening.wall,
      openingId: opening.id,
    });
  }

  // Two-ply header.
  for (let ply = 0; ply < 2; ply++) {
    members.push({
      id: nextId('header'),
      role: 'wall.header',
      category: 'walls',
      label: `${label} wall header (${opening.kind}, ply ${ply + 1})`,
      size: headerSize,
      species: 'SPF',
      cut: { length: headerLength, endA: square(), endB: square(), notches: [] },
      // Two plies stand on edge side by side, so each is 1.5" through the wall
      // and headerDepth tall, centred on its own half of the pair.
      placement: horizontalPlacement(roLeft - studT * jacksPerSide, headerBottomZ + headerDepth / 2, {
        inward: PLATE_T * (ply + 0.5),
        sectionW: PLATE_T,
        sectionH: headerDepth,
      }),
      wall: opening.wall,
      openingId: opening.id,
    });
  }

  // Sill plate and cripples below, for windows.
  if (opening.sill > PLATE_T + PLATE_T) {
    members.push({
      id: nextId('sillPlate'),
      role: 'wall.sillPlate',
      category: 'walls',
      label: `${label} wall rough sill (${opening.kind})`,
      size: config.framing.studSize,
      species: 'SPF',
      cut: { length: opening.width, endA: square(), endB: square(), notches: [] },
      placement: horizontalPlacement(roLeft, opening.sill - PLATE_T / 2),
      wall: opening.wall,
      openingId: opening.id,
    });

    const sillCrippleLen = opening.sill - PLATE_T - PLATE_T;
    if (sillCrippleLen > 0) {
      for (const s of studCentersWithin(roLeft, roRight, config.framing.studSpacing, studT)) {
        members.push({
          id: nextId('cripple'),
          role: 'wall.cripple',
          category: 'walls',
          label: `${label} wall cripple below sill`,
          size: config.framing.studSize,
          species: 'SPF',
          cut: { length: sillCrippleLen, endA: square(), endB: square(), notches: [] },
          placement: verticalPlacement(s, PLATE_T),
          wall: opening.wall,
          openingId: opening.id,
        });
      }
    }
  }

  // Cripples above the header. On a rake wall every one of these is a
  // different length with an angled top cut — the main reason the solver has
  // to be position-aware rather than emitting N identical pieces.
  for (const s of studCentersWithin(roLeft, roRight, config.framing.studSpacing, studT)) {
    const len = studTopZ(s) - headerTopZ;
    if (len <= 0.5) continue;
    const raked = kind === 'rake';
    members.push({
      id: nextId('cripple'),
      role: 'wall.cripple',
      category: 'walls',
      label: `${label} wall cripple above header`,
      size: config.framing.studSize,
      species: 'SPF',
      cut: {
        length: raked ? len + Math.tan((thetaDeg * Math.PI) / 180) * studT : len,
        endA: square(),
        endB: raked ? { angleDeg: thetaDeg, kind: 'bevel' } : square(),
        notches: [],
      },
      placement: verticalPlacement(s, headerTopZ),
      wall: opening.wall,
      openingId: opening.id,
    });
  }

  return {
    members,
    blocked: {
      from: roLeft - studT * (jacksPerSide + 1),
      to: roRight + studT * (jacksPerSide + 1),
    },
  };
}

/* ---------------------------------------------------------- gable ends */

function buildGableEnd(args: {
  axis: WallAxis;
  config: ResolvedShedConfig;
  roof: RoofSolution;
  eaveZ: number;
  studT: number;
  studW: number;
  nextId: (role: string) => string;
  label: string;
  verticalPlacement: (s: number, z: number) => Member['placement'];
  horizontalPlacement: (
    s: number,
    centreZ: number,
    opts?: { inward?: number; sectionW?: number; sectionH?: number },
  ) => Member['placement'];
}): Member[] {
  const { axis, config, roof, eaveZ, studT, nextId, label, verticalPlacement } = args;
  const members: Member[] = [];
  const ridgeZ = roof.ridgeHeight!;
  const rise = ridgeZ - eaveZ;
  const halfSpan = axis.length / 2;
  const slope = rise / halfSpan;
  const thetaDeg = degrees(Math.atan(slope));

  for (const s of studCenters(axis.length, config.framing.studSpacing, studT)) {
    const distFromEnd = Math.min(s, axis.length - s);
    const len = distFromEnd * slope - PLATE_T;
    if (len <= 1) continue;
    members.push({
      id: nextId('gableStud'),
      role: 'wall.stud',
      category: 'walls',
      label: `${label} gable stud`,
      size: config.framing.studSize,
      species: 'SPF',
      cut: {
        length: len + slope * studT,
        endA: square(),
        endB: { angleDeg: thetaDeg, kind: 'bevel' },
        notches: [],
      },
      placement: verticalPlacement(s, eaveZ),
      wall: axis.id,
    });
  }
  return members;
}

/* ----------------------------------------------------------------- utils */

const square = () => ({ angleDeg: 0, kind: 'square' as const });

/**
 * Stud layout marks. The first and last studs sit flush with the wall ends,
 * with the rest on-centre from the start so sheathing edges land on framing.
 */
export function studCenters(length: number, spacing: number, studT: number): number[] {
  const out: number[] = [studT / 2];
  for (let s = spacing; s < length - studT; s += spacing) out.push(s);
  const last = length - studT / 2;
  if (last - out[out.length - 1]! > studT) out.push(last);
  return out;
}

function studCentersWithin(
  from: number,
  to: number,
  spacing: number,
  studT: number,
): number[] {
  const out: number[] = [];
  for (let s = Math.ceil(from / spacing) * spacing; s < to; s += spacing) {
    if (s > from + studT / 2 && s < to - studT / 2) out.push(s);
  }
  return out;
}

function isLoadBearing(id: WallId, roof: RoofSolution): boolean {
  return roof.rafterAxis === 'y' ? id === 'front' || id === 'back' : id === 'left' || id === 'right';
}

function normalize(v: Pt3): Pt3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
