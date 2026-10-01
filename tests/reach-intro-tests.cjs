'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../combat.js');
const dt = 1 / 120;
function advance(state, seconds, inputs = [{}, {}]) {
  for (let time = 0; time < seconds - 1e-8; time += dt) Sim.stepPlayers(state, Math.min(dt, seconds - time), inputs);
}
function fight(character = 'veterano') {
  const state = Sim.createMatch({ multiplayer: true, seed: 914, characters: [character, 'veterano'] });
  state.phase = 'fight'; state.events = [];
  state.fighters[0].x = 0; state.fighters[1].x = 10;
  return state;
}
const legacyRanges = {
  veterano: { punch: 2, kick: 2.7, special: 3.45, super: 3.8 },
  titan: { punch: 2.18, kick: 2.85, super: 4.05 },
  mimico: { punch: 2, kick: 2.7, special: 3, super: 3.4 },
  orelha: { punch: 2, kick: 2.7, super: 2.5 },
  pixel: { punch: 1.9, kick: 2.55, special: 2.65, super: 3 }
};

for (const [character, names] of Object.entries(legacyRanges)) {
  test(character + ': melee contacts extend past their old limit and still miss outside the actual new range', () => {
    for (const [name, oldRange] of Object.entries(names)) {
      const scale = character === 'mimico' && ['special', 'super'].includes(name) ? 1.2 : 1.28;
      for (const contact of [true, false]) {
        const state = fight(character), [attacker, target] = state.fighters;
        const move = Sim.getMove(attacker, name);
        assert.ok(Math.abs(move.range - oldRange * scale) < 1e-10, name + ' must gain the intended reach');
        assert.ok(Math.abs(move.reachExtension - (move.range - oldRange)) < 1e-10);
        assert.equal(Sim.act(state, 0, name), true);
        // The target enters the committed attack lane only after startup, so
        // forward travel cannot masquerade as a larger contact radius.
        advance(state, move.windup);
        target.x = attacker.x + (contact ? oldRange * 1.15 : move.range + .08);
        target.y = attacker.y; target.z = attacker.z;
        advance(state, dt);
        assert.equal(target.hp < target.maxHp, contact, character + ' ' + name + ' distance boundary');
      }
    }
  });
}

test('Orelha and Mimico aerial kicks also expose their own extended range', () => {
  for (const [character, oldRange] of [['orelha', 2.85], ['mimico', 2.8]]) {
    const state = fight(character), [attacker, target] = state.fighters;
    attacker.y = 1.6;
    Sim.act(state, 0, 'kick');
    const move = Sim.getMove(attacker);
    assert.ok(Math.abs(move.range - oldRange * 1.28) < 1e-10);
    assert.ok(Math.abs(move.reachExtension - oldRange * .28) < 1e-10);
    advance(state, move.windup);
    target.x = attacker.x + oldRange * 1.15; target.y = attacker.y;
    advance(state, dt);
    assert.ok(target.hp < target.maxHp);
  }
});

test('expanded melee still respects guard, timed parry and paid invulnerable dodge', () => {
  for (const defense of ['guard', 'parry', 'dodge']) {
    const state = fight(), [attacker, target] = state.fighters;
    const move = Sim.getMove(attacker, 'punch'); target.x = move.range * .93;
    if (defense === 'guard') advance(state, .16, [{}, { block: true }]);
    Sim.act(state, 0, 'punch');
    advance(state, move.windup - .03, [{}, { block: defense === 'guard' }]);
    if (defense === 'dodge') { target._inputX = 1; Sim.act(state, 1, 'dodge'); }
    advance(state, move.active + .035, [{}, { block: defense !== 'dodge' }]);
    assert.equal(target.hp, target.maxHp - (defense === 'guard' ? 1 : 0));
    assert.ok(state.events.some(e => e.type === (defense === 'dodge' ? 'dodge' : defense === 'guard' ? 'block' : 'parry')));
  }
});

test('a larger directional melee cone remains committed and cannot home onto a sidestep', () => {
  const state = fight(), [attacker, target] = state.fighters;
  const move = Sim.getMove(attacker, 'special');
  Sim.act(state, 0, 'special'); const yaw = attacker._attackYaw;
  advance(state, move.windup);
  target.x = attacker.x; target.z = attacker.z + move.range * .8;
  advance(state, move.active + .02);
  assert.equal(target.hp, target.maxHp); assert.equal(attacker._attackYaw, yaw);
});

