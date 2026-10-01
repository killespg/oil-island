/* NEON CLASH: deterministic, camera-independent arena combat. */
(function (global) {
  'use strict';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const moves = Object.freeze({
    punch: Object.freeze({ duration: 0.36, windup: 0.12, active: 0.12, range: 2.0, cone: 0.72, depth: 1.05, height: 1.05, damage: 9, cost: 5, stun: 0.22, knockback: 0.32, guardDamage: 16 }),
    kick: Object.freeze({ duration: 0.63, windup: 0.27, active: 0.15, range: 2.7, cone: 0.85, depth: 1.1, height: 1.65, damage: 16, cost: 12, stun: 0.32, knockback: 0.75, guardDamage: 29 }),
    special: Object.freeze({ duration: 1.0, windup: 0.43, active: 0.20, range: 3.45, cone: 0.94, depth: 1.55, height: 1.9, damage: 28, cost: 40, stun: 0.44, knockback: 1.35, guardDamage: 55 }),
    dodge: Object.freeze({ duration: 0.4, cost: 15, cooldown: 0.9 }),
    jump: Object.freeze({ duration: 0.78, cost: 0 })
  });
  // Difficulty changes decisions, reaction latency and pressure, never health,
  // damage, hit boxes, animation speed, movement speed or available resources.
  const levels = Object.freeze({
    easy: Object.freeze({ id: 'easy', name: 'INICIANTE', think: .26, reaction: .32, delay: .62, defense: .20, pressure: .48, combo: .05, escape: .05, orbit: .04 }),
    normal: Object.freeze({ id: 'normal', name: 'COMBATENTE', think: .15, reaction: .23, delay: .34, defense: .48, pressure: .73, combo: .38, escape: .35, orbit: .18 }),
    hard: Object.freeze({ id: 'hard', name: 'EXECUTOR', think: .075, reaction: .16, delay: .12, defense: .78, pressure: .94, combo: .78, escape: .78, orbit: .35 }),
    nightmare: Object.freeze({ id: 'nightmare', name: 'PESADELO', think: .045, reaction: .12, delay: .045, defense: .94, pressure: .99, combo: .95, escape: .94, orbit: .48 })
  });
  const arenas = Object.freeze({
    skyline: Object.freeze({ id: 'skyline', name: 'SKYLINE', halfX: 8.5, halfZ: 8.5, description: 'Chuva, neon e um duelo acima da cidade.' }),
    reactor: Object.freeze({ id: 'reactor', name: 'REACTOR', halfX: 9, halfZ: 9, description: 'O piso instável avisa antes de entrar em erupção.' }),
    void: Object.freeze({ id: 'void', name: 'VOID', halfX: 10, halfZ: 10, description: 'Uma arena de cristal suspensa no vazio.' })
  });
  const emit = (state, type, detail) => state.events.push(Object.assign({ type }, detail || {}));
  const isStrike = f => !!(moves[f.action] && moves[f.action].damage);
  const isFree = f => f.hp > 0 && f.stun <= 0 && (!moves[f.action] || f.action === 'jump');
  const direction = (a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
    return { x: distance > .0001 ? dx / distance : Math.sin(a.yaw), z: distance > .0001 ? dz / distance : Math.cos(a.yaw), distance };
  };
  function faceTarget(f, opponent) {
    if (Math.hypot(opponent.x - f.x, opponent.z - f.z) > .001) f.yaw = Math.atan2(opponent.x - f.x, opponent.z - f.z);
    f.face = opponent.x >= f.x ? 1 : -1;
  }
  function fighter(id) {
    const yaw = id === 0 ? Math.PI / 2 : -Math.PI / 2;
    return {
      id, x: id === 0 ? -2.8 : 2.8, z: 0, y: 0, yaw, face: id === 0 ? 1 : -1,
      hp: 100, maxHp: 100, energy: 100, maxEnergy: 100, guard: 100,
      blocking: false, sprinting: false, action: 'idle', actionTime: 0, actionDuration: 0,
      stun: 0, vx: 0, vz: 0, combo: 0, color: id === 0 ? '#32e7ff' : '#ff4879',
      _vy: 0, _pushX: 0, _pushZ: 0, _invuln: 0, _dodgeCooldown: 0, _dodgeX: 0, _dodgeZ: 0,
      _guardLock: 0, _guardDelay: 0, _comboTimer: 0, _hurtChain: 0,
      _lastHitAgo: 10, _think: .3, _aiWait: .5, _aiBlock: 0, _aiReaction: null,
      _aiX: 0, _aiZ: 0, _aiOrbit: id === 0 ? 1 : -1, _aiOrbitTime: 0,
      _inputX: 0, _inputZ: 0, _buffer: null, _hitDone: false, _contact: false,
      _attackFace: id === 0 ? 1 : -1, _attackYaw: yaw, _respawn: 0,
      _attackSerial: 0, _chainIndex: 0, _aiRead: -1, _aiComboRead: -1,
      _blockHeld: false, _parryWindow: 0, _parryCooldown: 0, _hazardHit: -1
    };
  }
  function freshHazard() {
    return { active: false, warning: false, x: 0, z: 0, radius: 2.45, phaseTime: 0, warningDuration: 1.7, activeDuration: 1.15, cycle: 0, _wait: 6.5 };
  }
  function createMatch(options) {
    options = options || {};
    let seed = Number.isFinite(options.seed) ? options.seed >>> 0 : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    if (!seed) seed = 0x91ec10;
    const upgrades = {};
    for (const key of ['power', 'flow', 'guard']) upgrades[key] = clamp(Math.floor(Number(options.upgrades && options.upgrades[key]) || 0), 0, 10);
    const state = {
      phase: 'intro', phaseTime: 0, round: 1, timeLeft: 75, winner: null, roundWinner: null, wins: [0, 0],
      fighters: [fighter(0), fighter(1)], events: [], shake: 0,
      difficulty: levels[options.difficulty] ? options.difficulty : 'normal',
      arena: arenas[options.arena] ? options.arena : 'skyline', hazard: freshHazard(), upgrades,
      training: !!options.training, elapsed: 0,
      _random() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
    };
    emit(state, 'roundStart', { round: state.round, training: state.training });
    return state;
  }
  function setAction(f, name, duration) { f.action = name; f.actionTime = 0; f.actionDuration = duration || 0; }
  function startAction(state, f, name) {
    const move = moves[name];
    if (!move || f.energy + .00001 < move.cost) return false;
    if (name === 'dodge' && (f._dodgeCooldown > 0 || f.y > .1)) return false;
    if (name === 'jump' && (f.y > .05 || f._vy > 0)) return false;
    const opponent = state.fighters[1 - f.id];
    faceTarget(f, opponent);
    f.energy = clamp(f.energy - move.cost, 0, 100);
    f.blocking = false; f.sprinting = false; f._parryWindow = 0;
    f._buffer = null; f._contact = false; f._hitDone = false;
    f._attackFace = f.face; f._attackYaw = f.yaw;
    setAction(f, name, move.duration);
    if (name === 'dodge') {
      const length = Math.hypot(f._inputX, f._inputZ);
      f._dodgeX = length > .1 ? f._inputX / length : -Math.sin(f.yaw);
      f._dodgeZ = length > .1 ? f._inputZ / length : -Math.cos(f.yaw);
      f._dodgeCooldown = move.cooldown; f._invuln = .29; f._chainIndex = 0;
      emit(state, 'dodge', { fighter: f.id, x: f.x, z: f.z });
    } else if (name === 'jump') { f._vy = 7.8; f._chainIndex = 0; }
    else {
      f._attackSerial += 1;
      f._chainIndex = (f._comboTimer > 0 ? f._chainIndex : 0) + 1;
      emit(state, 'attack', { attacker: f.id, target: opponent.id, move: name, x: f.x, z: f.z, yaw: f.yaw });
    }
    return true;
  }
  function act(state, playerIndex, name) {
    if (!state || state.phase !== 'fight' || !moves[name]) return false;
    const f = state.fighters[playerIndex];
    if (!f || f.hp <= 0 || f.stun > 0 || (state.training && playerIndex === 1)) return false;
    if (moves[f.action] && f.action !== 'jump') {
      if (f.action === 'dodge' || name === 'jump' || name === 'dodge') return false;
      // One short input buffer: mashing cannot stack an invisible attack queue.
      f._buffer = { name, ttl: .25 };
      const previous = moves[f.action];
      if (f._contact && f.actionTime >= previous.windup + .09 && f._chainIndex < 3 && f.energy >= moves[name].cost) return startAction(state, f, name);
      return true;
    }
    return startAction(state, f, name);
  }
  function resetRound(state) {
    state.round += 1; state.phase = 'intro'; state.phaseTime = 0; state.timeLeft = 75;
    state.roundWinner = null; state.shake = 0; state.hazard = freshHazard();
    // Replace every transient field, including AI reactions, dodge vectors and parry state.
    state.fighters.forEach((f, id) => Object.assign(f, fighter(id)));
    emit(state, 'roundStart', { round: state.round });
  }
  function finishRound(state) {
    if (state.phase !== 'fight' || state.training) return;
    const [a, b] = state.fighters;
    if (a.hp > 0 && b.hp > 0 && state.timeLeft > 0) return;
    state.phase = 'roundOver'; state.phaseTime = 0;
    const difference = a.hp - b.hp, winner = Math.abs(difference) < .00001 ? 'draw' : difference > 0 ? 0 : 1;
    state.roundWinner = winner;
    if (winner !== 'draw') state.wins[winner] += 1;
    state.hazard.warning = false; state.hazard.active = false;
    for (const f of state.fighters) { f.blocking = false; f.sprinting = false; f._buffer = null; setAction(f, f.hp <= 0 ? 'ko' : 'idle', f.hp <= 0 ? 2 : 0); }
    emit(state, 'roundEnd', { winner, round: state.round, reason: state.timeLeft <= 0 ? 'time' : 'ko' });
  }
  function cpuInput(state, dt) {
    const cpu = state.fighters[1], player = state.fighters[0];
    if (state.training || cpu.hp <= 0) return { x: 0, z: 0, block: false };
    const skill = levels[state.difficulty], random = state._random;
    cpu._think -= dt; cpu._aiWait = Math.max(0, cpu._aiWait - dt); cpu._aiBlock = Math.max(0, cpu._aiBlock - dt); cpu._aiOrbitTime -= dt;
    const dir = direction(cpu, player), distance = dir.distance;
    // Observe started animations only. Even Nightmare must wait before reacting;
    // no reading keys, future actions or an unstarted buffer.
    if (isStrike(player) && player._attackSerial !== cpu._aiRead && distance < 4.5) {
      cpu._aiRead = player._attackSerial;
      cpu._aiReaction = { serial: player._attackSerial, remaining: skill.reaction + random() * .045, defend: random() < skill.defense };
    }
    if (cpu._aiReaction) {
      cpu._aiReaction.remaining -= dt;
      if (cpu._aiReaction.remaining <= 0) {
        const reaction = cpu._aiReaction; cpu._aiReaction = null;
        if (reaction.defend && isFree(cpu) && isStrike(player) && player._attackSerial === reaction.serial && distance < moves[player.action].range + .45) {
          const dangerous = player.action === 'special' || cpu.guard < 35;
          if ((dangerous || random() < .24) && cpu.energy >= 22 && cpu._dodgeCooldown <= 0 && cpu.y < .1) {
            cpu._inputX = dir.z * cpu._aiOrbit - dir.x * .25;
            cpu._inputZ = -dir.x * cpu._aiOrbit - dir.z * .25;
            if (act(state, 1, 'dodge')) cpu._aiWait = .22;
          } else cpu._aiBlock = Math.max(.22, moves[player.action].windup + moves[player.action].active - player.actionTime + .08);
        }
      }
    }
    if (cpu._think <= 0) {
      cpu._think = skill.think * (.85 + random() * .3);
      if (cpu._aiOrbitTime <= 0) { cpu._aiOrbit = random() < .5 ? -1 : 1; cpu._aiOrbitTime = 1.3 + random() * 1.4; }
      const recovering = isStrike(player) && player.actionTime > moves[player.action].windup + moves[player.action].active && !player._contact;
      const reserve = cpu.energy < 24;
      const preferred = reserve ? 3.7 : cpu._aiWait > .16 ? 2.6 : 1.5;
      const radial = distance > preferred + .22 ? 1 : distance < preferred - .22 ? -.8 : 0;
      const orbit = distance < 4.4 ? skill.orbit * cpu._aiOrbit : 0;
      cpu._aiX = dir.x * radial + dir.z * orbit;
      cpu._aiZ = dir.z * radial - dir.x * orbit;
      // Avoid a telegraphed reactor zone with the same movement tools as players.
      const h = state.hazard;
      if ((h.warning || h.active) && Math.hypot(cpu.x - h.x, cpu.z - h.z) < h.radius + .6) {
        const away = direction({ x: h.x, z: h.z, yaw: cpu.yaw + Math.PI }, cpu);
        cpu._aiX = away.x; cpu._aiZ = away.z;
      }
      // Refuse to orbit into the wall; inward steering prevents corner loops.
      const arena = arenas[state.arena];
      if (Math.abs(cpu.x) > arena.halfX - .75) cpu._aiX -= Math.sign(cpu.x) * .8;
      if (Math.abs(cpu.z) > arena.halfZ - .75) cpu._aiZ -= Math.sign(cpu.z) * .8;
      const pressured = player.combo >= 2 || cpu.guard < 30;
      if (pressured && isFree(cpu) && distance < 3.1 && cpu.y < .1 && cpu._dodgeCooldown <= 0 && cpu.energy >= 22 && random() < skill.escape) {
        cpu._inputX = dir.z * cpu._aiOrbit - dir.x * .4; cpu._inputZ = -dir.x * cpu._aiOrbit - dir.z * .4;
        if (act(state, 1, 'dodge')) { cpu._aiBlock = 0; cpu._aiWait = .28; }
      }
      // Confirmed strings have a readable cap of three. Whiffs never cancel.
      if (isStrike(cpu) && cpu._contact && cpu._chainIndex < 3 && cpu.actionTime >= moves[cpu.action].windup + .095 && cpu._aiComboRead !== cpu._attackSerial) {
        cpu._aiComboRead = cpu._attackSerial;
        if (random() < skill.combo) {
          const followup = cpu._chainIndex >= 2 || distance > 1.8 ? 'kick' : 'punch';
          if (cpu.energy >= moves[followup].cost + 12) { act(state, 1, followup); cpu._aiWait = skill.delay + .25; }
        }
      }
      if (isFree(cpu) && cpu._aiBlock <= 0 && (cpu._aiWait <= 0 || (recovering && skill.combo > .5)) && distance < 3.4) {
        const roll = random();
        // Neutral initiations use a readable kick; fast jabs punish a visible
        // recovery or continue a confirmed string, rather than ambushing.
        let name = recovering && distance <= 2.05 ? 'punch' : 'kick';
        if (cpu.energy >= 54 && (player.blocking || distance > 2.65 || roll < .12 * skill.pressure)) name = 'special';
        else if (distance < 2.6 && (player.guard < 45 || roll > .68)) name = 'kick';
        if (distance < moves[name].range - .08 && random() < skill.pressure) {
          if (act(state, 1, name)) cpu._aiWait = moves[name].duration + skill.delay + random() * .14;
        } else cpu._aiWait = .12;
      }
    }
    const sprint = distance > 5 && cpu.energy > 35 && skill.pressure > .8;
    return { x: cpu._aiX, z: cpu._aiZ, block: cpu._aiBlock > 0, sprint };
  }
  function bound(state, f) { const a = arenas[state.arena]; f.x = clamp(f.x, -a.halfX, a.halfX); f.z = clamp(f.z, -a.halfZ, a.halfZ); }
  function updateFighter(state, f, input, dt) {
    const oldX = f.x, oldZ = f.z;
    f._inputX = clamp(Number.isFinite(input.x) ? input.x : 0, -1, 1); f._inputZ = clamp(Number.isFinite(input.z) ? input.z : 0, -1, 1);
    for (const key of ['_invuln', '_dodgeCooldown', '_guardLock', '_guardDelay', '_parryWindow', '_parryCooldown', '_comboTimer']) f[key] = Math.max(0, f[key] - dt);
    f._lastHitAgo += dt; if (f._lastHitAgo > .9) f._hurtChain = 0;
    if (!f._comboTimer) { f.combo = 0; if (!isStrike(f)) f._chainIndex = 0; }
    f.actionTime += dt; f.stun = Math.max(0, f.stun - dt);
    if (f._buffer) { f._buffer.ttl -= dt; if (f._buffer.ttl <= 0) f._buffer = null; }
    if (f.y > 0 || f._vy > 0) { f._vy -= 20 * dt; f.y = Math.max(0, f.y + f._vy * dt); if (f.y === 0) f._vy = 0; }
    if (f.hp <= 0) {
      f.blocking = false; f.sprinting = false;
      if (state.training) {
        f._respawn += dt;
        if (f._respawn >= 1.6) {
          const x = f.x, z = f.z;
          Object.assign(f, fighter(f.id), { x, z, _invuln: .4 });
          faceTarget(f, state.fighters[1 - f.id]);
        }
      }
      f.vx = 0; f.vz = 0; return;
    }
    if (f.actionDuration > 0 && f.actionTime >= f.actionDuration && f.stun <= 0 && f.action !== 'ko') {
      const buffered = f._buffer; f._buffer = null;
      setAction(f, f.y > 0 ? 'jump' : 'idle', f.y > 0 ? .5 : 0);
      if (buffered) startAction(state, f, buffered.name);
    }
    const busy = !!moves[f.action] && f.action !== 'jump';
    f.blocking = !!input.block && !busy && f.stun <= 0 && f.y < .08 && f._guardLock <= 0;
    if (f.blocking && !f._blockHeld && f._parryCooldown <= 0 && f.energy >= 8) { f._parryWindow = .12; f._parryCooldown = .6; }
    f._blockHeld = !!input.block;
    const moving = Math.hypot(f._inputX, f._inputZ) > .1;
    f.sprinting = !!input.sprint && moving && !busy && !f.blocking && f.stun <= 0 && f.y < .05 && f.energy >= 1;
    const speed = f.blocking ? 1.75 : f.y > 0 ? 3.0 : f.sprinting ? 6.2 : 4.0;
    if (!busy && f.stun <= 0) {
      const length = Math.max(1, Math.hypot(f._inputX, f._inputZ));
      f.x += f._inputX / length * speed * dt; f.z += f._inputZ / length * speed * dt;
      if (f.y <= 0) { const name = moving ? (f.sprinting ? 'sprint' : 'walk') : 'idle'; if (f.action !== name) setAction(f, name, 0); }
    } else if (f.action === 'dodge' && f.stun <= 0) {
      const speedDodge = 12 * Math.max(0, 1 - f.actionTime / moves.dodge.duration);
      f.x += f._dodgeX * speedDodge * dt; f.z += f._dodgeZ * speedDodge * dt;
    } else if (isStrike(f) && f.actionTime < moves[f.action].windup) {
      const lunge = (f.action === 'special' ? 1.2 : .52) * dt;
      f.x += Math.sin(f._attackYaw) * lunge; f.z += Math.cos(f._attackYaw) * lunge;
    }
    f.x += f._pushX * dt; f.z += f._pushZ * dt;
    f._pushX *= Math.exp(-12 * dt); f._pushZ *= Math.exp(-12 * dt); bound(state, f);
    f.vx = (f.x - oldX) / dt; f.vz = (f.z - oldZ) / dt;
    const regen = (state.training ? 22 : f.blocking ? 3.5 : 7) * (f.id === 0 ? 1 + state.upgrades.flow * .15 : 1);
    f.energy = clamp(f.energy + (f.sprinting ? -12 : regen) * dt, 0, 100);
    if (f._guardDelay <= 0 && !f.blocking) f.guard = clamp(f.guard + 24 * dt, 0, 100);
    if (state.training && f._lastHitAgo > 3 && f.hp > 0) f.hp = clamp(f.hp + 20 * dt, 0, 100);
  }
  function collectStrike(state, attacker) {
    const move = moves[attacker.action];
    if (!move || !move.damage || attacker.hp <= 0 || attacker._hitDone || attacker.stun > 0) return null;
    if (attacker.actionTime > move.windup + move.active) {
      attacker._hitDone = true; emit(state, 'whiff', { attacker: attacker.id, move: attacker.action, x: attacker.x, z: attacker.z }); return null;
    }
    if (attacker.actionTime < move.windup) return null;
    const target = state.fighters[1 - attacker.id];
    if (target.hp <= 0 || target._invuln > 0) return null;
    const d = direction(attacker, target);
    const alignment = d.x * Math.sin(attacker._attackYaw) + d.z * Math.cos(attacker._attackYaw);
    if (d.distance > move.range || alignment < Math.cos(move.cone) || Math.abs(target.y - attacker.y) > move.height) return null;
    attacker._hitDone = true;
    const guardAlignment = -d.x * Math.sin(target.yaw) - d.z * Math.cos(target.yaw);
    const blocked = target.blocking && guardAlignment >= .15;
    return { attacker, target, move, name: attacker.action, blocked, parried: blocked && target._parryWindow > 0 && target.energy >= 8, nx: d.x, nz: d.z };
  }
  function resolveStrike(state, strike) {
    const { attacker, target, move, name, blocked, parried, nx, nz } = strike;
    const point = { attacker: attacker.id, target: target.id, x: (attacker.x + target.x) * .5, z: (attacker.z + target.z) * .5, move: name };
    target._lastHitAgo = 0; target._guardDelay = 1.2;
    if (parried) {
      target.energy = clamp(target.energy - 8, 0, 100); target.guard = clamp(target.guard + 18, 0, 100); target._parryWindow = 0;
      attacker._contact = false; attacker._buffer = null; attacker.stun = .42; attacker._pushX -= nx * 2; attacker._pushZ -= nz * 2;
      setAction(attacker, 'hurt', .42); state.shake = Math.max(state.shake, .3);
      emit(state, 'parry', Object.assign({ damage: 0 }, point)); return;
    }
    attacker._contact = true;
    if (blocked) {
      const damage = name === 'special' ? 5 : name === 'kick' ? 2 : 1;
      target.hp = Math.max(0, target.hp - damage);
      const guardScale = target.id === 0 ? Math.max(.5, 1 - state.upgrades.guard * .12) : 1;
      target.guard = Math.max(0, target.guard - move.guardDamage * guardScale);
      target._pushX += nx * move.knockback * 4.5; target._pushZ += nz * move.knockback * 4.5;
      target.energy = clamp(target.energy + 3, 0, 100); attacker.energy = clamp(attacker.energy + 2, 0, 100);
      emit(state, 'block', Object.assign({ damage }, point)); state.shake = Math.max(state.shake, .1);
      if (target.guard <= 0) {
        target.guard = 25; target.blocking = false; target._guardLock = 1.1; target.stun = .58; target._buffer = null;
        setAction(target, 'hurt', .58); emit(state, 'guardBreak', point); state.shake = Math.max(state.shake, .32);
      }
      if (target.hp <= 0) setAction(target, 'ko', 2);
      return;
    }
    attacker.combo = attacker._comboTimer > 0 ? attacker.combo + 1 : 1; attacker._comboTimer = 1.2;
    const scale = Math.max(.65, 1 - (attacker.combo - 1) * .1);
    const power = attacker.id === 0 ? 1 + state.upgrades.power * .08 : 1;
    const damage = Math.round(move.damage * scale * power);
    target.hp = Math.max(0, target.hp - damage); target.blocking = false; target._buffer = null; target._hurtChain += 1; target.stun = move.stun;
    target._pushX += nx * move.knockback * 12; target._pushZ += nz * move.knockback * 12;
    if (target._hurtChain >= 3) { target._invuln = move.stun + .25; target._pushX += nx * 7; target._pushZ += nz * 7; target._hurtChain = 0; }
    attacker.energy = clamp(attacker.energy + (name === 'special' ? 0 : 6), 0, 100); target.energy = clamp(target.energy + 5, 0, 100);
    setAction(target, target.hp <= 0 ? 'ko' : 'hurt', target.hp <= 0 ? 2 : target.stun);
    state.shake = Math.max(state.shake, name === 'special' ? .55 : name === 'kick' ? .3 : .19);
    emit(state, 'hit', Object.assign({ damage, combo: attacker.combo }, point));
    if (attacker.combo >= 2) emit(state, 'combo', Object.assign({ combo: attacker.combo }, point));
  }
  function separate(state) {
    const [a, b] = state.fighters;
    if (a.hp <= 0 || b.hp <= 0 || Math.abs(a.y - b.y) > .85) return;
    const d = direction(a, b);
    if (d.distance >= .82) return;
    const push = (.82 - d.distance) * .5;
    a.x -= d.x * push; a.z -= d.z * push; b.x += d.x * push; b.z += d.z * push;
    bound(state, a); bound(state, b);
  }
  function updateHazard(state, dt) {
    if (state.training || state.arena !== 'reactor') return;
    const h = state.hazard;
    if (!h.warning && !h.active) {
      h._wait -= dt;
      if (h._wait <= 0) {
        const focus = state.fighters[h.cycle % 2], arena = arenas[state.arena];
        h.x = clamp(focus.x + (state._random() - .5) * 1.2, -arena.halfX + h.radius, arena.halfX - h.radius);
        h.z = clamp(focus.z + (state._random() - .5) * 1.2, -arena.halfZ + h.radius, arena.halfZ - h.radius);
        h.warning = true; h.phaseTime = 0; h.cycle++;
        emit(state, 'hazardWarning', { x: h.x, z: h.z, radius: h.radius });
      }
      return;
    }
    h.phaseTime += dt;
    if (h.warning && h.phaseTime >= h.warningDuration) { h.warning = false; h.active = true; h.phaseTime = 0; emit(state, 'hazardActive', { x: h.x, z: h.z, radius: h.radius }); }
    if (!h.active) return;
    for (const f of state.fighters) {
      if (f.hp <= 0 || f._hazardHit === h.cycle || f.y > .85 || f._invuln > 0 || Math.hypot(f.x - h.x, f.z - h.z) > h.radius) continue;
      f._hazardHit = h.cycle; f.hp = Math.max(0, f.hp - 15); f._lastHitAgo = 0; f.stun = .3; f.blocking = false; f._buffer = null;
      const away = direction({ x: h.x, z: h.z, yaw: f.yaw }, f);
      f._pushX += away.x * 4; f._pushZ += away.z * 4;
      setAction(f, f.hp <= 0 ? 'ko' : 'hurt', f.hp <= 0 ? 2 : .3); state.shake = Math.max(state.shake, .4);
      emit(state, 'hazardHit', { target: f.id, x: f.x, z: f.z, damage: 15 });
    }
    if (h.phaseTime >= h.activeDuration) { h.active = false; h.phaseTime = 0; h._wait = 6.5; }
  }
  function tick(state, dt, input) {
    if (state.phase === 'matchOver') return;
    state.elapsed += dt; state.phaseTime += dt; state.shake *= Math.exp(-9 * dt);
    if (state.phase === 'intro') { if (state.phaseTime >= 2) { state.phase = 'fight'; state.phaseTime = 0; } return; }
    if (state.phase === 'roundOver') {
      for (const f of state.fighters) {
        f.actionTime += dt;
        if (f.y > 0) { f._vy -= 20 * dt; f.y = Math.max(0, f.y + f._vy * dt); }
        f.x += f._pushX * dt; f.z += f._pushZ * dt; bound(state, f); f._pushX *= Math.exp(-12 * dt); f._pushZ *= Math.exp(-12 * dt);
      }
      if (state.phaseTime >= 3) {
        if (state.wins[0] >= 2 || state.wins[1] >= 2) {
          state.phase = 'matchOver'; state.phaseTime = 0; state.winner = state.wins[0] >= 2 ? 0 : 1;
          emit(state, 'matchEnd', { winner: state.winner, wins: state.wins.slice() });
        } else resetRound(state);
      }
      return;
    }
    if (state.phase !== 'fight') return;
    if (!state.training) state.timeLeft = Math.max(0, state.timeLeft - dt);
    const ai = cpuInput(state, dt);
    updateFighter(state, state.fighters[0], input, dt); updateFighter(state, state.fighters[1], ai, dt); separate(state);
    for (const f of state.fighters) if (!isStrike(f)) faceTarget(f, state.fighters[1 - f.id]);
    // Snapshot both contacts before applying damage: honest trades and double KOs.
    const strikes = state.fighters.map(f => collectStrike(state, f)).filter(Boolean);
    strikes.forEach(strike => resolveStrike(state, strike)); updateHazard(state, dt); finishRound(state);
  }
  function step(state, dt, input) {
    if (!state || state.phase === 'matchOver' || !Number.isFinite(dt) || dt <= 0) return state;
    let remaining = Math.min(dt, .25); input = input || {};
    while (remaining > .000001) { const slice = Math.min(remaining, 1 / 120); tick(state, slice, input); remaining -= slice; }
    return state;
  }
  global.FightSim = Object.freeze({ createMatch, step, act, moves, levels, difficulties: levels, arenas });
  if (typeof module !== 'undefined' && module.exports) module.exports = global.FightSim;
})(typeof window !== 'undefined' ? window : globalThis);
