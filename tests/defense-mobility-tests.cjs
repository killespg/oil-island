'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../combat.js');

function match(characters = ['veterano', 'veterano']) {
  const state = Sim.createMatch({ multiplayer: true, seed: 742, characters });
  state.phase = 'fight'; state.events.length = 0;
  state.fighters[0].x = 0; state.fighters[1].x = 7;
  return state;
}
function advance(state, seconds, first = {}, second = {}) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += 1 / 120) {
    Sim.stepPlayers(state, Math.min(1 / 120, seconds - elapsed), [first, second]);
  }
}
const dodges = state => state.events.filter(event => event.type === 'dodge' && event.fighter === 0);

test('a late defensive press replaces an old attack and waits for whiff recovery to begin', () => {
  const s = match(), f = s.fighters[0];
  Sim.act(s, 0, 'punch'); advance(s, .16);
  Sim.act(s, 0, 'kick');
  const energy = f.energy;
  assert.equal(Sim.act(s, 0, 'dodge'), true);
  assert.equal(f.energy, energy, 'accepting a pending dodge does not spend its cost');
  advance(s, .02);
  assert.equal(f.action, 'punch'); assert.equal(f._invuln, 0);
  advance(s, .04);
  assert.equal(f.action, 'dodge'); assert.equal(dodges(s).length, 1);
  assert.equal(s.events.filter(e => e.type === 'attack').length, 1);
  assert.ok(Math.abs(f.energy - (energy + .06 * 9 - 15)) < 1e-7);
  advance(s, .7); assert.equal(dodges(s).length, 1);
});

test('a defensive buffer waits past an offensive confirm until active frames end', () => {
  const s = match(), f = s.fighters[0]; s.fighters[1].x = 1.4;
  Sim.act(s, 0, 'punch'); advance(s, .12);
  assert.equal(Sim.act(s, 0, 'dodge'), true);
  advance(s, .065); assert.equal(f.action, 'punch');
  advance(s, .025); assert.equal(f.action, 'dodge');
  assert.equal(dodges(s).length, 1);
});

test('a recent dodge escapes actual hitstun only after it ends', () => {
  const s = match(), f = s.fighters[0]; s.fighters[1].x = 1.4;
  Sim.act(s, 1, 'punch'); advance(s, .2, { z: 1 });
  assert.ok(f.stun > .08 && f.stun < .12);
  assert.equal(Sim.act(s, 0, 'dodge'), true);
  advance(s, .07); assert.equal(f.action, 'hurt'); assert.equal(f._invuln, 0);
  advance(s, .05); assert.equal(f.action, 'dodge'); assert.ok(f._invuln > 0);
});

test('a buffered dodge preserves the direction pressed, even after movement changes', () => {
  for (let heading = 0; heading < 8; heading++) {
    const s = match(), f = s.fighters[0], angle = heading * Math.PI / 4;
    Sim.act(s, 0, 'punch'); advance(s, .16, { x: Math.sin(angle), z: Math.cos(angle) });
    assert.equal(Sim.act(s, 0, 'dodge'), true);
    advance(s, .09, { x: -Math.sin(angle), z: -Math.cos(angle) });
    assert.ok(Math.abs(f._dodgeX - Math.sin(angle)) < 1e-8);
    assert.ok(Math.abs(f._dodgeZ - Math.cos(angle)) < 1e-8);
  }
});

test('late cooldown buffering preserves the entire vulnerable gap and never repeats automatically', () => {
  const s = match(), f = s.fighters[0];
  Sim.act(s, 0, 'dodge'); advance(s, .2);
  assert.equal(Sim.act(s, 0, 'dodge'), false, 'early repeated roll remains rejected');
  assert.equal(f._invuln, 0);
  advance(s, .24); assert.equal(Sim.act(s, 0, 'dodge'), true);
  advance(s, .12); assert.equal(dodges(s).length, 1); assert.equal(f._invuln, 0);
  advance(s, .04); assert.equal(dodges(s).length, 2);
  advance(s, 1); assert.equal(dodges(s).length, 2);
});

test('held guard cancels a pending dodge; insufficient meter never queues one', () => {
  const s = match(), f = s.fighters[0];
  Sim.act(s, 0, 'punch'); advance(s, .16); Sim.act(s, 0, 'dodge');
  advance(s, .1, { block: true });
  assert.equal(f.blocking, true); assert.equal(dodges(s).length, 0); assert.equal(f._buffer, null);
  advance(s, .2); f.energy = 14;
  assert.equal(Sim.act(s, 0, 'dodge'), false); assert.equal(f._buffer, null);
  advance(s, .2); assert.equal(dodges(s).length, 0);
});

test('super and long whiff commitments reject early dodge but allow their recovery to cancel', () => {
  for (const name of ['special', 'super']) {
    const s = match(), f = s.fighters[0]; Sim.act(s, 0, name);
    assert.equal(Sim.act(s, 0, 'dodge'), false);
    const move = Sim.getMove(f);
    advance(s, move.windup + move.active - .1);
    // A super spends all energy; restore only the fixture budget to isolate commitment.
    f.energy = 30;
    assert.equal(Sim.act(s, 0, 'dodge'), true);
    advance(s, .08); assert.equal(f.action, name); assert.equal(f._invuln, 0);
    advance(s, .04); assert.equal(f.action, 'dodge');
  }
});

