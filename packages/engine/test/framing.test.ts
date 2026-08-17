import { describe, expect, it } from 'vitest';
import { defaultShedConfig, feet, shedConfigSchema, type Member } from '@shedit/shared';
import { computePlan } from '../src/computePlan.js';
import { deriveRoof, heightAt } from '../src/geometry/roof.js';
import { buildWall } from '../src/geometry/wall.js';

/** An 8x10 lean-to: 7 ft at the back, 9 ft at the front. */
const leanTo = shedConfigSchema.parse({
  ...defaultShedConfig(),
  width: feet(8),
  depth: feet(10),
  wallHeights: { front: feet(9), back: feet(7), left: feet(7), right: feet(7) },
  openings: [],
});

function wallMembers(id: 'front' | 'back' | 'left' | 'right', config = leanTo): Member[] {
  const { solution } = deriveRoof(config);
  return buildWall({ config, roof: solution, id }).members;
}

describe('rake wall framing', () => {
  it('steps stud lengths linearly from the low end to the high end', () => {
    const studs = wallMembers('left')
      .filter((m) => m.role === 'wall.rakeStud')
      .map((m) => ({
        s: m.placement.origin[1],
        length: m.cut.length,
      }))
      // The left wall runs from high y to low y, so sort by height.
      .sort((a, b) => a.length - b.length);

    expect(studs.length).toBeGreaterThan(5);

    // Consecutive on-centre studs differ by spacing * slope. The slope is
    // 24" over 120" of depth, and studs are 16" apart => 3.2" per step.
    const middle = studs.slice(1, -1);
    for (let i = 1; i < middle.length; i++) {
      const step = middle[i]!.length - middle[i - 1]!.length;
      expect(step).toBeCloseTo(16 * (24 / 120), 4);
    }
  });

  it('bevels the top of every rake stud at the roof angle', () => {
    const studs = wallMembers('left').filter((m) => m.role === 'wall.rakeStud');
    const expected = (Math.atan(24 / 120) * 180) / Math.PI;
    for (const s of studs) {
      expect(s.cut.endA.kind).toBe('square');
      expect(s.cut.endB.kind).toBe('bevel');
      expect(s.cut.endB.angleDeg).toBeCloseTo(expected, 6);
    }
  });

  it('makes the raked top plate longer than the wall run and miters both ends', () => {
    const plates = wallMembers('left').filter((m) => m.role === 'wall.topPlate');
    const theta = Math.atan(24 / 120);
    const run = feet(10) - 2 * 1.5; // left/right walls tuck between front and back

    expect(plates.length).toBe(2); // doubled top plate
    for (const p of plates) {
      expect(p.cut.length).toBeCloseTo(run / Math.cos(theta), 6);
      expect(p.cut.length).toBeGreaterThan(run);
      expect(p.cut.endA.kind).toBe('miter');
      expect(p.cut.endB.angleDeg).toBeCloseTo((theta * 180) / Math.PI, 6);
    }
  });

  it('places the raked top plate on the slope, not flat at the low end', () => {
    const plates = wallMembers('left').filter((m) => m.role === 'wall.topPlate');
    const slope = 24 / 120;

    for (const p of plates) {
      // The direction must carry the rise; a flat placement would leave the
      // plate hanging below the studs it is supposed to cap.
      const [dx, dy, dz] = p.placement.dir;
      expect(Math.abs(dz)).toBeGreaterThan(0);
      expect(Math.hypot(dx, dy, dz)).toBeCloseTo(1, 9);
      expect(Math.abs(dz) / Math.hypot(dx, dy)).toBeCloseTo(slope, 6);

      // End B must land at the high end, one plate stack below the roof plane.
      const endZ = p.placement.origin[2] + dz * p.cut.length;
      expect(endZ).toBeGreaterThan(p.placement.origin[2]);

      // The section stays square to the slope.
      const dot =
        p.placement.dir[0] * p.placement.up[0] +
        p.placement.dir[1] * p.placement.up[1] +
        p.placement.dir[2] * p.placement.up[2];
      expect(dot).toBeCloseTo(0, 9);
    }
  });

  it('tops every rake stud out exactly under the plate stack', () => {
    const { solution } = deriveRoof(leanTo);
    const members = wallMembers('left');
    const slope = 24 / 120;
    const theta = Math.atan(slope);
    // Two 1.5" plates, measured plumb through a sloped stack.
    const plumbStack = (2 * 1.5) / Math.cos(theta);

    const studs = members.filter((m) => m.role === 'wall.rakeStud');
    expect(studs.length).toBeGreaterThan(5);

    for (const stud of studs) {
      const [x, y] = stud.placement.origin;
      const roofZ = heightAt(solution.plane, x, y);
      // Short point = start + long point less the bevel run across the stud.
      const shortPoint = stud.placement.origin[2] + stud.cut.length - slope * 1.5;
      expect(shortPoint).toBeCloseTo(roofZ - plumbStack, 4);
    }
  });

  it('seats the plate stack against the roof plane', () => {
    const { solution } = deriveRoof(leanTo);
    const plates = wallMembers('left').filter((m) => m.role === 'wall.topPlate');
    const theta = Math.atan(24 / 120);

    plates.forEach((p, i) => {
      const [x, y] = p.placement.origin;
      const roofZ = heightAt(solution.plane, x, y);
      // Ply i's section centre sits (i*1.5 + 0.75) perpendicular below the
      // roof plane, which is that over cos(theta) measured plumb.
      const expected = roofZ - (i * 1.5 + 0.75) / Math.cos(theta);
      expect(p.placement.origin[2]).toBeCloseTo(expected, 6);
    });
  });

  it('keeps the square walls square', () => {
    for (const id of ['front', 'back'] as const) {
      const members = wallMembers(id);
      expect(members.some((m) => m.role === 'wall.rakeStud')).toBe(false);
      const studs = members.filter((m) => m.role === 'wall.stud');
      const lengths = new Set(studs.map((s) => s.cut.length.toFixed(4)));
      // Every stud in a square wall is the same length.
      expect(lengths.size).toBe(1);
      for (const s of studs) expect(s.cut.endB.kind).toBe('square');
    }
  });

  it('cuts front wall studs to the plate height less the plates', () => {
    const studs = wallMembers('front').filter((m) => m.role === 'wall.stud');
    // 9 ft wall, 1.5" bottom plate + two 1.5" top plates.
    expect(studs[0]!.cut.length).toBeCloseTo(feet(9) - 1.5 - 3, 6);
  });
});

