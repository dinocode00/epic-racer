/**
 * Epic Racer local server. One process, LAN only, no game logic:
 *  - serves the game page (/) and the phone controller (/c/)
 *  - relays phone input to the game host over a WebSocket
 *  - prints the join URL and a QR code
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import {
  DEFAULT_PORT,
  type HostToServer,
  type PadToHost,
  type ServerInfo,
  type ServerToHost,
  WS_PATH,
  prefixSlot,
} from '@epic/shared';

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const GAME_DIR = join(ROOT, 'apps/game/dist');
const PAD_DIR = join(ROOT, 'apps/controller/dist');
const MAX_PADS = 8;
const RECONNECT_GRACE_MS = 60_000;

const ROOM = Array.from(
  { length: 4 },
  () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)],
).join('');

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  // Prefer typical home-network ranges first.
  const rank = (ip: string) =>
    ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3;
  return out.sort((a, b) => rank(a) - rank(b));
}

const lan = lanAddresses();
const host = process.env.PUBLIC_HOST ?? lan[0] ?? 'localhost';
const controllerUrl = `http://${host}:${PORT}/c/`;

// ---------- static files ----------
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

async function serveFile(res: ServerResponse, dir: string, rel: string): Promise<void> {
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, '');
  let file = join(dir, safe);
  if (!file.startsWith(dir)) return void res.writeHead(403).end();
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    // SPA fallback to the app's index.html
    try {
      const body = await readFile(join(dir, 'index.html'));
      res.writeHead(200, { 'content-type': TYPES['.html']! });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not built yet. Run: pnpm build');
    }
  }
}

let qrSvg = '';
async function info(): Promise<ServerInfo> {
  if (!qrSvg)
    qrSvg = await QRCode.toString(controllerUrl, {
      type: 'svg',
      margin: 1,
      color: { dark: '#111111', light: '#ffffff' },
    });
  return { room: ROOM, controllerUrl, qrSvg, lanAddresses: lan };
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return void res.end(JSON.stringify(await info()));
  }
  if (url.pathname === '/c') return void res.writeHead(302, { location: '/c/' }).end();
  if (url.pathname.startsWith('/c/')) return serveFile(res, PAD_DIR, url.pathname.slice(3));
  return serveFile(res, GAME_DIR, url.pathname.slice(1));
});

// ---------- websocket relay ----------
interface PadConn {
  slot: number;
  playerId: string;
  name: string;
  ws: WebSocket | null;
  lostAt: number;
}

let hostWs: WebSocket | null = null;
const pads = new Map<number, PadConn>();

const sendHost = (m: ServerToHost) => hostWs?.readyState === 1 && hostWs.send(JSON.stringify(m));

function freeSlot(playerId: string): number {
  for (const [slot, p] of pads) if (p.playerId === playerId) return slot; // reconnect
  const now = Date.now();
  for (const [slot, p] of pads) if (!p.ws && now - p.lostAt > RECONNECT_GRACE_MS) pads.delete(slot);
  for (let s = 0; s < MAX_PADS; s++) if (!pads.has(s)) return s;
  return -1;
}

const wss = new WebSocketServer({ server, path: WS_PATH });
wss.on('connection', (ws, req) => {
  const role = new URL(req.url ?? '', 'http://x').searchParams.get('role');
  if (role === 'host') {
    hostWs?.close(4000, 'replaced by a new game window');
    hostWs = ws;
    console.log('[host] game window connected');
    for (const p of pads.values())
      if (p.ws) sendHost({ t: 'padJoined', slot: p.slot, playerId: p.playerId, name: p.name });
    ws.on('message', (data: RawData, isBinary) => {
      if (isBinary) return;
      try {
        const m = JSON.parse(String(data)) as HostToServer;
        if (m.t === 'toPad') {
          const p = pads.get(m.slot);
          if (p?.ws?.readyState === 1) p.ws.send(JSON.stringify(m.msg));
        }
      } catch {
        /* ignore malformed */
      }
    });
    ws.on('close', () => {
      if (hostWs === ws) hostWs = null;
      console.log('[host] game window disconnected');
    });
    return;
  }

  // Phone controller.
  let me: PadConn | null = null;
  ws.on('message', (data: RawData, isBinary) => {
    if (isBinary) {
      if (!me || !hostWs || hostWs.readyState !== 1) return;
      const frame =
        data instanceof Buffer ? new Uint8Array(data) : new Uint8Array(data as ArrayBuffer);
      hostWs.send(prefixSlot(me.slot, frame));
      return;
    }
    let m: PadToHost;
    try {
      m = JSON.parse(String(data)) as PadToHost;
    } catch {
      return;
    }
    if (m.t === 'hello') {
      const slot = freeSlot(m.playerId);
      if (slot < 0) return void ws.close(4001, 'room full');
      const name = String(m.name).slice(0, 12) || 'Player';
      const prev = pads.get(slot);
      if (prev?.ws && prev.ws !== ws) prev.ws.close(4002, 'opened elsewhere');
      me = { slot, playerId: m.playerId, name, ws, lostAt: 0 };
      pads.set(slot, me);
      console.log(`[pad] ${name} joined in slot ${slot}`);
      sendHost({ t: 'padJoined', slot, playerId: m.playerId, name });
      return;
    }
    if (me) sendHost({ t: 'padMsg', slot: me.slot, msg: m });
  });
  ws.on('close', () => {
    if (!me || pads.get(me.slot) !== me) return;
    me.ws = null;
    me.lostAt = Date.now();
    console.log(`[pad] ${me.name} disconnected`);
    sendHost({ t: 'padLeft', slot: me.slot });
  });
});

server.listen(PORT, '0.0.0.0', async () => {
  const term = await QRCode.toString(controllerUrl, { type: 'terminal', small: true });
  console.log(`\n  EPIC RACER is running.\n`);
  console.log(`  1. On the laptop connected to the TV, open:  http://localhost:${PORT}/`);
  console.log(`  2. Phones join at:                           ${controllerUrl}   (room ${ROOM})\n`);
  console.log(term);
  if (lan.length > 1) console.log(`  Other addresses: ${lan.slice(1).join(', ')}\n`);
});
