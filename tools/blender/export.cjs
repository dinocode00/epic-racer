// Export code-built models for Blender: node tools/blender/export.cjs OUT.json [grandpa|buildings]
// Starts a Vite dev server for apps/game, opens apps/game/blenderExport.html in the
// preinstalled headless Chromium and saves what it hands over.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const out = process.argv[2] || 'export.json';
const what = process.argv[3] || 'grandpa';
const game = path.join(__dirname, '../../apps/game');
const port = 5199;
const vite = spawn('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], { cwd: game, stdio: 'ignore' });
(async () => {
  try {
    for (let i = 0; i < 120; i++) {
      try {
        if ((await fetch(`http://localhost:${port}/blenderExport.html`)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage();
    p.on('pageerror', (e) => console.log('ERR', e.message));
    await p.goto(`http://localhost:${port}/blenderExport.html?what=${what}`);
    await p.waitForFunction(() => window.__export, null, { timeout: 300000 });
    const data = await p.evaluate(() => JSON.stringify(window.__export));
    fs.writeFileSync(out, data);
    const g = JSON.parse(data)[what];
    if (g.meshes) console.log(`${what}: ${g.meshes.length} meshes (of ${g.total}), ${g.meshes.reduce((n, m) => n + m.pos.length / 3, 0)} vertices -> ${out}`);
    else console.log(`${what}: ${g.kinds.length} kinds, ${g.kinds.reduce((n, k) => n + (k.solid?.pos.length ?? 0) / 3 + (k.leaves?.pos.length ?? 0) / 3, 0)} vertices -> ${out}`);
    await b.close();
  } finally {
    vite.kill();
  }
})();
