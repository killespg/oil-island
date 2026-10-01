'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../combat.js');

function match() {
  const state = Sim.createMatch({ multiplayer: true, seed: 714, characters: ['veterano', 'veterano'] });
  state.phase = 'fight'; state.events.length = 0;
  state.fighters[0].x = 0; state.fighters[1].x = 1.4;
  return state;
}
function advance(state, seconds, first = {}, second = {}) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += 1 / 120) {
    Sim.stepPlayers(state, Math.min(1 / 120, seconds - elapsed), [first, second]);
  }
}
const attacks = state => state.events.filter(event => event.type === 'attack' && event.attacker === 0);

test('an early follow-up starts at the confirmed cancel window without another button press', () => {
  const state = match();
  Sim.act(state, 0, 'punch'); advance(state, .05);
  assert.equal(Sim.act(state, 0, 'kick'), true);
  advance(state, .10);
  assert.equal(state.fighters[0].action, 'punch', 'startup and contact commitment remain readable');
  advance(state, .025);
  assert.equal(state.fighters[0].action, 'kick', 'the accepted press must run when confirmation opens');
  assert.equal(attacks(state).length, 2);
  assert.ok(state.fighters[0].actionTime < .025);
});

test('one buffered slot uses the newest strike and consumes it exactly once', () => {
  const state = match();
  Sim.act(state, 0, 'punch'); advance(state, .05);
  Sim.act(state, 0, 'punch'); Sim.act(state, 0, 'kick');
  advance(state, .65);
  assert.deepEqual(attacks(state).map(event => event.move), ['punch', 'kick']);
  assert.equal(state.fighters[0]._buffer, null);
});

test('an obsolete strike expires after 180ms instead of firing after a later contact', () => {
  const state = match();
  Sim.act(state, 0, 'kick'); advance(state, .05); Sim.act(state, 0, 'punch');
  advance(state, .19);
  assert.equal(state.fighters[0]._buffer, null);
  advance(state, .4);
  assert.deepEqual(attacks(state).map(event => event.move), ['kick']);
});

test('a whiff cannot cancel but a recent follow-up starts after its full recovery', () => {
  const state = match(); state.fighters[1].x = 7;
  Sim.act(state, 0, 'punch'); advance(state, .14); Sim.act(state, 0, 'kick');
  advance(state, .14);
  assert.equal(state.fighters[0].action, 'punch');
  advance(state, .04);
  assert.equal(state.fighters[0].action, 'kick');
  assert.equal(attacks(state).length, 2);
});

test('holding guard overrides a buffered strike when whiff recovery ends', () => {
  const state = match(); state.fighters[1].x = 7;
  Sim.act(state, 0, 'punch'); advance(state, .23); Sim.act(state, 0, 'kick');
  advance(state, .1, { block: true });
  assert.equal(state.fighters[0].blocking, true);
  assert.equal(attacks(state).length, 1, 'a stale offensive press must not steal a newer guard request');
  assert.equal(state.fighters[0]._buffer, null);
});

test('holding guard overrides a buffered strike at the confirmed cancel window', () => {
  const state = match();
  Sim.act(state, 0, 'punch'); advance(state, .05); Sim.act(state, 0, 'kick');
  advance(state, .17, { block: true });
  assert.equal(state.fighters[0].blocking, true);
  assert.equal(attacks(state).length, 1);
});

test('blocked confirms stop cancelling after three attacks and reset after full recovery', () => {
  const state = match();
  state.fighters[0].x = 12; state.fighters[1].x = 13.5;
  advance(state, .16, {}, { block: true });
  for (let index = 0; index < 3; index++) {
    assert.equal(Sim.act(state, 0, 'punch'), true);
    advance(state, .17, {}, { block: true });
    assert.equal(attacks(state).length, index + 1);
  }
  assert.equal(state.events.filter(event => event.type === 'block').length, 3);
  assert.equal(state.fighters[0]._chainIndex, 3);
  Sim.act(state, 0, 'punch');
  assert.equal(attacks(state).length, 3, 'the fourth attack must pay the third attack recovery');
  advance(state, .10, {}, { block: true });
  assert.equal(attacks(state).length, 3);
  advance(state, .05, {}, { block: true });
  assert.equal(attacks(state).length, 4);
  assert.equal(state.fighters[0]._chainIndex, 1);
});

test('being hit clears a waiting follow-up instead of creating a revenge attack', () => {
  const state = match();
  Sim.act(state, 0, 'kick'); advance(state, .04); Sim.act(state, 0, 'punch');
  Sim.act(state, 1, 'punch'); advance(state, .5);
  assert.ok(state.fighters[0].hp < 300);
  assert.deepEqual(attacks(state).map(event => event.move), ['kick']);
  assert.equal(state.fighters[0]._buffer, null);
});

test('a pending confirmed follow-up survives an authoritative snapshot with identical replay', () => {
  const state = match();
  Sim.act(state, 0, 'punch'); advance(state, .05); Sim.act(state, 0, 'kick');
  const restored = Sim.restore(Sim.snapshot(state));
  advance(state, .7); advance(restored, .7);
  assert.deepEqual(Sim.snapshot(state), Sim.snapshot(restored));
  assert.equal(state.fighters[0]._attackSerial, 2);
});

test('visible fast follow-ups do not restart the CPU reaction latency already in progress', () => {
  const state = match(), cpu = state.fighters[1];
  Sim.act(state, 0, 'punch'); Sim.step(state, .05, {});
  assert.ok(cpu._aiReaction);
  const observedDeadline = state.elapsed + cpu._aiReaction.remaining;
  Sim.act(state, 0, 'kick'); Sim.step(state, .14, {});
  assert.equal(state.fighters[0]._attackSerial, 2);
  assert.ok(cpu._aiReaction && cpu._aiReaction.remaining > 0, 'normal CPU must still respect its reaction delay');
  assert.ok(Math.abs(state.elapsed + cpu._aiReaction.remaining - observedDeadline) < 1e-8,
    'a continuing visible threat must not postpone an existing reaction forever');
  assert.equal(cpu._aiReaction.serial, state.fighters[0]._attackSerial);
});

test('an observed CPU response waits through hitstun without breaking it or forgetting the threat', () => {
  const state = match(), cpu = state.fighters[1];
  Sim.act(state, 0, 'punch'); Sim.step(state, .05, {});
  Sim.act(state, 0, 'kick'); Sim.step(state, .23, {});
  assert.ok(cpu.stun > 0);
  assert.equal(cpu.blocking, false, 'an observed response cannot bypass hitstun');
  assert.ok(cpu._aiReaction && cpu._aiReaction.remaining <= 0,
    'a response whose normal latency elapsed must await legal control, not be discarded');
  Sim.step(state, .045, {});
  assert.equal(cpu._aiReaction, null, 'the waiting response is consumed once recovery allows it');
});

test('a delayed CPU response is discarded if its visible threat leaves range', () => {
  const state = match(), cpu = state.fighters[1];
  Sim.act(state, 0, 'punch'); Sim.step(state, .05, {});
  Sim.act(state, 0, 'kick'); Sim.step(state, .23, {});
  cpu.x = 8; Sim.step(state, .01, {});
  assert.equal(cpu._aiReaction, null);
  assert.equal(cpu.blocking, false);
});
