'use client';

import { WALL_IDS, formatFeetInches, type WallId, type WallKind } from '@shedit/shared';
import { useShedStore } from '../lib/store';

/**
 * The headline control. Each wall gets its own height field — until the roof
 * makes that impossible. When one pair of opposite walls is set to different
 * heights, the perpendicular pair becomes a rake wall whose height follows the
 * roof plane, so its input turns into a read-only "low to high" readout.
 */
export function WallHeightsPanel() {
  const config = useShedStore((s) => s.config);
  const plan = useShedStore((s) => s.plan);
  const setWallHeight = useShedStore((s) => s.setWallHeight);
  const patch = useShedStore((s) => s.patch);

  const kinds = plan?.roof.wallKinds;
  const corners = config.heightMode === 'corners';

  return (
    <div className="section">
      <h2>Wall heights</h2>

      {!corners &&
        WALL_IDS.map((id) => {
          const kind: WallKind = kinds?.[id] ?? 'square';
          const summary = plan?.walls.find((w) => w.id === id);
          return (
            <div key={id} className={`wall-card ${kind === 'rake' ? 'rake' : kind === 'gableEnd' ? 'gable' : ''}`}>
              <div className="head">
                <span className="name">{cap(id)} wall</span>
                {kind === 'rake' && <span className="badge rake">sloped</span>}
                {kind === 'gableEnd' && <span className="badge gable">gable end</span>}
                {kind === 'square' && <span className="badge">level</span>}
              </div>

              {kind === 'rake' && summary ? (
                <>
                  <div className="derived">
                    {formatFeetInches(summary.lowHeight)} → {formatFeetInches(summary.highHeight)}
                  </div>
                  <div className="hint">
                    Follows the roof at {summary.slopeAngleDeg.toFixed(1)}°. Set by the{' '}
                    {id === 'left' || id === 'right' ? 'front and back' : 'left and right'} walls.
                  </div>
                </>
              ) : (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor={`h-${id}`}>Height</label>
                  <InchesInput
                    id={`h-${id}`}
                    value={config.wallHeights[id]}
                    onChange={(v) => setWallHeight(id, v)}
                  />
                </div>
              )}
            </div>
          );
        })}

      {corners && config.cornerHeights && (
        <>
          {(['frontLeft', 'frontRight', 'backLeft'] as const).map((corner) => (
            <div className="field" key={corner}>
              <label htmlFor={`c-${corner}`}>{splitCamel(corner)}</label>
              <InchesInput
                id={`c-${corner}`}
                value={config.cornerHeights![corner]}
                onChange={(v) => patch(`cornerHeights.${corner}`, v)}
              />
            </div>
          ))}
          <div className="wall-card rake">
            <div className="head">
              <span className="name">Back right</span>
              <span className="badge rake">derived</span>
            </div>
            <div className="derived">
              {plan ? formatFeetInches(plan.roof.cornerHeights.backRight) : '—'}
            </div>
            <div className="hint">
              Three corners fix a plane, so the fourth is forced. That is why this mode can never
              produce an unbuildable roof.
            </div>
          </div>
        </>
      )}

      <button
        className="link"
        style={{ paddingLeft: 0 }}
        onClick={() =>
          corners
            ? patch('heightMode', 'walls')
            : useShedStore.getState().applyFix([
                { path: 'heightMode', value: 'corners' },
                {
                  path: 'cornerHeights',
                  value: plan
                    ? {
                        frontLeft: plan.roof.cornerHeights.frontLeft,
                        frontRight: plan.roof.cornerHeights.frontRight,
                        backLeft: plan.roof.cornerHeights.backLeft,
                      }
                    : {
                        frontLeft: config.wallHeights.front,
                        frontRight: config.wallHeights.front,
                        backLeft: config.wallHeights.back,
                      },
                },
              ])
        }
      >
        {corners ? '← Back to per-wall heights' : 'Switch to corner heights →'}
      </button>
    </div>
  );
}

/** Height entry in feet and inches, stored as decimal inches. */
function InchesInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (inches: number) => void;
}) {
  const ft = Math.floor(value / 12);
  const inch = Math.round((value - ft * 12) * 100) / 100;

  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <input
        id={id}
        type="number"
        value={ft}
        min={4}
        max={16}
        step={1}
        style={{ width: 52 }}
        onChange={(e) => onChange(Number(e.target.value) * 12 + inch)}
        aria-label="feet"
      />
      <span style={{ color: 'var(--muted)', fontSize: 12 }}>ft</span>
      <input
        type="number"
        value={inch}
        min={0}
        max={11.75}
        step={0.25}
        style={{ width: 58 }}
        onChange={(e) => onChange(ft * 12 + Number(e.target.value))}
        aria-label="inches"
      />
      <span style={{ color: 'var(--muted)', fontSize: 12 }}>in</span>
    </span>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function splitCamel(s: string): string {
  const out = s.replace(/([A-Z])/g, ' $1');
  return out.charAt(0).toUpperCase() + out.slice(1).toLowerCase();
}

export { InchesInput };
export type { WallId };
