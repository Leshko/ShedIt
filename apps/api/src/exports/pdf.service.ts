import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  SHEET_LABELS,
  formatFeetInches,
  type BomLine,
  type DrawEntity,
  type Drawing,
  type PlanResult,
  type Pt2,
  type ResolvedShedConfig,
} from '@shedit/shared';

const MARGIN = 48;
const PAGE: [number, number] = [792, 612]; // US Letter, landscape

type Doc = typeof PDFDocument.prototype;

/**
 * The plan book is drawn from the SAME DrawingIR the web UI renders to SVG.
 * That is deliberate: it makes "the PDF matches what I saw on screen" a
 * property of the architecture rather than something to keep in sync by hand.
 */
@Injectable()
export class PdfService {
  render(config: ResolvedShedConfig, plan: PlanResult): Promise<Buffer> {
    const doc = new PDFDocument({ size: PAGE, margin: MARGIN, autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    this.coverPage(doc, config, plan);
    this.specPage(doc, config, plan);
    for (const drawing of plan.drawings.sheets) this.drawingPage(doc, drawing);
    this.cutListPages(doc, plan);
    this.cutPlanPage(doc, plan);
    this.shoppingListPage(doc, plan);
    this.buildStepsPage(doc, config, plan);

    doc.end();
    return done;
  }

  /* ------------------------------------------------------------- pages */

  private coverPage(doc: Doc, config: ResolvedShedConfig, plan: PlanResult): void {
    doc.addPage();
    doc.fontSize(34).fillColor('#111827').text(config.name, MARGIN, 120);
    doc
      .fontSize(14)
      .fillColor('#4b5563')
      .text(
        `${formatFeetInches(config.width)} wide x ${formatFeetInches(config.depth)} deep — ` +
          `${roofLabel(plan)}`,
        MARGIN,
        170,
      );

    const rows: [string, string][] = [
      ['Footprint', `${plan.stats.footprintSqFt.toFixed(0)} sq ft`],
      ['Roof area', `${plan.stats.roofSqFt.toFixed(0)} sq ft`],
      ['Roof pitch', `${plan.roof.pitchPer12.toFixed(2)} in 12`],
      ['Framing members', String(plan.stats.memberCount)],
      ['Board feet', plan.stats.boardFeet.toFixed(0)],
      ['Lumber waste', `${plan.stats.lumberWastePct.toFixed(1)}%`],
      ['Estimated cost', plan.stats.estimatedCost ? `$${plan.stats.estimatedCost.toFixed(2)}` : '—'],
    ];

    let y = 230;
    for (const [k, v] of rows) {
      doc.fontSize(11).fillColor('#6b7280').text(k, MARGIN, y, { width: 160 });
      doc.fontSize(11).fillColor('#111827').text(v, MARGIN + 170, y);
      y += 22;
    }

    this.disclaimer(doc);
  }

  private specPage(doc: Doc, config: ResolvedShedConfig, plan: PlanResult): void {
    doc.addPage();
    this.heading(doc, 'Specification');

    let y = 110;
    const line = (k: string, v: string) => {
      doc.fontSize(10).fillColor('#6b7280').text(k, MARGIN, y, { width: 200 });
      doc.fontSize(10).fillColor('#111827').text(v, MARGIN + 210, y, { width: 480 });
      y += 18;
    };

    line('Roof form', roofLabel(plan));
    for (const wall of plan.walls) {
      line(
        `${cap(wall.id)} wall`,
        wall.kind === 'rake'
          ? `Sloped (rake) — ${formatFeetInches(wall.lowHeight)} rising to ${formatFeetInches(wall.highHeight)}, ` +
            `${wall.slopeAngleDeg.toFixed(1)}°, ${wall.studCount} studs`
          : `${cap(wall.kind)} — ${formatFeetInches(wall.highHeight)}, ${wall.studCount} studs`,
      );
    }
    line('Stud spacing', `${config.framing.studSpacing}" on centre, ${config.framing.studSize}`);
    line('Floor', `${config.framing.joistSize} joists at ${config.framing.joistSpacing}" o.c.`);
    line(
      'Rafters',
      `${config.framing.rafterSize} at ${config.framing.rafterSpacing}" o.c. — ` +
        `${plan.rafter.count} total, ${formatFeetInches(plan.rafter.overallLength)} long`,
    );
    line(
      'Rafter cuts',
      `Plumb cut ${plan.rafter.plumbCutDeg.toFixed(1)}°, seat cut ${plan.rafter.seatCutDeg.toFixed(1)}°, ` +
        `HAP ${formatFeetInches(plan.rafter.hap)}`,
    );
    line('Foundation', `${cap(config.foundation.type)} — ${config.foundation.skidSize} skids`);
    line('Siding', config.siding.material === 't1-11' ? 'T1-11 panel' : 'Lap siding');
    line('Roof covering', config.roof.covering === 'metal-panel' ? 'Metal panel' : 'Asphalt shingle');

    if (plan.issues.length) {
      y += 14;
      doc.fontSize(12).fillColor('#111827').text('Notes and warnings', MARGIN, y);
      y += 20;
      for (const issue of plan.issues) {
        const color =
          issue.severity === 'error' ? '#b91c1c' : issue.severity === 'warning' ? '#b45309' : '#2563eb';
        doc.fontSize(9).fillColor(color).text(issue.severity.toUpperCase(), MARGIN, y, { width: 60 });
        doc.fontSize(9).fillColor('#374151').text(issue.message, MARGIN + 65, y, { width: 620 });
        y += Math.max(16, doc.heightOfString(issue.message, { width: 620 }) + 6);
      }
    }
  }

  private drawingPage(doc: Doc, drawing: Drawing): void {
    doc.addPage();
    this.heading(doc, drawing.title);

    const availW = PAGE[0] - MARGIN * 2;
    const availH = PAGE[1] - MARGIN - 110;
    const modelW = Math.max(1, drawing.bounds.max[0] - drawing.bounds.min[0]);
    const modelH = Math.max(1, drawing.bounds.max[1] - drawing.bounds.min[1]);
    const scale = Math.min(availW / modelW, availH / modelH);

    const offsetX = MARGIN + (availW - modelW * scale) / 2;
    const offsetY = 100 + (availH - modelH * scale) / 2;

    // Model Y is up, PDF Y is down.
    const X = (x: number) => offsetX + (x - drawing.bounds.min[0]) * scale;
    const Y = (y: number) => offsetY + modelH * scale - (y - drawing.bounds.min[1]) * scale;

    for (const e of drawing.entities) this.entity(doc, e, X, Y);

    doc
      .fontSize(8)
      .fillColor('#9ca3af')
      .text(`Scale approximately 1" = ${(1 / scale).toFixed(1)}"`, MARGIN, PAGE[1] - MARGIN - 12, {
        lineBreak: false,
      });
  }

  private entity(doc: Doc, e: DrawEntity, X: (n: number) => number, Y: (n: number) => number): void {
    const stroke = STROKE[e.s.layer] ?? '#111827';
    const lw = WEIGHT[e.s.weight ?? 'thin'] ?? 0.5;

    switch (e.t) {
      case 'line':
        doc.save().lineWidth(lw).strokeColor(stroke);
        if (e.s.dash === 'dashed') doc.dash(3, { space: 2 });
        doc.moveTo(X(e.a[0]), Y(e.a[1])).lineTo(X(e.b[0]), Y(e.b[1])).stroke();
        doc.undash().restore();
        break;

      case 'polyline': {
        doc.save().lineWidth(lw).strokeColor(stroke);
        if (e.s.dash === 'dashed') doc.dash(3, { space: 2 });
        const pts = e.pts;
        if (pts.length) {
          doc.moveTo(X(pts[0]![0]), Y(pts[0]![1]));
          for (const p of pts.slice(1)) doc.lineTo(X(p[0]), Y(p[1]));
          if (e.closed) doc.closePath();
        }
        if (e.closed) doc.fillOpacity(0.12).fillAndStroke('#94a3b8', stroke);
        else doc.stroke();
        doc.undash().restore();
        break;
      }

      case 'text': {
        const size = Math.max(5, Math.min(11, e.h * 1.6));
        doc.fontSize(size).fillColor(stroke);
        const w = doc.widthOfString(e.text);
        const x = e.anchor === 'middle' ? X(e.at[0]) - w / 2 : e.anchor === 'end' ? X(e.at[0]) - w : X(e.at[0]);
        doc.text(e.text, x, Y(e.at[1]) - size / 2, { lineBreak: false });
        break;
      }

      case 'dim':
        this.dimension(doc, e, X, Y, stroke);
        break;
    }
  }

  private dimension(
    doc: Doc,
    e: Extract<DrawEntity, { t: 'dim' }>,
    X: (n: number) => number,
    Y: (n: number) => number,
    color: string,
  ): void {
    const dx = e.b[0] - e.a[0];
    const dy = e.b[1] - e.a[1];
    const len = Math.hypot(dx, dy) || 1;
    const ox = (-dy / len) * e.offset;
    const oy = (dx / len) * e.offset;
    const a: Pt2 = [e.a[0] + ox, e.a[1] + oy];
    const b: Pt2 = [e.b[0] + ox, e.b[1] + oy];

    doc.save().lineWidth(0.4).strokeColor(color).dash(2, { space: 2 });
    doc.moveTo(X(e.a[0]), Y(e.a[1])).lineTo(X(a[0]), Y(a[1])).stroke();
    doc.moveTo(X(e.b[0]), Y(e.b[1])).lineTo(X(b[0]), Y(b[1])).stroke();
    doc.undash();
    doc.lineWidth(0.7).moveTo(X(a[0]), Y(a[1])).lineTo(X(b[0]), Y(b[1])).stroke();
    doc.circle(X(a[0]), Y(a[1]), 1.4).fill(color);
    doc.circle(X(b[0]), Y(b[1]), 1.4).fill(color);
    doc.restore();

    if (e.text) {
      doc.fontSize(8).fillColor(color);
      const w = doc.widthOfString(e.text);
      doc.text(e.text, (X(a[0]) + X(b[0])) / 2 - w / 2, (Y(a[1]) + Y(b[1])) / 2 - 10, {
        lineBreak: false,
      });
    }
  }

  private cutListPages(doc: Doc, plan: PlanResult): void {
    const columns: Column[] = [
      { title: 'Qty', width: 40, align: 'right' },
      { title: 'Member', width: 240 },
      { title: 'Size', width: 55 },
      { title: 'Species', width: 55 },
      { title: 'Length', width: 90 },
      { title: 'End A', width: 80 },
      { title: 'End B', width: 80 },
      { title: 'Notes', width: 130 },
    ];

    const rows = plan.cutList.map((p) => [
      String(p.qty),
      p.label,
      p.size,
      p.species,
      formatFeetInches(p.length),
      cutLabel(p.endA),
      cutLabel(p.endB),
      p.notches.length ? `birdsmouth x${p.notches.length}` : '',
    ]);

    this.table(doc, 'Cut List', columns, rows);
  }

  private cutPlanPage(doc: Doc, plan: PlanResult): void {
    doc.addPage();
    this.heading(doc, 'Cutting Plan');
    doc
      .fontSize(9)
      .fillColor('#6b7280')
      .text(
        `${plan.cutPlan.bars.length} pieces of stock, ${plan.cutPlan.wastePct.toFixed(1)}% waste. ` +
          `Each bar below is one board — cut it left to right.`,
        MARGIN,
        96,
      );

    let y = 122;
    const barW = PAGE[0] - MARGIN * 2 - 130;

    for (const bar of plan.cutPlan.bars) {
      if (y > PAGE[1] - MARGIN - 30) {
        doc.addPage();
        this.heading(doc, 'Cutting Plan (continued)');
        y = 110;
      }

      doc
        .fontSize(8)
        .fillColor('#111827')
        .text(`${bar.size} ${bar.species} ${(bar.stockLength / 12).toFixed(0)}ft`, MARGIN, y + 3, {
          width: 120,
          lineBreak: false,
        });

      let x = MARGIN + 125;
      doc.save().lineWidth(0.5).strokeColor('#d1d5db').rect(x, y, barW, 14).stroke().restore();

      for (const cut of bar.cuts) {
        const w = (cut.length / bar.stockLength) * barW;
        doc.save();
        doc.rect(x, y, w, 14).fillOpacity(0.25).fill('#2563eb');
        doc.restore();
        doc.save().lineWidth(0.4).strokeColor('#1e40af').rect(x, y, w, 14).stroke().restore();
        if (w > 26) {
          doc.fontSize(6).fillColor('#1e3a8a');
          const t = formatFeetInches(cut.length);
          doc.text(t, x + 2, y + 4, { width: w - 3, lineBreak: false });
        }
        x += w;
      }
      y += 19;
    }
  }

  private shoppingListPage(doc: Doc, plan: PlanResult): void {
    const columns: Column[] = [
      { title: 'Qty', width: 45, align: 'right' },
      { title: 'Unit', width: 50 },
      { title: 'Item', width: 330 },
      { title: 'Source', width: 80 },
      { title: 'Unit price', width: 75, align: 'right' },
      { title: 'Total', width: 80, align: 'right' },
    ];

    const rows = plan.bom.map((b: BomLine) => [
      String(b.qty),
      b.unit,
      b.description,
      b.derivedFrom === 'heuristic' ? 'estimated' : 'counted',
      b.unitPrice ? `$${b.unitPrice.toFixed(2)}` : '—',
      b.extended ? `$${b.extended.toFixed(2)}` : '—',
    ]);

    rows.push([
      '',
      '',
      'TOTAL (estimate)',
      '',
      '',
      `$${(plan.stats.estimatedCost ?? 0).toFixed(2)}`,
    ]);

    this.table(doc, 'Shopping List', columns, rows);
    const noteY = Math.min(doc.y + 12, PAGE[1] - MARGIN - 34);
    doc
      .fontSize(8)
      .fillColor('#6b7280')
      .text(
        'Lines marked "counted" come from the cutting and sheet plans. Lines marked ' +
          '"estimated" use rules of thumb (nails per sheet, roofing at 10% waste) — check them ' +
          'against your own experience.',
        MARGIN,
        noteY,
        { width: PAGE[0] - MARGIN * 2, height: 30 },
      );
  }

  private buildStepsPage(doc: Doc, config: ResolvedShedConfig, plan: PlanResult): void {
    doc.addPage();
    this.heading(doc, 'Build Sequence');

    const rake = plan.walls.filter((w) => w.kind === 'rake');
    const steps: string[] = [
      `Level the site and set the ${config.foundation.skidSize} skids ${
        config.foundation.type === 'pier' ? 'on piers' : 'on a gravel pad'
      }, square to each other.`,
      `Build the floor: rim joists first, then ${config.framing.joistSize} joists at ` +
        `${config.framing.joistSpacing}" on centre. Check the diagonals before sheathing.`,
      `Glue and screw down the ${formatFeetInches(config.width)} x ${formatFeetInches(config.depth)} deck.`,
      `Frame the square walls flat on the deck — the ${plan.walls
        .filter((w) => w.kind === 'square')
        .map((w) => w.id)
        .join(' and ')} walls — then stand and brace them.`,
    ];

    if (rake.length) {
      steps.push(
        `Frame the ${rake.map((w) => w.id).join(' and ')} rake walls. Every stud is a different ` +
          `length and the top of each is bevelled ${rake[0]!.slopeAngleDeg.toFixed(1)}°. Lay them out ` +
          `from the low end and work up — the cut list gives each stud's long-point length.`,
        `Cut the sloping top plates ${formatFeetInches(
          plan.cutList.find((c) => c.role === 'wall.topPlate' && c.endA.kind === 'miter')?.length ?? 0,
        )} long with both ends mitered ${rake[0]!.slopeAngleDeg.toFixed(1)}°.`,
      );
    }

    steps.push(
      `Tie the walls together with the second top plate, lapping the corners.`,
      `Cut one rafter as a pattern: plumb cut ${plan.rafter.plumbCutDeg.toFixed(1)}° at each end, ` +
        `birdsmouth seat ${plan.rafter.seatCutDeg.toFixed(1)}°. Test-fit it before cutting the other ${
          plan.rafter.count - 1
        }.`,
      `Set the rafters at ${config.framing.rafterSpacing}" on centre and tie them down.`,
      `Sheath the roof, then run underlayment, drip edge and ${
        config.roof.covering === 'metal-panel' ? 'metal panels' : 'shingles'
      }.`,
      `Wrap the walls and hang the siding, holding it ${formatFeetInches(
        config.siding.dropBelowFloor,
      )} below the floor framing to shed water.`,
      `Hang the ${config.openings.filter((o) => o.kind === 'door').length} door(s) and ` +
        `${config.openings.filter((o) => o.kind === 'window').length} window(s), then trim and caulk.`,
    );

    let y = 100;
    steps.forEach((text, i) => {
      if (y > PAGE[1] - MARGIN - 40) {
        doc.addPage();
        this.heading(doc, 'Build Sequence (continued)');
        y = 100;
      }
      doc.fontSize(11).fillColor('#2563eb').text(`${i + 1}`, MARGIN, y, { width: 20 });
      doc.fontSize(10).fillColor('#111827').text(text, MARGIN + 24, y, { width: 640 });
      y += Math.max(22, doc.heightOfString(text, { width: 640 }) + 10);
    });

    this.disclaimer(doc);
  }

  /* ------------------------------------------------------------- helpers */

  private heading(doc: Doc, title: string): void {
    doc.fontSize(18).fillColor('#111827').text(title, MARGIN, 56);
    doc
      .save()
      .lineWidth(0.8)
      .strokeColor('#e5e7eb')
      .moveTo(MARGIN, 84)
      .lineTo(PAGE[0] - MARGIN, 84)
      .stroke()
      .restore();
  }

  private disclaimer(doc: Doc): void {
    // Keep this inside the bottom margin — pdfkit silently starts a new page
    // for any text that would overflow it.
    doc
      .fontSize(8)
      .fillColor('#9ca3af')
      .text(
        'ShedIt produces estimating drawings, not engineered plans. Check local building codes, ' +
          'permit thresholds, setbacks, frost depth and wind or snow loading before you build.',
        MARGIN,
        PAGE[1] - MARGIN - 22,
        { width: PAGE[0] - MARGIN * 2, height: 20 },
      );
  }

  private table(doc: Doc, title: string, columns: Column[], rows: string[][]): void {
    doc.addPage();
    this.heading(doc, title);
    let y = 100;

    const header = () => {
      let x = MARGIN;
      doc.fontSize(8).fillColor('#6b7280');
      for (const c of columns) {
        doc.text(c.title.toUpperCase(), x, y, { width: c.width, align: c.align ?? 'left', lineBreak: false });
        x += c.width;
      }
      y += 14;
      doc.save().lineWidth(0.6).strokeColor('#d1d5db').moveTo(MARGIN, y).lineTo(PAGE[0] - MARGIN, y).stroke().restore();
      y += 6;
    };

    header();

    for (const row of rows) {
      if (y > PAGE[1] - MARGIN - 20) {
        doc.addPage();
        this.heading(doc, `${title} (continued)`);
        y = 100;
        header();
      }
      let x = MARGIN;
      doc.fontSize(8.5).fillColor('#111827');
      for (const [i, c] of columns.entries()) {
        doc.text(row[i] ?? '', x, y, { width: c.width, align: c.align ?? 'left', lineBreak: false });
        x += c.width;
      }
      y += 15;
    }
    doc.y = y;
  }
}

interface Column {
  title: string;
  width: number;
  align?: 'left' | 'right';
}

const STROKE: Record<string, string> = {
  framing: '#4b5563',
  sheathing: '#9ca3af',
  outline: '#111827',
  dim: '#2563eb',
  text: '#111827',
  hidden: '#9ca3af',
  symbol: '#b45309',
};

const WEIGHT: Record<string, number> = { thin: 0.5, medium: 0.9, thick: 1.5 };

function cutLabel(e: { kind: string; angleDeg: number }): string {
  return e.kind === 'square' ? 'square' : `${e.kind} ${e.angleDeg.toFixed(1)}°`;
}

function roofLabel(plan: PlanResult): string {
  switch (plan.roof.mode) {
    case 'flat':
      return 'flat roof';
    case 'skillion-depth':
    case 'skillion-width':
      return `lean-to roof, ${plan.roof.pitchPer12.toFixed(2)} in 12`;
    case 'diagonal':
      return `single-plane roof falling diagonally, ${plan.roof.pitchPer12.toFixed(2)} in 12`;
    default:
      return `gable roof, ${plan.roof.pitchPer12.toFixed(2)} in 12`;
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export { SHEET_LABELS };
