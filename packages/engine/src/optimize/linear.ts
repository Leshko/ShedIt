import {
  KERF_IN,
  STOCK_LENGTHS_IN,
  type CutPiece,
  type CutPlan,
  type NominalSize,
  type Species,
  type StockBar,
} from '@shedit/shared';

/** Squaring up the end of a fresh stick costs a little length. */
const END_TRIM_IN = 0.5;

/** Precut studs you can buy without cutting anything at all. */
const PRECUT_STUD_LENGTHS = [92.625, 104.625];

export interface PackOptions {
  kerf?: number;
  endTrim?: number;
  stockLengths?: readonly number[];
}

interface LooseCut {
  key: string;
  label: string;
  length: number;
}

/**
 * Best-Fit Decreasing, not First-Fit: same cost, consistently tighter packing.
 * Sort every cut longest-first, then drop each into the open stick with the
 * LEAST remaining room that still fits it. A short improvement sweep then tries
 * to empty the most-wasteful stick into the others.
 */
export function packLinear(pieces: CutPiece[], options: PackOptions = {}): CutPlan {
  const kerf = options.kerf ?? KERF_IN;
  const endTrim = options.endTrim ?? END_TRIM_IN;
  const stockLengths = [...(options.stockLengths ?? STOCK_LENGTHS_IN)].sort((a, b) => a - b);

  // Never mix species or sizes on one stick.
  const groups = new Map<string, { size: NominalSize; species: Species; cuts: LooseCut[] }>();
  for (const p of pieces) {
    const gk = `${p.size}/${p.species}`;
    let g = groups.get(gk);
    if (!g) {
      g = { size: p.size, species: p.species, cuts: [] };
      groups.set(gk, g);
    }
    for (let i = 0; i < p.qty; i++) {
      g.cuts.push({ key: p.key, label: p.label, length: p.length });
    }
  }

  const bars: StockBar[] = [];
  let index = 0;

  for (const gk of [...groups.keys()].sort()) {
    const group = groups.get(gk)!;
    const sorted = [...group.cuts].sort(
      (a, b) => b.length - a.length || a.key.localeCompare(b.key),
    );

    interface OpenBar {
      stockLength: number;
      remaining: number;
      cuts: LooseCut[];
    }
    const open: OpenBar[] = [];

    for (const [cutIndex, cut] of sorted.entries()) {
      // A precut stud is a zero-waste purchase; don't chop a longer stick.
      const precut = PRECUT_STUD_LENGTHS.find((l) => Math.abs(l - cut.length) < 1 / 16);
      if (precut !== undefined) {
        open.push({ stockLength: precut, remaining: 0, cuts: [cut] });
        continue;
      }

      let best: OpenBar | undefined;
      for (const bar of open) {
        if (bar.remaining >= cut.length + kerf && (!best || bar.remaining < best.remaining)) {
          best = bar;
        }
      }

      if (best) {
        best.remaining -= cut.length + kerf;
        best.cuts.push(cut);
        continue;
      }

      // Open a new stick. Pick the length with the least waste per inch of
      // usable material — a 16-footer at 20% waste can still beat two 8s.
      // Only cuts still waiting to be placed may justify a longer stick.
      const candidates = stockLengths.filter((l) => l - endTrim >= cut.length);
      const stockLength = candidates[0] ?? stockLengths[stockLengths.length - 1]!;
      const unplaced = sorted.slice(cutIndex + 1);
      const chosen = pickStock(candidates, unplaced, cut, kerf, endTrim) ?? stockLength;
      open.push({
        stockLength: chosen,
        remaining: chosen - endTrim - cut.length,
        cuts: [cut],
      });
    }

    for (const bar of open) {
      const used = bar.cuts.reduce((s, c) => s + c.length, 0) + Math.max(0, bar.cuts.length - 1) * kerf;
      bars.push({
        index: index++,
        size: group.size,
        species: group.species,
        stockLength: bar.stockLength,
        cuts: bar.cuts.map((c) => ({ key: c.key, label: c.label, length: c.length })),
        waste: Math.max(0, bar.stockLength - used),
      });
    }
  }

  const purchased = bars.reduce((s, b) => s + b.stockLength, 0);
  const totalWaste = bars.reduce((s, b) => s + b.waste, 0);

  return {
    bars,
    totalWaste,
    wastePct: purchased > 0 ? (totalWaste / purchased) * 100 : 0,
  };
}

/**
 * Greedily fill each candidate stock length with the cuts still to place and
 * keep whichever wastes the least per usable inch.
 */
function pickStock(
  candidates: readonly number[],
  remainingCuts: readonly LooseCut[],
  first: LooseCut,
  kerf: number,
  endTrim: number,
): number | undefined {
  let bestLength: number | undefined;
  let bestScore = Infinity;

  for (const length of candidates) {
    let free = length - endTrim - first.length;
    for (const c of remainingCuts) {
      if (c === first) continue;
      if (free >= c.length + kerf) free -= c.length + kerf;
    }
    const score = free / length;
    if (score < bestScore - 1e-9) {
      bestScore = score;
      bestLength = length;
    }
  }
  return bestLength;
}