test('defensive buffer direction and remaining wait survive authoritative snapshot replay', () => {
  const s = match(); Sim.act(s, 0, 'punch'); advance(s, .16, { z: -1 }); Sim.act(s, 0, 'dodge');
  const replay = Sim.restore(Sim.snapshot(s));
  advance(s, .7); advance(replay, .7);
  assert.equal(dodges(s).length, 1); assert.equal(dodges(replay).length, 1);
  assert.deepEqual(Sim.snapshot(replay), Sim.snapshot(s));
});

test('a fresh guard press during the last recovery frames retains only its remaining parry window', () => {
  const s = match(), f = s.fighters[0];
  Sim.act(s, 0, 'punch'); advance(s, .25); advance(s, .07, { block: true });
  assert.equal(f.blocking, true);
  assert.ok(f._parryWindow > .04 && f._parryWindow < .08);
  advance(s, .2, { block: true }); assert.equal(f._parryWindow, 0);
  advance(s, .01); advance(s, .01, { block: true }); assert.equal(f._parryWindow, 0);
});

test('guard held through a long commitment grants no delayed perfect defense', () => {
  const s = match(), f = s.fighters[0];
  Sim.act(s, 0, 'kick'); advance(s, .6, { block: true });
  assert.equal(f.blocking, true); assert.equal(f._parryWindow, 0);
});

test('duels use 300 life, a 120s round and unchanged 100 energy', () => {
  const s = Sim.createMatch({ multiplayer: true, seed: 8 });
  assert.equal(s.timeLeft, 120);
  for (const f of s.fighters) {
    assert.equal(f.hp, 300); assert.equal(f.maxHp, 300);
    assert.equal(f.energy, 100); assert.equal(f.maxEnergy, 100);
  }
});

test('jump and held parry cancel recovery without interrupting startup or active frames', () => {
  for (const defense of ['jump', 'guard']) {
    const s = match(), f = s.fighters[0];
    Sim.act(s, 0, 'kick'); advance(s, .23);
    if (defense === 'jump') assert.equal(Sim.act(s, 0, 'jump'), true);
    advance(s, .12, { block: defense === 'guard' });
    assert.equal(f.action, 'kick'); assert.equal(f.y, 0); assert.equal(f.blocking, false);
    advance(s, .03, { block: defense === 'guard' });
    assert.equal(defense === 'jump' ? f.action : f.blocking, defense === 'jump' ? 'jump' : true);
    assert.equal(f._invuln, 0, 'jump and guard do not grant roll invulnerability');
  }
});

test('an attack buffered late in a dodge waits for its end and marks the entry once', () => {
  const s = match(), f = s.fighters[0];
  Sim.act(s, 0, 'dodge'); advance(s, .15);
  assert.equal(Sim.act(s, 0, 'punch'), true);
  advance(s, .11); assert.equal(f.action, 'dodge');
  advance(s, .04); assert.equal(f.action, 'punch'); assert.equal(f._entryFrom, 'dodge');
  assert.equal(s.events.find(e => e.type === 'attack').entryFrom, 'dodge');
  advance(s, .4); Sim.act(s, 0, 'kick'); assert.equal(f._entryFrom, '');
  const sprint = match(); advance(sprint, .1, { z: 1, sprint: true });
  Sim.act(sprint, 0, 'punch'); assert.equal(sprint.fighters[0]._entryFrom, 'sprint');
});

test('perfect dodge requires a real overlapping attack and rewards at most once per serial', () => {
  const s = match(), f = s.fighters[0]; f.x = 13.5; s.fighters[1].x = 12.1;
  f.energy = 50; f.guard = 40; f._guardDelay = 10;
  Sim.act(s, 1, 'punch'); advance(s, .04, { x: 1 });
  const energy = f.energy;
  Sim.act(s, 0, 'dodge'); advance(s, .13);
  assert.equal(f.hp, 300);
  assert.equal(s.events.filter(e => e.type === 'perfectDodge').length, 1);
  assert.ok(Math.abs(f.energy - (energy - 15 + 10 + .13 * 9)) < 1e-7);
  assert.equal(f.guard, 52);
  const replay = Sim.restore(Sim.snapshot(s)); advance(s, .1); advance(replay, .1);
  assert.deepEqual(Sim.snapshot(replay), Sim.snapshot(s));
  const distant = match(); Sim.act(distant, 1, 'punch'); Sim.act(distant, 0, 'dodge'); advance(distant, .2);
  assert.equal(distant.events.filter(e => e.type === 'perfectDodge').length, 0);
});

