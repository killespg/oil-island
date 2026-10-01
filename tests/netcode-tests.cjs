'use strict';
const assert = require('node:assert/strict');
const Sim = require('../combat.js');
const Net = require('../network.js');
const DT = 1 / 60;
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS', name); }
const empty = () => ({ x: 0, z: 0, block: false, sprint: false });
function match(arena = 'island') { const s = Sim.createMatch({ multiplayer: true, seed: 4242, arena }); s.phase = 'fight'; s.events.length = 0; return s; }
function inputs(state, list) { Sim.stepPlayers(state, DT, list); state.events.length = 0; }
function fixture(playerId = 0, initial = match()) {
  let time = 10000, interval = null;
  const sockets = [], statuses = [], events = [], matches = [];
  class Socket {
    constructor(url) { this.url = url; this.readyState = 0; this.bufferedAmount = 0; this.sent = []; sockets.push(this); }
    send(text) { this.sent.push(JSON.parse(text)); }
    close() { this.readyState = 3; }
    open() { this.readyState = 1; this.onopen && this.onopen(); }
    receive(packet) { this.onmessage && this.onmessage({ data: JSON.stringify(packet) }); }
  }
  const client = Net.create({ url: 'ws://test/ws', WebSocket: Socket, now: () => time, setInterval: fn => { interval = fn; return 1; }, clearInterval: () => { interval = null; }, onStatus: x => statuses.push(x), onEvents: x => events.push(...x), onMatch: x => matches.push(x) });
  const f = { client, sockets, statuses, events, matches, advance(ms) { time += ms; }, heart() { if (interval) interval(); }, get socket() { return sockets[sockets.length - 1]; }, state(value, tick, ack = [0, 0], id = 'one', fx = []) { f.socket.receive({ type: 'state', matchId: id, tick, ack, state: Sim.snapshot(value), events: fx }); } };
  client.host('island'); f.socket.open(); f.socket.receive({ type: 'welcome', code: 'ABC123', playerId });
  if (initial) f.state(initial, 0);
  return f;
}

test('multiplayer controls both fighters and never invokes AI', () => {
  const s = match();
  for (let i = 0; i < 60; i++) inputs(s, [empty(), { x: 0, z: 1 }]);
  assert.equal(s.fighters[0].x, -2.8); assert.ok(s.fighters[1].z > 3.9); assert.equal(s.fighters[1]._think, .3);
  assert.equal(s.fighters[1]._attackSerial, 0);
});
test('online ignores asymmetric upgrades and training', () => {
  const s = Sim.createMatch({ multiplayer: true, training: true, upgrades: { power: 10, flow: 10, guard: 10 } });
  assert.deepEqual(s.upgrades, { power: 0, flow: 0, guard: 0 }); assert.equal(s.training, false);
});
test('snapshot is independent JSON data without events or closures', () => {
  const s = match('nightclub'); s.events.push({ type: 'hit' }); s.localPlayer = 1;
  const data = Sim.snapshot(s); assert.equal(data._random, undefined); assert.equal(data.localPlayer, undefined); assert.deepEqual(data.events, []);
  data.fighters[0].x = 99; assert.equal(s.fighters[0].x, -2.8); assert.equal(JSON.stringify(data).includes('function'), false);
});
test('restored snapshot reproduces movement and combat bit for bit', () => {
  const a = match('nightclub');
  for (let i = 0; i < 421; i++) inputs(a, [{ z: -.2 }, { z: .2 }]);
  const b = Sim.restore(JSON.parse(JSON.stringify(Sim.snapshot(a))));
  for (let i = 0; i < 1800; i++) { const list = [{ z: Math.sin(i * .02) }, { x: Math.cos(i * .01) }]; inputs(a, list); inputs(b, list); }
  assert.deepEqual(Sim.snapshot(a), Sim.snapshot(b));
});
test('offline AI remains deterministic after serialization', () => {
  const a = Sim.createMatch({ seed: 888, difficulty: 'nightmare', arena: 'nightclub' }); a.phase = 'fight';
  for (let i = 0; i < 300; i++) Sim.step(a, DT, { x: .25 });
  const b = Sim.restore(Sim.snapshot(a));
  for (let i = 0; i < 300; i++) { Sim.step(a, DT, { block: i % 60 < 12 }); Sim.step(b, DT, { block: i % 60 < 12 }); }
  assert.deepEqual(Sim.snapshot(a), Sim.snapshot(b));
});
test('legacy step still drives offline AI', () => {
  const s = Sim.createMatch({ seed: 7 }); s.phase = 'fight';
  for (let i = 0; i < 180; i++) Sim.step(s, DT, {});
  assert.notEqual(s.fighters[1]._think, .3); assert.ok(s.fighters[1]._attackSerial > 0);
});
test('bad snapshot is rejected', () => { assert.throws(() => Sim.restore({ fighters: [] }), /snapshot/); });
test('host, welcome and first snapshot establish a match', () => {
  const f = fixture(); assert.deepEqual(f.socket.sent[0], { type: 'host', arena: 'island' }); assert.equal(f.client.playerId, 0);
  assert.equal(f.client.status.code, 'ABC123'); assert.equal(f.client.status.phase, 'playing'); assert.equal(f.matches.length, 1); assert.equal(f.client.active, true);
});
test('join normalizes a room code and releases prior socket', () => {
  const f = fixture(); const old = f.socket; f.client.join(' ab12cd '); f.socket.open();
  assert.equal(old.readyState, 3); assert.deepEqual(f.socket.sent[0], { type: 'join', code: 'AB12CD' }); assert.equal(f.client.active, false);
});

