import { type PadState, neutralPad } from '@epic/shared';

/** Anything that can drive a kart: keyboard, Xbox pad, phone, or autopilot. */
export interface InputSource {
  readonly kind: 'keyboard' | 'gamepad' | 'phone' | 'auto';
  readonly label: string;
  poll(): PadState;
}

/** Which keys a keyboard player drives with: everything, or one half of a shared keyboard. */
export type KeyScheme = 'all' | 'arrows' | 'wasd';

const KEYS: Record<
  KeyScheme,
  {
    left: string[];
    right: string[];
    gas: string[];
    brake: string[];
    drift: string[];
    item: string[];
    back: string[];
  }
> = {
  all: {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    gas: ['ArrowUp', 'KeyW'],
    brake: ['ArrowDown', 'KeyS'],
    drift: ['Space', 'ShiftLeft', 'ShiftRight'],
    item: ['KeyE', 'KeyX', 'ControlLeft'],
    back: ['KeyC'],
  },
  arrows: {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    gas: ['ArrowUp'],
    brake: ['ArrowDown'],
    drift: ['ShiftRight', 'Slash', 'Numpad0'],
    item: ['Period', 'ControlRight'],
    back: ['Comma'],
  },
  wasd: {
    left: ['KeyA'],
    right: ['KeyD'],
    gas: ['KeyW'],
    brake: ['KeyS'],
    drift: ['Space', 'ShiftLeft'],
    item: ['KeyE', 'ControlLeft'],
    back: ['KeyC'],
  },
};

/** One shared set of held keys, so several keyboard players can split one keyboard. */
const held = new Set<string>();
let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('keydown', (e) => {
    held.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());
}

export class KeyboardSource implements InputSource {
  readonly kind = 'keyboard';
  readonly label: string;
  constructor(readonly scheme: KeyScheme = 'all') {
    this.label = scheme === 'all' ? 'Keyboard' : scheme === 'arrows' ? 'Arrow keys' : 'WASD';
    listen();
  }
  has(...codes: string[]): boolean {
    return codes.some((c) => held.has(c));
  }
  poll(): PadState {
    const k = KEYS[this.scheme];
    const p = neutralPad();
    p.steer = (this.has(...k.right) ? 1 : 0) - (this.has(...k.left) ? 1 : 0);
    p.throttle = this.has(...k.gas) ? 1 : 0;
    p.brake = this.has(...k.brake) ? 1 : 0;
    p.drift = this.has(...k.drift);
    p.item = this.has(...k.item);
    p.lookBack = this.has(...k.back);
    p.pause = this.has('Escape', 'KeyP');
    return p;
  }
}

/** Xbox (standard mapping): stick steers, RT gas, LT brake, A/RB drift, X/LB item, Y look back. */
export class GamepadSource implements InputSource {
  readonly kind = 'gamepad';
  constructor(
    readonly index: number,
    readonly label: string,
  ) {}
  poll(): PadState {
    const gp = gamepads()[this.index];
    const p = neutralPad();
    if (!gp) return p;
    const b = (i: number) => gp.buttons[i]?.value ?? 0;
    const pressed = (i: number) => gp.buttons[i]?.pressed ?? false;
    const x = gp.axes[0] ?? 0;
    const dz = 0.15;
    p.steer = Math.abs(x) < dz ? 0 : Math.sign(x) * ((Math.abs(x) - dz) / (1 - dz));
    if (pressed(14)) p.steer = -1;
    if (pressed(15)) p.steer = 1;
    p.throttle = Math.max(b(7), pressed(12) ? 1 : 0);
    p.brake = Math.max(b(6), pressed(13) ? 1 : 0);
    p.drift = pressed(0) || pressed(5);
    p.item = pressed(2) || pressed(4);
    p.lookBack = pressed(3);
    p.pause = pressed(9);
    return p;
  }
  rumble(strength: number, ms: number): void {
    const gp = gamepads()[this.index];
    void gp?.vibrationActuator?.playEffect('dual-rumble', {
      duration: ms,
      strongMagnitude: strength,
      weakMagnitude: strength,
    });
  }
}

/** Input from a phone, pushed in by the network layer. */
export class PhoneSource implements InputSource {
  readonly kind = 'phone';
  state: PadState = neutralPad();
  lastSeen = performance.now();
  private itemPressAt = -Infinity;
  constructor(readonly label: string) {}
  receive(pad: PadState): void {
    if (pad.item && !this.state.item) this.itemPressAt = performance.now();
    this.state = pad;
    this.lastSeen = performance.now();
  }
  poll(): PadState {
    // A quick tap's press and release can arrive in the same burst over Wi-Fi, between two
    // reads; keep the press showing for a few sim steps so the game always sees it.
    if (!this.state.item && performance.now() - this.itemPressAt < 80)
      return { ...this.state, item: true };
    return this.state;
  }
}

/** Lists connected gamepads, keyed by index. */
/** Safe getGamepads: some embedded pages forbid controller access and throw. */
export function gamepads(): (Gamepad | null)[] {
  try {
    return [...(navigator.getGamepads?.() ?? [])];
  } catch {
    return [];
  }
}

export function connectedGamepads(): { index: number; id: string }[] {
  return gamepads()
    .filter((g): g is Gamepad => !!g && g.connected)
    .map((g) => ({ index: g.index, id: g.id }));
}
