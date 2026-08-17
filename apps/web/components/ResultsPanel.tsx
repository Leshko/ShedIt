'use client';

import { Fragment, useState } from 'react';
import { formatFeetInches, type CutPiece, type PlanResult } from '@shedit/shared';
import { useShedStore } from '../lib/store';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function ResultsPanel({ plan }: { plan: PlanResult }) {
  const [view, setView] = useState<'cuts' | 'buy'>('cuts');

  return (
    <div>
      <Stats plan={plan} />
      <ExportButtons />

      <div className="tabs" style={{ padding: 0, marginBottom: 10 }}>
        <button className={view === 'cuts' ? 'active' : ''} onClick={() => setView('cuts')}>
          Cut list
        </button>
        <button className={view === 'buy' ? 'active' : ''} onClick={() => setView('buy')}>
          Shopping list
        </button>
      </div>

      {view === 'cuts' ? <CutListTable plan={plan} /> : <ShoppingTable plan={plan} />}

      <p className="disclaimer">
        ShedIt produces estimating drawings, not engineered plans. Check local building codes,
        permit thresholds, setbacks, frost depth and wind or snow loading before you build.
      </p>
    </div>
  );
}

function Stats({ plan }: { plan: PlanResult }) {
  const s = plan.stats;
  return (
    <div className="stats">
      <Stat k="Footprint" v={`${s.footprintSqFt.toFixed(0)} sq ft`} />
      <Stat k="Roof area" v={`${s.roofSqFt.toFixed(0)} sq ft`} />
      <Stat k="Roof pitch" v={`${plan.roof.pitchPer12.toFixed(2)} in 12`} />
      <Stat k="Members" v={String(s.memberCount)} />
      <Stat k="Lumber waste" v={`${s.lumberWastePct.toFixed(1)}%`} />
      <Stat k="Estimated cost" v={s.estimatedCost ? `$${s.estimatedCost.toFixed(0)}` : '—'} />
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function ExportButtons() {
  const config = useShedStore((s) => s.config);
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (kind: 'pdf' | 'csv' | 'json') => {
    setBusy(kind);
    try {
      const res = await fetch(`${API}/api/exports/${kind}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug(config.name)}${kind === 'csv' ? '-cutlist' : kind === 'pdf' ? '-plans' : ''}.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="exports">
      <button className="primary" onClick={() => download('pdf')} disabled={busy !== null}>
        {busy === 'pdf' ? 'Building…' : 'PDF plans'}
      </button>
      <button onClick={() => download('csv')} disabled={busy !== null}>
        CSV
      </button>
      <button onClick={() => download('json')} disabled={busy !== null}>
        JSON
      </button>
    </div>
  );
}

function CutListTable({ plan }: { plan: PlanResult }) {
  const groups = new Map<string, CutPiece[]>();
  for (const p of plan.cutList) {
    const list = groups.get(p.category) ?? [];
    list.push(p);
    groups.set(p.category, list);
  }

  return (
    <table>
      <thead>
        <tr>
          <th className="num">Qty</th>
          <th>Member</th>
          <th>Size</th>
          <th>Length</th>
          <th>Cuts</th>
        </tr>
      </thead>
      <tbody>
        {[...groups.entries()].map(([category, pieces]) => (
          <Fragment key={category}>
            <tr className="group">
              <td colSpan={5}>{category}</td>
            </tr>
            {pieces.map((p) => (
              <tr key={p.key}>
                <td className="num">{p.qty}</td>
                <td>{p.label}</td>
                <td>
                  {p.size}
                  {p.species === 'PT' ? ' PT' : ''}
                </td>
                <td className="num">{formatFeetInches(p.length)}</td>
                <td style={{ color: 'var(--muted)' }}>{cutSummary(p)}</td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

function cutSummary(p: CutPiece): string {
  const parts: string[] = [];
  if (p.endA.kind !== 'square') parts.push(`${p.endA.kind} ${p.endA.angleDeg.toFixed(1)}°`);
  if (p.endB.kind !== 'square' && p.endB.kind !== p.endA.kind)
    parts.push(`${p.endB.kind} ${p.endB.angleDeg.toFixed(1)}°`);
  else if (p.endB.kind !== 'square' && parts.length === 0)
    parts.push(`${p.endB.kind} ${p.endB.angleDeg.toFixed(1)}°`);
  if (p.notches.length) parts.push(`birdsmouth ×${p.notches.length}`);
  return parts.join(', ') || 'square';
}

function ShoppingTable({ plan }: { plan: PlanResult }) {
  return (
    <table>
      <thead>
        <tr>
          <th className="num">Qty</th>
          <th>Item</th>
          <th className="num">Total</th>
        </tr>
      </thead>
      <tbody>
        {plan.bom.map((b) => (
          <tr key={b.sku}>
            <td className="num">{b.qty}</td>
            <td>
              {b.description}
              {b.derivedFrom === 'heuristic' && (
                <span style={{ color: 'var(--muted)', fontSize: 11 }}> · estimated</span>
              )}
            </td>
            <td className="num">{b.extended ? `$${b.extended.toFixed(2)}` : '—'}</td>
          </tr>
        ))}
        <tr>
          <td />
          <td style={{ fontWeight: 600 }}>Total (estimate)</td>
          <td className="num" style={{ fontWeight: 600 }}>
            ${(plan.stats.estimatedCost ?? 0).toFixed(2)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'shed'
  );
}
