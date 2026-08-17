import {
  SHEET_HEIGHT_IN,
  SHEET_WIDTH_IN,
  type PanelCut,
  type Pt2,
  type ResolvedShedConfig,
  type RoofSolution,
  type SheetMaterial,
  type WallSummary,
} from '@shedit/shared';
import { wallAxis } from '../geometry/wall.js';
import { heightAt } from '../geometry/roof.js';

/**
 * Break each surface into pieces that can be cut from 4x8 sheets. Rake walls
 * yield trapezoids rather than rectangles, which is why a panel carries a
 * polygon outline and not just a width and height.
 */
export function buildPanels(
  config: ResolvedShedConfig,
  roof: RoofSolution,
  walls: WallSummary[],
): PanelCut[] {
  const panels: PanelCut[] = [];

  panels.push(...tileRectangle(config.width, config.depth, 'plywood-3/4-tg', 'Floor deck', 'floor'));

  // Roof, measured on the slope and including the overhangs.
  const stretch = Math.sqrt(1 + roof.plane.a ** 2 + roof.plane.b ** 2);
  const roofW = config.width + 2 * config.roof.overhangRake;
  const roofD = (config.depth + 2 * config.roof.overhangEave) * stretch;
  panels.push(...tileRectangle(roofW, roofD, 'osb-7/16', 'Roof sheathing', 'roof'));

  // Siding, one run of vertical panels per wall.
  for (const wall of walls) {
    panels.push(...tileWall(config, roof, wall));
  }

  return panels;
}

function tileRectangle(
  width: number,
  height: number,
  material: SheetMaterial,
  label: string,
  prefix: string,
): PanelCut[] {
  const out: PanelCut[] = [];
  let i = 0;
  for (let x = 0; x < width - 1e-6; x += SHEET_WIDTH_IN) {
    const w = Math.min(SHEET_WIDTH_IN, width - x);
    for (let y = 0; y < height - 1e-6; y += SHEET_HEIGHT_IN) {
      const h = Math.min(SHEET_HEIGHT_IN, height - y);
      out.push({
        id: `${prefix}.panel.${i++}`,
        material,
        label: `${label} ${w.toFixed(0)}" x ${h.toFixed(0)}"`,
        outline: rect(w, h),
        boundsW: w,
        boundsH: h,
        // Structural sheathing has to span across the framing, and T1-11 has
        // vertical grooves, so panels are never rotated.
        allowRotate: false,
      });
    }
  }
  return out;
}

function tileWall(
  config: ResolvedShedConfig,
  roof: RoofSolution,
  wall: WallSummary,
): PanelCut[] {
  const material: SheetMaterial = config.siding.material === 't1-11' ? 't1-11' : 'osb-7/16';
  const axis = wallAxis(wall.id, config.width, config.depth);
  const drop = config.siding.dropBelowFloor;
  const out: PanelCut[] = [];
  let i = 0;

  const topAt = (s: number): number => {
    const x = axis.origin[0] + axis.dir[0] * s;
    const y = axis.origin[1] + axis.dir[1] * s;
    return heightAt(roof.plane, x, y);
  };

  for (let s = 0; s < wall.length - 1e-6; s += SHEET_WIDTH_IN) {
    const w = Math.min(SHEET_WIDTH_IN, wall.length - s);
    const zLeft = topAt(s) + drop;
    const zRight = topAt(s + w) + drop;
    const tapered = Math.abs(zLeft - zRight) > 1e-6;

    // A tapered panel is a trapezoid; we nest its bounding box but keep the
    // true outline so the cut line can be drawn on the sheet layout.
    const outline: Pt2[] = tapered
      ? [
          [0, 0],
          [w, 0],
          [w, zRight],
          [0, zLeft],
        ]
      : rect(w, zLeft);

    const boundsH = Math.max(zLeft, zRight);
    // Tall walls need more than one 8 ft panel course.
    let covered = 0;
    while (covered < boundsH - 1e-6) {
      const courseH = Math.min(SHEET_HEIGHT_IN, boundsH - covered);
      out.push({
        id: `${wall.id}.siding.${i++}`,
        material,
        label: `${titleCase(wall.id)} wall siding ${w.toFixed(0)}" x ${courseH.toFixed(0)}"`,
        outline: covered === 0 && tapered && boundsH <= SHEET_HEIGHT_IN ? outline : rect(w, courseH),
        boundsW: w,
        boundsH: courseH,
        allowRotate: false,
      });
      covered += courseH;
    }
  }
  return out;
}

function rect(w: number, h: number): Pt2[] {
  return [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
