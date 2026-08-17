import { describe, expect, it } from 'vitest';
import { defaultShedConfig, feet, shedConfigSchema } from '@shedit/shared';
import { deriveRoof, heightAt } from '../src/geometry/roof.js';

const base = (over: Record<string, unknown> = {}) =>
  shedConfigSchema.parse({
    ...defaultShedConfig(),
    openings: [],
    ...over,
  });

describe('roof classification from per-wall heights', () => {
  it('treats four equal heights as a flat roof', () => {
    const { solution, issues } = deriveRoof(
      base({ wallHeights: { front: 96, back: 96, left: 96, right: 96 } }),
    );
    expect(solution.mode).toBe('flat');
    expect(solution.plane).toEqual({ a: 0, b: 0, c: 96 });
    // A dead-flat roof does not drain, and we should say so.
    expect(issues.map((i) => i.code)).toContain('W_LOW_SLOPE_DRAINAGE');
  });

  it('derives a front-to-back lean-to and rakes the side walls', () => {
    const config = base({
      width: feet(10),
      depth: feet(12),
      wallHeights: { front: feet(9), back: feet(7), left: feet(7), right: feet(7) },
    });
    const { solution } = deriveRoof(config);

    expect(solution.mode).toBe('skillion-depth');
    expect(solution.wallKinds).toEqual({
      front: 'square',
      back: 'square',
      left: 'rake',
      right: 'rake',
    });
    // Falls 24" over 144" of depth => 2 in 12.
    expect(solution.pitchPer12).toBeCloseTo(2, 6);
    expect(solution.rafterAxis).toBe('y');
    expect(heightAt(solution.plane, 0, 0)).toBeCloseTo(feet(9), 6);
    expect(heightAt(solution.plane, 0, feet(12))).toBeCloseTo(feet(7), 6);
  });

  it('derives a left-to-right lean-to and rakes the front and back', () => {
    const { solution } = deriveRoof(
      base({
        width: feet(10),
        depth: feet(12),
        wallHeights: { front: feet(8), back: feet(8), left: feet(8), right: feet(10) },
      }),
    );
    expect(solution.mode).toBe('skillion-width');
    expect(solution.wallKinds.front).toBe('rake');
    expect(solution.wallKinds.left).toBe('square');
    expect(solution.rafterAxis).toBe('x');
    // Rises 24" across the 120" width => 2.4 in 12.
    expect(solution.pitchPer12).toBeCloseTo(2.4, 6);
  });

  it('rejects a warped roof and offers three ways out', () => {
    const { solution, issues } = deriveRoof(
      base({
        wallHeights: { front: feet(9), back: feet(7), left: feet(8), right: feet(10) },
      }),
    );

    const warped = issues.find((i) => i.code === 'E_WARPED_ROOF');
    expect(warped).toBeDefined();
    expect(warped!.severity).toBe('error');
    expect(warped!.fixes).toHaveLength(3);
    // It still returns something renderable so the viewer never blanks.
    expect(solution.mode).not.toBe('flat');
  });

  it('flags level-but-mismatched pairs rather than silently picking one', () => {
    const { issues } = deriveRoof(
      base({ wallHeights: { front: 96, back: 96, left: 108, right: 108 } }),
    );
    expect(issues.map((i) => i.code)).toContain('E_FLAT_HEIGHT_MISMATCH');
  });

  it('notes that rake wall heights are derived, not entered', () => {
    const { issues } = deriveRoof(
      base({ wallHeights: { front: feet(9), back: feet(7), left: feet(7), right: feet(7) } }),
    );
    const note = issues.find((i) => i.code === 'N_DERIVED_RAKE_HEIGHT');
    expect(note?.severity).toBe('notice');
    expect(note?.message).toMatch(/7'/);
    expect(note?.message).toMatch(/9'/);
  });
});

describe('corner-height mode', () => {
  it('always yields a valid plane, including a diagonal one', () => {
    const { solution, issues } = deriveRoof(
      base({
        heightMode: 'corners',
        cornerHeights: { frontLeft: feet(7), frontRight: feet(8), backLeft: feet(9) },
      }),
    );

    expect(issues.some((i) => i.severity === 'error')).toBe(false);
    expect(solution.mode).toBe('diagonal');
    // The fourth corner is forced by the other three: fr + bl - fl.
    expect(solution.cornerHeights.backRight).toBeCloseTo(feet(8) + feet(9) - feet(7), 6);
  });

  it('reproduces the three corners it was given', () => {
    const config = base({
      width: feet(10),
      depth: feet(12),
      heightMode: 'corners',
      cornerHeights: { frontLeft: 84, frontRight: 96, backLeft: 108 },
    });
    const { solution } = deriveRoof(config);
    expect(solution.cornerHeights.frontLeft).toBeCloseTo(84, 6);
    expect(solution.cornerHeights.frontRight).toBeCloseTo(96, 6);
    expect(solution.cornerHeights.backLeft).toBeCloseTo(108, 6);
  });
});

describe('gable roofs', () => {
  it('requires level plates and computes the ridge from the pitch', () => {
    const { solution, issues } = deriveRoof(
      base({
        width: feet(10),
        depth: feet(12),
        wallHeights: { front: 96, back: 96, left: 96, right: 96 },
        roof: { style: 'gable', ridgeAxis: 'width', gablePitch: 4 },
      }),
    );
    expect(issues.some((i) => i.code === 'E_GABLE_HEIGHT_MISMATCH')).toBe(false);
    expect(solution.mode).toBe('gable-width');
    // Ridge sits half the depth in, rising 4 in 12.
    expect(solution.ridgeHeight).toBeCloseTo(96 + (feet(12) / 2) * (4 / 12), 6);
    expect(solution.wallKinds.left).toBe('gableEnd');
  });

  it('errors when a gable is asked for over unequal walls', () => {
    const { issues } = deriveRoof(
      base({
        wallHeights: { front: feet(9), back: feet(7), left: feet(7), right: feet(7) },
        roof: { style: 'gable' },
      }),
    );
    expect(issues.map((i) => i.code)).toContain('E_GABLE_HEIGHT_MISMATCH');
  });
});
