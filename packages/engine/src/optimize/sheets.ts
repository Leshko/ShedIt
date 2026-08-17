import {
  SHEET_HEIGHT_IN,
  SHEET_WIDTH_IN,
  type NestedPanel,
  type PanelCut,
  type SheetPlan,
} from '@shedit/shared';

/**
 * Shelf packing (next-fit decreasing height), chosen over denser algorithms
 * like maxrects for one decisive reason: a DIYer cuts sheets with a circular
 * saw and a straightedge, so every cut has to run edge to edge. Shelf packing
 * is guillotine-cuttable by construction — rip the sheet into bands, then
 * crosscut each band. Maxrects packs tighter but produces layouts nobody can
 * actually cut by hand.
 */
export function nestSheets(panels: PanelCut[], kerf = 0.125): SheetPlan {
  const byMaterial = new Map<string, PanelCut[]>();
  for (const p of panels) {
    const list = byMaterial.get(p.material) ?? [];
    list.push(p);
    byMaterial.set(p.material, list);
  }

  const sheets: SheetPlan['sheets'] = [];
  const countByMaterial: Record<string, number> = {};
  let index = 0;

  for (const material of [...byMaterial.keys()].sort()) {
    const list = [...byMaterial.get(material)!].sort(
      (a, b) => b.boundsH - a.boundsH || b.boundsW - a.boundsW || a.id.localeCompare(b.id),
    );

    let placed: NestedPanel[] = [];
    let shelfY = 0;
    let shelfH = 0;
    let cursorX = 0;

    const flush = () => {
      if (placed.length === 0) return;
      const used = placed.reduce((s, p) => s + p.w * p.h, 0);
      const area = SHEET_WIDTH_IN * SHEET_HEIGHT_IN;
      sheets.push({
        index: index++,
        material: material as PanelCut['material'],
        placed,
        wastePct: ((area - used) / area) * 100,
      });
      countByMaterial[material] = (countByMaterial[material] ?? 0) + 1;
      placed = [];
      shelfY = 0;
      shelfH = 0;
      cursorX = 0;
    };

    for (const panel of list) {
      const w = Math.min(panel.boundsW, SHEET_WIDTH_IN);
      const h = Math.min(panel.boundsH, SHEET_HEIGHT_IN);

      // Does it fit on the current shelf?
      if (cursorX + w > SHEET_WIDTH_IN + 1e-6) {
        // Start a new shelf above this one.
        shelfY += shelfH + kerf;
        shelfH = 0;
        cursorX = 0;
      }
      if (shelfY + h > SHEET_HEIGHT_IN + 1e-6) {
        flush();
      }

      placed.push({
        panelId: panel.id,
        label: panel.label,
        x: cursorX,
        y: shelfY,
        w,
        h,
        outline: panel.outline,
      });
      cursorX += w + kerf;
      shelfH = Math.max(shelfH, h);
    }
    flush();
  }

  return { sheets, countByMaterial };
}
