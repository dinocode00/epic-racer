import { type KartState, driftLevel } from '@epic/sim';

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + `<sup>${s[(v - 20) % 10] ?? s[v] ?? s[0]}</sup>`;
};

/** Heads-up display for one player's viewport. */
export class Hud {
  readonly el: HTMLDivElement;
  private place: HTMLDivElement;
  private lap: HTMLDivElement;
  private kmh: HTMLDivElement;
  private bar: HTMLElement;
  private drift: HTMLDivElement;
  private done: HTMLDivElement;
  private draftEl: HTMLDivElement;
  private draftBar: HTMLElement;
  private last = '';

  constructor(parent: HTMLElement, name: string, color: string) {
    this.el = document.createElement('div');
    this.el.className = 'vp';
    this.el.innerHTML = `
      <div class="place"></div>
      <div class="lap"></div>
      <div class="name" style="background:${color}">${name}</div>
      <div class="speedo"><div class="kmh">0</div><div class="unit">KM/H</div><div class="bar"><i></i></div></div>
      <div class="drift"><i></i><i></i><i></i></div>
      <div class="draft">SLIPSTREAM<div class="meter"><i></i></div></div>
      <div class="done" hidden></div>`;
    parent.appendChild(this.el);
    const q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
    this.place = q('.place');
    this.lap = q('.lap');
    this.kmh = q('.kmh');
    this.bar = q('.bar i');
    this.drift = q('.drift');
    this.done = q('.done');
    this.draftEl = q('.draft');
    this.draftBar = q('.draft i');
  }

  setRect(x: number, y: number, w: number, h: number): void {
    Object.assign(this.el.style, {
      left: `${x * 100}%`,
      top: `${y * 100}%`,
      width: `${w * 100}%`,
      height: `${h * 100}%`,
    });
    // Scale text with the viewport's share of the screen.
    this.el.style.fontSize = `${Math.min(w, h) * 100}%`;
    this.el.style.setProperty('--s', String(Math.min(w, h)));
  }

  update(k: KartState, lap: number, laps: number): void {
    const lvl = k.drift.active ? driftLevel(k.drift.charge) : 0;
    const draft = Math.round(Math.min(1, k.draft / 1.1) * 20);
    const key = `${k.place}|${lap}|${Math.round(k.speed * 3.6)}|${lvl}|${k.drift.active}|${k.finished}|${k.boostTime > 0}|${draft}`;
    if (key === this.last) return;
    this.last = key;
    this.place.innerHTML = ordinal(k.place);
    this.lap.innerHTML = `LAP <b>${lap}</b>/${laps}`;
    this.kmh.textContent = String(Math.max(0, Math.round(k.speed * 3.6)));
    this.bar.style.width = `${Math.min(100, (Math.max(0, k.speed) / (k.params.topSpeed * 1.3)) * 100)}%`;
    this.drift.classList.toggle('on', k.drift.active);
    [...this.drift.children].forEach((c, i) => (c.className = lvl > i ? `l${lvl}` : ''));
    this.draftEl.classList.toggle('on', draft > 2);
    this.draftBar.style.width = `${draft * 5}%`;
    this.done.hidden = !k.finished;
    if (k.finished) this.done.innerHTML = `FINISH! ${ordinal(k.place)}`;
  }
}
