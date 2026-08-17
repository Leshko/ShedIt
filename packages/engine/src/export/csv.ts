import { formatFeetInches, type PlanResult } from '@shedit/shared';

/** The cut list as CSV, in the order it appears on screen and in the PDF. */
export function toCsv(plan: PlanResult): string {
  const header = [
    'Category',
    'Member',
    'Size',
    'Species',
    'Qty',
    'Length',
    'Length (in)',
    'End A',
    'End B',
    'Notches',
  ];

  const rows = plan.cutList.map((p) => [
    p.category,
    p.label,
    p.size,
    p.species,
    String(p.qty),
    formatFeetInches(p.length),
    p.length.toFixed(4),
    p.endA.kind === 'square' ? 'square' : `${p.endA.kind} ${p.endA.angleDeg.toFixed(1)}°`,
    p.endB.kind === 'square' ? 'square' : `${p.endB.kind} ${p.endB.angleDeg.toFixed(1)}°`,
    p.notches.map((n) => `${n.kind} @ ${formatFeetInches(n.distance)}`).join('; '),
  ]);

  return [header, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n');
}

function escapeCsv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
