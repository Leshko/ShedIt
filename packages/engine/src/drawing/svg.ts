import type { DrawEntity, DrawStyle, Drawing, Pt2 } from '@shedit/shared';

/**
 * Renders the drawing IR to SVG. The important rule here: geometry is in model
 * space (inches) and scales with the drawing, but text and arrowheads are in
 * paper space and must NOT scale. Getting that backwards is the classic
 * CAD-export bug where labels turn into billboards on a large sheet.
 */

export interface SvgOptions {
  /** Rendered width in px; height follows from the drawing's aspect ratio. */
  widthPx?: number;
  padding?: number;
  monochrome?: boolean;
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

const WIDTH_PX: Record<string, number> = { thin: 0.8, medium: 1.4, thick: 2.2 };

export interface SvgResult {
  svg: string;
  widthPx: number;
  heightPx: number;
}

export function renderDrawingToSvg(drawing: Drawing, options: SvgOptions = {}): SvgResult {
  const padding = options.padding ?? 12;
  const targetW = options.widthPx ?? 900;

  const min = drawing.bounds.min;
  const max = drawing.bounds.max;
  const modelW = Math.max(1, max[0] - min[0]);
  const modelH = Math.max(1, max[1] - min[1]);

  const scale = (targetW - padding * 2) / modelW;
  const heightPx = modelH * scale + padding * 2;

  // Model Y is up; SVG Y is down.
  const X = (x: number) => padding + (x - min[0]) * scale;
  const Y = (y: number) => heightPx - padding - (y - min[1]) * scale;

  const parts: string[] = [];
  for (const entity of drawing.entities) {
    parts.push(renderEntity(entity, X, Y, scale, options.monochrome ?? false));
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${targetW.toFixed(1)} ${heightPx.toFixed(1)}"`,
    ` width="100%" role="img" aria-label="${escapeXml(drawing.title)}">`,
    `<title>${escapeXml(drawing.title)}</title>`,
    parts.join(''),
    `</svg>`,
  ].join('');

  return { svg, widthPx: targetW, heightPx };
}

function renderEntity(
  e: DrawEntity,
  X: (n: number) => number,
  Y: (n: number) => number,
  scale: number,
  mono: boolean,
): string {
  const color = (s: DrawStyle) => (mono ? '#111827' : (STROKE[s.layer] ?? '#111827'));
  const width = (s: DrawStyle) => WIDTH_PX[s.weight ?? 'thin'] ?? 0.8;
  const dash = (s: DrawStyle) => (s.dash === 'dashed' ? ' stroke-dasharray="4 3"' : '');

  switch (e.t) {
    case 'line':
      return `<line x1="${X(e.a[0]).toFixed(2)}" y1="${Y(e.a[1]).toFixed(2)}" x2="${X(e.b[0]).toFixed(2)}" y2="${Y(e.b[1]).toFixed(2)}" stroke="${color(e.s)}" stroke-width="${width(e.s)}"${dash(e.s)}/>`;

    case 'polyline': {
      const pts = e.pts.map((p: Pt2) => `${X(p[0]).toFixed(2)},${Y(p[1]).toFixed(2)}`).join(' ');
      const fill = e.s.fill ?? (e.closed ? 'rgba(148,163,184,0.18)' : 'none');
      return e.closed
        ? `<polygon points="${pts}" fill="${fill}" stroke="${color(e.s)}" stroke-width="${width(e.s)}"${dash(e.s)}/>`
        : `<polyline points="${pts}" fill="none" stroke="${color(e.s)}" stroke-width="${width(e.s)}"${dash(e.s)}/>`;
    }

    case 'text': {
      // Paper-space size: text height is in model inches but clamped so it
      // stays readable regardless of how far the drawing is zoomed out.
      const px = Math.max(8, Math.min(16, e.h * scale));
      const rot = e.rot ? ` transform="rotate(${-e.rot} ${X(e.at[0]).toFixed(2)} ${Y(e.at[1]).toFixed(2)})"` : '';
      return `<text x="${X(e.at[0]).toFixed(2)}" y="${Y(e.at[1]).toFixed(2)}" font-size="${px.toFixed(1)}" font-family="ui-sans-serif, system-ui, sans-serif" fill="${color(e.s)}" text-anchor="${anchorOf(e.anchor)}" dominant-baseline="middle"${rot}>${escapeXml(e.text)}</text>`;
    }

    case 'dim':
      return renderDim(e, X, Y, scale, color(e.s));
  }
}

function renderDim(
  e: Extract<DrawEntity, { t: 'dim' }>,
  X: (n: number) => number,
  Y: (n: number) => number,
  scale: number,
  color: string,
): string {
  const dx = e.b[0] - e.a[0];
  const dy = e.b[1] - e.a[1];
  const len = Math.hypot(dx, dy) || 1;
  // Offset perpendicular to the measured span.
  const ox = (-dy / len) * e.offset;
  const oy = (dx / len) * e.offset;

  const a: Pt2 = [e.a[0] + ox, e.a[1] + oy];
  const b: Pt2 = [e.b[0] + ox, e.b[1] + oy];
  const midX = X((a[0] + b[0]) / 2);
  const midY = Y((a[1] + b[1]) / 2);
  const fontPx = 11;

  const tick = (p: Pt2) =>
    `<circle cx="${X(p[0]).toFixed(2)}" cy="${Y(p[1]).toFixed(2)}" r="2" fill="${color}"/>`;

  return [
    `<line x1="${X(e.a[0]).toFixed(2)}" y1="${Y(e.a[1]).toFixed(2)}" x2="${X(a[0]).toFixed(2)}" y2="${Y(a[1]).toFixed(2)}" stroke="${color}" stroke-width="0.5" stroke-dasharray="2 2"/>`,
    `<line x1="${X(e.b[0]).toFixed(2)}" y1="${Y(e.b[1]).toFixed(2)}" x2="${X(b[0]).toFixed(2)}" y2="${Y(b[1]).toFixed(2)}" stroke="${color}" stroke-width="0.5" stroke-dasharray="2 2"/>`,
    `<line x1="${X(a[0]).toFixed(2)}" y1="${Y(a[1]).toFixed(2)}" x2="${X(b[0]).toFixed(2)}" y2="${Y(b[1]).toFixed(2)}" stroke="${color}" stroke-width="0.9"/>`,
    tick(a),
    tick(b),
    `<text x="${midX.toFixed(2)}" y="${(midY - 5).toFixed(2)}" font-size="${fontPx}" font-family="ui-sans-serif, system-ui, sans-serif" fill="${color}" text-anchor="middle">${escapeXml(e.text ?? '')}</text>`,
  ].join('');
  void scale;
}

function anchorOf(a: 'start' | 'middle' | 'end'): string {
  return a === 'middle' ? 'middle' : a === 'end' ? 'end' : 'start';
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
