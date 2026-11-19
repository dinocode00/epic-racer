/**
 * "Game updates" in ⚙ Settings: on the laptop running the game, check GitHub for a newer
 * version and install it without closing the program. The local server does the work
 * (apps/server: /api/update, using tools/update.mjs); this follows along and reloads the game
 * when it's done. Shown only when the game is opened on the laptop itself (localhost).
 */

type Phase =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'installing'
  | 'restarting'
  | 'reloading'
  | 'finish'
  | 'error'
  | 'unavailable';

interface Check {
  git: boolean;
  busy?: boolean;
  error?: string;
  available?: number;
  commits?: string[];
}
interface Job {
  state: 'idle' | 'running' | 'done' | 'failed';
  step: string;
  error?: string;
  restart?: boolean;
  autoRestart?: boolean;
  changed?: boolean;
  commit?: string;
}

const esc = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { cache: 'no-store', ...init });
  if (!r.ok) throw new Error(`${r.status}`);
  return (await r.json()) as T;
}

export class GameUpdates {
  /** Only on the laptop: phones and other computers can't update it. */
  readonly enabled = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
  private phase: Phase = 'idle';
  private note = '';
  private commits: string[] = [];

  constructor(private changed: () => void) {}

  private set(phase: Phase, note = ''): void {
    this.phase = phase;
    this.note = note;
    this.changed();
  }

  /** What the row shows: the action on the right and a line under it. */
  view(): { action: string; note: string; busy: boolean } {
    const n = this.commits.length;
    switch (this.phase) {
      case 'idle':
        return {
          action: 'Check now',
          note: "See if there's a newer version of the game.",
          busy: false,
        };
      case 'checking':
        return { action: 'Checking…', note: 'Asking GitHub for the latest version.', busy: true };
      case 'current':
        return { action: 'Up to date', note: 'You have the newest version.', busy: false };
      case 'available':
        return {
          action: 'Install',
          note:
            `${n} new change${n === 1 ? '' : 's'}: ` +
            this.commits.slice(0, 3).map(esc).join(' · ') +
            (n > 3 ? ` · and ${n - 3} more` : '') +
            '. Press to install (about a minute or two).',
          busy: false,
        };
      case 'installing':
        return { action: 'Updating…', note: esc(this.note), busy: true };
      case 'restarting':
        return { action: 'Restarting…', note: 'Starting the new version.', busy: true };
      case 'reloading':
        return { action: 'Done!', note: 'Reloading the game…', busy: true };
      case 'finish':
        return {
          action: 'Reload',
          note: 'Updated. Close the program and start it again to finish (then press to reload).',
          busy: false,
        };
      case 'error':
        return { action: 'Try again', note: esc(this.note), busy: false };
      case 'unavailable':
        return { action: '—', note: esc(this.note), busy: false };
    }
  }

  /** The row was pressed (Enter, A or a click). */
  press(): void {
    if (this.phase === 'available') void this.install();
    else if (this.phase === 'finish') location.reload();
    else if (['idle', 'current', 'error'].includes(this.phase)) void this.check();
  }

  async check(): Promise<void> {
    this.set('checking');
    try {
      const c = await getJson<Check>('/api/update');
      if (c.busy) return void this.follow();
      if (!c.git)
        return this.set(
          'unavailable',
          c.error ?? "This copy wasn't installed from GitHub, so it can't update itself.",
        );
      if (c.error) return this.set('error', c.error);
      this.commits = c.commits ?? [];
      this.set((c.available ?? 0) > 0 ? 'available' : 'current');
    } catch {
      this.set('error', "Couldn't reach the game's server on this computer.");
    }
  }

  private async install(): Promise<void> {
    this.set('installing', 'Starting…');
    try {
      await getJson<Job>('/api/update', { method: 'POST' });
    } catch {
      return this.set('error', "Couldn't start the update.");
    }
    await this.follow();
  }

  /** Follow the server's update until it's done, then bring in the new version. */
  private async follow(): Promise<void> {
    this.set('installing', 'Working…');
    let lost = false;
    for (;;) {
      await wait(1000);
      let j: Job;
      try {
        j = await getJson<Job>('/api/update/status');
      } catch {
        lost = true; // the server restarting on the new version (or a hiccup): keep asking
        continue;
      }
      // Back after a restart before we saw it finish: the new version is running.
      if (lost && j.state === 'idle') {
        this.set('reloading');
        await wait(800);
        location.reload();
        return;
      }
      if (j.state === 'running') {
        if (j.step !== this.note) this.set('installing', j.step);
        continue;
      }
      if (j.state === 'failed') return this.set('error', j.error ?? 'The update failed.');
      if (j.state !== 'done') return this.set('idle');
      if (!j.changed) return this.set('current');
      if (j.restart && !j.autoRestart) return this.set('finish');
      if (j.autoRestart) {
        this.set('restarting');
        await this.serverBack();
      }
      this.set('reloading');
      await wait(800);
      location.reload();
      return;
    }
  }

  /** Wait for the server to go down and come back up on the new version. */
  private async serverBack(): Promise<void> {
    const up = async () => {
      try {
        await getJson('/api/info');
        return true;
      } catch {
        return false;
      }
    };
    for (let i = 0; i < 20 && (await up()); i++) await wait(300);
    for (let i = 0; i < 120 && !(await up()); i++) await wait(500);
  }
}
