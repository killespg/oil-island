'use strict';
// Real TCP/WebSocket integration, with the same client used by game.js. No browser or renderer.
const assert = require('node:assert/strict');
const test = require('node:test');
const { performance } = require('node:perf_hooks');
const { WebSocket } = require('ws');
const { createArenaServer } = require('../dist/server/index.js');
const Net = require('../network.js');
const FightSim = require('../combat.js');
const STEP = 1 / 60;
const neutral = () => ({ x: 0, z: 0, block: false, sprint: false });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition, label, timeout = 6000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) { if (condition()) return; await wait(10); }
  throw new Error(`Timed out waiting for ${label}`);
}
function observedClient(url) {
  const log = { sent: [], snapshots: [], events: [], errors: [], matches: [], statuses: [] };
  class ObservedSocket extends WebSocket {
    constructor(address) {
      super(address);
      this.on('message', data => { const packet = JSON.parse(data.toString()); if (packet.type === 'state') log.snapshots.push(packet); });
    }
    send(data, ...args) { log.sent.push(JSON.parse(data)); return super.send(data, ...args); }
  }
  const client = Net.create({ url, WebSocket: ObservedSocket, onStatus: status => { log.statuses.push(status); if (status.phase === 'error') log.errors.push(status.message); }, onMatch: state => log.matches.push(state), onEvents: events => log.events.push(...events) });
  return { client, log, controls: neutral, paused: false, latest: () => log.snapshots.at(-1) };
}

for (const arena of ['island', 'nightclub', 'seaside', 'helipad']) test(`two real clients keep ${arena} through hosting, snapshots and prediction`, { timeout: 8000 }, async () => {
  const readyCombat = { ...FightSim, createMatch(options) { const state = FightSim.createMatch(options); state.phase = 'fight'; return state; } };
  const server = createArenaServer({ host: '127.0.0.1', port: 0 }, readyCombat);
  const address = await server.listen(), url = `ws://127.0.0.1:${address.port}/ws`;
  const clients = [observedClient(url), observedClient(url)], [host, guest] = clients;
  try {
    host.client.host(arena, 'orelha');
    await until(() => host.client.status.phase === 'waiting' && host.client.status.code, `${arena} room code`);
    guest.client.join(host.client.status.code, 'pixel');
    await until(() => clients.every(client => client.client.active), `${arena} active peers`);
    for (const peer of clients) {
      assert.equal(peer.client.state.arena, arena); assert.equal(peer.latest().state.arena, arena);
      assert.deepEqual(peer.client.state.fighters.map(fighter => fighter.character), ['orelha', 'pixel']);
    }
    const start = guest.client.state.fighters[1].z;
    guest.client.step({ z: 1 });
    assert.ok(guest.client.state.fighters[1].z > start, 'prediction must respond before a round trip');
    await until(() => clients.every(peer => peer.latest().ack[1] >= 1), `${arena} movement acknowledged on both peers`);
    const authoritative = host.latest();
    await until(() => guest.log.snapshots.some(snapshot => snapshot.tick === authoritative.tick), `${arena} matching snapshot`);
    assert.deepEqual(authoritative.state, guest.log.snapshots.find(snapshot => snapshot.tick === authoritative.tick).state);
    assert.equal(authoritative.state.arena, arena);
    assert.ok(authoritative.state.fighters[1].z > start, 'server must apply movement in the selected arena');
    assert.deepEqual(clients.flatMap(peer => peer.log.errors), []);
  } finally { clients.forEach(peer => peer.client.leave()); await server.close(); }
});

