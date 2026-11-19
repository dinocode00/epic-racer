// Getting a new version of Epic Racer: pull it from GitHub, install what changed, rebuild.
// Shared by the launcher (tools/launch.mjs, on start) and the server (the game's ⚙ Settings →
// "Check for updates", while it runs). Node's built-ins only: it runs before the project's own
// dependencies are installed.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const WIN = process.platform === 'win32';
const STATE_FILE = join(ROOT, '.tools', 'launch-state.json');
/**
 * Left by the server when an update changed the server itself, just before it stops: the
 * launcher sees it and starts the server again (exit codes don't survive pnpm reliably).
 */
export const RESTART_FLAG = join(ROOT, '.tools', 'restart-server');

export function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}
export function writeState(s) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

/** pnpm via the corepack that ships with this Node (no global installs needed). */
export function pnpmCommand() {
  const local = join(dirname(process.execPath), WIN ? 'corepack.cmd' : 'corepack');
  return existsSync(local) ? local : 'corepack';
}
export const env = {
  ...process.env,
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  COREPACK_ENABLE_STRICT: '0',
};
// Make sure child processes find this same Node first (matters for the portable copy).
// Package scripts call plain `pnpm`, so put a corepack shim for it on PATH (in .tools/, no global install).
const SHIM_DIR = join(ROOT, '.tools', 'bin');
env.PATH =
  SHIM_DIR +
  (WIN ? ';' : ':') +
  dirname(process.execPath) +
  (WIN ? ';' : ':') +
  (env.PATH ?? env.Path ?? '');
export function ensurePnpmShim() {
  mkdirSync(SHIM_DIR, { recursive: true });
  spawnSync(pnpmCommand(), ['enable', '--install-directory', SHIM_DIR, 'pnpm'], {
    cwd: ROOT,
    env,
    stdio: 'ignore',
    shell: WIN,
  });
}

/** Newest modification time of the source that goes into the build. */
export function newestSource() {
  let newest = 0;
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else newest = Math.max(newest, st.mtimeMs);
    }
  };
  for (const d of ['apps', 'packages']) walk(join(ROOT, d));
  return newest;
}

export const hashFile = (p) =>
  existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : '';
export const lockHash = () => hashFile(join(ROOT, 'pnpm-lock.yaml'));

export const isGitClone = () => existsSync(join(ROOT, '.git'));

/** Run a command without blocking (the server keeps serving meanwhile); resolves with its result. */
export function run(cmd, args, { timeout = 15 * 60_000, onLine } = {}) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(cmd, args, { cwd: ROOT, env, shell: WIN, windowsHide: true });
    } catch (e) {
      resolve({ ok: false, out: String(e) });
      return;
    }
    const timer = setTimeout(() => child.kill(), timeout);
    const take = (b) => {
      const s = b.toString();
      out = (out + s).slice(-20_000);
      if (onLine) for (const line of s.split(/\r?\n/)) if (line.trim()) onLine(line.trim());
    };
    child.stdout?.on('data', take);
    child.stderr?.on('data', take);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, out: out + String(e) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, out: out.trim() });
    });
  });
}
const git = (args, opts) => run('git', args, { timeout: 90_000, ...opts });
const pnpm = (args, opts) => run(pnpmCommand(), ['pnpm', ...args], opts);

/**
 * Is there a newer version? Asks GitHub (git fetch) and compares.
 * Returns { git: false } when this folder isn't a git clone (nothing to update from).
 */
export async function checkForUpdates() {
  if (!isGitClone()) return { git: false };
  const fetched = await git(['fetch', '--quiet']);
  if (!fetched.ok) return { git: true, error: "Couldn't reach GitHub (are you online?)." };
  const up = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!up.ok) return { git: true, error: "This copy isn't following a branch on GitHub." };
  const log = await git(['log', '--format=%s', 'HEAD..@{u}']);
  const ahead = await git(['rev-list', '--count', '@{u}..HEAD']);
  const commits = log.ok && log.out ? log.out.split('\n') : [];
  return {
    git: true,
    branch: up.out,
    available: commits.length,
    commits: commits.slice(0, 8),
    localOnly: Number(ahead.out) || 0,
  };
}

/**
 * Pull the new version, then install (only if the dependencies changed) and rebuild the game.
 * `step(text)` reports progress. Returns { ok, error?, restart } where restart says the server's
 * own code changed, so it has to be restarted to run the new version.
 */
export async function applyUpdate(step = () => {}) {
  if (!isGitClone()) return { ok: false, error: "This copy wasn't installed from GitHub." };
  step('Downloading the update…');
  const before = (await git(['rev-parse', 'HEAD'])).out;
  const lockBefore = lockHash();
  const pulled = await git(['pull', '--ff-only', '--quiet']);
  if (!pulled.ok)
    return {
      ok: false,
      error:
        "Couldn't download it (offline, or files on this computer were changed by hand): " +
        pulled.out.split('\n').slice(-2).join(' '),
    };
  const after = (await git(['rev-parse', 'HEAD'])).out;
  if (after === before) return { ok: true, restart: false, changed: false };
  const changed = (await git(['diff', '--name-only', before, after])).out.split('\n');
  const state = readState();
  if (lockHash() !== lockBefore || state.lockHash !== lockHash()) {
    step('Installing new pieces (about a minute)…');
    ensurePnpmShim();
    let r = await pnpm(['install', '--frozen-lockfile']);
    if (!r.ok) r = await pnpm(['install']);
    if (!r.ok)
      return { ok: false, error: 'The install failed: ' + r.out.split('\n').slice(-3).join(' ') };
    state.lockHash = lockHash();
    writeState(state);
  }
  step('Building the game (about a minute)…');
  const built = await pnpm(['build']);
  if (!built.ok)
    return { ok: false, error: 'The build failed: ' + built.out.split('\n').slice(-3).join(' ') };
  state.builtStamp = newestSource();
  writeState(state);
  const restart = changed.some(
    (f) =>
      f.startsWith('apps/server/') ||
      f.startsWith('packages/shared/') ||
      f === 'pnpm-lock.yaml' ||
      f === 'tools/update.mjs',
  );
  return {
    ok: true,
    restart,
    changed: true,
    commit: (await git(['log', '-1', '--format=%s'])).out,
  };
}
