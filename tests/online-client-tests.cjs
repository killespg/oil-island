'use strict';
// Real TCP/WebSocket integration, with the same client used by game.js. No browser or renderer.
const assert = require('node:assert/strict');
const test = require('node:test');
const { performance } = require('node:perf_hooks');
const { WebSocket } = require('ws');
const { createArenaServer } = require('../dist/server/index.js');
const Net = require('../network.js');
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

test('two real browser-client instances stay synchronized with the authoritative WebSocket server', { timeout: 20000 }, async t => {
  const server = createArenaServer({ host: '127.0.0.1', port: 0, allowNoOriginLoopback: true });
  const address = await server.listen();
  const url = `ws://127.0.0.1:${address.port}/ws`;
  const host = observedClient(url), guest = observedClient(url), clients = [host, guest];
  let timer = null;
  try {
    await t.test('host and guest receive stable slots and a shared arena', async () => {
      host.client.host('void');
      await until(() => host.client.status.code && host.client.status.phase === 'waiting', 'host room code');
      guest.client.join(host.client.status.code);
      await until(() => clients.every(c => c.client.active), 'both client match callbacks');
      assert.equal(host.client.playerId, 0); assert.equal(guest.client.playerId, 1);
      assert.equal(host.client.state.localPlayer, 0); assert.equal(guest.client.state.localPlayer, 1);
      assert.equal(host.client.state.arena, 'void'); assert.equal(guest.client.state.arena, 'void');
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
        assert.equal(c.latest().state.fighters[0].hp, 91); assert.equal(c.latest().state.fighters[1].hp, 100);
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
