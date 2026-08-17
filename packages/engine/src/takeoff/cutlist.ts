import {
  roundToFraction,
  type CutPiece,
  type EndCut,
  type Member,
  type Notch,
} from '@shedit/shared';

/**
 * Cut lengths round to the nearest 1/16" HERE, at the boundary, and the
 * optimizer consumes the rounded values. That way the packing matches the
 * numbers actually printed on the cut list — no drift between plan and paper.
 */
export function buildCutList(members: Member[]): CutPiece[] {
  const byKey = new Map<string, CutPiece>();

  for (const m of members) {
    const length = roundToFraction(m.cut.length, 16);
    const key = [
      m.role,
      m.size,
      m.species,
      length.toFixed(4),
      endKey(m.cut.endA),
      endKey(m.cut.endB),
      m.cut.notches.map(notchKey).join('|'),
    ].join('/');

    const existing = byKey.get(key);
    if (existing) {
      existing.qty += 1;
      existing.memberIds.push(m.id);
      continue;
    }

    byKey.set(key, {
      key,
      role: m.role,
      category: m.category,
      label: m.label,
      size: m.size,
      species: m.species,
      length,
      endA: m.cut.endA,
      endB: m.cut.endB,
      notches: m.cut.notches,
      qty: 1,
      memberIds: [m.id],
    });
  }

  // Stable, deterministic ordering: golden tests and the PDF both depend on it.
  return [...byKey.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.role.localeCompare(b.role) ||
      b.length - a.length ||
      a.key.localeCompare(b.key),
  );
}

function endKey(e: EndCut): string {
  return `${e.kind}:${e.angleDeg.toFixed(2)}`;
}

function notchKey(n: Notch): string {
  return `${n.kind}:${n.fromEnd}:${n.distance.toFixed(2)}:${n.seatDepth.toFixed(2)}`;
}