test('Titan oil is predicted once and both real clients receive the complete authoritative stream', { timeout: 9000 }, async () => {
  const readyCombat = { ...FightSim, createMatch(options) { const s = FightSim.createMatch(options); s.phase = 'fight'; return s; } };
  const server = createArenaServer({ host: '127.0.0.1', port: 0 }, readyCombat);
  const address = await server.listen(), url = `ws://127.0.0.1:${address.port}/ws`;
  const clients = [observedClient(url), observedClient(url)], [host, guest] = clients;
  try {
    host.client.host('island', 'titan');
    await until(() => host.client.status.phase === 'waiting', 'oil room');
    guest.client.join(host.client.status.code, 'orelha');
    await until(() => clients.every(peer => peer.client.active), 'oil peers active');
    assert.equal(host.client.action('special'), true); host.client.step(neutral());
    assert.equal(host.client.state.fighters[0].action, 'special');
    assert.ok(host.client.state.fighters[0].energy < 60, 'cost is visible before the network round trip');
    await until(() => clients.every(peer => peer.log.events.filter(event => event.type === 'projectile' && event.kind === 'oil').length === 20), 'all twenty oil droplets', 6500);
    for (const peer of clients) {
      assert.equal(peer.latest().state.fighters[0]._projectileShots, 20);
      assert.equal(peer.latest().state.fighters[0]._attackSerial, 1);
      assert.equal(peer.log.events.filter(event => event.type === 'attack' && event.move === 'special').length, 1);
      assert.equal(peer.latest().ack[0], 1); assert.deepEqual(peer.log.errors, []);
    }
    const packet = host.latest();
    await until(() => guest.log.snapshots.some(snapshot => snapshot.tick === packet.tick), 'matching oil snapshot');
    assert.deepEqual(packet.state, guest.log.snapshots.find(snapshot => snapshot.tick === packet.tick).state);
  } finally { clients.forEach(peer => peer.client.leave()); await server.close(); }
});

test('two real clients preserve different character selections while super is predicted and acknowledged', { timeout: 8000 }, async () => {
  const chargedCombat = { ...FightSim, createMatch(options) { const state = FightSim.createMatch(options); state.phase = 'fight'; state.fighters.forEach(fighter => { fighter.energy = 100; }); return state; } };
  const server = createArenaServer({ host: '127.0.0.1', port: 0 }, chargedCombat);
  const address = await server.listen();
  const clients = [observedClient(`ws://127.0.0.1:${address.port}/ws`), observedClient(`ws://127.0.0.1:${address.port}/ws`)];
  const [host, guest] = clients;
  try {
    host.client.host('seaside', 'pixel');
    await until(() => host.client.status.phase === 'waiting' && host.client.status.code, 'selected host waiting');
    assert.deepEqual(host.client.status.characters, ['pixel', null]);
    guest.client.join(host.client.status.code, 'orelha');
    await until(() => clients.every(c => c.client.active), 'selected players active');
    for (const c of clients) {
      assert.deepEqual(c.client.state.fighters.map(fighter => fighter.character), ['pixel', 'orelha']);
      assert.deepEqual(c.client.status.characters, ['pixel', 'orelha']);
    }
    assert.equal(guest.client.action('super'), true); guest.client.step(neutral());
    assert.equal(guest.client.state.fighters[1].action, 'super');
    await until(() => clients.every(c => c.log.events.some(event => event.type === 'attack' && event.attacker === 1 && event.move === 'super')), 'authoritative super on both clients');
    assert.equal(guest.latest().ack[1], 1);
    for (const c of clients) {
      assert.deepEqual(c.latest().state.fighters.map(fighter => fighter.character), ['pixel', 'orelha']);
      assert.equal(c.log.events.filter(event => event.type === 'attack' && event.move === 'super').length, 1);
      assert.deepEqual(c.log.errors, []);
    }
  } finally { clients.forEach(c => c.client.leave()); await server.close(); }
});

