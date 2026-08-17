import {
  WALL_IDS,
  actualSize,
  shedConfigSchema,
  type Issue,
  type Member,
  type PlanResult,
  type PlanStats,
  type ResolvedShedConfig,
  type ShedConfig,
  type WallSummary,
} from '@shedit/shared';
import { deriveRoof } from './geometry/roof.js';
import { buildWall } from './geometry/wall.js';
import { buildFloor } from './geometry/floor.js';
import { buildRoof, rafterGeometry } from './geometry/rafter.js';
import { buildCutList } from './takeoff/cutlist.js';
import { buildPanels } from './takeoff/panels.js';
import { buildBom, totalCost } from './takeoff/bom.js';
import { packLinear } from './optimize/linear.js';
import { nestSheets } from './optimize/sheets.js';
import { buildDrawings } from './drawing/index.js';

export const ENGINE_VERSION = '0.1.0';

/**
 * The one entry point. Pure and deterministic — no clock, no randomness, ids
 * derived from structure — so the API can cache on a hash of the input and the
 * PDF is guaranteed to match what the user saw on screen.
 */
export function computePlan(input: ShedConfig | ResolvedShedConfig): PlanResult {
  const config = shedConfigSchema.parse(input);
  const issues: Issue[] = [];

  const { solution: roof, issues: roofIssues } = deriveRoof(config);
  issues.push(...roofIssues);

  validateOpenings(config, issues);

  const members: Member[] = [];
  const walls: WallSummary[] = [];

  members.push(...buildFloor(config));

  for (const id of WALL_IDS) {
    const framed = buildWall({ config, roof, id });
    members.push(...framed.members);
    walls.push(framed.summary);
    issues.push(...framed.issues);
  }

  const rafter = rafterGeometry(config, roof, issues);
  members.push(...buildRoof(config, roof, rafter));

  const cutList = buildCutList(members);
  const cutPlan = packLinear(cutList);
  const panels = buildPanels(config, roof, walls);
  const sheetPlan = nestSheets(panels);
  const bom = buildBom(config, roof, cutPlan, sheetPlan);
  const drawings = buildDrawings(config, roof, walls, members, sheetPlan);

  if (cutPlan.wastePct > 25) {
    issues.push({
      code: 'W_HIGH_WASTE',
      severity: 'warning',
      message:
        `This layout wastes ${cutPlan.wastePct.toFixed(0)}% of the lumber you buy. ` +
        `Nudging the footprint to a multiple of 2 ft usually helps.`,
    });
  }

  const stats: PlanStats = {
    footprintSqFt: (config.width * config.depth) / 144,
    wallSqFt: walls.reduce(
      (s, w) => s + (w.length * (w.lowHeight + w.highHeight)) / 2 / 144,
      0,
    ),
    roofSqFt: roof.roofAreaSqFt,
    memberCount: members.length,
    boardFeet: boardFeet(members),
    lumberWastePct: cutPlan.wastePct,
    estimatedCost: totalCost(bom),
  };

  return {
    engineVersion: ENGINE_VERSION,
    issues,
    roof,
    rafter,
    walls,
    members,
    cutList,
    cutPlan,
    panels,
    sheetPlan,
    bom,
    stats,
    drawings,
  };
}

function boardFeet(members: Member[]): number {
  let total = 0;
  for (const m of members) {
    const { thickness, width } = actualSize(m.size);
    total += (thickness * width * m.cut.length) / 144;
  }
  return Math.round(total * 10) / 10;
}

function validateOpenings(config: ResolvedShedConfig, issues: Issue[]): void {
  for (const wall of WALL_IDS) {
    const list = config.openings
      .filter((o) => o.wall === wall)
      .sort((a, b) => a.offset - b.offset);

    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const cur = list[i]!;
      // Two openings need room between them for both sets of king studs.
      if (cur.offset < prev.offset + prev.width + 3) {
        issues.push({
          code: 'E_OPENING_OVERLAP',
          severity: 'error',
          message:
            `Two openings on the ${wall} wall are less than 3" apart, leaving no room ` +
            `for king studs between them.`,
          path: `openings.${cur.id}.offset`,
          fixes: [
            {
              label: 'Slide the second one clear',
              ops: [
                { path: `openings.${cur.id}.offset`, value: prev.offset + prev.width + 3.5 },
              ],
            },
          ],
        });
      }
    }
  }
}
