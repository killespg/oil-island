(function (global) {
  'use strict';
  const sim = global.FightSim || (typeof require !== 'undefined' ? require('../combat.js') : null);
  const results = [];
  function assert(value, message) { if (!value) throw new Error(message); }
  function advance(s, seconds, input) {
    for (let t = 0; t < seconds - 0.000001; t += 1 / 120) sim.step(s, Math.min(1 / 120, seconds - t), input || {});
  }
  function active(options) {
    const s = sim.createMatch(Object.assign({ training: true, seed: 12345 }, options));
    s.phase = 'fight'; s.phaseTime = 0; s.events = [];
    s.fighters[0].x = -0.7; s.fighters[1].x = 0.7;
    s.fighters[1]._aiWait = 999;
    s.fighters[1]._think = 999;
    return s;
  }
  function test(name, fn) {
    try { fn(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.message }); }
  }

  test('Intro gates attacks, then starts fighting', () => {
    const s = sim.createMatch({ seed: 1 });
    assert(s.phase === 'intro' && !sim.act(s, 0, 'punch'), 'intro should reject attacks');
    advance(s, 2.05);
    assert(s.phase === 'fight', 'intro should automatically finish');
    assert(s.timeLeft > 74.9, 'fight clock should wait for intro');
  });

  test('Movement is bounded and diagonal speed is normalized', () => {
    const s = active(), f = s.fighters[0];
    f.x = -4;
    advance(s, 0.1, { x: -1, z: -1 });
    assert(Math.abs(f.x + 4) < 0.3, 'diagonal X must be normalized');
    advance(s, 5, { x: -1, z: -1 });
    assert(f.x === -6 && f.z === -2, 'movement must stay inside arena');
  });

  test('Punch connects once during its active window', () => {
    const s = active();
    assert(sim.act(s, 0, 'punch'), 'punch should start');
    advance(s, 0.6);
    assert(s.fighters[1].hp === 91, 'one punch should inflict 9 damage once');
    assert(s.events.filter(e => e.type === 'hit').length === 1, 'one hit event expected');
  });

  test('Attacks must reach both distance and lane', () => {
    const s = active();
    s.fighters[0].x = -3; s.fighters[1].x = 3;
    sim.act(s, 0, 'special'); advance(s, 1);
    assert(s.fighters[1].hp === 100, 'distant special must miss');
    s.fighters[0].x = -0.7; s.fighters[1].x = 0.7;
    s.fighters[0].z = -2; s.fighters[1].z = 2;
    sim.act(s, 0, 'kick'); advance(s, 0.7);
    assert(s.fighters[1].hp === 100, 'off-lane kick must miss');
    assert(s.events.filter(e => e.type === 'whiff').length === 2, 'misses should emit whiff events');
  });

  test('Special meter is charged atomically and rejects insufficient energy', () => {
    const s = active(), f = s.fighters[0];
    f.energy = 39;
    assert(!sim.act(s, 0, 'special') && f.energy === 39, 'unaffordable special must leave meter untouched');
    f.energy = 40;
    assert(sim.act(s, 0, 'special') && f.energy === 0, 'special must consume 40 immediately');
  });

  test('Dodge avoids an active hit and cannot repeat during cooldown', () => {
    const s = active({ training: false });
    sim.act(s, 1, 'punch');
    assert(sim.act(s, 0, 'dodge'), 'dodge should start');
    advance(s, 0.41);
    assert(s.fighters[0].hp === 100, 'dodge should avoid the punch');
    assert(!sim.act(s, 0, 'dodge'), 'dodge cooldown should reject immediate repetition');
  });

  test('Jump rises, can attack in air, and lands', () => {
    const s = active();
    assert(sim.act(s, 0, 'jump'), 'jump should start');
    advance(s, 0.18);
    assert(s.fighters[0].y > 0.8, 'jump should gain visible height');
    assert(!sim.act(s, 0, 'jump'), 'double jump must be rejected');
    assert(sim.act(s, 0, 'kick'), 'air kick should work');
    advance(s, 0.85);
    assert(s.fighters[0].y === 0, 'fighter should land on arena floor');
  });

  test('Blocking reduces damage and depleted guard breaks', () => {
    const s = active({ training: false }), player = s.fighters[0];
    player.guard = 20;
    sim.step(s, 1 / 120, { block: true });
    sim.act(s, 1, 'kick');
    advance(s, 0.3, { block: true });
    assert(player.hp === 98, 'blocked kick should deal 2 chip damage');
    assert(s.events.some(e => e.type === 'guardBreak'), 'depleted guard should break');
    assert(player.stun > 0 && !player.blocking, 'guard break should briefly open defender');
  });

  test('Buffered J J K chains without an infinite stun lock', () => {
    const s = active();
    sim.act(s, 0, 'punch'); advance(s, 0.22);
    sim.act(s, 0, 'punch'); advance(s, 0.22);
    sim.act(s, 0, 'kick'); advance(s, 0.29);
    assert(s.fighters[0].combo === 3, 'jab jab kick should make three hits');
    assert(s.fighters[1].hp < 75, 'three-hit chain should cause meaningful damage');
    assert(s.fighters[1]._invuln > 0, 'third consecutive hit should grant escape protection');
  });

  test('Simultaneous lethal attacks resolve as one drawn round', () => {
    const s = active({ training: false });
    s.fighters.forEach(f => { f.hp = 1; });
    sim.act(s, 0, 'punch'); sim.act(s, 1, 'punch');
    advance(s, 0.2);
    assert(s.fighters.every(f => f.hp === 0), 'both simultaneous attacks should connect');
    assert(s.phase === 'roundOver' && s.roundWinner === 'draw', 'double KO should be a draw');
    assert(s.wins[0] === 0 && s.wins[1] === 0, 'draw must not award wins');
    assert(s.events.filter(e => e.type === 'roundEnd').length === 1, 'round end must emit once');
  });

  test('Best of three resets fighters and ends exactly once', () => {
    const s = active({ training: false });
    s.fighters[1].hp = 0;
    advance(s, 0.05);
    assert(s.phase === 'roundOver' && s.wins[0] === 1, 'first KO should award a round');
    advance(s, 3.1);
    assert(s.phase === 'intro' && s.round === 2 && s.fighters[1].hp === 100, 'new round should fully reset');
    advance(s, 2.1);
    s.fighters[1].hp = 0;
    advance(s, 3.2);
    assert(s.phase === 'matchOver' && s.winner === 0 && s.wins[0] === 2, 'second win should finish match');
    const terminal = JSON.stringify(s);
    advance(s, 5);
    assert(JSON.stringify(s) === terminal, 'finished simulation should remain completely stable');
    assert(s.events.filter(e => e.type === 'matchEnd').length === 1, 'match event must not repeat');
    assert(!sim.act(s, 0, 'punch'), 'completed match must reject input');
  });

  test('Timeout compares health, including ties', () => {
    const s = active({ training: false });
    s.timeLeft = 0.01; s.fighters[0].hp = 61; s.fighters[1].hp = 60;
    advance(s, 0.03);
    assert(s.roundWinner === 0, 'health advantage should win timeout');
    const tied = active({ training: false });
    tied.timeLeft = 0.01;
    advance(tied, 0.03);
    assert(tied.roundWinner === 'draw', 'equal health timeout should draw');
  });

  test('Training revives opponent and never ends the match', () => {
    const s = active();
    s.fighters[1].hp = 0;
    advance(s, 1.8);
    assert(s.fighters[1].hp === 100 && s.phase === 'fight', 'training opponent should revive');
    assert(s.timeLeft === 75 && s.wins.every(n => n === 0), 'training should not run a competitive clock');
  });

  test('Airborne knockout lands during the round result', () => {
    const s = active({ training: false });
    s.fighters[1].y = 1.4;
    s.fighters[1]._vy = 3;
    s.fighters[1].hp = 0;
    advance(s, 0.8);
    assert(s.phase === 'roundOver' && s.fighters[1].y === 0, 'knocked-out fighter must fall to arena floor');
  });

  test('Hard rival spends dodge meter to escape a completed pressure string', () => {
    function pressuredMatch(difficulty, energy) {
      const s = active({ training: false, difficulty });
      sim.act(s, 0, 'punch'); advance(s, 0.22);
      sim.act(s, 0, 'punch'); advance(s, 0.36);
      assert(s.fighters[0].combo === 2, 'setup should land two real punches');
      assert(s.fighters[0].action === 'idle', 'response must not require an unseen next input');
      s.fighters[1]._think = 0;
      s.fighters[1].energy = energy;
      s._random = () => 0.5;
      sim.step(s, 1 / 120, {});
      return s;
    }
    const hard = pressuredMatch('hard', 100);
    assert(hard.fighters[1].action === 'dodge' && Math.abs(hard.fighters[1].z) > 0, 'hard rival should escape the attack lane');
    assert(hard.fighters[1].energy < 86 && hard.fighters[1]._dodgeCooldown > 0, 'evasion must use the normal meter and cooldown');
    assert(pressuredMatch('normal', 100).fighters[1].action !== 'dodge', 'normal difficulty should retain its original response');
    assert(pressuredMatch('hard', 10).fighters[1].action !== 'dodge', 'hard rival cannot evade without enough energy');
  });

  test('Seeded AI is reproducible and a long match keeps valid numbers', () => {
    const a = sim.createMatch({ seed: 123, difficulty: 'hard' });
    const b = sim.createMatch({ seed: 123, difficulty: 'hard' });
    for (let i = 0; i < 3600; i++) {
      if (i % 24 === 0) { sim.act(a, 0, i % 72 ? 'punch' : 'kick'); sim.act(b, 0, i % 72 ? 'punch' : 'kick'); }
      const input = { x: i % 240 < 120 ? 1 : -1, z: Math.sin(i / 90), block: i % 180 > 150 };
      sim.step(a, 1 / 60, input); sim.step(b, 1 / 60, input);
    }
    assert(JSON.stringify(a) === JSON.stringify(b), 'same seed and inputs should reproduce the state');
    for (const f of a.fighters) {
      assert([f.x, f.y, f.z, f.hp, f.energy, f.guard].every(Number.isFinite), 'all fighter values should stay finite');
      assert(f.hp >= 0 && f.hp <= 100 && f.energy >= 0 && f.energy <= 100, 'health and meter must stay bounded');
    }
  });

  global.COMBAT_TEST_RESULTS = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, tests: results };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.COMBAT_TEST_RESULTS;
    console.log(JSON.stringify(global.COMBAT_TEST_RESULTS, null, 2));
    if (global.COMBAT_TEST_RESULTS.failed) process.exitCode = 1;
  }
})(typeof window !== 'undefined' ? window : globalThis);
