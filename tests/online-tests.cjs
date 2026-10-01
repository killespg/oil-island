'use strict';
// Integration tests use actual HTTP and WebSocket clients. No browser or renderer starts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { request } = require('node:http');
const { WebSocket } = require('ws');
const { createArenaServer, optionsFromEnvironment } = require('../dist/server/index.js');
const FightSim = require('../combat.js');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const neutral = { x: 0, z: 0, block: false, sprint: false };
const fastCombat = {
  ...FightSim,
  createMatch(options) { const state = FightSim.createMatch(options); state.phase = 'fight'; return state; }
};

async function fixture(t, options = {}, combat = FightSim) {
  const server = createArenaServer({ host: '127.0.0.1', port: 0, ...options }, combat);
  const address = await server.listen();
  const http = `http://127.0.0.1:${address.port}`, url = `ws://127.0.0.1:${address.port}/ws`;
  t.after(() => server.close());
  return { server, http, url };
}

function connect(url, options = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options), messages = [], listeners = new Set();
    let closed;
    const close = new Promise(done => ws.on('close', (code, reason) => { closed = { code, reason: reason.toString() }; done(closed); }));
    ws.on('error', reject);
    ws.on('message', raw => { const message = JSON.parse(raw.toString()); messages.push(message); for (const fn of listeners) fn(message); });
    ws.on('open', () => resolve({
      ws, messages, close,
      send: message => ws.send(JSON.stringify(message)),
      wait(predicate, timeout = 2500) {
        const existing = messages.find(predicate);
        if (existing) return Promise.resolve(existing);
        if (closed) return Promise.reject(new Error(`Conexão fechada: ${JSON.stringify(closed)}`));
        return new Promise((done, fail) => {
          const timer = setTimeout(() => { listeners.delete(fn); fail(new Error(`Tempo limite; mensagens: ${JSON.stringify(messages.slice(-2))}`)); }, timeout);
          const fn = message => { if (predicate(message)) { clearTimeout(timer); listeners.delete(fn); done(message); } };
          listeners.add(fn);
        });
      }
    }));
  });
}
async function pair(url, arena = 'skyline') {
  const a = await connect(url), b = await connect(url);
  a.send({ type: 'host', arena });
  const welcome = await a.wait(message => message.type === 'welcome');
  b.send({ type: 'join', code: welcome.code });
  const initial = await a.wait(message => message.type === 'state');
  await b.wait(message => message.type === 'state');
  return { a, b, code: welcome.code, initial };
}
function command(client, seq, input = neutral, actions = [], extra = {}) {
  client.send({ type: 'input', seq, input, actions, ...extra });
}

test('serves only the public game assets and safe health data', async t => {
  const { http } = await fixture(t);
  const response = await fetch(http);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.match(await response.text(), /NEON CLASH/);
  for (const asset of ['combat.js', 'network.js', 'performance.js', 'vendor/three.min.js']) assert.equal((await fetch(`${http}/${asset}`)).status, 200);
  for (const path of ['server/index.ts', 'dist/server/index.js', 'package.json', 'package-lock.json', '.git/config', '.env', 'tests/online-tests.cjs', 'evidencias/v2-browser-results.json', '%2e%2e/.git/config', '%00', 'vendor/README.txt']) {
    assert.equal((await fetch(`${http}/${path}`)).status, 404, `private path ${path}`);
  }
  assert.equal((await fetch(http, { method: 'POST', body: 'nope' })).status, 405);
  assert.equal((await fetch(`${http}/combat.js`, { method: 'HEAD' })).status, 200);
  assert.deepEqual(await (await fetch(`${http}/healthz`)).json(), { ok: true, rooms: 0, players: 0, tickRate: 60, snapshotRate: 20 });
});

test('same-origin upgrades work, cross-origin and unexpected paths are rejected', async t => {
  const { url, http } = await fixture(t);
  const good = await connect(url, { origin: http });
  good.send({ type: 'ping', at: 42 });
  assert.equal((await good.wait(message => message.type === 'pong')).at, 42);
  await assert.rejects(connect(url, { origin: 'https://attacker.invalid' }), /403/);
  await assert.rejects(connect(url.replace('/ws', '/anything')), /404/);
  await assert.rejects(connect(url, { origin: 'null' }), /403/);
});