test('client includes character selections in host and normalized join requests', () => {
  const f = fixture();
  f.client.host('nightclub', 'mimico'); f.socket.open();
  assert.deepEqual(f.socket.sent[0], { type: 'host', arena: 'nightclub', character: 'mimico' });
  f.client.join(' ab12cd ', 'pixel'); f.socket.open();
  assert.deepEqual(f.socket.sent[0], { type: 'join', code: 'AB12CD', character: 'pixel' });
});

test('client exposes waiting-room selections and clears them when leaving', () => {
  const f = fixture(0, null);
  f.socket.receive({ type: 'waiting', code: 'ABC123', characters: ['orelha', null] });
  assert.deepEqual(f.client.status.characters, ['orelha', null]);
  f.client.leave(); assert.deepEqual(f.client.status.characters, [null, null]);
});

test('client queues super once and retains character identity through prediction', () => {
  const s = Sim.createMatch({ multiplayer: true, characters: ['pixel', 'mimico'] }); s.phase = 'fight';
  const f = fixture(1, s);
  assert.equal(f.client.action('super'), true); f.client.step({});
  assert.deepEqual(f.socket.sent.at(-1).actions, ['super']);
  assert.deepEqual(f.client.state.fighters.map(fighter => fighter.character), ['pixel', 'mimico']);
  assert.deepEqual(f.client.status.characters, ['pixel', 'mimico']);
});
test('prediction moves immediately before any server response', () => {
  const f = fixture(); const start = f.client.state.fighters[0].z;
  f.client.step({ z: 1 }); assert.ok(f.client.state.fighters[0].z > start); assert.equal(f.socket.sent.at(-1).seq, 1);
  assert.equal(f.events.length, 0);
});
test('input clamp blocks NaN and out-of-range local controls', () => {
  const f = fixture(); f.client.step({ x: Infinity, z: 200, block: true, sprint: false });
  assert.deepEqual(f.socket.sent.at(-1).input, { x: 0, z: 1, block: true, sprint: false });
});
test('second player predicts fighter one while retaining native IDs', () => {
  const f = fixture(1); f.client.step({ z: -1 });
  assert.equal(f.client.state.fighters[0].z, 0); assert.ok(f.client.state.fighters[1].z < 0);
  assert.equal(f.client.state.localPlayer, 1); assert.equal(f.client.view(DT).localPlayer, 1); assert.equal(f.client.view(DT).fighters[1].id, 1);
});
test('dodge prediction uses direction from current packet', () => {
  const f = fixture(); assert.equal(f.client.action('dodge'), true); f.client.step({ z: 1 });
  assert.equal(f.client.state.fighters[0]._dodgeZ, 1); assert.equal(f.client.state.fighters[0]._dodgeX, 0);
});
test('reconciliation acknowledges prefix and deterministically replays remaining input', () => {
  const f = fixture(), authoritative = match();
  for (let i = 0; i < 10; i++) f.client.step({ z: 1 });
  for (let i = 0; i < 3; i++) inputs(authoritative, [{ z: 1 }, empty()]);
  authoritative.fighters[0].x += .3;
  const expected = Sim.restore(Sim.snapshot(authoritative));
  for (let i = 3; i < 10; i++) inputs(expected, [{ z: 1 }, empty()]);
  f.state(authoritative, 3, [3, 0]); assert.deepEqual(Sim.snapshot(f.client.state), Sim.snapshot(expected));
  f.client.step({ z: 1 }); assert.equal(f.socket.sent.at(-1).seq, 11);
});
test('only authoritative events fire and stale snapshots never repeat effects', () => {
  const f = fixture(), s = match(); f.client.action('punch'); f.client.step({});
  assert.deepEqual(f.events, []);
  f.state(s, 1, [1, 0], 'one', [{ id: 1, type: 'attack' }]);
  f.state(s, 1, [1, 0], 'one', [{ id: 1, type: 'attack' }]); f.state(s, 0, [0, 0]);
  assert.equal(f.events.length, 1);
});
test('ack regressions and impossible future acknowledgments are ignored', () => {
  const f = fixture(); f.client.step({}); f.state(match(), 1, [1, 0]); const before = Sim.snapshot(f.client.state);
  const invalid = match(); invalid.fighters[0].hp = 1;
  f.state(invalid, 2, [0, 0]); f.state(invalid, 3, [7, 0]); assert.deepEqual(Sim.snapshot(f.client.state), before);
});
test('a rematch clears pending actions and starts sequence from one', () => {
  const f = fixture(); f.client.step({ x: 1 }); f.client.action('special');
  f.state(match(), 0, [0, 0], 'two'); f.client.step({});
  assert.equal(f.matches.length, 2); assert.equal(f.socket.sent.at(-1).seq, 1); assert.deepEqual(f.socket.sent.at(-1).actions, []);
  f.state(match(), 20, [1, 0], 'one'); assert.equal(f.matches.length, 2);
});
test('predicted matchOver cannot authorize the result screen', () => {
  const s = match(); s.phase = 'roundOver'; s.phaseTime = 2.99; s.wins = [2, 0];
  const f = fixture(0, s); f.client.step({}); assert.equal(f.client.state.phase, 'matchOver'); assert.equal(f.client.status.phase, 'playing');
  f.state(s, 1, [0, 0]); assert.equal(f.client.status.phase, 'playing');
  const result = Sim.restore(Sim.snapshot(s)); result.phase = 'matchOver'; result.winner = 0;
  f.state(result, 2, [1, 0]); assert.equal(f.client.status.phase, 'result'); assert.equal(f.client.rematch(), true);
});
test('render correction is smooth and never modifies simulation state', () => {
  const f = fixture(); f.client.step({ z: 1 }); f.advance(17); f.client.view(DT);
  const s = match(); s.fighters[0].x += .8; f.state(s, 1, [1, 0]);
  const before = Sim.snapshot(f.client.state), first = f.client.view(DT).fighters[0].x;
  let last; for (let i = 0; i < 60; i++) { f.advance(17); last = f.client.view(DT).fighters[0].x; }
  assert.ok(Math.abs(first - before.fighters[0].x) > .1); assert.ok(Math.abs(last - before.fighters[0].x) < .001);
  assert.deepEqual(Sim.snapshot(f.client.state), before);
});
test('remote presentation interpolates delayed snapshots instead of jumping', () => {
  const f = fixture();
  for (let tick = 3; tick <= 15; tick += 3) { const s = match(); s.fighters[1].z = tick * .1; s.fighters[1].vz = 6; f.advance(50); f.state(s, tick); f.client.view(.05); }
  const rendered = f.client.view(DT).fighters[1].z;
  assert.ok(rendered > 0 && rendered < 1.5); assert.equal(f.client.state.fighters[1].z, 1.5);
});
test('remote extrapolation has a two-tick bound through a network stall', () => {
  const s = match(); s.fighters[1].vx = 6; const f = fixture(0, s);
  let rendered; for (let i = 0; i < 120; i++) { f.advance(17); rendered = f.client.view(DT); }
  assert.ok(rendered.fighters[1].x <= s.fighters[1].x + 6 * 2 * DT + .00001);
});
test('latency and jitter reconcile to authoritative result without duplicate events', () => {
  const f = fixture(), server = match('island'), transit = [];
  let sent = 0, consumed = 0;
  for (let tick = 1; tick <= 180; tick++) {
    f.client.step({ z: Math.sin(tick / 30), x: -.2 }); sent++;
    if (tick > 4) { consumed++; const p = f.socket.sent.find(p => p.type === 'input' && p.seq === consumed); inputs(server, [p.input, empty()]); }
    if (tick % 3 === 0) transit.push({ at: tick + 2 + tick % 5, tick, ack: consumed, state: Sim.snapshot(server) });
    f.advance(1000 / 60);
    for (const packet of transit.filter(p => p.at === tick)) f.state(packet.state, packet.tick, [packet.ack, 0]);
    const render = f.client.view(DT); assert.ok(Number.isFinite(render.fighters[0].z));
  }
  while (consumed < sent) { consumed++; const p = f.socket.sent.find(p => p.type === 'input' && p.seq === consumed); inputs(server, [p.input, empty()]); }
  f.state(server, 200, [sent, 0]); assert.deepEqual(Sim.snapshot(f.client.state), Sim.snapshot(server)); assert.deepEqual(f.events, []);
});
test('neutralize immediately sends a release and drops unsent attacks', () => {
  const f = fixture(); f.client.step({ x: 1, block: true }); f.client.action('special'); f.client.neutralize();
  const last = f.socket.sent.at(-1); assert.deepEqual(last.input, empty()); assert.deepEqual(last.actions, []); assert.equal(last.seq, 2);
});
test('actions are bounded and unknown actions rejected', () => {
  const f = fixture(); assert.equal(f.client.action('teleport'), false); assert.equal(f.client.action('constructor'), false);
  for (let i = 0; i < 8; i++) assert.equal(f.client.action('punch'), true);
  assert.equal(f.client.action('punch'), false); f.client.step({}); assert.equal(f.socket.sent.at(-1).actions.length, 2);
});
test('backpressure stops prediction instead of growing an unbounded socket queue', () => {
  const f = fixture(); f.socket.bufferedAmount = 100000; f.client.step({ x: 1 });
  assert.equal(f.client.active, false); assert.equal(f.client.status.phase, 'error'); assert.equal(f.client.state.fighters[0].x, -2.8);
});
test('unacknowledged inputs have a hard memory limit', () => {
  const f = fixture(); for (let i = 0; i < 181; i++) f.client.step({});
  assert.equal(f.client.active, false); assert.equal(f.client.status.phase, 'error');
});
test('lost server heartbeat stops the match after timeout', () => {
  const f = fixture(); f.advance(10001); f.heart(); assert.equal(f.client.status.phase, 'error'); assert.equal(f.client.active, false);
});
test('heartbeat pings report measured round-trip time', () => {
  const f = fixture(); f.heart(); const ping = f.socket.sent.at(-1); assert.equal(ping.type, 'ping');
  f.advance(83); f.socket.receive({ type: 'pong', at: ping.at }); assert.equal(f.client.status.ping, 83);
});
test('peer departure and explicit leave stop input and clear room state', () => {
  const f = fixture(); f.socket.receive({ type: 'peerLeft' }); const before = Sim.snapshot(f.client.state);
  f.client.step({ x: 1 }); assert.equal(f.client.active, false); assert.deepEqual(Sim.snapshot(f.client.state), before);
  f.client.leave(); assert.equal(f.client.state, null); assert.equal(f.client.status.code, '');
});
test('malformed messages end connection with a visible error', () => {
  const f = fixture(); f.socket.onmessage({ data: 'not json' }); assert.equal(f.client.status.phase, 'error');
});
test('socket failure and late callbacks cannot revive an old match', () => {
  const f = fixture(); const oldMessage = f.socket.onmessage; f.socket.onerror();
  oldMessage({ data: JSON.stringify({ type: 'welcome', playerId: 1, code: 'OLD' }) }); assert.equal(f.client.status.phase, 'error');
});
test('invalid authoritative data reports error rather than corrupting the simulation', () => {
  const f = fixture(); f.socket.receive({ type: 'state', matchId: 'one', tick: 3, ack: [0, 0], state: {} });
  assert.equal(f.client.status.phase, 'error');
});
console.log(`${count} combat serialization and client network tests passed.`);
