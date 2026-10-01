'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../combat.js');
const ids = ['veterano', 'titan', 'mimico', 'orelha', 'pixel'];
function match(characters = ['veterano', 'titan'], options = {}) {
  const state = Sim.createMatch({ multiplayer: true, seed: 3197, characters, ...options });
  state.phase = 'fight'; state.events.length = 0;
  return state;
}
function advance(state, seconds, first = {}, second = {}) {
  for (let time = 0; time < seconds - 1e-8; time += 1 / 120) Sim.stepPlayers(state, Math.min(1 / 120, seconds - time), [first, second]);
}
function close(state, distance = 1.4) {
  state.fighters[0].x = 0; state.fighters[1].x = distance;
  state.fighters.forEach(f => { f.z = 0; });
}

test('character selection validates IDs, defaults each slot and supplies presentation metadata', () => {
  assert.deepEqual(Object.keys(Sim.characters || {}), ids);
  for (const id of ids) {
    const selected = match([id, id]);
    assert.deepEqual(selected.fighters.map(f => f.character), [id, id]);
    for (const field of ['id', 'name', 'title', 'description', 'color', 'specialName', 'superName']) assert.ok(Sim.characters[id][field]);
  }
  for (const invalid of ['invalid', 'constructor', '__proto__', null, {}]) {
    assert.deepEqual(match([invalid, invalid]).fighters.map(f => f.character), ['veterano', 'titan']);
  }
});

test('chosen fighters survive serialization, new rounds and training revival', () => {
  const s = match(['orelha', 'pixel']);
  const restored = Sim.restore(Sim.snapshot(s));
  assert.deepEqual(restored.fighters.map(f => f.character), ['orelha', 'pixel']);
  restored.fighters[1].hp = 0; advance(restored, 3.1);
  assert.equal(restored.round, 2);
  assert.deepEqual(restored.fighters.map(f => f.character), ['orelha', 'pixel']);
  const practice = match(['mimico', 'orelha'], { multiplayer: false, training: true });
  practice.fighters[1].hp = 0; advance(practice, 1.7);
  assert.equal(practice.fighters[1].hp, 300); assert.equal(practice.fighters[1].character, 'orelha');
  const invalid = Sim.snapshot(s); invalid.fighters[0].character = 'constructor';
  assert.equal(Sim.restore(invalid).fighters[0].character, 'veterano');
});

test('fast movement is normalized and each expanded arena has working collision bounds', () => {
  const walk = match(), diagonal = match(), sprint = match();
  const x = walk.fighters[0].x;
  advance(walk, .4, { z: 1 }); advance(diagonal, .4, { x: -1, z: 1 }); advance(sprint, .4, { z: 1, sprint: true });
  assert.ok(walk.fighters[0].z >= 2.5, 'walk should cover more than 2.5 world units in 400ms');
  assert.ok(sprint.fighters[0].z >= 4, 'sprint should cover at least four units in 400ms');
  assert.ok(Math.abs(Math.hypot(diagonal.fighters[0].x - x, diagonal.fighters[0].z) - walk.fighters[0].z) < 1e-8);
  assert.ok(sprint.fighters[0].energy < walk.fighters[0].energy);
  for (const [arena, bound] of [['island', 13.5], ['nightclub', 12], ['seaside', 14], ['helipad', 13]]) {
    const s = match(undefined, { arena }); advance(s, 5, { x: -1, z: -1 });
    assert.equal(s.fighters[0].x, -bound); assert.equal(s.fighters[0].z, -bound);
  }
});

test('roster differences affect actual movement, impact damage and special cost', () => {
  const results = {};
  for (const id of ids) {
    const s = match([id, 'veterano']); close(s); Sim.act(s, 0, 'punch'); advance(s, .2);
    const movement = match([id, 'veterano']); advance(movement, .25, { z: 1 });
    const special = match([id, 'veterano']); Sim.act(special, 0, 'special');
    results[id] = { damage: 300 - s.fighters[1].hp, distance: movement.fighters[0].z, cost: 100 - special.fighters[0].energy };
  }
  assert.ok(results.titan.damage > results.pixel.damage);
  assert.ok(results.pixel.distance > results.titan.distance);
  assert.ok(results.orelha.cost < results.veterano.cost);
});