test('oil and wind retain their complete distance budgets and projectile timing', () => {
  for (const character of ['titan', 'orelha']) {
    const state = fight(character), attacker = state.fighters[0];
    const move = Sim.getMove(attacker, 'special');
    assert.equal(move.reachExtension, undefined);
    assert.equal(move.range, character === 'titan' ? 7.2 : 4.4);
    assert.equal(move.projectileSpeed, character === 'titan' ? 22 : 18);
    assert.equal(move.projectileRadius, character === 'titan' ? .22 : .4);
    const target = state.fighters[1]; target.x = move.range + move.projectileRadius + .41;
    Sim.act(state, 0, 'special'); advance(state, move.duration + .5);
    assert.equal(state.events.filter(e => e.type === 'projectile').length, character === 'titan' ? 20 : 1);
    assert.equal(target.hp, target.maxHp); assert.equal(state.projectiles.length, 0);
  }
});

for (const characters of [['orelha', 'veterano'], ['veterano', 'orelha'], ['orelha', 'orelha']]) {
  test('Orla Brava cinematic triggers for ' + characters.join('/') + ', locks controls and resumes deterministically', () => {
    const state = Sim.createMatch({ multiplayer: true, arena: 'seaside', characters, seed: 742 });
    assert.equal(Sim.introKind(state), 'orelha-chase'); assert.equal(Sim.introDuration(state), 6.2);
    const initial = state.fighters.map(f => [f.x, f.y, f.z, f.hp, f.energy]);
    const input = [{ x: 1, z: 1, sprint: true, block: true }, { x: -1, z: -1, sprint: true, block: true }];
    for (let frame = 0; frame < 720; frame++) {
      for (const player of [0, 1]) for (const name of ['punch', 'kick', 'special', 'super', 'jump', 'dodge']) assert.equal(Sim.act(state, player, name), false);
      Sim.stepPlayers(state, dt, input);
    }
    assert.equal(state.phase, 'intro'); assert.equal(state.timeLeft, 120);
    assert.deepEqual(state.fighters.map(f => [f.x, f.y, f.z, f.hp, f.energy]), initial);
    const replay = Sim.restore(Sim.snapshot(state));
    assert.equal(Sim.introKind(replay), 'orelha-chase');
    advance(state, .16, input); advance(replay, .16, input);
    assert.equal(state.phase, 'intro');
    advance(state, .07); advance(replay, .07);
    assert.equal(state.phase, 'fight'); assert.ok(state.timeLeft > 119.95);
    assert.deepEqual(Sim.snapshot(replay), Sim.snapshot(state));
    assert.equal(Sim.act(state, 0, 'punch'), true);
    const rematch = Sim.createMatch({ multiplayer: true, arena: 'seaside', characters });
    assert.equal(Sim.introKind(rematch), 'orelha-chase'); assert.equal(Sim.introDuration(rematch), 6.2);
  });
}

test('cinematic kinds honor arena, roster, training and round exclusions', () => {
  for (const options of [
    { arena: 'island', characters: ['orelha', 'orelha'] },
    { arena: 'nightclub', characters: ['orelha', 'orelha'] },
    { arena: 'seaside', characters: ['veterano', 'titan'] },
    { arena: 'seaside', characters: ['orelha', 'titan'], training: true },
    { arena: 'helipad', characters: ['orelha', 'titan'], training: true }
  ]) {
    const state = Sim.createMatch(options);
    assert.equal(Sim.introKind(state), null); assert.equal(Sim.introDuration(state), 2);
    advance(state, 2.02); assert.equal(state.phase, 'fight');
  }
  for (const arena of ['seaside', 'helipad']) {
    const state = Sim.createMatch({ arena, characters: ['orelha', 'titan'] }); state.round = 2;
    assert.equal(Sim.introKind(state), null); assert.equal(Sim.introDuration(state), 2);
  }
  const helipad = Sim.createMatch({ multiplayer: true, arena: 'helipad', characters: ['orelha', 'orelha'] });
  assert.equal(Sim.introKind(helipad), 'helicopter'); assert.equal(Sim.introDuration(helipad), 6.2);
});