test('twenty oil drops cannot farm perfect-dodge rewards from the same channel', () => {
  const s = match(['veterano', 'titan']), f = s.fighters[0]; f.x = 13.5; s.fighters[1].x = 12.1;
  Sim.act(s, 1, 'special');
  for (let index = 0; index < 640; index++) {
    f._inputX = 1;
    // Independent button presses, each subject to the normal cooldown and meter.
    if (index % 72 === 18) Sim.act(s, 0, 'dodge');
    Sim.stepPlayers(s, 1 / 120, [{ x: 1 }, {}]);
  }
  assert.equal(s.events.filter(e => e.type === 'projectile').length, 20);
  assert.ok(dodges(s).length > 3);
  assert.equal(s.events.filter(e => e.type === 'perfectDodge').length, 1);
  assert.ok(f.energy >= 0 && f.energy <= 100);
});

function performRoute(state, names) {
  const f = state.fighters[0]; let next = 0;
  for (let frame = 0; frame < 1200 && next < names.length; frame++) {
    const move = Sim.getMove(f);
    if (!move || f.action === 'jump' || (f._contact && !move.channel && f.actionTime >= move.windup + .06)) {
      const serial = f._attackSerial;
      if (Sim.act(state, 0, names[next]) && f._attackSerial !== serial) next++;
    }
    Sim.stepPlayers(state, 1 / 120, [{}, {}]);
  }
  assert.equal(next, names.length);
}

test('mixed eight-hit routes reach the cap with real contacts and preserve a vulnerable recovery before the ninth', () => {
  const route = ['punch', 'punch', 'kick', 'special', 'punch', 'kick', 'special', 'punch'];
  for (const character of ['veterano', 'mimico']) {
    const s = match([character, 'veterano']), f = s.fighters[0]; f.x = 12.1; s.fighters[1].x = 13.5;
    f.guard = 50; f._guardDelay = 100;
    performRoute(s, route); advance(s, .17);
    const hits = s.events.filter(e => e.type === 'hit' && e.attacker === 0);
    assert.equal(hits.length, 8); assert.equal(f._chainIndex, 8);
    assert.deepEqual(s.events.filter(e => e.type === 'attack').map(e => e.chain), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(hits.at(-1).damage, Math.round(Sim.getMove(f, 'punch').damage * .4));
    assert.equal(f.guard, 78, 'seven successful continuations reward posture once each');
    const serial = f._attackSerial;
    assert.equal(Sim.act(s, 0, 'kick'), true);
    advance(s, .05); assert.equal(f._attackSerial, serial);
    advance(s, .12); assert.equal(f._attackSerial, serial + 1); assert.equal(f._chainIndex, 1);
    assert.ok(f.energy >= 0 && f.energy <= 100);
  }
});

test('short varied routes start across the roster while the third hit still creates an escape gap', () => {
  for (const character of Object.keys(Sim.characters)) {
    for (const route of [['punch', 'punch', 'punch', 'kick'], ['punch', 'kick', 'punch', 'kick']]) {
      const s = match([character, 'veterano']); s.fighters[0].x = 12.1; s.fighters[1].x = 13.5;
      performRoute(s, route); advance(s, .4);
      assert.deepEqual(s.events.filter(e => e.type === 'attack').map(e => e.move), route);
      assert.equal(s.events.filter(e => e.type === 'hit').length, 3, 'the fast fourth attack cannot bypass third-hit escape protection');
    }
  }
});

test('training regeneration reaches the new maximum instead of truncating healthy fighters to 100', () => {
  const s = Sim.createMatch({ training: true }); s.phase = 'fight'; s.fighters[0].hp = 290;
  advance(s, .7);
  assert.equal(s.fighters[0].hp, 300); assert.equal(s.fighters[1].hp, 300);
});

test('a real interrupt clears the queued defense rather than launching it after a later hitstun', () => {
  const s = match(), f = s.fighters[0]; s.fighters[1].x = 1.4;
  Sim.act(s, 0, 'kick'); advance(s, .13); Sim.act(s, 1, 'punch'); advance(s, .09);
  assert.equal(Sim.act(s, 0, 'dodge'), true);
  advance(s, .03); assert.equal(f.action, 'hurt'); assert.equal(f._buffer, null);
  advance(s, .6); assert.equal(dodges(s).length, 0);
});

test('oil damage may continue a combo but rewards offensive posture once per channel', () => {
  const s = match(['titan', 'veterano']), f = s.fighters[0]; f.x = 12.1; s.fighters[1].x = 13.5;
  f.guard = 50; f._guardDelay = 100;
  Sim.act(s, 0, 'special'); advance(s, 5.4);
  assert.ok(s.events.filter(e => e.type === 'hit').length > 5);
  assert.equal(f.guard, 54); assert.equal(f._comboRewardSerial, f._attackSerial);
});

test('a defensive command accepted exactly 180ms before cooldown ends is not lost at its deadline', () => {
  const s = match(); Sim.act(s, 0, 'dodge'); advance(s, .4);
  assert.equal(Sim.act(s, 0, 'dodge'), true);
  advance(s, .16); assert.equal(dodges(s).length, 1);
  advance(s, .04); assert.equal(dodges(s).length, 2);
});