test('directional roll moves quickly, never deals damage and cannot chain invulnerability', () => {
  const s = match(['orelha', 'titan']); close(s);
  advance(s, 1 / 120, { z: 1 });
  const initialZ = s.fighters[0].z;
  assert.equal(Sim.act(s, 0, 'dodge'), true);
  assert.equal(s.fighters[0].moveName, 'Esquiva do Mascote');
  assert.ok(s.fighters[0]._invuln > 0 && s.fighters[0]._invuln <= .18);
  advance(s, .2);
  assert.ok(s.fighters[0].z - initialZ > 2);
  assert.equal(s.fighters[0]._invuln, 0);
  assert.equal(Sim.act(s, 0, 'dodge'), false);
  assert.equal(s.fighters[1].hp, 300);
});

test('Orelha rolls forward from neutral and lateral input remains camera-independent', () => {
  const forward = match(['orelha', 'veterano']); close(forward, 4);
  Sim.act(forward, 0, 'dodge'); advance(forward, .1);
  assert.ok(forward.fighters[0].x > 1, 'neutral mascot roll should advance toward the opponent');
  const lateral = match(['orelha', 'veterano']); close(lateral, 4);
  advance(lateral, 1 / 120, { z: -1 }); Sim.act(lateral, 0, 'dodge'); advance(lateral, .1);
  assert.ok(lateral.fighters[0].z < -1); assert.ok(Math.abs(lateral.fighters[0].x) < .01);
});

test('confirmed strike can cancel into a paid roll but whiff startup cannot', () => {
  const s = match(); close(s); Sim.act(s, 0, 'punch');
  assert.equal(Sim.act(s, 0, 'dodge'), false);
  advance(s, .22);
  assert.ok(s.fighters[1].hp < 300);
  assert.equal(Sim.act(s, 0, 'dodge'), true);
  assert.equal(s.fighters[0].action, 'dodge');
  assert.ok(s.fighters[0].energy < 90);
});

test('guard cancels confirmed recovery responsively while guard taps retain a parry cooldown', () => {
  const s = match(); close(s); Sim.act(s, 0, 'punch'); advance(s, .22);
  advance(s, 1 / 120, { block: true });
  assert.equal(s.fighters[0].blocking, true);
  advance(s, .2, { block: true }); advance(s, .01); advance(s, .01, { block: true });
  assert.equal(s.fighters[0]._parryWindow, 0);
});

test('Orelha has a low sweep, a distinct air attack and a travelling short wind projectile', () => {
  const sweep = match(['orelha', 'veterano']); close(sweep); Sim.act(sweep, 0, 'kick');
  assert.equal(sweep.fighters[0].moveName, 'Giro da Orla');
  const air = match(['orelha', 'veterano']); close(air); Sim.act(air, 0, 'jump'); advance(air, .15); Sim.act(air, 0, 'kick');
  assert.equal(air.fighters[0].moveName, 'Salto do Casamento');
  const wind = match(['orelha', 'veterano']); close(wind, 3.7); Sim.act(wind, 0, 'special'); advance(wind, .2);
  assert.equal(wind.fighters[1].hp, 300, 'wind should travel before hitting');
  assert.ok(wind.projectiles.length > 0);
  advance(wind, .3);
  assert.ok(wind.fighters[1].hp < 300);
  assert.equal(wind.events.filter(e => e.type === 'hit').length, 1);
  const distant = match(['orelha', 'veterano']); close(distant, 7); Sim.act(distant, 0, 'special'); advance(distant, 1);
  assert.equal(distant.fighters[1].hp, 300); assert.equal(distant.projectiles.length, 0);
});

test('wind respects sidesteps and timed guard instead of homing or bypassing defense', () => {
  const s = match(['orelha', 'veterano']); close(s, 3.7); Sim.act(s, 0, 'special'); advance(s, .55, {}, { z: 1 });
  assert.equal(s.fighters[1].hp, 300);
  const parry = match(['orelha', 'veterano']); close(parry, 3.7); Sim.act(parry, 0, 'special'); advance(parry, .29); advance(parry, .14, {}, { block: true });
  assert.equal(parry.fighters[1].hp, 300); assert.ok(parry.events.some(e => e.type === 'parry'));
});

