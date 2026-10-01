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
    assert(s.timeLeft > 119.9, 'fight clock should wait for intro');
  });

  test('Helipad first-round cinematic gates combat for 6.2 seconds and survives snapshot replay', () => {
    const state = sim.createMatch({ arena: 'helipad', multiplayer: true, seed: 42 });
    const starts = state.fighters.map(f => [f.x, f.z]);
    assert(sim.introDuration(state) === 6.2, 'first helipad duel needs the full helicopter entrance');
    for (let i = 0; i < 360; i++) {
      assert(!sim.act(state, 0, 'punch'), 'attacks cannot start during the cinematic');
      sim.stepPlayers(state, 1 / 60, [{ x: 1, z: 1 }, { x: -1, z: -1 }]);
    }
    assert(state.phase === 'intro' && state.timeLeft === 120, 'cinematic must not spend the fight clock');
    assert(JSON.stringify(state.fighters.map(f => [f.x, f.z])) === JSON.stringify(starts), 'cinematic rendering must not move authoritative fighters');
    const restored = sim.restore(sim.snapshot(state));
    for (let i = 0; i < 10; i++) {
      sim.stepPlayers(state, 1 / 60, [{}, {}]); sim.stepPlayers(restored, 1 / 60, [{}, {}]);
    }
    assert(state.phase === 'intro' && restored.phase === 'intro', '6.16 seconds is still cinematic');
    for (let i = 0; i < 4; i++) {
      sim.stepPlayers(state, 1 / 60, [{}, {}]); sim.stepPlayers(restored, 1 / 60, [{}, {}]);
    }
    assert(state.phase === 'fight' && restored.phase === 'fight', 'both peers unlock combat after 6.2 seconds');
    assert(JSON.stringify(sim.snapshot(state)) === JSON.stringify(sim.snapshot(restored)), 'intro phaseTime must replay deterministically');
    assert(sim.act(state, 0, 'punch'), 'the player can attack after landing');
    const training = sim.createMatch({ arena: 'helipad', training: true });
    advance(training, 2.05); assert(training.phase === 'fight', 'training skips the cinematic and keeps its normal intro');
    const nextRound = sim.createMatch({ arena: 'helipad' }); nextRound.round = 2;
    advance(nextRound, 2.05); assert(nextRound.phase === 'fight', 'the entrance does not repeat between rounds');
    assert(sim.introDuration(sim.createMatch({ arena: 'helipad', multiplayer: true })) === 6.2, 'a rematch gets a fresh cinematic');
  });

  test('Movement is bounded and diagonal speed is normalized', () => {
    const s = active(), f = s.fighters[0];
    f.x = -4;
    advance(s, 0.1, { x: -1, z: -1 });
    assert(Math.abs(Math.hypot(f.x + 4, f.z) - 6.4 * .1) < 1e-8, 'diagonal walking must preserve the 6.4-unit movement speed');
    advance(s, 5, { x: -1, z: -1 });
    const arena = sim.arenas[s.arena];
    assert(f.x === -arena.halfX && f.z === -arena.halfZ, 'movement must stay inside arena');
  });

  test('Punch connects once during its active window', () => {
    const s = active();
    assert(sim.act(s, 0, 'punch'), 'punch should start');
    advance(s, 0.6);
    assert(s.fighters[1].hp === 291, 'one punch should inflict 9 damage once');
    assert(s.events.filter(e => e.type === 'hit').length === 1, 'one hit event expected');
  });

  test('Attacks use true radial reach across the entire arena', () => {
    const s = active();
    s.fighters[0].x = -3; s.fighters[1].x = 3;
    sim.act(s, 0, 'special'); advance(s, 1);
    assert(s.fighters[1].hp === 300, 'distant special must miss');
    s.fighters[0].x = -0.7; s.fighters[1].x = 0.7;
    s.fighters[0].z = -2; s.fighters[1].z = 2;
    sim.act(s, 0, 'kick'); advance(s, 0.7);
    assert(s.fighters[1].hp === 300, 'target beyond radial reach must not be hit');
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
    assert(s.fighters[0].hp === 300, 'dodge should avoid the punch');
    const before = s.events.filter(e => e.type === 'dodge' && e.fighter === 0).length;
    assert(sim.act(s, 0, 'dodge'), 'recent press may wait for the last 180ms of cooldown');
    assert(s.events.filter(e => e.type === 'dodge' && e.fighter === 0).length === before && s.fighters[0]._invuln === 0, 'buffering must not start a roll or restore invulnerability during cooldown');
    advance(s, .14);
    assert(s.events.filter(e => e.type === 'dodge' && e.fighter === 0).length === before, 'the entire original cooldown remains enforced');
    advance(s, .05);
    assert(s.events.filter(e => e.type === 'dodge' && e.fighter === 0).length === before + 1, 'one pending dodge starts after cooldown');
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
    assert(player.hp === 298, 'blocked kick should deal 2 chip damage');
    assert(s.events.some(e => e.type === 'guardBreak'), 'depleted guard should break');
    assert(player.stun > 0 && !player.blocking, 'guard break should briefly open defender');
  });

  test('Buffered J J K chains without an infinite stun lock', () => {
    const s = active();
    sim.act(s, 0, 'punch'); advance(s, 0.22);
    sim.act(s, 0, 'punch'); advance(s, 0.22);
    sim.act(s, 0, 'kick'); advance(s, 0.29);
    assert(s.fighters[0].combo === 3, 'jab jab kick should make three hits');
    assert(s.fighters[1].hp < 275, 'three-hit chain should cause meaningful damage');
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
    assert(s.phase === 'intro' && s.round === 2 && s.fighters[1].hp === 300, 'new round should fully reset');
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
    assert(s.fighters[1].hp === 300 && s.phase === 'fight', 'training opponent should revive');
    assert(s.timeLeft === 120 && s.wins.every(n => n === 0), 'training should not run a competitive clock');
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
      // Establish real pressure without asking the reaction AI to cooperate
      // with the fixture. The escape decision below still uses the live AI.
      function establishPressure(seconds) {
        for (let t = 0; t < seconds - .000001; t += 1 / 120) sim.stepPlayers(s, Math.min(1 / 120, seconds - t), [{}, {}]);
      }
      sim.act(s, 0, 'punch'); establishPressure(0.22);
      sim.act(s, 0, 'punch'); establishPressure(0.36);
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
      assert(f.hp >= 0 && f.hp <= 300 && f.energy >= 0 && f.energy <= 100, 'health and meter must stay bounded');
    }
  });

  test('Every arena has full planar movement and safe fallback metadata', () => {
    assert(Object.keys(sim.arenas).length === 4, 'four arenas must be available');
    for (const arena of Object.values(sim.arenas)) {
      assert(arena.halfX >= 7 && arena.halfZ >= 7 && arena.id && arena.description, 'maps must be large 3D arenas with metadata');
      const s = active({ arena: arena.id }), f = s.fighters[0];
      advance(s, 8, { x: 1, z: 1 });
      assert(f.x === arena.halfX && f.z === arena.halfZ, 'selected map bounds must apply in both axes');
    }
    assert(sim.createMatch({arena:'invalid', difficulty:'invalid'}).arena === 'island', 'unknown map must fall back');
    for (const retired of ['skyline', 'reactor', 'void', '__proto__', 'constructor']) {
      assert(sim.createMatch({ arena: retired }).arena === 'island', 'retired and invalid arenas must fall back to the island');
      const old = sim.snapshot(sim.createMatch()); old.arena = retired;
      let rejected = false;
      try { sim.restore(old); } catch (_) { rejected = true; }
      assert(rejected, 'network snapshots may only reference the four available arenas');
    }
  });

  for (const arena of ['island', 'nightclub', 'seaside', 'helipad']) test(`${arena}: snapshots retain the arena, all corners constrain movement, and decoration causes no damage`, () => {
    const state = sim.createMatch({ arena, multiplayer: true, seed: 503 });
    state.phase = 'fight'; state.events.length = 0;
    const bounds = sim.arenas[arena], f = state.fighters[0];
    for (const [x, z] of [[1,1],[-1,1],[-1,-1],[1,-1]]) {
      f.x = x * (bounds.halfX - .1); f.z = z * (bounds.halfZ - .1);
      for (let tick = 0; tick < 30; tick++) sim.stepPlayers(state, 1 / 60, [{ x, z }, {}]);
      assert(f.x === x * bounds.halfX && f.z === z * bounds.halfZ, 'both corner axes must constrain outward movement');
    }
    const restored = sim.restore(JSON.parse(JSON.stringify(sim.snapshot(state))));
    assert(restored.arena === arena, 'serialization must preserve the selected venue');
    for (let tick = 0; tick < 1200; tick++) {
      sim.stepPlayers(state, 1 / 60, [{}, {}]);
      sim.stepPlayers(restored, 1 / 60, [{}, {}]);
    }
    assert(JSON.stringify(sim.snapshot(state)) === JSON.stringify(sim.snapshot(restored)), 'restored match must evolve identically');
    assert(state.fighters.every(fighter => fighter.hp === 300), 'lights, water and scenery must not inflict hazard damage');
    assert(!state.hazard.warning && !state.hazard.active && !state.events.some(event => event.type.startsWith('hazard')), 'new venues must never inherit reactor hazards');
  });

  test('Attacks hit at all eight headings and knockback follows the impact', () => {
    for (let i = 0; i < 8; i++) {
      const s = active(), a = s.fighters[0], b = s.fighters[1], yaw = i * Math.PI / 4;
      a.x = a.z = 0; b.x = Math.sin(yaw) * 1.5; b.z = Math.cos(yaw) * 1.5;
      assert(sim.act(s, 0, 'punch'), 'punch must start');
      assert(Math.abs(Math.sin(a.yaw - yaw)) < 1e-8, 'fighter yaw must face planar target');
      advance(s, .15);
      assert(b.hp === 291, 'every heading must connect');
      assert(b._pushX * Math.sin(yaw) + b._pushZ * Math.cos(yaw) > 0, 'knockback must point away from attacker');
    }
  });

  test('Committed strike cannot magnetically rotate to follow a sidestep', () => {
    const s = active(), a = s.fighters[0], b = s.fighters[1];
    a.x = a.z = 0; b.x = 0; b.z = 1.5;
    sim.act(s, 0, 'special'); const committed = a._attackYaw;
    b.x = 1.5; b.z = 0;
    advance(s, .8);
    assert(b.hp === 300, 'a target outside the committed strike cone must escape');
    assert(a._attackYaw === committed, 'attack direction must remain committed throughout recovery');
    assert(s.events.some(e => e.type === 'whiff'), 'side-step must produce a real whiff');
    assert(sim.act(s, 0, 'dodge') && a.action === 'dodge', 'completed active frames permit a paid recovery cancel even after a whiff');
  });

  test('Timed guard parries for no chip and opens a counter window', () => {
    const s = active({training:false}), a = s.fighters[0], b = s.fighters[1];
    sim.act(s, 1, 'kick'); advance(s, .20);
    const energy = a.energy;
    advance(s, .10, {block:true});
    assert(a.hp === 300 && s.events.some(e => e.type === 'parry'), 'late guard should negate the entire strike');
    assert(b.stun > .3 && b.action === 'hurt', 'parry should stagger the attacker');
    assert(a.energy < energy - 7, 'parry must spend meter');
    assert(sim.act(s, 0, 'punch'), 'defender must be free to counter immediately');
    advance(s, .2);
    assert(b.hp === 291, 'counter should land during parry stagger');
  });

  test('Holding or repeatedly tapping guard cannot perpetually parry', () => {
    const s = active({training:false}), a = s.fighters[0];
    advance(s, .2, {block:true});
    sim.act(s, 1, 'punch'); advance(s, .15, {block:true});
    assert(a.hp === 299 && !s.events.some(e => e.type === 'parry'), 'held block should take chip after perfect window');
    advance(s, .01, {block:false}); advance(s, .01, {block:true});
    assert(a._parryWindow === 0, 'repeated guard tapping must respect parry cooldown');
  });

  test('Sprint is isotropic, drains energy and cannot bypass attack commitment', () => {
    const s = active(), f = s.fighters[0]; f.x = f.z = -5; f.energy = 80;
    advance(s, .25, {x:1,z:1,sprint:true});
    assert(f.sprinting && f.action === 'sprint', 'sprint must expose an animation state');
    assert(Math.abs((f.x + 5) - (f.z + 5)) < 1e-8, 'sprint X and Z speeds must match');
    assert(Math.abs(Math.hypot(f.x + 5,f.z + 5) - 10.5*.25) < 1e-8, 'diagonal sprint must preserve the new 10.5-unit speed');
    assert(Math.abs(f.energy - 77) < 1e-8, 'sprint must cost twelve energy per second');
    sim.act(s, 0, 'special'); advance(s, .1, {x:1,z:1,sprint:true});
    assert(!f.sprinting && f.action === 'special', 'attack must prevent sprint');
  });

  test('CPU reacts to a visible attack only after its difficulty latency', () => {
    for (const difficulty of Object.keys(sim.levels)) {
      const s = active({training:false,difficulty}), cpu = s.fighters[1];
      s._random = () => 0; cpu._aiWait = cpu._think = 999;
      advance(s, .05);
      assert(cpu._aiReaction === null && !cpu.blocking, 'idle player must not provoke predictive defense');
      sim.act(s, 0, 'special');
      advance(s, sim.levels[difficulty].reaction - .025);
      assert(!cpu.blocking && cpu.action !== 'dodge', 'CPU must respect visible reaction latency');
      advance(s, .04);
      assert(cpu.blocking || cpu.action === 'dodge', 'CPU should respond once its latency expires');
    }
  });

  test('Ascension upgrades apply only to the player and survive round resets', () => {
    const s = active({training:false,upgrades:{power:2,flow:2,guard:2}});
    sim.act(s,0,'punch'); advance(s,.16);
    assert(s.fighters[1].hp === 290, 'power must add eight percent per selection before rounding');
    const cpu = s.fighters[1], player = s.fighters[0];
    cpu.action = 'idle'; cpu.stun = 0; cpu.x = .7; cpu.z = 0; cpu._pushX = cpu._pushZ = 0;
    player.action = 'idle'; player.stun = 0; player.x = -.7;
    player.energy = cpu.energy = 40; advance(s,.1);
    assert(player.energy > cpu.energy && Math.abs((player.energy-40)/(cpu.energy-40)-1.3)<1e-8, 'flow must affect only player regen');
    player.guard = 100; advance(s,.2,{block:true}); sim.act(s,1,'kick'); advance(s,.3,{block:true});
    assert(Math.abs(player.guard - (100-29*.76)) < 1e-8, 'guard perk must lower only guard loss');
    cpu.hp = 0; player._parryWindow = .12; player._dodgeX = 1; cpu._aiReaction = {remaining:2};
    advance(s,3.1);
    assert(s.round === 2 && s.upgrades.power === 2 && s.upgrades.flow === 2 && s.upgrades.guard === 2, 'run choices must survive rounds');
    assert(player._parryWindow === 0 && player._dodgeX === 0 && cpu._aiReaction === null && s.hazard.cycle === 0, 'new round must clear every transient combat system');
  });

  test('Invalid timing and non-finite movement input cannot poison the simulation', () => {
    const s = active(); const before = JSON.stringify(s);
    for (const dt of [NaN, Infinity, -1, 0]) sim.step(s,dt,{x:Infinity,z:NaN});
    assert(JSON.stringify(s) === before, 'invalid dt must be ignored');
    sim.step(s,1/60,{x:Infinity,z:NaN});
    assert(s.fighters.every(f=>[f.x,f.z,f.yaw,f.hp,f.energy].every(Number.isFinite)), 'invalid vectors must normalize to zero');
  });

  test('Difficulty defeats repeated button spam with better decisions, not hidden stats', () => {
    const summaries = {};
    for (const difficulty of Object.keys(sim.levels)) {
      let playerDamage = 0, cpuDamage = 0, cpuWins = 0, cpuRounds = 0;
      for (let seed=1;seed<=12;seed++) {
        const s = sim.createMatch({seed,difficulty});
        assert(s.fighters.every(f=>f.hp===300 && f.energy===100 && f.maxHp===300), 'all difficulties must start with identical resources');
        for(let i=0;i<37500 && s.phase!=='matchOver';i++) {
          const a=s.fighters[0], b=s.fighters[1], dx=b.x-a.x, dz=b.z-a.z, d=Math.hypot(dx,dz);
          if(i%8===0) sim.act(s,0,'punch');
          sim.step(s,1/60,{x:d>1.25?dx/d:0,z:d>1.25?dz/d:0});
          for(const e of s.events) if(e.type==='hit') { if(e.attacker===0) playerDamage+=e.damage; else cpuDamage+=e.damage; }
          s.events.length=0;
        }
        if(s.winner===1) cpuWins++;
        cpuRounds += s.wins[1];
        assert(s.phase==='matchOver', 'the enlarged life and round budget must still allow each fixture to finish');
      }
      summaries[difficulty]={playerDamage,cpuDamage,cpuWins,cpuRounds};
    }
    assert(summaries.hard.cpuWins>=10 && summaries.nightmare.cpuWins>=10, 'highest difficulties must reliably punish jab spam');
    assert(summaries.normal.cpuDamage > summaries.easy.cpuDamage * 1.5 && summaries.normal.cpuRounds > summaries.easy.cpuRounds, 'normal must deal meaningfully more damage and win more rounds than easy');
    assert(summaries.hard.playerDamage < summaries.normal.playerDamage && summaries.nightmare.playerDamage < summaries.hard.playerDamage, 'each advanced CPU must survive pressure through stronger play');
  });

  global.COMBAT_TEST_RESULTS = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, tests: results };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.COMBAT_TEST_RESULTS;
    console.log(JSON.stringify(global.COMBAT_TEST_RESULTS, null, 2));
    if (global.COMBAT_TEST_RESULTS.failed) process.exitCode = 1;
  }
})(typeof window !== 'undefined' ? window : globalThis);
