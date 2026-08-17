import {
  SHEET_LABELS,
  type BomLine,
  type CutPlan,
  type NominalSize,
  type ResolvedShedConfig,
  type RoofSolution,
  type SheetPlan,
  type Species,
} from '@shedit/shared';

/**
 * Indicative unit prices in USD. These are a starting point, not a quote —
 * the UI lets you override them, and every heuristic line is tagged so you can
 * see which numbers are counted and which are estimated.
 */
const LUMBER_PRICE: Record<string, number> = {
  '2x4/SPF/96': 4.2,
  '2x4/SPF/120': 5.6,
  '2x4/SPF/144': 7.1,
  '2x4/SPF/192': 10.4,
  '2x4/PT/96': 7.0,
  '2x6/SPF/96': 7.4,
  '2x6/SPF/120': 9.6,
  '2x6/SPF/144': 11.8,
  '2x6/SPF/192': 16.5,
  '2x6/PT/96': 11.2,
  '2x6/PT/120': 14.0,
  '2x6/PT/144': 17.2,
  '2x6/PT/192': 23.5,
  '2x8/SPF/144': 18.9,
  '2x8/PT/144': 26.4,
  '2x10/SPF/144': 25.5,
  '2x12/SPF/144': 33.0,
  '4x4/PT/144': 22.0,
  '4x6/PT/144': 38.0,
};

const SHEET_PRICE: Record<string, number> = {
  'osb-7/16': 18.5,
  'plywood-1/2': 32.0,
  'plywood-3/4-tg': 52.0,
  't1-11': 58.0,
};

function lumberPrice(size: NominalSize, species: Species, length: number): number | undefined {
  return (
    LUMBER_PRICE[`${size}/${species}/${length}`] ??
    LUMBER_PRICE[`${size}/${species}/144`] ??
    LUMBER_PRICE[`${size}/SPF/144`]
  );
}

export function buildBom(
  config: ResolvedShedConfig,
  roof: RoofSolution,
  cutPlan: CutPlan,
  sheetPlan: SheetPlan,
): BomLine[] {
  const lines: BomLine[] = [];

  /* ------------------------------------------------ counted from the plan */

  const lumber = new Map<string, { size: NominalSize; species: Species; length: number; qty: number }>();
  for (const bar of cutPlan.bars) {
    const key = `${bar.size}/${bar.species}/${bar.stockLength}`;
    const entry = lumber.get(key) ?? {
      size: bar.size,
      species: bar.species,
      length: bar.stockLength,
      qty: 0,
    };
    entry.qty += 1;
    lumber.set(key, entry);
  }

  for (const key of [...lumber.keys()].sort()) {
    const e = lumber.get(key)!;
    const unitPrice = lumberPrice(e.size, e.species, e.length);
    lines.push({
      sku: key,
      description: `${e.size} ${e.species === 'PT' ? 'pressure-treated' : 'SPF'} — ${(e.length / 12).toFixed(0)} ft`,
      category: 'walls',
      qty: e.qty,
      unit: 'each',
      unitPrice,
      extended: unitPrice ? round2(unitPrice * e.qty) : undefined,
      derivedFrom: 'cutPlan',
    });
  }

  for (const material of Object.keys(sheetPlan.countByMaterial).sort()) {
    const qty = sheetPlan.countByMaterial[material]!;
    const unitPrice = SHEET_PRICE[material];
    lines.push({
      sku: material,
      description: `${SHEET_LABELS[material as keyof typeof SHEET_LABELS] ?? material} — 4x8 sheet`,
      category: 'siding',
      qty,
      unit: 'sheet',
      unitPrice,
      extended: unitPrice ? round2(unitPrice * qty) : undefined,
      derivedFrom: 'sheetPlan',
    });
  }

  /* ----------------------------------------------------------- estimated */

  const roofSqFt = roof.roofAreaSqFt;
  const perimeterFt = ((config.width + config.depth) * 2) / 12;

  const est = (
    sku: string,
    description: string,
    category: BomLine['category'],
    qty: number,
    unit: BomLine['unit'],
    unitPrice: number,
  ) => {
    const q = Math.ceil(qty);
    lines.push({
      sku,
      description,
      category,
      qty: q,
      unit,
      unitPrice,
      extended: round2(unitPrice * q),
      derivedFrom: 'heuristic',
    });
  };

  // Roofing at 10% waste; a "square" covers 100 sq ft.
  if (config.roof.covering === 'asphalt-shingle') {
    est('shingles', 'Architectural shingles (bundle, 33 sq ft)', 'roofing', (roofSqFt * 1.1) / 33, 'each', 38);
    est('felt', 'Roofing underlayment (roll, 400 sq ft)', 'roofing', roofSqFt / 400, 'roll', 28);
  } else {
    est('metal-panel', 'Metal roofing panel (3 ft wide)', 'roofing', (roofSqFt * 1.1) / 3 / (config.depth / 12), 'each', 32);
  }
  est('drip-edge', 'Drip edge (10 ft)', 'roofing', perimeterFt / 10, 'each', 12);
  est('housewrap', 'House wrap (roll, 195 sq ft)', 'siding', (perimeterFt * 9) / 195, 'roll', 42);

  est('nails-framing', 'Framing nails 3-1/4" (5 lb box)', 'fasteners', Math.max(1, cutPlan.bars.length / 60), 'box', 24);
  est('nails-sheathing', 'Sheathing nails 2-3/8" (5 lb box)', 'fasteners', Math.max(1, sheetPlan.sheets.length / 20), 'box', 22);
  est('screws-siding', 'Siding screws (1 lb box)', 'fasteners', Math.max(1, perimeterFt / 40), 'box', 16);
  est('hurricane-ties', 'Rafter hurricane ties', 'hardware', 0, 'each', 1.1);
  est('hinges', 'Strap hinges (pair)', 'hardware', config.openings.filter((o) => o.kind === 'door').length * 1.5, 'each', 14);
  est('hasp', 'Hasp and latch', 'hardware', config.openings.filter((o) => o.kind === 'door').length, 'each', 11);

  return lines.filter((l) => l.qty > 0);
}

export function totalCost(bom: BomLine[]): number {
  return round2(bom.reduce((s, l) => s + (l.extended ?? 0), 0));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
