// Render a top-down SVG map of a track, coloured by height, with landmark labels.
// Usage: npx tsx tools/trackmap/trackmap.ts shire out.svg
import { writeFileSync } from 'node:fs';
import { PROVING, SHIRE, SHIRE_MARKS, Track } from '../../packages/sim/src/index.ts';

const [, , id = 'shire', out = 'track.svg'] = process.argv;
const defs = { shire: { def: SHIRE, marks: SHIRE_MARKS }, proving: { def: PROVING, marks: {} as Record<string, number> } };
const { def, marks } = defs[id as keyof typeof defs];
// Friendly names for landmark marks (unknown marks are skipped).
const LABELS: Record<string, string> = {
  crest1: 'Blind crest',
  bridgeStart: 'Stone bridge over the brook, watermill',
  villageStart: 'Hobbit-hole lane',
  towerTurn: 'Ruined watchtower (high point)',
  crest2: 'Second crest',
};
const NOTES: Record<string, string> = {
  towerTurn: 'Lap 2+: Nazgûl shadow sweeps the climb',
  crest1: 'Lap 3: fireworks over the Party Tree',
};
const t = new Track(def);
const xs = t.frames.map((f) => f.pos.x),
  zs = t.frames.map((f) => f.pos.z),
  ys = t.frames.map((f) => f.pos.y);
const pad = 40;
const minX = Math.min(...xs) - pad,
  maxX = Math.max(...xs) + pad,
  minZ = Math.min(...zs) - pad,
  maxZ = Math.max(...zs) + pad;
const W = 900,
  H = Math.round((W * (maxZ - minZ)) / (maxX - minX));
const sx = (x: number) => ((x - minX) / (maxX - minX)) * W;
const sz = (z: number) => ((z - minZ) / (maxZ - minZ)) * H;
const minY = Math.min(...ys),
  maxY = Math.max(...ys);
const col = (y: number) => {
  const k = (y - minY) / (maxY - minY || 1);
  return `hsl(${130 - k * 110}, 60%, ${38 + k * 15}%)`;
};
let segs = '';
for (let i = 0; i < t.count; i += 2) {
  const a = t.frame(i).pos,
    b = t.frame(i + 2).pos;
  segs += `<line x1="${sx(a.x).toFixed(1)}" y1="${sz(a.z).toFixed(1)}" x2="${sx(b.x).toFixed(1)}" y2="${sz(b.z).toFixed(1)}" stroke="${col(a.y)}" stroke-width="${(def.defaultWidth / (maxX - minX)) * W}" stroke-linecap="round"/>`;
}
const f0 = t.frameAtS(0);
let labels = `<rect x="${sx(f0.pos.x) - 14}" y="${sz(f0.pos.z) - 3}" width="28" height="6" fill="url(#chk)"/><text x="${sx(f0.pos.x) + 22}" y="${sz(f0.pos.z) + 5}" class="l">START</text>`;
// direction arrow
const fa = t.frameAtS(40);
labels += `<text x="${sx(fa.pos.x) - 26}" y="${sz(fa.pos.z)}" class="l" fill="#555">▲</text>`;
labels += `<circle cx="${sx(f0.pos.x) + 60}" cy="${sz(f0.pos.z) - 40}" r="18" fill="#3f7a2e"/><text x="${sx(f0.pos.x) + 84}" y="${sz(f0.pos.z) - 36}" class="m">Party Tree on the village green</text>`;
for (const [name, s] of Object.entries(marks)) {
  if (!LABELS[name]) continue;
  const f = t.frameAtS(s);
  const x = sx(f.pos.x),
    y = sz(f.pos.z);
  const anchor = x > W * 0.6 ? 'end' : 'start';
  const dx = anchor === 'end' ? -10 : 10;
  labels += `<circle cx="${x}" cy="${y}" r="6" fill="#222" stroke="#fff" stroke-width="2"/><text x="${x + dx}" y="${y - 8}" text-anchor="${anchor}" class="m">${LABELS[name]}</text>`;
  if (NOTES[name]) labels += `<text x="${x + dx}" y="${y + 20}" text-anchor="${anchor}" class="n">${NOTES[name]}</text>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><pattern id="chk" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#000"/><rect x="2" y="2" width="2" height="2" fill="#000"/><rect x="2" width="2" height="2" fill="#fff"/><rect y="2" width="2" height="2" fill="#fff"/></pattern>
<style>.l{font:bold 15px sans-serif}.m{font:bold 14px sans-serif;fill:#222}.n{font:italic 13px sans-serif;fill:#8a2a1a}</style></defs>
<rect width="100%" height="100%" fill="#eef3e2"/>${segs}${labels}
<text x="12" y="${H - 12}" class="m">${def.name} · ${t.length.toFixed(0)} m lap · height ${minY.toFixed(0)}..${maxY.toFixed(0)} m (green low, orange high)</text></svg>`;
writeFileSync(out, svg);
console.log(`${def.name}: ${t.length.toFixed(0)} m, ${W}x${H}`);
