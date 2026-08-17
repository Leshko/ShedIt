'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useShedStore } from '../lib/store';
import { Configurator } from '../components/Configurator';
import { ResultsPanel } from '../components/ResultsPanel';
import { DrawingList } from '../components/DrawingView';

// three.js has no business in the server bundle.
const Viewer3D = dynamic(() => import('../components/Viewer3D').then((m) => m.Viewer3D), {
  ssr: false,
  loading: () => <Placeholder text="Loading 3D view…" />,
});

type Tab = '3d' | 'plan' | 'elevations' | 'framing' | 'sheets';

const TABS: { id: Tab; label: string }[] = [
  { id: '3d', label: '3D' },
  { id: 'plan', label: 'Plan' },
  { id: 'elevations', label: 'Elevations' },
  { id: 'framing', label: 'Framing' },
  { id: 'sheets', label: 'Sheet layouts' },
];

export default function PlanPage() {
  const [tab, setTab] = useState<Tab>('3d');
  const plan = useShedStore((s) => s.plan);
  const lastGood = useShedStore((s) => s.lastGoodPlan);
  const computing = useShedStore((s) => s.computing);
  const compute = useShedStore((s) => s.compute);

  useEffect(() => {
    void compute();
  }, [compute]);

  // Keep showing the last valid plan while the current one has errors, so the
  // viewer never blanks out mid-edit.
  const shown = plan && !plan.issues.some((i) => i.severity === 'error') ? plan : lastGood;

  return (
    <div className="app">
      <header className="topbar">
        <h1>ShedIt</h1>
        <span className="sub">
          Every wall gets its own height — unequal walls become a lean-to automatically
        </span>
        <span className="spacer" />
        {computing && <span className="sub">calculating…</span>}
        {shown && (
          <span className="sub">
            {shown.roof.mode.replace('-', ' ')} · {shown.roof.pitchPer12.toFixed(2)} in 12
          </span>
        )}
      </header>

      <aside className="pane left">
        <Configurator />
      </aside>

      <main className="center">
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="tab-body">
          {!shown ? (
            <Placeholder text={computing ? 'Calculating…' : 'Waiting for the planner API…'} />
          ) : tab === '3d' ? (
            <Viewer3D plan={shown} />
          ) : (
            <DrawingList drawings={drawingsFor(shown, tab)} />
          )}
        </div>
      </main>

      <aside className="pane right">
        {shown ? <ResultsPanel plan={shown} /> : <Placeholder text="No plan yet." />}
      </aside>
    </div>
  );
}

function drawingsFor(plan: NonNullable<ReturnType<typeof useShedStore.getState>['plan']>, tab: Tab) {
  const all = plan.drawings.sheets;
  switch (tab) {
    case 'plan':
      return all.filter((d) => d.id === 'plan' || d.id === 'roof-framing');
    case 'elevations':
      return all.filter((d) => d.id.startsWith('elev-'));
    case 'framing':
      return all.filter((d) => d.id.startsWith('framing-'));
    case 'sheets':
      return all.filter((d) => d.id.startsWith('sheet-'));
    default:
      return [];
  }
}

function Placeholder({ text }: { text: string }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--muted)',
        minHeight: 300,
      }}
    >
      {text}
    </div>
  );
}
