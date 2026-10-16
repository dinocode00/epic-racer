import { type PadState, neutralPad } from '@epic/shared';

/** Anything that can drive a kart: keyboard, Xbox pad, phone, or autopilot. */
export interface InputSource {
  readonly kind: 'keyboard' | 'gamepad' | 'phone' | 'auto';
  readonly label: string;
  poll(): PadState;
}

export class KeyboardSource implements InputSource {
  readonly kind = 'keyboard';
  readonly label = 'Keyboard';
  private keys = new Set<string>();
  constructor() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }
  has(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }
  poll(): PadState {
    const p = neutralPad();
    p.steer = (this.has('ArrowRight', 'KeyD') ? 1 : 0) - (this.has('ArrowLeft', 'KeyA') ? 1 : 0);
    p.throttle = this.has('ArrowUp', 'KeyW') ? 1 : 0;
    p.brake = this.has('ArrowDown', 'KeyS') ? 1 : 0;
    p.drift = this.has('Space', 'ShiftLeft', 'ShiftRight');
    p.item = this.has('KeyE', 'KeyX', 'ControlLeft');
    p.lookBack = this.has('KeyC');
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
    const gp = navigator.getGamepads()[this.index];
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
    const gp = navigator.getGamepads()[this.index];
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
  constructor(readonly label: string) {}
  poll(): PadState {
    return this.state;
  }
}

/** Lists connected gamepads, keyed by index. */
export function connectedGamepads(): { index: number; id: string }[] {
  return [...navigator.getGamepads()]
    .filter((g): g is Gamepad => !!g && g.connected)
    .map((g) => ({ index: g.index, id: g.id }));
}
