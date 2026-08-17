import { describe, expect, it } from 'vitest';
import {
  KERF_IN,
  SHEET_HEIGHT_IN,
  SHEET_WIDTH_IN,
  defaultShedConfig,
  feet,
  type CutPiece,
} from '@shedit/shared';
import { computePlan } from '../src/computePlan.js';
import { packLinear } from '../src/optimize/linear.js';
import { nestSheets } from '../src/optimize/sheets.js';

function piece(over: Partial<CutPiece> & { length: number; qty: number }): CutPiece {
  return {
    key: `k${over.length}x${over.qty}`,
    role: 'wall.stud',
    category: 'walls',
    label: 'test',
    size: '2x4',
    species: 'SPF',
    endA: { angleDeg: 0, kind: 'square' },
    endB: { angleDeg: 0, kind: 'square' },
    notches: [],
    memberIds: [],
    ...over,
  } as CutPiece;
}

describe('linear cutting stock', () => {
  it('never loses a piece', () => {
    const pieces = [
      piece({ length: 92.625, qty: 14 }),
      piece({ length: 45, qty: 9 }),
      piece({ length: 31.5, qty: 7 }),
    ];
    const plan = packLinear(pieces);

    const wanted = pieces.reduce((s, p) => s + p.qty, 0);
    const placed = plan.bars.reduce((s, b) => s + b.cuts.length, 0);
    expect(placed).toBe(wanted);
  });

  it('never overfills a stick, counting the kerf', () => {
    const plan = packLinear([
      piece({ length: 70, qty: 11 }),
      piece({ length: 26, qty: 13 }),
      piece({ length: 8.25, qty: 21 }),
    ]);

    for (const bar of plan.bars) {
      const consumed =
        bar.cuts.reduce((s, c) => s + c.length, 0) + Math.max(0, bar.cuts.length - 1) * KERF_IN;
      expect(consumed).toBeLessThanOrEqual(bar.stockLength + 1e-9);
    }
  });

  it('buys precut studs instead of cutting down long stock', () => {
    const plan = packLinear([piece({ length: 92.625, qty: 6 })]);
    expect(plan.bars).toHaveLength(6);
    for (const bar of plan.bars) {
      expect(bar.stockLength).toBeCloseTo(92.625, 6);
      expect(bar.waste).toBeCloseTo(0, 6);
    }
  });

  it('keeps pressure-treated and untreated stock on separate sticks', () => {
    const plan = packLinear([
      piece({ length: 40, qty: 2, species: 'PT', key: 'pt' }),
      piece({ length: 40, qty: 2, species: 'SPF', key: 'spf' }),
    ]);
    for (const bar of plan.bars) {
      const species = new Set(bar.cuts.map((c) => c.key));
      expect(species.size).toBe(1);
    }
  });

  it('is deterministic', () => {
    const pieces = [piece({ length: 63, qty: 8 }), piece({ length: 41.5, qty: 5 })];
    expect(JSON.stringify(packLinear(pieces))).toBe(JSON.stringify(packLinear(pieces)));
  });
});

describe('sheet nesting', () => {
  const plan = computePlan(defaultShedConfig());

  it('keeps every panel inside its sheet', () => {
    const nested = nestSheets(plan.panels);
    for (const sheet of nested.sheets) {
      for (const p of sheet.placed) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x + p.w).toBeLessThanOrEqual(SHEET_WIDTH_IN + 1e-6);
        expect(p.y + p.h).toBeLessThanOrEqual(SHEET_HEIGHT_IN + 1e-6);
      }
    }
  });

  it('never overlaps two panels on the same sheet', () => {
    const nested = nestSheets(plan.panels);
    for (const sheet of nested.sheets) {
      for (let i = 0; i < sheet.placed.length; i++) {
        for (let j = i + 1; j < sheet.placed.length; j++) {
          const a = sheet.placed[i]!;
          const b = sheet.placed[j]!;
          const disjoint =
            a.x + a.w <= b.x + 1e-9 ||
            b.x + b.w <= a.x + 1e-9 ||
            a.y + a.h <= b.y + 1e-9 ||
            b.y + b.h <= a.y + 1e-9;
          expect(disjoint).toBe(true);
        }
      }
    }
  });

  it('places every panel exactly once', () => {
    const nested = nestSheets(plan.panels);
    const placed = nested.sheets.flatMap((s) => s.placed.map((p) => p.panelId));
    expect(new Set(placed).size).toBe(plan.panels.length);
  });
});

describe('whole-plan invariants', () => {
  it('accounts for every member in the cut list', () => {
    const plan = computePlan(defaultShedConfig());
    const counted = plan.cutList.reduce((s, p) => s + p.qty, 0);
    expect(counted).toBe(plan.members.length);
    expect(plan.members.length).toBeGreaterThan(80);
  });

  it('produces no zero-length or negative cuts', () => {
    const plan = computePlan(defaultShedConfig());
    for (const m of plan.members) expect(m.cut.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same input', () => {
    const a = computePlan(defaultShedConfig());
    const b = computePlan(defaultShedConfig());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('reports a cost and sane statistics for a 10x12 lean-to', () => {
    const plan = computePlan(defaultShedConfig());
    expect(plan.stats.footprintSqFt).toBeCloseTo(120, 6);
    expect(plan.stats.roofSqFt).toBeGreaterThan(120);
    expect(plan.stats.boardFeet).toBeGreaterThan(0);
    expect(plan.stats.estimatedCost).toBeGreaterThan(0);
    expect(plan.stats.lumberWastePct).toBeLessThan(60);
  });

  it('covers a bigger shed without validation errors', () => {
    const plan = computePlan({
      ...defaultShedConfig(),
      width: feet(12),
      depth: feet(20),
      wallHeights: { front: feet(10), back: feet(8), left: feet(8), right: feet(8) },
      framing: { rafterSize: '2x8' },
      openings: [],
    });
    expect(plan.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});
