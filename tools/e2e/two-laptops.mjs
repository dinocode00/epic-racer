// (The screens draw nothing, ?draw=0, so the race runs at full speed without a GPU.)
// End-to-end test of 8-Player Local: two game screens (standing in for two laptops) link up,
// players join on each, race one race, and both screens must end up with exactly the same
// race (same fingerprint at the same step) and the same results.
// Usage: pnpm build && pnpm --filter @epic/server start &   then   node tools/e2e/two-laptops.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:4000';
// Each screen gets a browser of its own, like two laptops (and two GPU processes).
const launch = () =>
  chromium.launch({
    // (Set CHROME to a Chromium binary if Playwright's own isn't installed.)
    executablePath: process.env.CHROME || undefined,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
const browsers = [];
const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exitCode = 1;
};
const ok = (msg) => console.log('ok  ', msg);

/** A game screen: screen 0 is the main laptop, screen 1 the second one. */
async function screen(n) {
  const browser = await launch();
  browsers.push(browser);
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
  // 8-Player Local on (it matters on the main laptop), two AI racers, one lap.
  await ctx.addInitScript(() =>
    localStorage.setItem(
      'epic-racer-settings',
      JSON.stringify({ link: true, ai: 2, laps: 1, level: 1, cupRaces: 0 }),
    ),
  );
  const p = await ctx.newPage();
  p.on('pageerror', (e) => fail(`screen ${n + 1} error ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      console.log(`  [screen ${n + 1}] ${m.text()}`);
  });
  await p.goto(`${BASE}/?track=proving&quality=low&draw=0${n ? `&screen=${n}` : ''}`, {
    waitUntil: 'domcontentloaded',
    timeout: 300000,
  });
  await p.waitForSelector('.lobby .qr svg', { timeout: 300000 });
  return p;
}

/**
 * Hold a key long enough for the lobby to see it: without a GPU, repainting the lobby can
 * drop a screen to a few frames a second for a moment.
 */
async function tap(p, key) {
  await p.keyboard.down(key);
  await p.waitForTimeout(1000);
  await p.keyboard.up(key);
  await p.waitForTimeout(300);
}

const a = await screen(0);
const b = await screen(1);

// Linked: both lobbies show eight places.
await a.waitForSelector('.slots.eight', { timeout: 120000 });
await b.waitForSelector('.slots.eight', { timeout: 120000 });
ok('the two screens linked (eight places in both lobbies)');
const qrA = await a.$eval('.lobby .url', (e) => e.textContent);
const qrB = await b.$eval('.lobby .url', (e) => e.textContent);
if (!qrB.endsWith('?s=1') || qrA.includes('?s=')) fail(`phone links: ${qrA} / ${qrB}`);
else ok(`each screen has its own phone link (${qrB})`);

/** Press `key` until `check` holds on the page (a press during a repaint stall can be missed). */
async function until(p, key, check, what) {
  for (let i = 0; i < 6; i++) {
    await tap(p, key);
    if (await p.evaluate(check).catch(() => false)) return;
  }
  fail(`${what}: never happened`);
}
const has = (key, ready) =>
  `window.__epic.session || !!window.__epic.members.find((m) => m.key === '${key}'${ready ? ' && m.ready' : ''})`;

// One keyboard player on the main laptop, two sharing the second laptop's keyboard.
await until(a, 'Enter', has('keyboard'), 'main laptop player joins');
await until(b, 'Enter', has('keyboard'), 'second laptop player 1 joins');
await until(b, 'Space', has('keyboard2'), 'second laptop player 2 joins');
await a
  .waitForFunction(() => document.querySelectorAll('.slots.eight .slot.on').length === 3, null, {
    timeout: 30000,
  })
  .catch(async (e) => {
    for (const [n, p] of [
      ['main', a],
      ['second', b],
    ])
      console.log(
        n,
        await p.evaluate(() => ({
          slots: [...document.querySelectorAll('.slot.on .who')].map((x) => x.textContent),
          members: window.__epic?.members?.map((m) => m.name),
          screen: window.__epic?.net?.screen,
          rosters: [...(window.__epic?.link?.rosters ?? [])].map(([s, r]) => [s, r.length]),
        })),
      );
    throw e;
  });
const names = await a.$$eval('.slots.eight .slot.on .who span:first-child', (els) =>
  els.map((e) => e.textContent),
);
ok(`main laptop's lobby shows all three players: ${names.join(', ')}`);
if (names.join() !== 'P1,P5,P6') fail(`expected P1,P5,P6, got ${names}`);

// Pick a ride, then everyone ready.
await tap(b, 'ArrowRight');
await until(a, 'Enter', has('keyboard', true), 'main laptop player readies');
await until(b, 'Enter', has('keyboard', true), 'second laptop player 1 readies');
await until(b, 'Space', has('keyboard2', true), 'second laptop player 2 readies');
const started = (p) =>
  p.waitForFunction(() => window.__epic?.session && !window.__epic.session.waiting, null, {
    timeout: 180000,
  });
await Promise.all([started(a), started(b)]);
ok('the race started on both screens');

const info = (p) =>
  p.evaluate(() => {
    const s = window.__epic.session;
    return {
      karts: s.race.karts.length,
      humans: window.__epic.link.spec.humans.map((h) => `${h.name}@${h.screen}`),
      frame: s.net.frame,
      confirmed: s.net.confirmed,
    };
  });
const ia = await info(a),
  ib = await info(b);
if (ia.karts !== 5 || ib.karts !== 5) fail(`karts: ${ia.karts} / ${ib.karts}`);
else ok(`5 racers on both (players ${ia.humans.join(' ')} + 2 AI)`);

// Drive: everyone on the gas, steering about at random, for 15 seconds.
await a.keyboard.down('ArrowUp');
await b.keyboard.down('ArrowUp');
await b.keyboard.down('KeyW');
const t0 = Date.now();
let r = 1;
while (Date.now() - t0 < 15000) {
  r = (r * 16807) % 2147483647;
  const key = r % 3 === 0 ? 'ArrowLeft' : r % 3 === 1 ? 'ArrowRight' : null;
  const page = r % 2 ? a : b;
  if (key) {
    await page.keyboard.down(key);
    await page.waitForTimeout(80 + (r % 200));
    await page.keyboard.up(key);
  } else await page.waitForTimeout(150);
}

/** Fingerprint of the race just before step f on a screen (null if it can't say yet). */
const hashAt = (p, f) =>
  p.evaluate((f) => {
    const n = window.__epic.session.net;
    if (n.confirmed + 1 < f) return null;
    const s = n.stateAt(f);
    return s ? n.race.hash(s) : null;
  }, f);
const stats = (p) =>
  p.evaluate(() => ({
    np: window.__epic.session.net.stats,
    link: window.__epic.link.race.stats,
    frame: window.__epic.session.net.frame,
    confirmed: window.__epic.session.net.confirmed,
    progress: window.__epic.session.race.karts.slice(2).map((k) => Math.round(k.progress)),
  }));
const sa = await stats(a),
  sb = await stats(b);
console.log('  main  :', JSON.stringify(sa));
console.log('  second:', JSON.stringify(sb));
let compared = 0;
for (let tries = 0; tries < 20 && compared < 3; tries++) {
  const ca = (await stats(a)).confirmed,
    cb = (await stats(b)).confirmed;
  const f = Math.min(ca, cb) - 2;
  const [ha, hb] = [await hashAt(a, f), await hashAt(b, f)];
  if (ha === null || hb === null) continue;
  if (ha !== hb) fail(`the screens disagree at step ${f}: ${ha} vs ${hb}`);
  else compared++;
}
if (compared >= 3) ok('both screens have exactly the same race at the same steps');
else fail('could not compare fingerprints');
if (sa.np.rollbacks + sb.np.rollbacks === 0)
  fail('no rewinds at all: inputs were not being predicted');
else
  ok(`late inputs were put right by rewinding (${sa.np.rollbacks} + ${sb.np.rollbacks} rewinds)`);
if (sa.link.mismatches || sa.link.repairs) fail(`fingerprint mismatches: ${sa.link.mismatches}`);
else ok('no fingerprint mismatches and no repairs needed');
if (Math.min(...sa.progress) < 30) fail(`players barely moved: ${sa.progress}`);
else ok(`players drove (progress ${sa.progress.join(', ')} m)`);

// Pause from the second laptop pauses both; resume from the main one.
await b.keyboard.up('ArrowUp');
await tap(b, 'Escape');
await a.waitForFunction(() => window.__epic.session.paused, null, { timeout: 5000 });
await b.waitForFunction(() => window.__epic.session.paused, null, { timeout: 5000 });
ok('pausing on the second laptop paused both');
await tap(a, 'Escape');
await b.waitForFunction(() => !window.__epic.session.paused, null, { timeout: 5000 });
ok('resuming on the main laptop resumed both');

// Hand everyone to the autopilot to finish the lap; both screens must show the same results.
for (const p of [a, b])
  await p.evaluate(() => window.__epic.session.players.forEach((pl) => (pl.autopilot = true)));
const results = (p) =>
  p
    .waitForSelector('.results .row', { timeout: 240000 })
    .then(() => p.$$eval('.results .row', (rows) => rows.map((x) => x.textContent.trim())));
const [ra, rb] = await Promise.all([results(a), results(b)]);
console.log('  results (main):', ra.join(' | '));
if (ra.join('\n') !== rb.join('\n'))
  fail(`results differ:\n${ra.join('\n')}\n---\n${rb.join('\n')}`);
else ok('both screens show the same results');

// Continue from the second laptop: both go back to the lobby.
await b.waitForTimeout(2600);
await tap(b, 'Enter');
await a.waitForSelector('.lobby', { timeout: 10000 });
await b.waitForSelector('.lobby', { timeout: 10000 });
ok('continue on the second laptop took both back to the lobby');

for (const br of browsers) await br.close();
console.log(process.exitCode ? 'FAILED' : 'PASSED');
