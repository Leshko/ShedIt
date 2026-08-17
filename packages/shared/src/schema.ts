import { z } from 'zod';
import { NOMINAL_SIZES } from './lumber.js';
import { feet } from './units.js';

export const WALL_IDS = ['front', 'back', 'left', 'right'] as const;
export type WallId = (typeof WALL_IDS)[number];

/** The two walls that face each other along the depth axis, and along the width axis. */
export const WALL_PAIRS = {
  depth: ['front', 'back'] as const,
  width: ['left', 'right'] as const,
};

export const wallIdSchema = z.enum(WALL_IDS);
export const nominalSizeSchema = z.enum(NOMINAL_SIZES);

export const openingSchema = z.object({
  id: z.string().min(1),
  wall: wallIdSchema,
  kind: z.enum(['door', 'window']),
  /** Distance in inches from the wall's left edge (viewed from outside) to the rough opening. */
  offset: z.number().min(0).max(feet(60)),
  width: z.number().min(12).max(feet(16)),
  height: z.number().min(12).max(feet(12)),
  /** Height of the rough sill above the subfloor. Doors use 0. */
  sill: z.number().min(0).max(feet(10)).default(0),
});

export type Opening = z.infer<typeof openingSchema>;

export const wallHeightsSchema = z.object({
  front: z.number().min(feet(4)).max(feet(16)),
  back: z.number().min(feet(4)).max(feet(16)),
  left: z.number().min(feet(4)).max(feet(16)),
  right: z.number().min(feet(4)).max(feet(16)),
});

export type WallHeights = z.infer<typeof wallHeightsSchema>;

/**
 * Corner heights are the escape hatch. Four level top plates plus one roof
 * plane is over-determined, so some combinations of wall heights describe a
 * warped surface that cannot be framed. Corner entry takes three heights and
 * derives the fourth, which is exactly the three degrees of freedom a plane
 * has — it can never be invalid.
 */
export const cornerHeightsSchema = z.object({
  frontLeft: z.number().min(feet(4)).max(feet(16)),
  frontRight: z.number().min(feet(4)).max(feet(16)),
  backLeft: z.number().min(feet(4)).max(feet(16)),
});

export type CornerHeights = z.infer<typeof cornerHeightsSchema>;

export const shedConfigSchema = z.object({
  name: z.string().min(1).max(120).default('My Shed'),

  /** Exterior footprint in inches, measured to the outside of the framing. */
  width: z.number().min(feet(4)).max(feet(40)),
  depth: z.number().min(feet(4)).max(feet(40)),

  /**
   * `walls` is the intuitive mode: one height per wall. `corners` is the
   * escape hatch for roof planes that per-wall heights cannot express.
   */
  heightMode: z.enum(['walls', 'corners']).default('walls'),

  /**
   * Top-plate height at each wall, measured from the top of the floor deck to
   * the top of the uppermost top plate. Setting opposite walls to different
   * heights is what produces a lean-to; the perpendicular pair then becomes
   * rake walls whose heights are derived rather than entered.
   */
  wallHeights: wallHeightsSchema,

  /** Used instead of `wallHeights` when `heightMode` is `corners`. */
  cornerHeights: cornerHeightsSchema.optional(),

  roof: z.object({
    /**
     * `auto` derives the roof form from the wall heights. `gable` forces a
     * ridge (requires all four heights equal). `flat` forces a level roof.
     */
    style: z.enum(['auto', 'flat', 'gable']).default('auto'),
    /** Which axis the ridge runs along; only meaningful for a gable roof. */
    ridgeAxis: z.enum(['width', 'depth']).default('width'),
    /** Gable pitch in rise-per-12. Ignored for skillion roofs (slope is derived). */
    gablePitch: z.number().min(1).max(12).default(4),
    /** Overhang past the eave walls, in inches. */
    overhangEave: z.number().min(0).max(36).default(12),
    /** Overhang past the rake/gable walls, in inches. */
    overhangRake: z.number().min(0).max(36).default(6),
    covering: z.enum(['asphalt-shingle', 'metal-panel']).default('asphalt-shingle'),
  }),

  framing: z.object({
    studSpacing: z.union([z.literal(16), z.literal(24)]).default(16),
    studSize: z.enum(['2x4', '2x6']).default('2x4'),
    joistSpacing: z.union([z.literal(12), z.literal(16), z.literal(24)]).default(16),
    joistSize: z.enum(['2x6', '2x8']).default('2x6'),
    rafterSize: z.enum(['2x6', '2x8']).default('2x6'),
    rafterSpacing: z.union([z.literal(16), z.literal(24)]).default(24),
    doubleTopPlate: z.boolean().default(true),
  }),

  foundation: z.object({
    type: z.enum(['skid', 'pier']).default('skid'),
    skidSize: z.enum(['4x4', '4x6']).default('4x6'),
  }),

  siding: z.object({
    material: z.enum(['t1-11', 'lap']).default('t1-11'),
    /** Distance the siding hangs below the floor framing, in inches. */
    dropBelowFloor: z.number().min(0).max(12).default(3),
  }),

  openings: z.array(openingSchema).max(20).default([]),
});

export type ShedConfig = z.input<typeof shedConfigSchema>;
export type ResolvedShedConfig = z.output<typeof shedConfigSchema>;

/** A sensible 10x12 lean-to that exercises every part of the engine. */
export function defaultShedConfig(): ResolvedShedConfig {
  return shedConfigSchema.parse({
    name: 'Backyard Lean-To',
    width: feet(10),
    depth: feet(12),
    wallHeights: {
      front: feet(9),
      back: feet(7),
      left: feet(7),
      right: feet(7),
    },
    roof: { style: 'auto' },
    framing: {},
    foundation: {},
    siding: {},
    openings: [
      {
        id: 'door-1',
        wall: 'front',
        kind: 'door',
        offset: 36,
        width: 36,
        height: 80,
        sill: 0,
      },
      {
        id: 'window-1',
        wall: 'left',
        kind: 'window',
        offset: 48,
        width: 36,
        height: 30,
        sill: 42,
      },
    ],
  });
}