test('a real client rematch retains both selections and clears the ready votes', { timeout: 8000 }, async () => {
  const finishedCombat = { ...FightSim, createMatch(options) { const state = FightSim.createMatch(options); state.phase = 'matchOver'; state.winner = 0; return state; } };
  const server = createArenaServer({ host: '127.0.0.1', port: 0 }, finishedCombat);
  const address = await server.listen();
  const clients = [observedClient(`ws://127.0.0.1:${address.port}/ws`), observedClient(`ws://127.0.0.1:${address.port}/ws`)];
  const [host, guest] = clients;
  try {
    host.client.host('nightclub', 'mimico');
    await until(() => host.client.status.phase === 'waiting' && host.client.status.code, 'host waiting for rematch test');
    guest.client.join(host.client.status.code, 'titan');
    await until(() => clients.every(c => c.client.status.phase === 'result'), 'authoritative result');
    const first = host.latest().matchId;
    assert.equal(host.client.rematch(), true);
    await until(() => guest.client.status.rematchReady[0], 'host ready vote');
    assert.deepEqual(guest.client.status.rematchReady, [true, false]);
    assert.equal(guest.client.rematch(), true);
    await until(() => clients.every(c => c.log.matches.length === 2), 'second match on both clients');
    assert.notEqual(host.latest().matchId, first); assert.equal(host.latest().matchId, guest.latest().matchId);
    for (const c of clients) {
      assert.deepEqual(c.client.state.fighters.map(fighter => fighter.character), ['mimico', 'titan']);
      assert.deepEqual(c.client.status.characters, ['mimico', 'titan']);
      assert.deepEqual(c.client.status.rematchReady, [false, false]);
      assert.deepEqual(c.latest().ack, [0, 0]);
      assert.deepEqual(c.log.errors, []);
    }
  } finally { clients.forEach(c => c.client.leave()); await server.close(); }
});