test('short wind cannot hit beyond its maximum range including its collision radius', () => {
  const s = match(['orelha', 'veterano']); close(s, 5.3);
  Sim.act(s, 0, 'special'); advance(s, 1);
  assert.equal(s.fighters[1].hp, 300); assert.equal(s.projectiles.length, 0);
});

test('timeout and knockout clear travelling projectiles before result snapshots are emitted', () => {
  for (const reason of ['timeout', 'ko']) {
    const s = match(['orelha', 'veterano']);
    Sim.act(s, 0, 'special'); advance(s, .2);
    assert.equal(s.projectiles.length, 1, 'setup needs a real travelling projectile');
    if (reason === 'timeout') s.timeLeft = 0;
    else s.fighters[1].hp = 0;
    advance(s, 1 / 120);
    assert.equal(s.phase, 'roundOver');
    assert.deepEqual(Sim.snapshot(s).projectiles, [], reason + ' must not retain a frozen projectile');
    advance(s, 2);
    assert.deepEqual(s.projectiles, []);
  }
});

test('a grounded sweep misses a real jump while the aerial strike can connect', () => {
  const s = match(['orelha', 'veterano']); close(s);
  Sim.act(s, 1, 'jump'); advance(s, .1); Sim.act(s, 0, 'kick'); advance(s, .3);
  assert.equal(s.fighters[1].hp, 300);
  const air = match(['orelha', 'veterano']); close(air);
  Sim.act(air, 0, 'jump'); advance(air, .15); Sim.act(air, 0, 'kick'); advance(air, .25);
  assert.ok(air.fighters[1].hp < 300);
});

test('Mimico rotor and Pixel rush provide different spacing and contact behavior', () => {
  const rotor = match(['mimico', 'veterano']); close(rotor); Sim.act(rotor, 0, 'special'); advance(rotor, .8);
  assert.equal(rotor.events.filter(e => e.type === 'hit').length, 2);
  const pixel = match(['pixel', 'veterano']); close(pixel, 3.8); Sim.act(pixel, 0, 'special'); advance(pixel, .5);
  assert.ok(pixel.fighters[0].x > 1); assert.ok(pixel.fighters[1].hp < 300);
  const titan = match(['titan', 'veterano']); close(titan, 3.8); Sim.act(titan, 0, 'special'); advance(titan, .8);
  assert.equal(titan.fighters[0].x, 0, 'oil gun fires from a stationary stance');
  assert.ok(titan.fighters[1].hp < 300, 'oil reaches farther than the old close-range attack');
});

test('Titan spends energy once for a five-second oil stream with bounded travelling projectiles', () => {
  const s = match(['titan', 'veterano']); close(s, 10);
  const f = s.fighters[0], move = Sim.getMove(f, 'special'); f.energy = move.cost;
  assert.equal(Sim.act(s, 0, 'special'), true); assert.equal(f.energy, 0); assert.equal(move.active, 5);
  const shots = []; let peak = 0;
  for (let i = 0; i < 660; i++) {
    advance(s, 1 / 120);
    for (const event of s.events.splice(0)) if (event.type === 'projectile') shots.push({ time: s.elapsed, event });
    peak = Math.max(peak, s.projectiles.length);
    if (i === 59) assert.ok(Math.abs(f.energy - 4.5) < 1e-7, 'firing later droplets must not charge energy again');
    if (i === 575) assert.equal(f.action, 'special', 'the weapon stays active near the end of the five-second stream');
    for (const p of s.projectiles) {
      assert.equal(p.kind, 'oil'); assert.equal(p.owner, 0);
      for (const field of ['x','y','z','dx','dz','remaining','speed','radius']) assert.ok(Number.isFinite(p[field]));
    }
  }
  assert.equal(shots.length, 20); assert.ok(shots.every(shot => shot.event.kind === 'oil'));
  assert.ok(shots[0].time >= move.windup && shots[0].time < move.windup + .01);
  assert.ok(shots.at(-1).time >= move.windup + 4.75 && shots.at(-1).time < move.windup + 4.76);
  assert.ok(peak <= 2, 'projectiles must expire before unbounded accumulation');
  assert.equal(f.action, 'idle'); assert.equal(s.projectiles.length, 0); assert.equal(s.fighters[1].hp, 300);
});

