'use client';

import { create } from 'zustand';
import {
  defaultShedConfig,
  type Opening,
  type PlanResult,
  type ResolvedShedConfig,
  type WallId,
} from '@shedit/shared';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ShedStore {
  config: ResolvedShedConfig;
  plan: PlanResult | null;
  /** Kept so the viewer never blanks while the user is mid-typo. */
  lastGoodPlan: PlanResult | null;
  computing: boolean;
  error: string | null;

  setConfig: (next: ResolvedShedConfig) => void;
  patch: (path: string, value: unknown) => void;
  applyFix: (ops: { path: string; value: unknown }[]) => void;
  setWallHeight: (wall: WallId, inches: number) => void;
  upsertOpening: (opening: Opening) => void;
  removeOpening: (id: string) => void;
  compute: () => Promise<void>;
}

let requestSeq = 0;

export const useShedStore = create<ShedStore>((set, get) => ({
  config: defaultShedConfig(),
  plan: null,
  lastGoodPlan: null,
  computing: false,
  error: null,

  setConfig: (next) => {
    set({ config: next });
    void get().compute();
  },

  patch: (path, value) => {
    set({ config: setPath(get().config, path, value) });
    void get().compute();
  },

  applyFix: (ops) => {
    let next = get().config;
    for (const op of ops) next = setPath(next, op.path, op.value);
    set({ config: next });
    void get().compute();
  },

  setWallHeight: (wall, inches) => {
    get().patch(`wallHeights.${wall}`, inches);
  },

  upsertOpening: (opening) => {
    const openings = [...get().config.openings];
    const i = openings.findIndex((o) => o.id === opening.id);
    if (i >= 0) openings[i] = opening;
    else openings.push(opening);
    get().patch('openings', openings);
  },

  removeOpening: (id) => {
    get().patch(
      'openings',
      get().config.openings.filter((o) => o.id !== id),
    );
  },

  compute: async () => {
    const seq = ++requestSeq;
    set({ computing: true });
    try {
      const res = await fetch(`${API}/api/plans/compute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(get().config),
      });

      // A slower earlier request must not overwrite a newer result.
      if (seq !== requestSeq) return;

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        set({ error: body.message ?? `Request failed (${res.status})`, computing: false });
        return;
      }

      const plan: PlanResult = await res.json();
      const usable = !plan.issues.some((i) => i.severity === 'error');
      set({
        plan,
        lastGoodPlan: usable ? plan : get().lastGoodPlan,
        error: null,
        computing: false,
      });
    } catch {
      if (seq !== requestSeq) return;
      set({
        error: `Cannot reach the planner API at ${API}. Is it running?`,
        computing: false,
      });
    }
  },
}));

/** Immutably set a dotted path, e.g. `wallHeights.left`. */
function setPath<T>(object: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  if (!head) return object;
  const clone: Record<string, unknown> = { ...(object as Record<string, unknown>) };
  clone[head] = rest.length
    ? setPath(clone[head] as Record<string, unknown>, rest.join('.'), value)
    : value;
  return clone as T;
}
