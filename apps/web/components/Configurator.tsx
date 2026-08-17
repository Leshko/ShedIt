'use client';

import { WALL_IDS, type Opening } from '@shedit/shared';
import { useShedStore } from '../lib/store';
import { WallHeightsPanel, InchesInput } from './WallHeightsPanel';
import { IssueList } from './IssueList';

export function Configurator() {
  const config = useShedStore((s) => s.config);
  const patch = useShedStore((s) => s.patch);

  return (
    <div>
      <div className="section">
        <h2>Project</h2>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            value={config.name}
            onChange={(e) => patch('name', e.target.value)}
          />
        </div>
      </div>

      <div className="section">
        <h2>Footprint</h2>
        <div className="field">
          <label htmlFor="w">Width</label>
          <InchesInput id="w" value={config.width} onChange={(v) => patch('width', v)} />
        </div>
        <div className="field">
          <label htmlFor="d">Depth</label>
          <InchesInput id="d" value={config.depth} onChange={(v) => patch('depth', v)} />
        </div>
      </div>

      <WallHeightsPanel />
      <IssueList />

      <div className="section">
        <h2>Roof</h2>
        <div className="field">
          <label htmlFor="style">Style</label>
          <select
            id="style"
            value={config.roof.style}
            onChange={(e) => patch('roof.style', e.target.value)}
          >
            <option value="auto">Auto (from wall heights)</option>
            <option value="flat">Flat</option>
            <option value="gable">Gable</option>
          </select>
        </div>
        {config.roof.style === 'gable' && (
          <>
            <div className="field">
              <label htmlFor="ridge">Ridge runs along</label>
              <select
                id="ridge"
                value={config.roof.ridgeAxis}
                onChange={(e) => patch('roof.ridgeAxis', e.target.value)}
              >
                <option value="width">Width</option>
                <option value="depth">Depth</option>
              </select>
            </div>
            <NumberField
              label="Pitch (in 12)"
              value={config.roof.gablePitch}
              min={1}
              max={12}
              step={0.5}
              onChange={(v) => patch('roof.gablePitch', v)}
            />
          </>
        )}
        <NumberField
          label="Eave overhang (in)"
          value={config.roof.overhangEave}
          min={0}
          max={36}
          onChange={(v) => patch('roof.overhangEave', v)}
        />
        <NumberField
          label="Rake overhang (in)"
          value={config.roof.overhangRake}
          min={0}
          max={36}
          onChange={(v) => patch('roof.overhangRake', v)}
        />
        <div className="field">
          <label htmlFor="cover">Covering</label>
          <select
            id="cover"
            value={config.roof.covering}
            onChange={(e) => patch('roof.covering', e.target.value)}
          >
            <option value="asphalt-shingle">Asphalt shingle</option>
            <option value="metal-panel">Metal panel</option>
          </select>
        </div>
      </div>

      <div className="section">
        <h2>Framing</h2>
        <SelectField
          label="Stud size"
          value={config.framing.studSize}
          options={['2x4', '2x6']}
          onChange={(v) => patch('framing.studSize', v)}
        />
        <SelectField
          label="Stud spacing"
          value={String(config.framing.studSpacing)}
          options={['16', '24']}
          suffix='" o.c.'
          onChange={(v) => patch('framing.studSpacing', Number(v))}
        />
        <SelectField
          label="Joist size"
          value={config.framing.joistSize}
          options={['2x6', '2x8']}
          onChange={(v) => patch('framing.joistSize', v)}
        />
        <SelectField
          label="Joist spacing"
          value={String(config.framing.joistSpacing)}
          options={['12', '16', '24']}
          suffix='" o.c.'
          onChange={(v) => patch('framing.joistSpacing', Number(v))}
        />
        <SelectField
          label="Rafter size"
          value={config.framing.rafterSize}
          options={['2x6', '2x8']}
          onChange={(v) => patch('framing.rafterSize', v)}
        />
        <SelectField
          label="Rafter spacing"
          value={String(config.framing.rafterSpacing)}
          options={['16', '24']}
          suffix='" o.c.'
          onChange={(v) => patch('framing.rafterSpacing', Number(v))}
        />
        <div className="field">
          <label htmlFor="dtp">Double top plate</label>
          <input
            id="dtp"
            type="checkbox"
            style={{ width: 'auto' }}
            checked={config.framing.doubleTopPlate}
            onChange={(e) => patch('framing.doubleTopPlate', e.target.checked)}
          />
        </div>
      </div>

      <div className="section">
        <h2>Foundation &amp; siding</h2>
        <SelectField
          label="Foundation"
          value={config.foundation.type}
          options={['skid', 'pier']}
          onChange={(v) => patch('foundation.type', v)}
        />
        <SelectField
          label="Skid size"
          value={config.foundation.skidSize}
          options={['4x4', '4x6']}
          onChange={(v) => patch('foundation.skidSize', v)}
        />
        <SelectField
          label="Siding"
          value={config.siding.material}
          options={['t1-11', 'lap']}
          onChange={(v) => patch('siding.material', v)}
        />
      </div>

      <OpeningsEditor />
    </div>
  );
}

function OpeningsEditor() {
  const config = useShedStore((s) => s.config);
  const upsert = useShedStore((s) => s.upsertOpening);
  const remove = useShedStore((s) => s.removeOpening);

  const add = (kind: 'door' | 'window') => {
    const id = `${kind}-${Date.now().toString(36)}`;
    upsert({
      id,
      wall: 'front',
      kind,
      offset: 24,
      width: kind === 'door' ? 36 : 30,
      height: kind === 'door' ? 80 : 24,
      sill: kind === 'door' ? 0 : 42,
    });
  };

  return (
    <div className="section">
      <h2>Doors &amp; windows</h2>

      {config.openings.map((o) => (
        <div className="opening-row" key={o.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <strong style={{ fontSize: 12.5 }}>{o.kind === 'door' ? 'Door' : 'Window'}</strong>
            <button className="link" onClick={() => remove(o.id)}>
              Remove
            </button>
          </div>
          <div className="grid">
            <div className="field">
              <label>Wall</label>
              <select
                value={o.wall}
                onChange={(e) => upsert({ ...o, wall: e.target.value as Opening['wall'] })}
              >
                {WALL_IDS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <NumField label="From left" value={o.offset} onChange={(v) => upsert({ ...o, offset: v })} />
            <NumField label="Width" value={o.width} onChange={(v) => upsert({ ...o, width: v })} />
            <NumField label="Height" value={o.height} onChange={(v) => upsert({ ...o, height: v })} />
            {o.kind === 'window' && (
              <NumField label="Sill" value={o.sill} onChange={(v) => upsert({ ...o, sill: v })} />
            )}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => add('door')}>+ Door</button>
        <button onClick={() => add('window')}>+ Window</button>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="number" value={value} step={0.5} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  suffix,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  suffix?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
            {suffix ?? ''}
          </option>
        ))}
      </select>
    </div>
  );
}
