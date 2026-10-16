import {
  type HostToPad,
  type HostToServer,
  type PadState,
  type ServerInfo,
  type ServerToHost,
  WS_PATH,
  decodeInput,
} from '@epic/shared';

/** Game-host side of the local server link. Silently retries if the server isn't running. */
export class Net {
  private ws: WebSocket | null = null;
  info: ServerInfo | null = null;
  connected = false;
  /** True when the page isn't served by the home server (e.g. a hosted copy): no phones. */
  standalone = false;
  private misses = 0;
  /** Counters for diagnostics. */
  stats = { inputs: 0, messages: 0, other: '' };
  onJoin?: (slot: number, playerId: string, name: string) => void;
  onLeave?: (slot: number) => void;
  onMsg?: (slot: number, msg: Extract<ServerToHost, { t: 'padMsg' }>['msg']) => void;
  onInput?: (slot: number, pad: PadState) => void;
  onInfo?: (info: ServerInfo | null) => void;

  start(): void {
    void this.fetchInfo();
    this.connect();
  }

  private async fetchInfo(): Promise<void> {
    let r: Response;
    try {
      r = await fetch('/api/info');
    } catch {
      // The server may still be starting; after a couple of misses, offer couch mode meanwhile.
      if (++this.misses === 2) {
        this.standalone = true;
        this.onInfo?.(null);
      }
      setTimeout(() => void this.fetchInfo(), 3000);
      return;
    }
    try {
      if (!r.ok) throw new Error(String(r.status));
      this.info = (await r.json()) as ServerInfo;
      if (this.standalone) {
        this.standalone = false; // the home server came up after all
        this.connect();
      }
    } catch {
      // Something answered, but it isn't our server: run keyboard / Xbox only.
      this.standalone = true;
      this.ws?.close();
    }
    this.onInfo?.(this.info);
  }

  private connect(): void {
    if (this.standalone) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}${WS_PATH}?role=host`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => (this.connected = true);
    ws.onclose = () => {
      this.connected = false;
      setTimeout(() => this.connect(), 2000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      this.stats.messages++;
      if (typeof e.data !== 'string') this.stats.other = Object.prototype.toString.call(e.data);
      if (e.data instanceof ArrayBuffer) {
        this.stats.inputs++;
        const bytes = new Uint8Array(e.data);
        const decoded = decodeInput(bytes.subarray(1));
        if (decoded) this.onInput?.(bytes[0]!, decoded.pad);
        return;
      }
      const m = JSON.parse(e.data as string) as ServerToHost;
      if (m.t === 'padJoined') this.onJoin?.(m.slot, m.playerId, m.name);
      else if (m.t === 'padLeft') this.onLeave?.(m.slot);
      else if (m.t === 'padMsg') this.onMsg?.(m.slot, m.msg);
    };
  }

  send(slot: number, msg: HostToPad): void {
    if (this.ws?.readyState !== 1) return;
    const m: HostToServer = { t: 'toPad', slot, msg };
    this.ws.send(JSON.stringify(m));
  }
}
