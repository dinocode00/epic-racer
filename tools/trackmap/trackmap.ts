// Render a top-down SVG map of a track, coloured by height, with landmark labels.
// Usage: npx tsx tools/trackmap/trackmap.ts shire out.svg
import { writeFileSync } from 'node:fs';
import { ME_MARKS, ME_REGIONS, MIDDLE_EARTH, PROVING, SHIRE, SHIRE_MARKS, Track } from '../../packages/sim/src/index.ts';

const [, , id = 'shire', out = 'track.svg'] = process.argv;
const defs = {
  shire: { def: SHIRE, marks: SHIRE_MARKS, regions: [] as [string, number][] },
  proving: { def: PROVING, marks: {} as Record<string, number>, regions: [] as [string, number][] },
  middleEarth: { def: MIDDLE_EARTH, marks: ME_MARKS, regions: ME_REGIONS },
};
const { def, marks, regions } = defs[id as keyof typeof defs];
// Friendly names for landmark marks (unknown marks are skipped).
const REGION_STYLE: Record<string, [string, string]> = {
  hobbiton: ['#5fae3a', 'Hobbiton'],
  weathertop: ['#8a9a6a', 'Weathertop'],
  rivendell: ['#3fa3a0', 'Rivendell'],
  moria: ['#4a4a5a', 'Moria (underground)'],
  lothlorien: ['#d4b23a', 'Lothlórien'],
  argonath: ['#5a7fa8', 'The Argonath'],
  rohan: ['#c9a24a', 'Rohan'],
  pelennor: ['#b8b2a0', 'Pelennor & Minas Tirith'],
  mordor: ['#8a2a1a', 'Mordor'],
  deadMarshes: ['#5a6a4a', 'Dead Marshes'],
};
const regionAt = (s: number) => {
  let r = regions[0]?.[0];
  for (const [rid, rs] of regions) if (s >= rs) r = rid;
  return r;
};
const LABELS: Record<string, string> = {
  partyField: 'Party Tree · start',
  bagEnd: 'Bag End',
  gandalfLane: "Gandalf's cart",
  millBridge: 'Mill & Green Dragon',
  weathertopSummit: 'Weathertop ruins',
  rivendellBridge: 'Elven bridge',
  rivendellFalls: 'Waterfalls',
  doorsOfDurin: 'Doors of Durin & the Watcher',
  dwarrowdelf: 'Dwarrowdelf pillars',
  khazadDum: 'Bridge of Khazad-dûm · BALROG',
  mallorns: 'Golden mallorn trees',
  argonath: 'Statues of the Argonath',
  edoras: 'Edoras & golden hall',
  oliphaunts: 'Pelennor charge · OLIPHAUNTS',

  blackGate: 'Black Gate',
  mountDoom: 'Mount Doom',
  baradDur: 'Barad-dûr · EYE OF SAURON',
  deadMarshes: 'Dead Marshes · open causeway, mud',
  weathertopLeap: 'LEAP off Weathertop',
  bridgeBreak: 'Broken bridge JUMP',
  anduinJump: 'JUMP the Anduin between the kings',
  greatGate: 'Great Gate, switchbacks up Minas Tirith',
  prow: 'LEAP off the prow (30 m drop)',
  lavaJump: 'JUMP the lava (Eagles rescue)',
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
  const stroke = regions.length ? (REGION_STYLE[regionAt(i * t.spacing)!]?.[0] ?? '#888') : col(a.y);
  segs += `<line x1="${sx(a.x).toFixed(1)}" y1="${sz(a.z).toFixed(1)}" x2="${sx(b.x).toFixed(1)}" y2="${sz(b.z).toFixed(1)}" stroke="${stroke}" stroke-width="${(def.defaultWidth / (maxX - minX)) * W}" stroke-linecap="round"/>`;
}
const f0 = t.frameAtS(0);
let labels = `<rect x="${sx(f0.pos.x) - 14}" y="${sz(f0.pos.z) - 3}" width="28" height="6" fill="url(#chk)"/><text x="${sx(f0.pos.x) + 22}" y="${sz(f0.pos.z) + 5}" class="l">START</text>`;
// direction arrow
const fa = t.frameAtS(40);
labels += `<text x="${sx(fa.pos.x) - 26}" y="${sz(fa.pos.z)}" class="l" fill="#555">▲</text>`;
 if (!regions.length) labels += `<circle cx="${sx(f0.pos.x) + 60}" cy="${sz(f0.pos.z) - 40}" r="18" fill="#3f7a2e"/><text x="${sx(f0.pos.x) + 84}" y="${sz(f0.pos.z) - 36}" class="m">Party Tree on the village green</text>`;
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
let legend = '';
regions.forEach(([rid], i) => {
  const [c, name] = REGION_STYLE[rid] ?? ['#888', rid];
  legend += `<rect x="${W - 210}" y="${14 + i * 22}" width="16" height="16" rx="3" fill="${c}"/><text x="${W - 188}" y="${27 + i * 22}" class="m">${name}</text>`;
});
// Hazards as small dots, jumps (gaps) as thick dashed overlays, open edges as thin outlines.
let extras = '';
const at = (s0: number) => t.frameAtS(s0).pos;
for (const [g0, g1] of def.gaps ?? []) {
  let d = '';
  for (let s0 = g0; s0 <= g1; s0 += 2) d += `${d ? 'L' : 'M'}${sx(at(s0).x).toFixed(1)},${sz(at(s0).z).toFixed(1)}`;
  extras += `<path d="${d}" stroke="#fff" stroke-width="5" stroke-dasharray="3 3" fill="none"/>`;
}
for (const [a0, a1] of def.tunnels ?? []) {
  let d = '';
  for (let s0 = a0; s0 <= a1; s0 += 4) d += `${d ? 'L' : 'M'}${sx(at(s0).x).toFixed(1)},${sz(at(s0).z).toFixed(1)}`;
  extras += `<path d="${d}" stroke="#000" stroke-width="2" stroke-dasharray="8 4" fill="none"/>`;
}
for (const h of def.hazards ?? []) {
  const p = at(h.s);
  const f = t.frameAtS(h.s);
  const hx = sx(p.x + f.right.x * h.lat),
    hz = sz(p.z + f.right.z * h.lat);
  extras += `<circle cx="${hx.toFixed(1)}" cy="${hz.toFixed(1)}" r="3.2" fill="#e8321e" stroke="#fff" stroke-width="1"/>`;
}
legend += `<circle cx="${W - 202}" cy="${14 + regions.length * 22 + 8}" r="4" fill="#e8321e" stroke="#fff"/><text x="${W - 188}" y="${27 + regions.length * 22}" class="m">hazard</text>`;
legend += `<path d="M${W - 210} ${14 + (regions.length + 1) * 22 + 8} h16" stroke="#555" stroke-width="5" stroke-dasharray="3 3"/><text x="${W - 188}" y="${27 + (regions.length + 1) * 22}" class="m">jump / gap</text>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><pattern id="chk" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#000"/><rect x="2" y="2" width="2" height="2" fill="#000"/><rect x="2" width="2" height="2" fill="#fff"/><rect y="2" width="2" height="2" fill="#fff"/></pattern>
<style>.l{font:bold 15px sans-serif}.m{font:bold 14px sans-serif;fill:#222}.n{font:italic 13px sans-serif;fill:#8a2a1a}</style></defs>
<rect width="100%" height="100%" fill="#eef3e2"/>${segs}${extras}${labels}
${legend}<text x="12" y="${H - 12}" class="m">${def.name} · ${t.length.toFixed(0)} m lap · ${def.laps} laps · clockwise</text></svg>`;
writeFileSync(out, svg);
console.log(`${def.name}: ${t.length.toFixed(0)} m, ${W}x${H}`);