test('two real browser-client instances stay synchronized with the authoritative WebSocket server', { timeout: 20000 }, async t => {
  const server = createArenaServer({ host: '127.0.0.1', port: 0, allowNoOriginLoopback: true });
  const address = await server.listen();
  const url = `ws://127.0.0.1:${address.port}/ws`;
  const host = observedClient(url), guest = observedClient(url), clients = [host, guest];
  let timer = null;
  try {
    await t.test('host and guest receive stable slots and a shared arena', async () => {
      host.client.host('seaside');
      await until(() => host.client.status.code && host.client.status.phase === 'waiting', 'host room code');
      guest.client.join(host.client.status.code);
      await until(() => clients.every(c => c.client.active), 'both client match callbacks');
      assert.equal(host.client.playerId, 0); assert.equal(guest.client.playerId, 1);
      assert.equal(host.client.state.localPlayer, 0); assert.equal(guest.client.state.localPlayer, 1);
      assert.equal(host.client.state.arena, 'seaside'); assert.equal(guest.client.state.arena, 'seaside');
      assert.equal(host.latest().matchId, guest.latest().matchId); assert.equal(host.log.matches.length, 1); assert.equal(guest.log.matches.length, 1);
    });
    let last = performance.now(), accumulator = 0;
    timer = setInterval(() => {
      const now = performance.now(); accumulator += Math.min(.1, (now - last) / 1000); last = now;
      while (accumulator >= STEP) {
        for (const c of clients) if (!c.paused && c.client.active && c.client.status.phase === 'playing') c.client.step(c.controls());
        accumulator -= STEP;
      }
      for (const c of clients) if (c.client.active) c.client.view(.005);
    }, 5);
    await t.test('fixed-rate packets are acknowledged during intro and enter a real fight', async () => {
      await until(() => clients.every(c => c.latest().state.phase === 'fight'), 'authoritative fight');
      assert.ok(host.latest().ack[0] > 60); assert.ok(guest.latest().ack[1] > 60);
      assert.deepEqual(clients.flatMap(c => c.log.errors), []);
    });
    await t.test('player two predicts immediately and both players can move in opposite directions', async () => {
      const guestStart = guest.client.state.fighters[1].z;
      guest.client.step({ z: 1 });
      assert.ok(guest.client.state.fighters[1].z > guestStart, 'movement must be visible before receiving a response');
      host.controls = () => ({ z: -1 }); guest.controls = () => ({ z: 1 });
      const starts = host.latest().state.fighters.map(f => f.z);
      await until(() => { const fs = host.latest().state.fighters; return fs[0].z < starts[0] - .8 && fs[1].z > starts[1] + .8; }, 'authoritative opposite movement');
      host.controls = neutral; guest.controls = neutral;
      host.client.neutralize(); guest.client.neutralize();
      await wait(200);
      const a = host.latest(), b = guest.log.snapshots.find(s => s.tick === a.tick);
      assert.ok(b, 'both clients receive the same authoritative tick'); assert.deepEqual(a.state, b.state);
      for (let id = 0; id < 2; id++) {
        assert.ok(Math.abs(host.client.state.fighters[id].z - a.state.fighters[id].z) < .001);
        assert.ok(Math.abs(guest.client.state.fighters[id].z - a.state.fighters[id].z) < .001);
      }
    });
    await t.test('clients approach each other without AI and retain the correct player identity', async () => {
      clients.forEach((c, id) => {
        c.controls = () => {
          const own = c.client.state.fighters[id], other = c.client.state.fighters[1 - id];
          const dx = other.x - own.x, dz = other.z - own.z, length = Math.hypot(dx, dz);
          return length > 1.6 ? { x: dx / length, z: dz / length } : neutral();
        };
      });
      await until(() => { const [a, b] = host.latest().state.fighters; return Math.hypot(a.x - b.x, a.z - b.z) < 1.85; }, 'players in punching distance');
      clients.forEach(c => { c.controls = neutral; c.client.neutralize(); });
      await wait(150);
      const fighters = host.latest().state.fighters;
      assert.equal(fighters[0]._attackSerial, 0); assert.equal(fighters[1]._attackSerial, 0);
      assert.ok(Math.hypot(fighters[0].x - fighters[1].x, fighters[0].z - fighters[1].z) >= .82 - .00001);
    });
    await t.test('a guest attack is validated once and reaches both clients without duplicate FX', async () => {
      assert.equal(guest.client.action('punch'), true);
      await until(() => clients.every(c => c.log.events.some(e => e.type === 'hit' && e.attacker === 1)), 'one authoritative guest hit');
      await wait(180);
      for (const c of clients) {
        const attacks = c.log.events.filter(e => e.type === 'attack' && e.attacker === 1);
        const hits = c.log.events.filter(e => e.type === 'hit' && e.attacker === 1);
        assert.equal(attacks.length, 1); assert.equal(hits.length, 1); assert.equal(hits[0].target, 0);
        assert.equal(c.log.events.length, new Set(c.log.events.map(e => e.id)).size);
        assert.equal(c.latest().state.fighters[0].hp, 289); assert.equal(c.latest().state.fighters[1].hp, 300);
      }
      assert.deepEqual(host.log.events, guest.log.events);
    });
    await t.test('neutralize releases a moving player even when its tick loop stops', async () => {
      host.controls = () => ({ x: -1 });
      const initial = host.latest().state.fighters[0].x;
      await until(() => host.latest().state.fighters[0].x < initial - .6, 'host moving away');
      host.controls = neutral; host.client.neutralize(); host.paused = true;
      const release = host.log.sent.filter(p => p.type === 'input').at(-1);
      assert.deepEqual(release.input, neutral()); assert.deepEqual(release.actions, []);
      await until(() => guest.latest().ack[0] >= release.seq, 'release acknowledgment');
      await wait(120);
      const stopped = guest.latest().state.fighters[0].x;
      await wait(300);
      assert.ok(Math.abs(guest.latest().state.fighters[0].x - stopped) < .002);
      assert.equal(guest.latest().state.fighters[0]._inputX, 0); assert.equal(guest.latest().state.fighters[0]._blockHeld, false);
      host.paused = false;
    });
    await t.test('heartbeat returns measured latency and normal traffic stays connected', async () => {
      await until(() => clients.every(c => c.client.status.ping !== null), 'round-trip measurements');
      assert.ok(host.client.status.ping >= 0); assert.ok(guest.client.status.ping < 1000);
      assert.deepEqual(clients.flatMap(c => c.log.errors), []); assert.deepEqual(server.stats(), { rooms: 1, players: 2 });
    });
    await t.test('leaving ends the peer match and releases server resources', async () => {
      host.client.leave();
      await until(() => guest.client.status.phase === 'closed', 'peer departure');
      assert.equal(host.client.state, null); assert.equal(guest.client.active, false);
      const sent = guest.log.sent.length; guest.client.step({ x: 1 }); assert.equal(guest.log.sent.length, sent);
      guest.client.leave(); await until(() => server.stats().rooms === 0 && server.stats().players === 0, 'server resource cleanup');
    });
  } finally {
    if (timer !== null) clearInterval(timer);
    clients.forEach(c => c.client.leave());
    await server.close();
  }
});
