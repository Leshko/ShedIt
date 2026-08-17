'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { toSolids, type Solid } from '@shedit/engine';
import type { MemberCategory, PlanResult } from '@shedit/shared';

const COLOR: Record<MemberCategory, string> = {
  foundation: '#57534e',
  floor: '#a16207',
  walls: '#d6b06a',
  roof: '#b45309',
  siding: '#94a3b8',
  trim: '#64748b',
};

const CATEGORIES: MemberCategory[] = ['foundation', 'floor', 'walls', 'roof'];

export function Viewer3D({ plan }: { plan: PlanResult }) {
  const solids = useMemo(() => toSolids(plan), [plan]);
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CATEGORIES.map((c) => [c, true])),
  );

  // Frame the camera on the shed itself rather than the world origin. Engine
  // space is Z-up and the scene group rotates it, so the target has to be
  // converted too: engine (x, y, z) becomes three (x, z, -y).
  const { target, distance, groundY } = useMemo(() => {
    const xs = solids.map((s) => s.position[0]);
    const ys = solids.map((s) => s.position[1]);
    const zs = solids.map((s) => s.position[2]);
    const range = (v: number[]) =>
      v.length ? ([Math.min(...v), Math.max(...v)] as const) : ([0, 120] as const);
    const [x0, x1] = range(xs);
    const [y0, y1] = range(ys);
    const [z0, z1] = range(zs);
    return {
      target: [(x0 + x1) / 2, (z0 + z1) / 2, -(y0 + y1) / 2] as [number, number, number],
      distance: Math.max(x1 - x0, y1 - y0, z1 - z0, 96),
      groundY: z0 - 6,
    };
  }, [solids]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="canvas-wrap" style={{ flex: 1 }}>
        <Canvas
          camera={{
            position: [
              target[0] + distance * 1.5,
              target[1] + distance * 1.0,
              target[2] + distance * 1.7,
            ],
            fov: 42,
            far: 20000,
          }}
          dpr={[1, 2]}
        >
          <hemisphereLight args={['#ffffff', '#8d8d8d', 2.1]} />
          <directionalLight position={[distance, distance * 1.6, distance * 0.8]} intensity={1.5} />
          <directionalLight position={[-distance, distance, -distance]} intensity={0.5} />

          {/* Engine space is Z-up; Three is Y-up. */}
          <group rotation={[-Math.PI / 2, 0, 0]}>
            {CATEGORIES.filter((c) => visible[c]).map((category) => (
              <MemberGroup
                key={category}
                solids={solids.filter((s) => s.category === category)}
                color={COLOR[category]}
              />
            ))}
          </group>

          <Grid
            args={[distance * 8, distance * 8]}
            cellSize={12}
            sectionSize={120}
            cellColor="#cbd5e1"
            sectionColor="#94a3b8"
            fadeDistance={distance * 9}
            position={[target[0], groundY, target[2]]}
            infiniteGrid
          />
          <OrbitControls makeDefault target={target} />
        </Canvas>
      </div>

      <div className="legend">
        {CATEGORIES.map((c) => (
          <span key={c}>
            <input
              type="checkbox"
              checked={visible[c] ?? true}
              onChange={(e) => setVisible((v) => ({ ...v, [c]: e.target.checked }))}
              style={{ width: 'auto', margin: 0 }}
              id={`vis-${c}`}
            />
            <i style={{ background: COLOR[c] }} />
            <label htmlFor={`vis-${c}`} style={{ cursor: 'pointer' }}>
              {c}
            </label>
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>{plan.members.length} members · drag to orbit</span>
      </div>
    </div>
  );
}

/** One instanced mesh per category keeps the draw calls down. */
function MemberGroup({ solids, color }: { solids: Solid[]; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const dir = new THREE.Vector3();

    solids.forEach((s, i) => {
      right.set(...s.basis[0]).multiplyScalar(s.size[0]);
      up.set(...s.basis[1]).multiplyScalar(s.size[1]);
      dir.set(...s.basis[2]).multiplyScalar(s.size[2]);
      // A unit cube scaled and oriented by the member's own basis.
      matrix.makeBasis(right, up, dir).setPosition(...s.position);
      mesh.setMatrixAt(i, matrix);
    });

    mesh.count = solids.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [solids]);

  if (!solids.length) return null;

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, solids.length]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={0.85} metalness={0.02} />
    </instancedMesh>
  );
}