describe('openings', () => {
  const withDoor = shedConfigSchema.parse({
    ...defaultShedConfig(),
    width: feet(8),
    depth: feet(10),
    wallHeights: { front: feet(9), back: feet(7), left: feet(7), right: feet(7) },
    openings: [
      { id: 'd1', wall: 'front', kind: 'door', offset: 24, width: 36, height: 80, sill: 0 },
    ],
  });

  it('frames a door with jacks, kings and a two-ply header', () => {
    const members = wallMembers('front', withDoor).filter((m) => m.openingId === 'd1');
    const roles = members.map((m) => m.role);

    expect(roles.filter((r) => r === 'wall.jack')).toHaveLength(2);
    expect(roles.filter((r) => r === 'wall.king')).toHaveLength(2);
    expect(roles.filter((r) => r === 'wall.header')).toHaveLength(2);

    const jack = members.find((m) => m.role === 'wall.jack')!;
    expect(jack.cut.length).toBeCloseTo(80 - 1.5, 6);

    const header = members.find((m) => m.role === 'wall.header')!;
    // Rough opening plus one jack thickness each side.
    expect(header.cut.length).toBeCloseTo(36 + 3, 6);
    expect(header.size).toBe('2x6');
  });

  it('gives every cripple over a rake-wall header its own length and angle', () => {
    const config = shedConfigSchema.parse({
      ...defaultShedConfig(),
      width: feet(8),
      depth: feet(10),
      wallHeights: { front: feet(9), back: feet(7), left: feet(7), right: feet(7) },
      openings: [
        { id: 'w1', wall: 'left', kind: 'window', offset: 30, width: 36, height: 24, sill: 40 },
      ],
    });
    const cripples = wallMembers('left', config).filter(
      (m) => m.openingId === 'w1' && m.label.includes('above header'),
    );

    expect(cripples.length).toBeGreaterThan(0);
    const lengths = new Set(cripples.map((c) => c.cut.length.toFixed(4)));
    // On a sloping wall no two cripples are alike.
    expect(lengths.size).toBe(cripples.length);
    for (const c of cripples) expect(c.cut.endB.kind).toBe('bevel');
  });

  it('rejects an opening that will not fit under the low edge of a rake wall', () => {
    const plan = computePlan({
      ...defaultShedConfig(),
      width: feet(8),
      depth: feet(10),
      wallHeights: { front: feet(9), back: feet(7), left: feet(7), right: feet(7) },
      openings: [
        { id: 'w1', wall: 'left', kind: 'window', offset: 12, width: 36, height: 78, sill: 12 },
      ],
    });
    const issue = plan.issues.find((i) => i.code === 'E_OPENING_TOO_TALL');
    expect(issue).toBeDefined();
    expect(issue!.message).toMatch(/low edge/);
  });

  it('catches two openings crowded together', () => {
    const plan = computePlan({
      ...defaultShedConfig(),
      openings: [
        { id: 'a', wall: 'front', kind: 'window', offset: 24, width: 36, height: 24, sill: 40 },
        { id: 'b', wall: 'front', kind: 'window', offset: 61, width: 36, height: 24, sill: 40 },
      ],
    });
    expect(plan.issues.map((i) => i.code)).toContain('E_OPENING_OVERLAP');
  });
});

describe('rafters', () => {
  it('derives cut angles straight from the roof plane', () => {
    const plan = computePlan(leanTo);
    const expectedDeg = (Math.atan(24 / 120) * 180) / Math.PI;

    expect(plan.rafter.pitchPer12).toBeCloseTo(2.4, 6);
    expect(plan.rafter.plumbCutDeg).toBeCloseTo(expectedDeg, 6);
    expect(plan.rafter.seatCutDeg).toBeCloseTo(90 - expectedDeg, 6);
    expect(plan.rafter.run).toBeCloseTo(feet(10), 6);
    expect(plan.rafter.rise).toBeCloseTo(24, 6);
    expect(plan.rafter.lineLength).toBeCloseTo(Math.hypot(feet(10), 24), 6);
  });

  it('birdsmouths a skillion rafter over both walls', () => {
    const plan = computePlan(leanTo);
    const rafter = plan.members.find((m) => m.role === 'roof.rafter')!;
    expect(rafter.cut.notches).toHaveLength(2);
    expect(rafter.cut.notches.map((n) => n.fromEnd).sort()).toEqual(['a', 'b']);
  });
});
