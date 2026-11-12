import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The JSON part of a binary glTF file. */
function gltfJson(path: string): {
  animations: { name: string; channels: unknown[] }[];
  skins: { joints: number[] }[];
  materials: { name: string }[];
  meshes: { name: string }[];
} {
  const b = readFileSync(new URL(path, import.meta.url));
  expect(b.toString('latin1', 0, 4)).toBe('glTF');
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

describe('Blender Nazgûl (tools/blender/nazgul.py)', () => {
  const g = gltfJson('../src/render/models/nazgul.glb');

  it('carries the two clips the game blends by speed', () => {
    const clips = Object.fromEntries(g.animations.map((a) => [a.name, a.channels.length]));
    expect(Object.keys(clips).sort()).toEqual(['Gallop', 'Idle']);
    expect(clips.Idle).toBeGreaterThan(100);
    expect(clips.Gallop).toBeGreaterThan(100);
  });

  it('is one skeleton', () => {
    expect(g.skins).toHaveLength(1);
    expect(g.skins[0]!.joints.length).toBeGreaterThan(40);
  });

  it('uses only material names the game knows how to dress (render/rigged.ts)', () => {
    const known = [
      'blade',
      'coat',
      'dark',
      'eye',
      'grip',
      'hair',
      'hood',
      'hoof',
      'leather',
      'rag',
      'robe',
      'steel',
      'trim',
      'void',
    ];
    expect(g.materials.map((m) => m.name).sort()).toEqual(known);
  });
});

describe('Blender barn cat (tools/blender/cat.py)', () => {
  const g = gltfJson('../src/render/models/cat.glb');

  it('has the walk, sit and groom clips', () => {
    expect(g.animations.map((a) => a.name).sort()).toEqual(['Groom', 'Sit', 'Walk']);
  });

  it('is only the cat: no preview floor, camera or light left in', () => {
    expect(g.meshes.map((m) => m.name).sort()).toEqual(['Cat', 'Eyes', 'Nose', 'Pupils']);
  });
});

/** Racing vehicles modelled in Blender (tools/blender/<script>.py; render/blenderVehicles.ts). */
const WHEELS = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'];
const BLENDER_VEHICLES = [
  { file: 'podracer', nodes: ['body', 'exhaust_L', 'exhaust_R', 'fan_L', 'fan_R'] },
  { file: 'corolla', nodes: ['body', 'exhaust', ...WHEELS] },
  { file: 'landcruiser', nodes: ['body', 'exhaust', ...WHEELS] },
  { file: 'mach5', nodes: ['body', 'exhaust_L', 'exhaust_R', ...WHEELS] },
];
describe.each(BLENDER_VEHICLES)('Blender vehicle $file', ({ file, nodes }) => {
  const g = gltfJson(`../src/render/models/${file}.glb`) as ReturnType<typeof gltfJson> & {
    nodes: { name: string }[];
    meshes: { name: string; primitives: { attributes: Record<string, number> }[] }[];
  };

  it('has the nodes the game looks for, and nothing else (no preview floor, camera or light)', () => {
    expect(g.nodes.map((n) => n.name).sort()).toEqual(nodes);
  });

  it('carries its baked shading as vertex colour on every part', () => {
    for (const m of g.meshes)
      for (const p of m.primitives) expect(p.attributes.COLOR_0, m.name).toBeDefined();
  });
});