test('CSP permits explicit same-host WebSocket URLs without trusting hostile Host values', async t => {
  const { http } = await fixture(t);
  const response = await fetch(http);
  const connectSource = response.headers.get('content-security-policy').split(';').find(directive => directive.trim().startsWith('connect-src'));
  assert.equal(connectSource.trim(), `connect-src 'self' ${http.replace('http:', 'ws:')}`);
  const malicious = await new Promise((resolve, reject) => {
    const req = request(http, { headers: { Host: "localhost; connect-src *" } }, response => {
      response.resume(); resolve(response);
    });
    req.on('error', reject); req.end();
  });
  assert.equal(malicious.statusCode, 400);
  assert.equal(malicious.headers['content-security-policy'], undefined);
});

test('HTTPS proxy CSP lists only explicitly configured secure WebSocket origins', async t => {
  const { http } = await fixture(t, { allowedOrigins: ['https://arena.example', 'https://duel.example:8443'] });
  const response = await fetch(http);
  const connectSource = response.headers.get('content-security-policy').split(';').find(directive => directive.trim().startsWith('connect-src'));
  assert.equal(connectSource.trim(), "connect-src 'self' wss://arena.example wss://duel.example:8443");
});

test('an explicit public HTTPS origin supports a reverse proxy and can disable no-origin clients', async t => {
  const { url } = await fixture(t, { allowedOrigins: ['https://arena.example'], allowNoOriginLoopback: false });
  await assert.rejects(connect(url), /403/);
  await assert.rejects(connect(url, { origin: 'https://other.example' }), /403/);
  const good = await connect(url, { origin: 'https://arena.example' });
  good.send({ type: 'host', arena: 'void' });
  assert.match((await good.wait(message => message.type === 'welcome')).code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
});

test('two peers share the same authoritative match, seed, player identities and snapshots', async t => {
  const { url } = await fixture(t);
  const { a, b, initial, code } = await pair(url, 'reactor');
  assert.equal((await a.wait(message => message.type === 'welcome')).playerId, 0);
  assert.equal((await b.wait(message => message.type === 'welcome')).playerId, 1);
  assert.equal((await b.wait(message => message.type === 'welcome')).code, code);
  assert.equal(initial.state.arena, 'reactor');
  assert.equal(initial.state.multiplayer, true);
  assert.deepEqual(initial.ack, [0, 0]);
  assert.equal(initial.tick, 0);
  assert.equal(initial.seed, initial.state._rng);
  assert.equal(initial.events[0].type, 'roundStart');
  assert.deepEqual(initial, await b.wait(message => message.type === 'state' && message.tick === 0));
  const later = await a.wait(message => message.type === 'state' && message.tick >= 12);
  assert.equal(later.tick % 3, 0);
  assert.deepEqual(later, await b.wait(message => message.type === 'state' && message.tick === later.tick));
  const ids = a.messages.filter(message => message.type === 'state').flatMap(message => message.events).map(event => event.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('only each peer controls its own fighter and input cannot spoof HP, time, winner or upgrades', async t => {
  const { url } = await fixture(t, {}, fastCombat);
  const { a, b, initial } = await pair(url);
  command(a, 1, { ...neutral, x: 1 }, [], { playerId: 1, dt: 99999, hp: 99999, winner: 0, upgrades: { power: 99 }, state: { phase: 'matchOver' } });
  command(b, 1, { ...neutral, z: 1 });
  const state = await a.wait(message => message.type === 'state' && message.ack[0] === 1 && message.ack[1] === 1);
  assert(state.state.fighters[0].x > initial.state.fighters[0].x);
  assert.equal(state.state.fighters[0].z, 0);
  assert(state.state.fighters[1].z > 0);
  assert.equal(state.state.fighters[1].x, initial.state.fighters[1].x);
  assert.equal(state.state.fighters[0].hp, 100);
  assert.equal(state.state.fighters[1].hp, 100);
  assert.equal(state.state.winner, null);
  assert.equal(state.state.phase, 'fight');
  assert(state.state.timeLeft < 75 && state.state.timeLeft > 74);
  assert.deepEqual(state.state.upgrades, { power: 0, flow: 0, guard: 0 });
});

test('invalid numbers, types, actions and sequences are rejected without poisoning the next input', async t => {
  const { url } = await fixture(t, {}, fastCombat);
  const { a } = await pair(url);
  const bad = [
    { seq: 1, input: { ...neutral, x: '1' }, actions: [] },
    { seq: 1, input: { ...neutral, block: 1 }, actions: [] },
    { seq: 1, input: { ...neutral, z: null }, actions: [] },
    { seq: 1, input: neutral, actions: ['kill'] },
    { seq: 1, input: neutral, actions: ['punch', 'kick', 'special'] },
    { seq: 2, input: neutral, actions: [] },
    { seq: 0, input: neutral, actions: [] }
  ];
  bad.forEach(message => a.send({ type: 'input', ...message }));
  a.ws.send('{"type":"input","seq":1,"input":{"x":1e999,"z":0,"block":false,"sprint":false},"actions":[]}');
  a.ws.send('{not json}');
  command(a, 1);
  await a.wait(message => message.type === 'state' && message.ack[0] === 1);
  assert.equal(a.messages.filter(message => message.type === 'error').length, 9);
  command(a, 1);
  command(a, 2);
  await a.wait(message => message.type === 'state' && message.ack[0] === 2);
  assert.equal(a.messages.filter(message => message.type === 'error').length, 10);
});

test('movement magnitude is clamped and stale movement/blocking is released automatically', async t => {
  const { url } = await fixture(t, {}, fastCombat);
  const { a, initial } = await pair(url);
  command(a, 1, { x: 1e100, z: 1e100, block: true, sprint: false });
  const active = await a.wait(message => message.type === 'state' && message.ack[0] === 1);
  assert(Math.hypot(active.state.fighters[0]._inputX, active.state.fighters[0]._inputZ) <= 1.000001);
  const stopped = await a.wait(message => message.type === 'state' && message.tick >= active.tick + 21);
  assert.equal(stopped.state.fighters[0]._inputX, 0);
  assert.equal(stopped.state.fighters[0]._inputZ, 0);
  assert.equal(stopped.state.fighters[0]._blockHeld, false);
  const later = await a.wait(message => message.type === 'state' && message.tick >= stopped.tick + 12);
  assert.equal(later.state.fighters[0].x, stopped.state.fighters[0].x);
  assert.equal(later.state.fighters[0].z, stopped.state.fighters[0].z);
  assert(Math.hypot(later.state.fighters[0].x - initial.state.fighters[0].x, later.state.fighters[0].z) < 1.5);
});

test('queues consume at most one command per simulation tick and events are delivered exactly once', async t => {
  const { url } = await fixture(t, {}, fastCombat);
  const { a } = await pair(url);
  for (let seq = 1; seq <= 8; seq++) command(a, seq, neutral, seq === 1 ? ['punch'] : []);
  const done = await a.wait(message => message.type === 'state' && message.ack[0] === 8);
  const snapshots = a.messages.filter(message => message.type === 'state');
  for (let index = 1; index < snapshots.length; index++) {
    assert(snapshots[index].ack[0] - snapshots[index - 1].ack[0] <= snapshots[index].tick - snapshots[index - 1].tick);
  }
  assert(done.tick >= 8);
  await a.wait(message => message.type === 'state' && message.tick >= done.tick + 6);
  const events = a.messages.filter(message => message.type === 'state').flatMap(message => message.events);
  assert.equal(events.filter(event => event.type === 'attack' && event.move === 'punch').length, 1);
  assert.equal(events.length, new Set(events.map(event => event.id)).size);
});

test('live simulation rejects premature rematches and rejects third players', async t => {
  const { url } = await fixture(t, {}, fastCombat);
  const { a, code } = await pair(url);
  a.send({ type: 'rematch' });
  assert.match((await a.wait(message => message.type === 'error')).message, /fim da partida/);
  const third = await connect(url);
  third.send({ type: 'join', code });
  assert.match((await third.wait(message => message.type === 'error')).message, /indisponível/);
});

test('rematch requires both peers, creates a new matchId and resets both sequence numbers', async t => {
  const finishedCombat = { ...FightSim, createMatch(options) { const state = FightSim.createMatch(options); state.phase = 'matchOver'; state.winner = 0; return state; } };
  const { url } = await fixture(t, {}, finishedCombat);
  const { a, b, initial } = await pair(url);
  command(a, 1); command(b, 1);
  await a.wait(message => message.type === 'state' && message.ack[0] === 1 && message.ack[1] === 1);
  a.send({ type: 'rematch' });
  assert.deepEqual((await b.wait(message => message.type === 'rematch')).ready, [true, false]);
  await delay(70);
  assert.equal(a.messages.filter(message => message.type === 'state' && message.matchId !== initial.matchId).length, 0);
  b.send({ type: 'rematch' });
  const next = await a.wait(message => message.type === 'state' && message.matchId !== initial.matchId);
  assert.equal(next.tick, 0);
  assert.deepEqual(next.ack, [0, 0]);
  assert.equal(next.events[0].id, 1);
  command(a, 1); command(b, 1);
  await a.wait(message => message.type === 'state' && message.matchId === next.matchId && message.ack[0] === 1 && message.ack[1] === 1);
});

test('disconnect forfeits the room immediately and the remaining connection can host again', async t => {
  const { url, server } = await fixture(t);
  const { a, b, code } = await pair(url);
  b.ws.close();
  const left = await a.wait(message => message.type === 'peerLeft');
  assert.equal(left.winner, 0);
  assert.equal(server.stats().rooms, 0);
  a.send({ type: 'host', arena: 'void' });
  const next = await a.wait(message => message.type === 'welcome' && message.code !== code);
  assert.equal(next.playerId, 0);
  assert.equal(server.stats().rooms, 1);
});

test('room and connection caps, arena validation and lobby membership are enforced', async t => {
  const { url } = await fixture(t, { maxRooms: 1, maxConnections: 2 });
  const a = await connect(url), b = await connect(url);
  a.send({ type: 'host', arena: '__proto__' });
  assert.match((await a.wait(message => message.type === 'error')).message, /Arena inválida/);
  a.send({ type: 'host', arena: 'skyline' });
  await a.wait(message => message.type === 'welcome');
  b.send({ type: 'host', arena: 'reactor' });
  assert.match((await b.wait(message => message.type === 'error')).message, /Servidor cheio/);
  a.send({ type: 'host', arena: 'skyline' });
  await a.wait(message => message.type === 'error' && /já está/.test(message.message));
  await assert.rejects(connect(url), /503/);
});

test('input queue floods are disconnected and remove their room', async t => {
  const { url, server } = await fixture(t);
  const { a, b } = await pair(url);
  for (let seq = 1; seq <= 20; seq++) command(a, seq);
  assert.equal((await a.close).code, 1008);
  await b.wait(message => message.type === 'peerLeft');
  assert.equal(server.stats().rooms, 0);
});

test('oversize messages, binary payloads and message floods are bounded', async t => {
  const { url } = await fixture(t);
  const large = await connect(url);
  large.ws.send('x'.repeat(3000));
  assert.equal((await large.close).code, 1009);
  const binary = await connect(url);
  binary.ws.send(Buffer.from('hello'));
  assert.equal((await binary.close).code, 1008);
  const flood = await connect(url);
  for (let at = 0; at < 250; at++) flood.send({ type: 'ping', at });
  assert.equal((await flood.close).code, 1008);
});

test('a peer that stops reading is removed when its send buffer exceeds the cap', async t => {
  // Enlarge only the injected snapshot to reach a real TCP backpressure condition quickly.
  const bulkyCombat = { ...FightSim, snapshot(state) { return { ...FightSim.snapshot(state), padding: 'x'.repeat(4 * 1024 * 1024) }; } };
  const { url, server } = await fixture(t, {}, bulkyCombat);
  const a = await connect(url), b = await connect(url);
  a.send({ type: 'host', arena: 'skyline' });
  const { code } = await a.wait(message => message.type === 'welcome');
  a.ws._socket.pause();
  b.send({ type: 'join', code });
  try {
    await b.wait(message => message.type === 'peerLeft', 4000);
    assert.equal(server.stats().rooms, 0);
  } finally { a.ws._socket.resume(); }
  assert.equal((await a.close).code, 1008);
});

test('waiting rooms and empty connections expire, while shutdown closes live sockets', async t => {
  const { url, server } = await fixture(t, { waitingIdleMs: 100, connectionIdleMs: 100 });
  const a = await connect(url), empty = await connect(url);
  a.send({ type: 'host', arena: 'skyline' });
  await a.wait(message => message.type === 'welcome');
  await a.wait(message => message.type === 'error' && /tempo limite/.test(message.message));
  assert.equal(server.stats().rooms, 0);
  assert.equal((await empty.close).code, 1000);
  const live = await connect(url);
  const closed = live.close;
  await server.close();
  assert.equal((await closed).code, 1001);
});

test('environment configuration rejects invalid bounds and origin URLs', () => {
  const original = process.env.PORT;
  try {
    process.env.PORT = 'NaN';
    assert.throws(optionsFromEnvironment, /configuração inválido/);
    process.env.PORT = '65536';
    assert.throws(optionsFromEnvironment, /configuração inválido/);
    assert.throws(() => createArenaServer({ allowedOrigins: ['https://arena.example/path'] }), /ALLOWED_ORIGIN/);
  } finally { if (original === undefined) delete process.env.PORT; else process.env.PORT = original; }
});
