import { type KartState, SPECIAL_OF, driftLevel } from '@epic/sim';
import { ROULETTE, itemSkin } from './itemSkins.ts';

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
  private slot!: HTMLDivElement;
  private slotIcon!: HTMLDivElement;
  private slotName!: HTMLDivElement;
  private slotCount!: HTMLElement;
  private warn!: HTMLDivElement;
  private lastItem = '';
  trackId = '';

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
      <div class="slot"><div class="ic"></div><div class="nm"></div><b class="ct"></b></div>
      <div class="warn" hidden></div>
      <div class="done" hidden></div>`;
    parent.appendChild(this.el);
    const q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
    this.place = q('.place');
    this.lap = q('.lap');
    this.kmh = q('.kmh');
    this.bar = q('.bar i');
    this.drift = q('.drift');
    this.done = q('.done');
    this.slot = q('.slot');
    this.slotIcon = q('.slot .ic');
    this.slotName = q('.slot .nm');
    this.slotCount = q('.slot .ct');
    this.warn = q('.warn');
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
    // In a four-way split the HUD corner nearest the screen centre makes room for the map.
    const quad = w < 1 && h < 1;
    this.el.classList.toggle('quad', quad);
    for (const c of ['q-TL', 'q-TR', 'q-BL', 'q-BR']) this.el.classList.remove(c);
    if (quad) this.el.classList.add(`q-${y < 0.5 ? 'T' : 'B'}${x < 0.5 ? 'L' : 'R'}`);
  }

  /** The held item, the roulette, and warnings about incoming attacks. */
  private updateItem(k: KartState, t: number): void {
    const special = SPECIAL_OF[k.vehicle.id];
    let icon = '',
      name = '',
      count = '',
      cls = '';
    if (k.rollTime > 0) {
      const kind = ROULETTE[Math.floor(t * 14) % ROULETTE.length]!;
      icon = itemSkin(this.trackId, kind, special).icon;
      cls = 'roll';
    } else if (k.item) {
      const skin = itemSkin(this.trackId, k.item, special);
      icon = skin.icon;
      name = skin.name;
      count = k.item === 'boost3' && k.itemCount > 1 ? `×${k.itemCount}` : '';
      cls = k.trailing ? 'have hold' : 'have';
    }
    const active = k.special
      ? `${itemSkin(this.trackId, 'special', k.special.kind).icon} ${itemSkin(this.trackId, 'special', k.special.kind).name}!`
      : k.eagleTime > 0
        ? '🦅 The Eagles are coming!'
        : '';
    const threat =
      k.threat === 'whip'
        ? `🔥 ${itemSkin(this.trackId, 'whip').name.toUpperCase()}!`
        : k.threat === 'homing'
          ? `⚠ ${itemSkin(this.trackId, 'homing').name.toUpperCase()} INCOMING`
          : '';
    const key = `${icon}|${name}|${count}|${cls}|${active}|${threat}`;
    if (key === this.lastItem) return;
    this.lastItem = key;
    this.slot.className = `slot ${cls}`;
    this.slotIcon.textContent = icon;
    this.slotName.textContent = name;
    this.slotCount.textContent = count;
    this.warn.hidden = !threat && !active;
    this.warn.textContent = threat || active;
    this.warn.className = threat ? 'warn danger' : 'warn power';
  }

  update(k: KartState, lap: number, laps: number, t = 0): void {
    this.updateItem(k, t);
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
