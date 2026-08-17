import {
  actualSize,
  type Member,
  type Pt3,
  type ResolvedShedConfig,
} from '@shedit/shared';
import { studCenters } from './wall.js';

const DECK_THICKNESS = 0.75;

/**
 * The floor deck's top face is z = 0, so everything here hangs below zero:
 * sheathing, then joists, then skids on the ground.
 */
export function buildFloor(config: ResolvedShedConfig): Member[] {
  const members: Member[] = [];
  const joistDepth = actualSize(config.framing.joistSize).width;
  const joistTopZ = -DECK_THICKNESS;
  const joistBottomZ = joistTopZ - joistDepth;

  // Joists span the width; rim joists cap their ends and run the depth.
  const joistLength = config.width - 2 * 1.5;

  for (const [i, side] of [0, config.width - 1.5].entries()) {
    members.push({
      id: `floor.rim.${i}`,
      role: 'floor.rim',
      category: 'floor',
      label: 'Rim joist',
      size: config.framing.joistSize,
      species: 'PT',
      cut: {
        length: config.depth,
        endA: { angleDeg: 0, kind: 'square' },
        endB: { angleDeg: 0, kind: 'square' },
        notches: [],
      },
      placement: {
        // origin is the centre of the end-A cross-section, so z sits at
        // mid-depth of the joist rather than at its underside.
        origin: [side + 0.75, 0, joistBottomZ + joistDepth / 2],
        dir: [0, 1, 0],
        up: [0, 0, 1],
        sectionW: 1.5,
        sectionH: joistDepth,
      },
    });
  }

  let seq = 0;
  for (const y of studCenters(config.depth, config.framing.joistSpacing, 1.5)) {
    members.push({
      id: `floor.joist.${seq++}`,
      role: 'floor.joist',
      category: 'floor',
      label: 'Floor joist',
      size: config.framing.joistSize,
      species: 'PT',
      cut: {
        length: joistLength,
        endA: { angleDeg: 0, kind: 'square' },
        endB: { angleDeg: 0, kind: 'square' },
        notches: [],
      },
      placement: {
        origin: [1.5, y, joistBottomZ + joistDepth / 2],
        dir: [1, 0, 0],
        up: [0, 0, 1],
        sectionW: 1.5,
        sectionH: joistDepth,
      },
    });
  }

  members.push(...buildFoundation(config, joistBottomZ));
  return members;
}

function buildFoundation(config: ResolvedShedConfig, joistBottomZ: number): Member[] {
  const members: Member[] = [];
  const skidDims = actualSize(config.foundation.skidSize);
  const skidTopZ = joistBottomZ;
  const origin: Pt3 = [0, 0, skidTopZ - skidDims.width];

  if (config.foundation.type === 'pier') {
    // Piers still carry skids; the skids just bear on blocks instead of grade.
    // Modelled the same way, so the framing above is identical.
  }

  // Skids run the depth, spaced across the width, never more than 48" apart.
  const count = Math.max(2, Math.ceil(config.width / 48) + 1);
  for (let i = 0; i < count; i++) {
    const x =
      count === 1
        ? config.width / 2
        : (i * (config.width - skidDims.thickness)) / (count - 1) + skidDims.thickness / 2;
    members.push({
      id: `found.skid.${i}`,
      role: 'foundation.skid',
      category: 'foundation',
      label: `Skid (${config.foundation.type === 'pier' ? 'on piers' : 'on grade'})`,
      size: config.foundation.skidSize,
      species: 'PT',
      cut: {
        length: config.depth,
        endA: { angleDeg: 0, kind: 'square' },
        endB: { angleDeg: 0, kind: 'square' },
        notches: [],
      },
      placement: {
        origin: [x, 0, origin[2] + skidDims.width / 2],
        dir: [0, 1, 0],
        up: [0, 0, 1],
        sectionW: skidDims.thickness,
        sectionH: skidDims.width,
      },
    });
  }

  return members;
}

export { DECK_THICKNESS };