test('Titan oil stream can be cancelled by guard or dodge and interrupted by an actual hit or knockout', () => {
  for (const cancel of ['guard', 'dodge', 'hit', 'ko']) {
    const s = match(['titan', 'veterano']); close(s, cancel === 'hit' ? 1.4 : 10);
    Sim.act(s, 0, 'special'); advance(s, .3);
    if (cancel === 'guard') advance(s, .01, { block: true });
    else if (cancel === 'dodge') assert.equal(Sim.act(s, 0, 'dodge'), true);
    else if (cancel === 'hit') { assert.equal(Sim.act(s, 1, 'punch'), true); advance(s, .12); assert.ok(s.fighters[0].hp < 300); }
    else { s.fighters[0].hp = 0; advance(s, .01); }
    assert.notEqual(s.fighters[0].action, 'special');
    const fired = s.events.filter(e => e.type === 'projectile' && e.kind === 'oil').length;
    advance(s, .8, cancel === 'guard' ? { block: true } : {});
    assert.equal(s.events.filter(e => e.type === 'projectile' && e.kind === 'oil').length, fired, cancel + ' must stop future droplets');
  }
});

test('Titan oil respects distance, sidesteps, sustained guard and a timed parry with moderate damage', () => {
  const hit = match(['titan', 'veterano']); close(hit, 4); Sim.act(hit, 0, 'special'); advance(hit, 5.6);
  const damage = 300 - hit.fighters[1].hp; assert.ok(damage > 8 && damage <= 30, 'full stream has moderate total damage');
  assert.ok(hit.events.filter(e => e.type === 'hit').every(e => e.kind === 'oil' && e.damage <= 2), 'the old melee impact must not fire too');
  const guard = match(['titan', 'veterano']); close(guard, 4); advance(guard, .2, {}, { block: true });
  Sim.act(guard, 0, 'special'); advance(guard, 5.6, {}, { block: true });
  assert.equal(guard.fighters[1].hp, 295); assert.ok(guard.fighters[1].guard >= 60);
  const evade = match(['titan', 'veterano']); close(evade, 4); Sim.act(evade, 0, 'special'); advance(evade, 5.6, {}, { z: 1 });
  assert.equal(evade.fighters[1].hp, 300, 'a stream follows its committed direction instead of homing');
  const parry = match(['titan', 'veterano']); close(parry, 4); Sim.act(parry, 0, 'special'); advance(parry, .25); advance(parry, .2, {}, { block: true });
  assert.equal(parry.fighters[1].hp, 300); assert.ok(parry.events.some(e => e.type === 'parry' && e.kind === 'oil'));
  const fired = parry.fighters[0]._projectileShots; advance(parry, 1);
  assert.equal(parry.fighters[0]._projectileShots, fired, 'parry interrupts the channel');
});

test('Titan oil snapshots resume the remaining stream deterministically and cannot restart it through attack mashing', () => {
  const s = match(['titan', 'veterano']); close(s, 4); Sim.act(s, 0, 'special'); advance(s, 2.13);
  const serial = s.fighters[0]._attackSerial, spent = s.fighters[0].energy;
  assert.equal(Sim.act(s, 0, 'special'), false); assert.equal(Sim.act(s, 0, 'punch'), false);
  assert.equal(s.fighters[0]._attackSerial, serial); assert.equal(s.fighters[0].energy, spent);
  const copy = Sim.restore(JSON.parse(JSON.stringify(Sim.snapshot(s))));
  for (let i = 0; i < 420; i++) {
    Sim.stepPlayers(s, 1 / 120, [{}, { z: i < 30 ? .1 : 0 }]);
    Sim.stepPlayers(copy, 1 / 120, [{}, { z: i < 30 ? .1 : 0 }]);
  }
  assert.deepEqual(Sim.snapshot(copy), Sim.snapshot(s)); assert.equal(s.fighters[0]._projectileShots, 20);
});

test('Helice Giratoria sweeps around the fighter twice with no homing or forward lunge', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const s = match(['mimico', 'veterano']); close(s);
    Sim.act(s, 0, 'special');
    assert.equal(s.fighters[0].moveName, 'Hélice Giratória');
    s.fighters[1].x = Math.cos(angle) * 1.6; s.fighters[1].z = Math.sin(angle) * 1.6;
    advance(s, .8);
    const hits = s.events.filter(e => e.type === 'hit');
    assert.equal(hits.length, 2, 'rotor must cover every horizontal direction');
    assert.ok(hits.reduce((total, hit) => total + hit.damage, 0) <= 24);
    assert.equal(s.fighters[0].x, 0); assert.equal(s.fighters[0].z, 0);
  }
});

