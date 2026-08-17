'use client';

import { useMemo } from 'react';
import { renderDrawingToSvg } from '@shedit/engine';
import type { Drawing } from '@shedit/shared';

/**
 * The web view and the PDF are rendered from the same DrawingIR by two
 * renderers, so the printed plans cannot drift from what is on screen.
 */
export function DrawingView({ drawing, width = 900 }: { drawing: Drawing; width?: number }) {
  const svg = useMemo(() => renderDrawingToSvg(drawing, { widthPx: width }).svg, [drawing, width]);

  return (
    <div className="drawing-card">
      <h3>{drawing.title}</h3>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

export function DrawingList({ drawings }: { drawings: Drawing[] }) {
  if (!drawings.length) return <Empty />;
  return (
    <>
      {drawings.map((d) => (
        <DrawingView key={d.id} drawing={d} />
      ))}
    </>
  );
}

function Empty() {
  return <p style={{ color: 'var(--muted)' }}>No drawings for this view yet.</p>;
}
