import type { NominalSize, SheetMaterial } from './lumber.js';
import type { Issue } from './issues.js';
import type { WallId } from './schema.js';

/**
 * A `Member` is the atom of the whole system. The 3D viewer, the 2D drawings,
 * the cut list and the shopping list are all projections of one `Member[]`, so
 * nothing downstream ever re-derives geometry.
 */

export type Pt2 = [number, number];
export type Pt3 = [number, number, number];

export type MemberCategory =
  | 'foundation'
  | 'floor'
  | 'walls'
  | 'roof'
  | 'siding'
  | 'trim';

export type MemberRole =
  | 'foundation.skid'
  | 'floor.rim'
  | 'floor.joist'
  | 'wall.bottomPlate'
  | 'wall.topPlate'
  | 'wall.stud'
  | 'wall.rakeStud'
  | 'wall.cornerPost'
  | 'wall.king'
  | 'wall.jack'
  | 'wall.header'
  | 'wall.cripple'
  | 'wall.sillPlate'
  | 'roof.rafter'
  | 'roof.ridge'
  | 'roof.blocking'
  | 'trim.fascia';

export type Species = 'SPF' | 'PT';

export interface EndCut {
  /** 0 for a square cut. */
  angleDeg: number;
  kind: 'square' | 'miter' | 'bevel';
}

export interface Notch {
  kind: 'birdsmouth';
  fromEnd: 'a' | 'b';
  distance: number;
  seatDepth: number;
  heelPlumb: number;
}

/** Enough to place an oriented box in the 3D scene. */
export interface Placement {
  origin: Pt3;
  /** Unit vector from end A to end B. */
  dir: Pt3;
  /** Unit vector orienting the section. */
  up: Pt3;
  sectionW: number;
  sectionH: number;
}

export interface Member {
  /** Deterministic and structural, e.g. `left.rakeStud.7`. */
  id: string;
  role: MemberRole;
  category: MemberCategory;
  label: string;
  size: NominalSize;
  species: Species;
  cut: {
    /** Long-point length in inches. */
    length: number;
    endA: EndCut;
    endB: EndCut;
    notches: Notch[];
  };
  placement: Placement;
  wall?: WallId;
  openingId?: string;
}

/** Identical members collapsed into one row. */
export interface CutPiece {
  key: string;
  role: MemberRole;
  category: MemberCategory;
  label: string;
  size: NominalSize;
  species: Species;
  length: number;
  endA: EndCut;
  endB: EndCut;
  notches: Notch[];
  qty: number;
  memberIds: string[];
}

export interface StockBar {
  index: number;
  size: NominalSize;
  species: Species;
  stockLength: number;
  cuts: { key: string; label: string; length: number }[];
  waste: number;
}

export interface CutPlan {
  bars: StockBar[];
  totalWaste: number;
  wastePct: number;
}

export interface PanelCut {
  id: string;
  material: SheetMaterial;
  label: string;
  /** True outline in panel space; may be a trapezoid on a rake wall. */
  outline: Pt2[];
  boundsW: number;
  boundsH: number;
  allowRotate: boolean;
}

export interface NestedPanel {
  panelId: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  outline: Pt2[];
}

export interface SheetPlan {
  sheets: {
    index: number;
    material: SheetMaterial;
    placed: NestedPanel[];
    wastePct: number;
  }[];
  countByMaterial: Record<string, number>;
}

export interface BomLine {
  sku: string;
  description: string;
  category: MemberCategory | 'fasteners' | 'hardware' | 'roofing';
  qty: number;
  unit: 'each' | 'sheet' | 'box' | 'roll' | 'sqft';
  unitPrice?: number;
  extended?: number;
  derivedFrom: 'cutPlan' | 'sheetPlan' | 'heuristic';
}

export type RoofMode =
  | 'flat'
  | 'skillion-depth'
  | 'skillion-width'
  | 'diagonal'
  | 'gable-width'
  | 'gable-depth';

export type WallKind = 'square' | 'rake' | 'gableEnd';

/** The roof plane, z = a*x + b*y + c, in inches. */
export interface RoofPlane {
  a: number;
  b: number;
  c: number;
}

export interface RoofSolution {
  mode: RoofMode;
  plane: RoofPlane;
  /** Slope of the rafter run, as rise per 12 of run. */
  pitchPer12: number;
  slopeAngleDeg: number;
  /** Axis the rafters run along. */
  rafterAxis: 'x' | 'y';
  wallKinds: Record<WallId, WallKind>;
  cornerHeights: {
    frontLeft: number;
    frontRight: number;
    backLeft: number;
    backRight: number;
  };
  ridgeHeight?: number;
  roofAreaSqFt: number;
}

export interface RafterGeometry {
  angleDeg: number;
  pitchPer12: number;
  plumbCutDeg: number;
  seatCutDeg: number;
  run: number;
  rise: number;
  lineLength: number;
  overallLength: number;
  hap: number;
  count: number;
}

export interface WallSummary {
  id: WallId;
  kind: WallKind;
  length: number;
  loadBearing: boolean;
  lowHeight: number;
  highHeight: number;
  slopeAngleDeg: number;
  studCount: number;
}

export interface PlanStats {
  footprintSqFt: number;
  wallSqFt: number;
  roofSqFt: number;
  memberCount: number;
  boardFeet: number;
  lumberWastePct: number;
  estimatedCost?: number;
}

export interface PlanResult {
  engineVersion: string;
  issues: Issue[];
  roof: RoofSolution;
  rafter: RafterGeometry;
  walls: WallSummary[];
  members: Member[];
  cutList: CutPiece[];
  cutPlan: CutPlan;
  panels: PanelCut[];
  sheetPlan: SheetPlan;
  bom: BomLine[];
  stats: PlanStats;
  drawings: DrawingSet;
}

/* ---------------------------------------------------------------- drawings */

export type LayerId =
  | 'framing'
  | 'sheathing'
  | 'outline'
  | 'dim'
  | 'text'
  | 'hidden'
  | 'symbol';

export interface DrawStyle {
  layer: LayerId;
  weight?: 'thin' | 'medium' | 'thick';
  dash?: 'solid' | 'dashed';
  fill?: string;
}

export type DrawEntity =
  | { t: 'line'; a: Pt2; b: Pt2; s: DrawStyle }
  | { t: 'polyline'; pts: Pt2[]; closed?: boolean; s: DrawStyle }
  | {
      t: 'text';
      at: Pt2;
      text: string;
      h: number;
      anchor: 'start' | 'middle' | 'end';
      rot?: number;
      s: DrawStyle;
    }
  | { t: 'dim'; a: Pt2; b: Pt2; offset: number; text?: string; s: DrawStyle };

export interface Drawing {
  id: string;
  title: string;
  /** Model-space bounds in inches; the renderer fits these to paper. */
  bounds: { min: Pt2; max: Pt2 };
  entities: DrawEntity[];
}

export interface DrawingSet {
  sheets: Drawing[];
}
