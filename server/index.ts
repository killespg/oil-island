import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { AddressInfo } from 'node:net';
import { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { Combat, GameEvent, Input, Match } from './combat-types';

const ROOT = resolve(__dirname, '../..');
const FightSim: Combat = require(resolve(ROOT, 'combat.js'));
const STEP = 1 / 60;
const NEUTRAL: Input = Object.freeze({ x: 0, z: 0, block: false, sprint: false });
const ACTIONS = new Set(['punch', 'kick', 'special', 'dodge', 'jump']);
const ASSETS = new Map<string, string>([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/style.css', 'style.css'],
  ...['combat', 'scene', 'audio', 'run', 'game', 'network', 'performance'].map(name => [`/${name}.js`, `${name}.js`] as [string, string]),
  ['/vendor/three.min.js', 'vendor/three.min.js'], ['/vendor/THREE-LICENSE.txt', 'vendor/THREE-LICENSE.txt']
]);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_QUEUE = 12;
const INPUT_EXPIRY_MS = 200;
const MAX_BUFFER_BYTES = 128 * 1024;
const MAX_EVENTS = 240;

export interface ServerOptions {
  host?: string;
  port?: number;
  maxRooms?: number;
  maxConnections?: number;
  allowedOrigins?: string[];
  allowNoOriginLoopback?: boolean;
  waitingIdleMs?: number;
  connectionIdleMs?: number;
  maxMatchMs?: number;
}
interface Packet { seq: number; input: Input; actions: string[]; receivedAt: number }
interface Peer {
  ws: WebSocket;
  room: Room | null;
  playerId: number;
  queue: Packet[];
  input: Input;
  ack: number;
  lastReceived: number;
  lastInputAt: number;
  lastActivity: number;
  alive: boolean;
  tokens: number;
  tokenAt: number;
  lobbyAttempts: number[];
}
interface Room {
  code: string;
  arena: string;
  players: Peer[];
  state: Match | null;
  matchId: string;
  seed: number;
  tick: number;
  events: GameEvent[];
  eventId: number;
  ready: boolean[];
  createdAt: number;
  startedAt: number;
  finishedAt: number;
}
const boundedInteger = (value: string | undefined, fallback: number, min: number, max: number): number => {
  if (value === undefined) return fallback;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new Error(`Valor de configuração inválido: ${value}`);
  return result;
};

export function optionsFromEnvironment(): ServerOptions {
  return {
    host: process.env.HOST || '0.0.0.0',
    port: boundedInteger(process.env.PORT, 3000, 1, 65535),
    maxRooms: boundedInteger(process.env.MAX_ROOMS, 64, 1, 1024),
    maxConnections: boundedInteger(process.env.MAX_CONNECTIONS, 160, 2, 4096),
    allowedOrigins: (process.env.ALLOWED_ORIGIN || '').split(',').map(origin => origin.trim()).filter(Boolean),
    allowNoOriginLoopback: process.env.ALLOW_NO_ORIGIN_LOOPBACK !== '0'
  };
}

/** No test-only HTTP routes or state mutation endpoints are exposed. */
export function createArenaServer(options: ServerOptions = {}, combat: Combat = FightSim) {
  const config = {
    host: options.host ?? '0.0.0.0', port: options.port ?? 3000,
    maxRooms: options.maxRooms ?? 64, maxConnections: options.maxConnections ?? 160,
    allowedOrigins: new Set(options.allowedOrigins ?? []),
    allowNoOriginLoopback: options.allowNoOriginLoopback ?? true,
    waitingIdleMs: options.waitingIdleMs ?? 5 * 60_000,
    connectionIdleMs: options.connectionIdleMs ?? 60_000,
    maxMatchMs: options.maxMatchMs ?? 30 * 60_000
  };
  for (const origin of config.allowedOrigins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('ALLOWED_ORIGIN deve conter origens HTTP(S), sem caminho.');
  }
  const rooms = new Map<string, Room>();
  const peers = new Set<Peer>();
  let closing = false;
  const httpServer = createServer((request, response) => { void serve(request, response); });
  httpServer.requestTimeout = 15_000;
  httpServer.headersTimeout = 10_000;
  httpServer.keepAliveTimeout = 5_000;
  httpServer.maxHeadersCount = 40;
  httpServer.maxConnections = config.maxConnections + 32;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });

  function textResponse(response: ServerResponse, status: number, message: string): void {
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    response.end(message);
  }
  function requestOrigin(request: IncomingMessage): string | null {
    const host = request.headers.host;
    // Host becomes a CSP source, so reject source separators, paths and credentials.
    if (!host || !/^(?:\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.test(host)) return null;
    try { return new URL(`http://${host}`).origin; } catch { return null; }
  }
  function websocketSources(origin: string): string {
    const origins = config.allowedOrigins.size ? [...config.allowedOrigins] : [origin];
    return origins.map(value => {
      const parsed = new URL(value);
      return `${parsed.protocol === 'https:' ? 'wss:' : 'ws:'}//${parsed.host}`;
    }).join(' ');
  }
  async function serve(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (closing) return textResponse(response, 503, 'Servidor encerrando.');
    if (!['GET', 'HEAD'].includes(request.method || '')) return textResponse(response, 405, 'Método não permitido.');
    const origin = requestOrigin(request);
    if (!origin) return textResponse(response, 400, 'Host inválido.');
    let path: string;
    try { path = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname); }
    catch { return textResponse(response, 400, 'Caminho inválido.'); }
    if (path === '/healthz') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, rooms: rooms.size, players: peers.size, tickRate: 60, snapshotRate: 20 }));
      return;
    }
    const asset = ASSETS.get(path);
    if (!asset) return textResponse(response, 404, 'Não encontrado.');
    const file = resolve(ROOT, asset);
    try {
      const info = await stat(file);
      if (!info.isFile()) return textResponse(response, 404, 'Não encontrado.');
      const type = asset.endsWith('.html') ? 'text/html; charset=utf-8' : asset.endsWith('.css') ? 'text/css; charset=utf-8' : asset.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/plain; charset=utf-8';
      response.writeHead(200, {
        'Content-Type': type, 'Content-Length': info.size, 'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
        'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${websocketSources(origin)}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`
      });
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch { textResponse(response, 404, 'Não encontrado.'); }
  }
  function originAllowed(request: IncomingMessage): boolean {
    const origin = request.headers.origin;
    if (!origin) {
      const address = request.socket.remoteAddress;
      return config.allowNoOriginLoopback && (address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1');
    }
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) return false;
      if (config.allowedOrigins.size) return config.allowedOrigins.has(origin);
      return origin === requestOrigin(request);
    } catch { return false; }
  }
  function refuse(socket: Duplex, status: number): void {
    socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }
  httpServer.on('upgrade', (request, socket, head) => {
    if (closing || peers.size >= config.maxConnections) return refuse(socket, 503);
    if (request.url !== '/ws') return refuse(socket, 404);
    if (!originAllowed(request)) return refuse(socket, 403);
    wss.handleUpgrade(request, socket, head, ws => accept(ws));
  });
  function send(peer: Peer, message: object | string): void {
    if (peer.ws.readyState !== WebSocket.OPEN) return;
    if (peer.ws.bufferedAmount > MAX_BUFFER_BYTES) { peer.ws.close(1008, 'Conexão lenta demais.'); leave(peer); return; }
    peer.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
  }
  function error(peer: Peer, message: string): void { send(peer, { type: 'error', message }); }
  function resetPeer(peer: Peer): void {
    peer.queue.length = 0; peer.input = NEUTRAL; peer.ack = 0; peer.lastReceived = 0; peer.lastInputAt = 0;
  }
  function closeRoom(room: Room, departed?: Peer): void {
    if (!rooms.delete(room.code)) return;
    for (const peer of room.players) {
      peer.room = null; resetPeer(peer); peer.lastActivity = performance.now();
      if (peer !== departed) send(peer, { type: 'peerLeft', winner: room.state ? peer.playerId : null });
    }
    room.events.length = 0;
  }
  function leave(peer: Peer): void {
    if (peer.room) closeRoom(peer.room, peer);
  }
  function drainEvents(room: Room): void {
    for (const event of room.state!.events) room.events.push({ ...event, id: ++room.eventId });
    room.state!.events.length = 0;
    if (room.events.length > MAX_EVENTS) {
      for (const peer of room.players) error(peer, 'Partida interrompida por excesso de eventos.');
      closeRoom(room);
    }
  }
  function broadcastState(room: Room): void {
    if (!room.state || !rooms.has(room.code)) return;
    const message = JSON.stringify({ type: 'state', matchId: room.matchId, seed: room.seed, tick: room.tick, ack: room.players.map(peer => peer.ack), state: combat.snapshot(room.state), events: room.events });
    room.events.length = 0;
    for (const peer of room.players) send(peer, message);
  }
  function start(room: Room): void {
    room.matchId = randomUUID(); room.seed = randomBytes(4).readUInt32LE() || 1;
    room.state = combat.createMatch({ multiplayer: true, seed: room.seed, arena: room.arena });
    room.tick = 0; room.eventId = 0; room.events = []; room.ready = [false, false];
    room.startedAt = performance.now(); room.finishedAt = 0;
    room.players.forEach(resetPeer);
    drainEvents(room); broadcastState(room);
  }
  function lobbyAllowed(peer: Peer): boolean {
    const now = performance.now();
    peer.lobbyAttempts = peer.lobbyAttempts.filter(time => now - time < 10_000);
    peer.lobbyAttempts.push(now);
    if (peer.lobbyAttempts.length > 10) { peer.ws.close(1008, 'Muitas tentativas de sala.'); leave(peer); return false; }
    return true;
  }
  function host(peer: Peer, arena: unknown): void {
    if (!lobbyAllowed(peer)) return;
    if (peer.room) return error(peer, 'Você já está em uma sala.');
    if (typeof arena !== 'string' || !Object.hasOwn(combat.arenas, arena)) return error(peer, 'Arena inválida.');
    if (rooms.size >= config.maxRooms) return error(peer, 'Servidor cheio. Tente novamente em instantes.');
    let code: string;
    do { code = [...randomBytes(6)].map(byte => CODE_ALPHABET[byte & 31]).join(''); } while (rooms.has(code));
    const room: Room = { code, arena, players: [peer], state: null, matchId: '', seed: 0, tick: 0, events: [], eventId: 0, ready: [false, false], createdAt: performance.now(), startedAt: 0, finishedAt: 0 };
    rooms.set(code, room); peer.room = room; peer.playerId = 0;
    send(peer, { type: 'welcome', code, playerId: 0 }); send(peer, { type: 'waiting', code });
  }
  function join(peer: Peer, value: unknown): void {
    if (!lobbyAllowed(peer)) return;
    if (peer.room) return error(peer, 'Você já está em uma sala.');
    const code = typeof value === 'string' ? value.toUpperCase() : '';
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) return error(peer, 'Código de sala inválido.');
    const room = rooms.get(code);
    if (!room || room.players.length !== 1) return error(peer, 'Sala indisponível. Confira o código.');
    peer.room = room; peer.playerId = 1; room.players.push(peer);
    send(peer, { type: 'welcome', code, playerId: 1 }); start(room);
  }
  function inputPacket(peer: Peer, message: Record<string, unknown>): void {
    if (!peer.room?.state) return error(peer, 'Aguarde o segundo jogador.');
    const seq = message.seq, source = message.input, actions = message.actions;
    if (!Number.isSafeInteger(seq) || typeof seq !== 'number' || seq !== peer.lastReceived + 1 || seq > 1_000_000_000) return error(peer, 'Sequência de comandos inválida.');
    if (!source || typeof source !== 'object' || Array.isArray(source)) return error(peer, 'Comando inválido.');
    const input = source as Record<string, unknown>;
    if (typeof input.x !== 'number' || !Number.isFinite(input.x) || typeof input.z !== 'number' || !Number.isFinite(input.z) || typeof input.block !== 'boolean' || typeof input.sprint !== 'boolean') return error(peer, 'Movimento inválido.');
    if (!Array.isArray(actions) || actions.length > 2 || actions.some(action => typeof action !== 'string' || !ACTIONS.has(action) || !Object.hasOwn(combat.moves, action))) return error(peer, 'Ação inválida.');
    if (peer.queue.length >= MAX_QUEUE) { peer.ws.close(1008, 'Fila de comandos excedida.'); leave(peer); return; }
    const length = Math.hypot(input.x, input.z), scale = length > 1 ? length : 1;
    const normalized = { x: input.x / scale, z: input.z / scale, block: input.block, sprint: input.sprint };
    // Extremely large finite components can overflow hypot; they still become a neutral legal vector.
    peer.lastReceived = seq; peer.lastInputAt = performance.now();
    peer.queue.push({ seq, input: normalized, actions: [...new Set(actions)] as string[], receivedAt: peer.lastInputAt });
  }
  function receive(peer: Peer, data: Buffer, binary: boolean): void {
    if (peer.ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    peer.tokens = Math.min(150, peer.tokens + (now - peer.tokenAt) * .12); peer.tokenAt = now;
    if (--peer.tokens < 0 || binary) { peer.ws.close(1008, 'Limite de mensagens excedido.'); leave(peer); return; }
    let message: Record<string, unknown>;
    try { const parsed: unknown = JSON.parse(data.toString()); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); message = parsed as Record<string, unknown>; }
    catch { return error(peer, 'Mensagem inválida.'); }
    peer.lastActivity = now;
    switch (message.type) {
      case 'host': host(peer, message.arena); break;
      case 'join': join(peer, message.code); break;
      case 'input': inputPacket(peer, message); break;
      case 'rematch': {
        const room = peer.room;
        if (!room?.state || room.state.phase !== 'matchOver') return error(peer, 'A revanche fica disponível ao fim da partida.');
        room.ready[peer.playerId] = true;
        for (const player of room.players) send(player, { type: 'rematch', ready: room.ready });
        if (room.ready.every(Boolean)) start(room);
        break;
      }
      case 'ping': if (typeof message.at === 'number' && Number.isFinite(message.at)) send(peer, { type: 'pong', at: message.at }); else error(peer, 'Ping inválido.'); break;
      default: error(peer, 'Tipo de mensagem inválido.');
    }
  }
  function accept(ws: WebSocket): void {
    const now = performance.now();
    const peer: Peer = { ws, room: null, playerId: 0, queue: [], input: NEUTRAL, ack: 0, lastReceived: 0, lastInputAt: 0, lastActivity: now, alive: true, tokens: 150, tokenAt: now, lobbyAttempts: [] };
    peers.add(peer);
    ws.on('message', (data, binary) => receive(peer, data as Buffer, binary));
    ws.on('pong', () => { peer.alive = true; });
    ws.on('error', () => { leave(peer); });
    ws.on('close', () => { leave(peer); peers.delete(peer); });
  }
  function tick(now: number): void {
    for (const room of rooms.values()) {
      if (!room.state) continue;
      const inputs: Input[] = [];
      for (const peer of room.players) {
        if (now - peer.lastInputAt > INPUT_EXPIRY_MS) {
          peer.input = NEUTRAL; peer.ack = peer.lastReceived; peer.queue.length = 0;
        }
        const packet = peer.queue.shift();
        if (packet) {
          peer.ack = packet.seq;
          if (now - packet.receivedAt <= INPUT_EXPIRY_MS) {
            peer.input = packet.input;
            const fighter = room.state.fighters[peer.playerId];
            fighter._inputX = packet.input.x; fighter._inputZ = packet.input.z;
            for (const action of packet.actions) combat.act(room.state, peer.playerId, action);
          }
        }
        inputs.push(peer.input);
      }
      combat.stepPlayers(room.state, STEP, inputs); room.tick++;
      drainEvents(room);
      if (room.state.phase === 'matchOver' && !room.finishedAt) room.finishedAt = now;
      if (room.tick % 3 === 0) broadcastState(room);
    }
  }
  let lastTime = performance.now(), accumulator = 0;
  const simulationTimer = setInterval(() => {
    const now = performance.now();
    accumulator += Math.min((now - lastTime) / 1000, STEP * 4); lastTime = now;
    while (accumulator >= STEP) { tick(now); accumulator -= STEP; }
  }, 8);
  const cleanupTimer = setInterval(() => {
    const now = performance.now();
    for (const room of rooms.values()) {
      const expired = !room.state ? now - room.createdAt > config.waitingIdleMs : room.finishedAt ? now - room.finishedAt > config.waitingIdleMs : now - room.startedAt > config.maxMatchMs;
      if (expired) { for (const peer of room.players) error(peer, 'Sala encerrada por tempo limite.'); closeRoom(room); }
    }
    for (const peer of peers) if (!peer.room && now - peer.lastActivity > config.connectionIdleMs) peer.ws.close(1000, 'Conexão inativa.');
  }, 250);
  const heartbeatTimer = setInterval(() => {
    for (const peer of peers) {
      if (!peer.alive) { leave(peer); peer.ws.terminate(); continue; }
      peer.alive = false; peer.ws.ping();
    }
  }, 15_000);
  let closed: Promise<void> | null = null;
  return {
    httpServer,
    stats: () => ({ rooms: rooms.size, players: peers.size }),
    listen: () => new Promise<AddressInfo>((resolveAddress, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(config.port, config.host, () => { httpServer.removeListener('error', reject); resolveAddress(httpServer.address() as AddressInfo); });
    }),
    close: (): Promise<void> => {
      if (closed) return closed;
      closing = true; clearInterval(simulationTimer); clearInterval(cleanupTimer); clearInterval(heartbeatTimer);
      rooms.clear();
      for (const peer of peers) { peer.room = null; peer.ws.close(1001, 'Servidor reiniciando.'); }
      closed = new Promise<void>(resolveClosed => {
        const timeout = setTimeout(() => { for (const peer of peers) peer.ws.terminate(); httpServer.closeAllConnections(); }, 1000);
        httpServer.close(() => { wss.close(() => { clearTimeout(timeout); resolveClosed(); }); });
      });
      return closed;
    }
  };
}

if (require.main === module) {
  const server = createArenaServer(optionsFromEnvironment());
  server.listen().then(address => console.log(`NEON CLASH online em http://${address.address}:${address.port} (60 Hz / 20 snapshots/s)`)).catch(error => { console.error(error); void server.close().then(() => { process.exitCode = 1; }); });
  const shutdown = () => { void server.close().then(() => { process.exitCode = 0; }); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
}
