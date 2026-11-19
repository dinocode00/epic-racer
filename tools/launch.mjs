// Epic Racer launcher: run by the double-click files ("Start Epic Racer.command" / ".bat").
// Updates (if this folder is a git clone), installs and builds only when something changed,
// starts the server and opens the game in the browser. Uses only Node's built-ins, because
// it runs before the project's own dependencies are installed.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  RESTART_FLAG,
  ROOT,
  WIN,
  ensurePnpmShim,
  env,
  lockHash as currentLockHash,
  newestSource,
  pnpmCommand,
  readState,
  writeState,
} from './update.mjs';

const PORT = Number(process.env.PORT ?? 4000);
const URL = `http://localhost:${PORT}/`;

const say = (msg) => console.log(`  ${msg}`);
const fail = (msg) => {
  console.error(`\n  ✖ ${msg}\n`);
  process.exit(1);
};

function pnpm(args, what) {
  say(what);
  const r = spawnSync(pnpmCommand(), ['pnpm', ...args], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
    shell: WIN, // .cmd files need a shell on Windows
  });
  return r.status === 0;
}

async function running() {
  try {
    const r = await fetch(`http://localhost:${PORT}/api/info`, {
      signal: AbortSignal.timeout(800),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function openBrowser() {
  const cmd = WIN ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = WIN ? ['/c', 'start', '', URL] : [URL];
  const tell = () => say(`Open ${URL} in your browser.`);
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', tell);
    child.unref();
  } catch {
    tell();
  }
}

console.log('\n  🏁  EPIC RACER\n');

if (await running()) {
  say('Already running, opening the game.');
  openBrowser();
  process.exit(0);
}

// 1. Fetch the latest version, if this folder is a git clone (never fatal).
if (existsSync(join(ROOT, '.git'))) {
  say('Checking for updates…');
  const r = spawnSync('git', ['pull', '--ff-only', '--quiet'], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 60000,
  });
  if (r.status !== 0)
    say("Couldn't update (offline, or local changes): starting the version you have.");
}

ensurePnpmShim();

// 2. Install dependencies when they're missing or the lockfile changed.
const state = readState();
const lockHash = currentLockHash();
if (!existsSync(join(ROOT, 'node_modules')) || state.lockHash !== lockHash) {
  if (
    !pnpm(
      ['install', '--frozen-lockfile'],
      'Installing (first run or after an update, takes a minute)…',
    )
  )
    if (!pnpm(['install'], 'Retrying the install…'))
      fail('Install failed. Check your internet connection and try again.');
  state.lockHash = lockHash;
  writeState(state);
}

// 3. Build when the game hasn't been built or its source changed.
const stamp = newestSource();
const built =
  existsSync(join(ROOT, 'apps', 'game', 'dist', 'index.html')) &&
  existsSync(join(ROOT, 'apps', 'controller', 'dist', 'index.html'));
if (!built || state.builtStamp !== stamp) {
  if (!pnpm(['build'], 'Building the game…')) fail('Build failed.');
  state.builtStamp = stamp;
  writeState(state);
}

// 4. Start the server, open the browser once it answers, keep running until closed. When the
// game installs an update that changes the server itself (⚙ Settings → Check for updates), the
// server leaves RESTART_FLAG, stops, and comes straight back up here, running the new version.
let server;
function startServer() {
  server = spawn(pnpmCommand(), ['pnpm', '--filter', '@epic/server', 'start'], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
    shell: WIN,
  });
  server.on('exit', (code) => {
    if (existsSync(RESTART_FLAG)) {
      rmSync(RESTART_FLAG, { force: true });
      say('Restarting with the update…\n');
      startServer();
    } else process.exit(code ?? 0);
  });
}
rmSync(RESTART_FLAG, { force: true });
env.EPIC_LAUNCHER = '1'; // tells the server it will be restarted after an update
say('Starting…\n');
startServer();
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 300));
  if (await running()) {
    openBrowser();
    console.log(
      '  The game is open in your browser (press F11, or Ctrl+Cmd+F on a Mac, for fullscreen).',
    );
    console.log('  Keep this window open while you play. Close it to stop the game.');
    console.log('  New versions: ⚙ Settings → Check for updates (no need to close this).\n');
    break;
  }
}
const stop = () => {
  server.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