test('Chute Rotor has real bounded lift and Pouso de Impacto forces a descending air kick', () => {
  const lift = match(['mimico', 'veterano']); close(lift);
  Sim.act(lift, 0, 'kick');
  assert.equal(lift.fighters[0].moveName, 'Chute Rotor');
  advance(lift, .12);
  assert.ok(lift.fighters[0].y > .2 && lift.fighters[0].y < .6);
  assert.equal(lift.fighters[0]._invuln, 0);
  advance(lift, .65);
  assert.equal(lift.fighters[0].y, 0);
  assert.ok(lift.fighters[1].hp < 300);
  const air = match(['mimico', 'veterano']); close(air);
  Sim.act(air, 0, 'jump'); advance(air, .15); Sim.act(air, 0, 'kick');
  assert.equal(air.fighters[0].moveName, 'Pouso de Impacto');
  assert.ok(air.fighters[0]._vy < 0, 'air kick must accelerate descent, never grant another jump');
  const replay = Sim.restore(Sim.snapshot(air));
  advance(air, .6); advance(replay, .6);
  assert.equal(air.fighters[0].y, 0); assert.ok(air.fighters[1].hp < 300);
  assert.deepEqual(Sim.snapshot(replay), Sim.snapshot(air));
  Sim.act(air, 0, 'kick'); advance(air, .12);
  assert.equal(air.fighters[0].moveName, 'Chute Rotor');
  assert.ok(air.fighters[0].y > .2, 'landing must restore the ground hop even after a dive');
});

test('Decolagem Total makes exactly three radial hits with short bounded travel and no armor', () => {
  const s = match(['mimico', 'veterano']); close(s);
  Sim.act(s, 0, 'super');
  assert.equal(s.fighters[0].moveName, 'Decolagem Total');
  s.fighters[1].x = -1.4;
  advance(s, .12);
  assert.ok(s.fighters[0].y > .2 && s.fighters[0].y < .7);
  assert.equal(s.fighters[0]._invuln, 0);
  advance(s, .07);
  assert.equal(s.events.filter(e => e.type === 'hit').length, 0, 'startup must remain readable');
  for (let pulse = 1; pulse <= 3; pulse++) {
    advance(s, .02);
    assert.equal(s.events.filter(e => e.type === 'hit').length, pulse);
    if (pulse < 3) {
      advance(s, .18);
      assert.equal(s.events.filter(e => e.type === 'hit').length, pulse, 'one contact per rotor pulse');
    }
  }
  advance(s, .61);
  const hits = s.events.filter(e => e.type === 'hit');
  assert.equal(hits.length, 3);
  assert.ok(hits.every(e => e.damage <= 13));
  assert.ok(s.fighters[1].hp >= 260 && s.fighters[1].hp < 270);
  assert.ok(s.fighters[0].x > .4 && s.fighters[0].x < .8, 'rush follows its initial facing for less than one unit');
  assert.equal(s.fighters[0].y, 0);
  assert.equal(s.fighters[0].action, 'idle');
  for (const arena of ['island', 'nightclub', 'seaside', 'helipad']) {
    const edge = match(['mimico', 'veterano'], { arena });
    edge.fighters[0].x = Sim.arenas[arena].halfX - 1;
    edge.fighters[1].x = Sim.arenas[arena].halfX;
    Sim.act(edge, 0, 'super'); advance(edge, 1.3);
    for (const f of edge.fighters) assert.ok(Math.abs(f.x) <= Sim.arenas[arena].halfX && Math.abs(f.z) <= Sim.arenas[arena].halfZ);
  }
});

