import type { Member, PlanResult, Pt3 } from '@shedit/shared';

/**
 * Every framing member as an oriented box, ready for instanced rendering.
 * Birdsmouths and bevels are deliberately not modelled in 3D — they would cost
 * a CSG dependency and teach the viewer nothing the cut list doesn't already
 * say more precisely.
 */
export interface Solid {
  id: string;
  role: Member['role'];
  category: Member['category'];
  /** Centre of the box in world space. */
  position: Pt3;
  /** Box dimensions along local x (section width), y (section height), z (length). */
  size: Pt3;
  /** Column-major 3x3 basis: [right, up, forward(dir)]. */
  basis: [Pt3, Pt3, Pt3];
}

export function toSolids(plan: PlanResult): Solid[] {
  return plan.members.map((m) => {
    const dir = m.placement.dir;
    const up = m.placement.up;
    const right = cross(dir, up);

    const half = m.cut.length / 2;
    const position: Pt3 = [
      m.placement.origin[0] + dir[0] * half,
      m.placement.origin[1] + dir[1] * half,
      m.placement.origin[2] + dir[2] * half,
    ];

    return {
      id: m.id,
      role: m.role,
      category: m.category,
      position,
      size: [m.placement.sectionW, m.placement.sectionH, m.cut.length] as Pt3,
      basis: [right, up, dir] as [Pt3, Pt3, Pt3],
    };
  });
}

function cross(a: Pt3, b: Pt3): Pt3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
