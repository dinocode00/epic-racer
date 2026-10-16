// End-to-end smoke test: TV page + two simulated iPhones join, pick rides, ready up,
// hold GAS / steer with real touch events, and the karts on the TV must move.
// Usage: pnpm build && pnpm --filter @epic/server start &   then   node tools/e2e/two-phones.mjs
import { chromium, devices } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:4000';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exitCode = 1;
};

const tv = await browser.newPage({ viewport: { width: 640, height: 360 } });
tv.on('pageerror', (e) => fail('TV error ' + e.message));
await tv.goto(BASE + '/', { waitUntil: 'domcontentloaded' });

const phones = [];
for (const [name, ride] of [['Rex', 'nazgul'], ['Sam', 'pod']]) {
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => fail(name + ' error ' + e.message));
  await p.goto(BASE + '/c/');
  await p.fill('#nm', name);
  await p.tap('#go');
  await p.waitForSelector('.car');
  await p.tap(`.car[data-id="${ride}"]`);
  await p.tap('#ready');
  phones.push({ p, ctx });
}
await tv.waitForFunction(() => window.__epic?.session, null, { timeout: 120000 });
for (const { p, ctx } of phones) {
  await p.waitForSelector('.btn.gas');
  const cdp = await ctx.newCDPSession(p);
  const gas = await p.locator('.btn.gas').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gas.x + gas.width / 2, y: gas.y + gas.height / 2, id: 1 }] });
}
await tv.waitForTimeout(8000); // the software renderer in CI is slow to drain the socket
const res = await tv.evaluate(() => {
  const e = window.__epic;
  e.session.frame(0.016);
  e.session.fastForward(8);
  return [0, 1].map((i) => ({ ride: e.session.humanKart(i).vehicle.id, speed: e.session.humanKart(i).speed, progress: e.session.humanKart(i).progress }));
});
console.log(JSON.stringify(res));
res.forEach((r, i) => r.progress < 20 && fail(`player ${i + 1} (${r.ride}) did not move`));
if (!process.exitCode) console.log('PASS: phones drive karts on the TV');
await browser.close();