test('rotor attacks respect a held guard, a timed parry and a real escape dodge', () => {
  const guard = match(['mimico', 'veterano']); close(guard);
  advance(guard, .2, {}, { block: true }); Sim.act(guard, 0, 'super'); advance(guard, 1.1, {}, { block: true });
  assert.equal(guard.events.filter(e => e.type === 'block').length, 3);
  assert.equal(guard.events.filter(e => e.type === 'hit').length, 0);
  const parry = match(['mimico', 'veterano']); close(parry);
  Sim.act(parry, 0, 'super'); advance(parry, .14); advance(parry, 1, {}, { block: true });
  assert.equal(parry.events.filter(e => e.type === 'parry').length, 1);
  assert.equal(parry.fighters[1].hp, 300);
  assert.equal(parry.events.filter(e => e.type === 'hit').length, 0);
  const dodge = match(['mimico', 'veterano']); close(dodge);
  Sim.act(dodge, 0, 'special'); advance(dodge, .12, {}, { z: 1 });
  Sim.act(dodge, 1, 'dodge'); advance(dodge, .8, {}, { z: 1, sprint: true });
  assert.equal(dodge.fighters[1].hp, 300);
});

test('every super spends all 100 energy atomically and never starts below the threshold', () => {
  for (const id of ids) {
    const s = match([id, 'veterano']); s.fighters[0].energy = 99.9;
    assert.equal(Sim.act(s, 0, 'super'), false); assert.equal(s.fighters[0].energy, 99.9);
    s.fighters[0].energy = 100;
    assert.equal(Sim.act(s, 0, 'super'), true); assert.equal(s.fighters[0].energy, 0);
    assert.equal(s.fighters[0].action, 'super'); assert.ok(Sim.moves.super.damage > 0);
  }
});

test('Mare da Protecao rushes, lands three moderate hits and pushes toward arena center', () => {
  const s = match(['orelha', 'veterano']); s.fighters[0].x = 5; s.fighters[1].x = 7;
  Sim.act(s, 0, 'super'); advance(s, .85);
  const hits = s.events.filter(e => e.type === 'hit' && e.attacker === 0);
  assert.equal(hits.length, 3); assert.ok(hits.every(e => e.damage <= 13));
  assert.ok(s.fighters[1].hp >= 260 && s.fighters[1].hp < 280);
  assert.ok(s.fighters[0].x > 5.5); assert.ok(s.fighters[1].x < 7);
  assert.equal(s.fighters[0].moveName, 'Maré da Proteção');
});

test('a super remains interruptible by a real parry and cannot cancel into an invulnerable roll', () => {
  const s = match(['orelha', 'veterano']); close(s, 2.7);
  Sim.act(s, 0, 'super'); advance(s, .1);
  assert.equal(Sim.act(s, 0, 'dodge'), false);
  advance(s, .7, {}, { block: true });
  assert.equal(s.fighters[1].hp, 300);
  assert.equal(s.events.filter(e => e.type === 'parry').length, 1);
  assert.equal(s.events.filter(e => e.type === 'hit').length, 0);
});

test('three-hit strings grant escape protection and cannot be freely canceled into infinite chains', () => {
  const s = match(['veterano', 'veterano']); close(s);
  Sim.act(s, 0, 'punch'); advance(s, .18); Sim.act(s, 0, 'punch'); advance(s, .18); Sim.act(s, 0, 'kick'); advance(s, .29);
  assert.equal(s.fighters[0].combo, 3); assert.ok(s.fighters[1]._invuln > 0);
  const serial = s.fighters[0]._attackSerial;
  Sim.act(s, 0, 'punch'); assert.equal(s.fighters[0]._attackSerial, serial);
});

test('snapshot replay preserves active projectiles, supers and seeded fights for all characters', () => {
  for (const id of ids) {
    const original = match([id, 'orelha'], { arena: 'nightclub' }); close(original, 3.7);
    assert.equal(Sim.act(original, 0, id === 'orelha' ? 'special' : 'super'), true); advance(original, .2);
    if (id === 'orelha') assert.equal(original.projectiles.length, 1);
    const replay = Sim.restore(Sim.snapshot(original));
    for (let i = 0; i < 240; i++) {
      const input = [{ z: Math.sin(i / 30), block: i % 45 > 30 }, { x: -.2, sprint: i % 50 < 20 }];
      Sim.stepPlayers(original, 1 / 60, input); Sim.stepPlayers(replay, 1 / 60, input);
    }
    assert.deepEqual(Sim.snapshot(replay), Sim.snapshot(original));
  }
});
