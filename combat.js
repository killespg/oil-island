(function (global) {
  'use strict';

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const moves = Object.freeze({
    punch: Object.freeze({ duration: 0.34, windup: 0.11, active: 0.12, range: 1.95, depth: 1.05, height: 1.05, damage: 9, cost: 5, stun: 0.22, knockback: 0.32, guardDamage: 16 }),
    kick: Object.freeze({ duration: 0.58, windup: 0.23, active: 0.15, range: 2.55, depth: 1.1, height: 1.65, damage: 15, cost: 12, stun: 0.32, knockback: 0.75, guardDamage: 27 }),
    special: Object.freeze({ duration: 0.88, windup: 0.34, active: 0.22, range: 3.15, depth: 1.55, height: 1.9, damage: 27, cost: 40, stun: 0.44, knockback: 1.35, guardDamage: 49 }),
    dodge: Object.freeze({ duration: 0.4, cost: 15, cooldown: 0.9 }),
    jump: Object.freeze({ duration: 0.78, cost: 0 })
  });

  const levels = {
    easy: { think: 0.24, delay: 0.56, defense: 0.18, speed: 0.79, pressure: 0.48 },
    normal: { think: 0.15, delay: 0.32, defense: 0.41, speed: 0.9, pressure: 0.72 },
    hard: { think: 0.095, delay: 0.2, defense: 0.64, speed: 1.0, pressure: 0.86 }
  };

  function emit(state, type, detail) {
    state.events.push(Object.assign({ type }, detail || {}));
  }

  function fighter(id) {
    return {
      id, x: id === 0 ? -2 : 2, z: 0, y: 0, face: id === 0 ? 1 : -1,
      hp: 100, maxHp: 100, energy: 100, maxEnergy: 100, guard: 100,
      blocking: false, action: 'idle', actionTime: 0, actionDuration: 0,
      stun: 0, vx: 0, vz: 0, combo: 0,
      color: id === 0 ? '#32e7ff' : '#ff4879',
      _vy: 0, _pushX: 0, _pushZ: 0, _invuln: 0, _dodgeCooldown: 0,
      _guardLock: 0, _guardDelay: 0, _comboTimer: 0, _hurtChain: 0,
      _lastHitAgo: 10, _think: 0.3, _aiWait: 0.5, _aiBlock: 0,
      _aiX: 0, _aiZ: 0, _inputX: 0, _inputZ: 0, _buffer: null,
      _hitDone: false, _contact: false, _attackFace: id === 0 ? 1 : -1,
      _respawn: 0, _attackSerial: 0, _chainIndex: 0, _aiRead: -1
    };
  }

  function createMatch(options) {
    options = options || {};
    let seed = Number.isFinite(options.seed) ? options.seed >>> 0 : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    if (!seed) seed = 0x91ec10;
    const state = {
      phase: 'intro', phaseTime: 0, round: 1, timeLeft: 75,
      winner: null, roundWinner: null, wins: [0, 0],
      fighters: [fighter(0), fighter(1)], events: [], shake: 0,
      difficulty: levels[options.difficulty] ? options.difficulty : 'normal',
      training: !!options.training, elapsed: 0,
      _random() {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        return (seed >>> 0) / 4294967296;
      }
    };
    emit(state, 'roundStart', { round: state.round, training: state.training });
    return state;
  }

  function setAction(f, name, duration) {
    f.action = name;
    f.actionTime = 0;
    f.actionDuration = duration || 0;
  }

  function startAction(state, f, name) {
    const move = moves[name];
    if (!move || f.energy + 0.00001 < move.cost) return false;
    if (name === 'dodge' && (f._dodgeCooldown > 0 || f.y > 0.1)) return false;
    if (name === 'jump' && (f.y > 0.05 || f._vy > 0)) return false;
    const opponent = state.fighters[1 - f.id];
    f.face = opponent.x >= f.x ? 1 : -1;
    f.energy = clamp(f.energy - move.cost, 0, 100);
    f.blocking = false;
    f._buffer = null;
    f._contact = false;
    f._hitDone = false;
    f._attackFace = f.face;
    setAction(f, name, move.duration);
    if (name === 'dodge') {
      const length = Math.hypot(f._inputX, f._inputZ);
      f._dodgeX = length > 0.1 ? f._inputX / length : -f.face;
      f._dodgeZ = length > 0.1 ? f._inputZ / length : 0;
      f._dodgeCooldown = move.cooldown;
      f._invuln = 0.29;
      f._chainIndex = 0;
    } else if (name === 'jump') {
      f._vy = 7.8;
      f._chainIndex = 0;
    } else {
      f._attackSerial += 1;
      f._chainIndex = (f._comboTimer > 0 ? f._chainIndex : 0) + 1;
      emit(state, 'attack', { attacker: f.id, target: opponent.id, move: name, x: f.x, z: f.z });
    }
    return true;
  }

  function act(state, playerIndex, name) {
    if (!state || state.phase !== 'fight' || !moves[name]) return false;
    const f = state.fighters[playerIndex];
    if (!f || f.hp <= 0 || f.stun > 0) return false;
    if (state.training && playerIndex === 1) return false;
    if (moves[f.action] && f.action !== 'jump') {
      if (f.action === 'dodge' || name === 'jump' || name === 'dodge') return false;
      // A single buffered input survives the end of recovery. A confirmed jab
      // can also cancel into the next strike, giving J → J → K a real rhythm.
      f._buffer = { name, ttl: 0.25 };
      const previous = moves[f.action];
      if (f._contact && f.actionTime >= previous.windup + 0.09 && f._chainIndex < 3 && f.energy >= moves[name].cost) {
        return startAction(state, f, name);
      }
      return true;
    }
    return startAction(state, f, name);
  }

  function resetRound(state) {
    state.round += 1;
    state.phase = 'intro';
    state.phaseTime = 0;
    state.timeLeft = 75;
    state.roundWinner = null;
    state.shake = 0;
    state.fighters.forEach((f, id) => Object.assign(f, fighter(id)));
    emit(state, 'roundStart', { round: state.round });
  }

  function finishRound(state) {
    if (state.phase !== 'fight' || state.training) return;
    const [a, b] = state.fighters;
    if (a.hp > 0 && b.hp > 0 && state.timeLeft > 0) return;
    state.phase = 'roundOver';
    state.phaseTime = 0;
    const difference = a.hp - b.hp;
    const winner = Math.abs(difference) < 0.00001 ? 'draw' : (difference > 0 ? 0 : 1);
    state.roundWinner = winner;
    if (winner !== 'draw') state.wins[winner] += 1;
    for (const f of state.fighters) {
      f.blocking = false;
      f._buffer = null;
      if (f.hp <= 0) setAction(f, 'ko', 2);
      else setAction(f, 'idle', 0);
    }
    emit(state, 'roundEnd', { winner, round: state.round, reason: state.timeLeft <= 0 ? 'time' : 'ko' });
  }

  function cpuInput(state, dt) {
    const cpu = state.fighters[1], player = state.fighters[0];
    if (state.training || cpu.hp <= 0) return { x: 0, z: 0, block: false };
    const skill = levels[state.difficulty], random = state._random;
    cpu._think -= dt;
    cpu._aiWait = Math.max(0, cpu._aiWait - dt);
    cpu._aiBlock = Math.max(0, cpu._aiBlock - dt);
    if (cpu._think <= 0) {
      cpu._think = skill.think * (0.8 + random() * 0.45);
      const dx = player.x - cpu.x, dz = player.z - cpu.z;
      const distance = Math.abs(dx), sameLane = Math.abs(dz) < 1.1;
      const direction = dx >= 0 ? 1 : -1;
      cpu._aiX = distance > 2.05 ? direction : distance < 1.1 ? -direction * 0.75 : 0;
      cpu._aiZ = Math.abs(dz) > 0.35 ? Math.sign(dz) * 0.75 : 0;
      // Hard opponents learn from visible pressure: after taking a string or
      // nearly losing their guard, spend normal dodge meter to leave its lane.
      // This reacts to damage already dealt, never to an unstarted input.
      const pressured = player.combo >= 2 || cpu.guard < 45;
      const freeToEvade = cpu.stun <= 0 && (!moves[cpu.action] || cpu.action === 'jump');
      if (state.difficulty === 'hard' && pressured && freeToEvade && sameLane && distance < 2.75 && cpu.y < 0.1 && cpu._dodgeCooldown <= 0 && cpu.energy >= 22 && random() < 0.85) {
        cpu._inputX = -direction * 0.35;
        cpu._inputZ = Math.abs(cpu.z) > 0.4 ? -Math.sign(cpu.z) : (random() < 0.5 ? -1 : 1);
        if (act(state, 1, 'dodge')) {
          cpu._aiBlock = 0;
          cpu._aiWait = 0.45;
          return { x: cpu._inputX, z: cpu._inputZ, block: false };
        }
      }
      // React once to an attack, rather than rerolling a block every frame.
      if (moves[player.action] && moves[player.action].damage && player._attackSerial !== cpu._aiRead && sameLane && distance < 3.4) {
        cpu._aiRead = player._attackSerial;
        if (random() < skill.defense && cpu.stun <= 0 && cpu.action !== 'dodge') {
          if (random() < 0.24 && cpu._dodgeCooldown <= 0 && cpu.energy >= 22) act(state, 1, 'dodge');
          else cpu._aiBlock = 0.3 + random() * 0.2;
        }
      }
      if (cpu._aiWait <= 0 && cpu._aiBlock <= 0 && sameLane && cpu.stun <= 0 && distance <= 3.0) {
        const roll = random();
        let move = distance > 2.25 ? 'kick' : 'punch';
        if (cpu.energy >= 48 && roll < 0.16 * skill.pressure) move = 'special';
        else if (distance <= 2.45 && roll > 0.56) move = 'kick';
        if (distance < moves[move].range - 0.08 && random() < skill.pressure) {
          act(state, 1, move);
          cpu._aiWait = moves[move].duration * 0.72 + skill.delay + random() * 0.33;
        } else cpu._aiWait = 0.12;
      }
    }
    return { x: cpu._aiX * skill.speed, z: cpu._aiZ * skill.speed, block: cpu._aiBlock > 0 };
  }

  function updateFighter(state, f, input, dt) {
    const oldX = f.x, oldZ = f.z;
    f._inputX = clamp(Number(input.x) || 0, -1, 1);
    f._inputZ = clamp(Number(input.z) || 0, -1, 1);
    f._invuln = Math.max(0, f._invuln - dt);
    f._dodgeCooldown = Math.max(0, f._dodgeCooldown - dt);
    f._guardLock = Math.max(0, f._guardLock - dt);
    f._guardDelay = Math.max(0, f._guardDelay - dt);
    f._lastHitAgo += dt;
    if (f._lastHitAgo > 0.9) f._hurtChain = 0;
    f._comboTimer = Math.max(0, f._comboTimer - dt);
    if (!f._comboTimer) { f.combo = 0; f._chainIndex = 0; }
    f.actionTime += dt;
    f.stun = Math.max(0, f.stun - dt);
    if (f._buffer) {
      f._buffer.ttl -= dt;
      if (f._buffer.ttl <= 0) f._buffer = null;
    }
    if (f.y > 0 || f._vy > 0) {
      f._vy -= 20 * dt;
      f.y = Math.max(0, f.y + f._vy * dt);
      if (f.y === 0) f._vy = 0;
    }
    if (f.hp <= 0) {
      f.blocking = false;
      if (state.training) {
        f._respawn += dt;
        if (f._respawn >= 1.6) {
          f.hp = f.maxHp; f.guard = 100; f.stun = 0; f._invuln = 0.4;
          f._respawn = 0; f._hurtChain = 0; f._pushX = 0;
          setAction(f, 'idle', 0);
        }
      }
      f.vx = 0; f.vz = 0;
      return;
    }
    if (f.actionDuration > 0 && f.actionTime >= f.actionDuration && f.stun <= 0 && f.action !== 'ko') {
      const buffered = f._buffer;
      f._buffer = null;
      setAction(f, f.y > 0 ? 'jump' : 'idle', f.y > 0 ? 0.5 : 0);
      if (buffered) startAction(state, f, buffered.name);
    }
    const busy = !!moves[f.action] && f.action !== 'jump';
    f.blocking = !!input.block && !busy && f.stun <= 0 && f.y < 0.08 && f._guardLock <= 0;
    const speed = f.blocking ? 1.75 : f.y > 0 ? 3.0 : 4.0;
    if (!busy && f.stun <= 0) {
      const length = Math.max(1, Math.hypot(f._inputX, f._inputZ));
      f.x += f._inputX / length * speed * dt;
      f.z += f._inputZ / length * speed * 0.83 * dt;
      if (f.y <= 0) {
        const name = Math.hypot(f._inputX, f._inputZ) > 0.1 ? 'walk' : 'idle';
        if (f.action !== name) setAction(f, name, 0);
      }
    } else if (f.action === 'dodge' && f.stun <= 0) {
      const speedDodge = 10 * Math.max(0, 1 - f.actionTime / moves.dodge.duration);
      f.x += f._dodgeX * speedDodge * dt;
      f.z += f._dodgeZ * speedDodge * dt;
    } else if (moves[f.action] && moves[f.action].damage && f.actionTime < moves[f.action].windup) {
      // Forward commitment keeps attacks responsive without magnetic hits.
      f.x += f._attackFace * (f.action === 'special' ? 1.0 : 0.52) * dt;
    }
    f.x += f._pushX * dt;
    f.z += f._pushZ * dt;
    f._pushX *= Math.exp(-12 * dt);
    f._pushZ *= Math.exp(-12 * dt);
    f.x = clamp(f.x, -6, 6);
    f.z = clamp(f.z, -2, 2);
    f.vx = (f.x - oldX) / dt;
    f.vz = (f.z - oldZ) / dt;
    f.energy = clamp(f.energy + (state.training ? 22 : f.blocking ? 3.5 : 7) * dt, 0, 100);
    if (f._guardDelay <= 0 && !f.blocking) f.guard = clamp(f.guard + 24 * dt, 0, 100);
    if (state.training && f._lastHitAgo > 3 && f.hp > 0) f.hp = clamp(f.hp + 20 * dt, 0, 100);
  }

  function collectStrike(state, attacker) {
    const move = moves[attacker.action];
    if (!move || !move.damage || attacker.hp <= 0 || attacker._hitDone || attacker.stun > 0) return null;
    if (attacker.actionTime > move.windup + move.active) {
      attacker._hitDone = true;
      emit(state, 'whiff', { attacker: attacker.id, move: attacker.action, x: attacker.x, z: attacker.z });
      return null;
    }
    if (attacker.actionTime < move.windup) return null;
    const target = state.fighters[1 - attacker.id];
    if (target.hp <= 0 || target._invuln > 0) return null;
    const dx = target.x - attacker.x;
    if (dx * attacker._attackFace < -0.2 || Math.abs(dx) > move.range || Math.abs(target.z - attacker.z) > move.depth || Math.abs(target.y - attacker.y) > move.height) return null;
    attacker._hitDone = true;
    return { attacker, target, move, name: attacker.action, blocked: target.blocking && target.face * (attacker.x - target.x) >= -0.1 };
  }

  function resolveStrike(state, strike) {
    const { attacker, target, move, name, blocked } = strike;
    attacker._contact = true;
    const point = { attacker: attacker.id, target: target.id, x: (attacker.x + target.x) * 0.5, z: (attacker.z + target.z) * 0.5, move: name };
    target._lastHitAgo = 0;
    target._guardDelay = 1.2;
    if (blocked) {
      const damage = name === 'special' ? 5 : name === 'kick' ? 2 : 1;
      target.hp = Math.max(0, target.hp - damage);
      target.guard = Math.max(0, target.guard - move.guardDamage);
      target._pushX += attacker._attackFace * move.knockback * 4.5;
      target.energy = clamp(target.energy + 3, 0, 100);
      attacker.energy = clamp(attacker.energy + 2, 0, 100);
      emit(state, 'block', Object.assign({ damage }, point));
      state.shake = Math.max(state.shake, 0.1);
      if (target.guard <= 0) {
        target.guard = 25;
        target.blocking = false;
        target._guardLock = 1.1;
        target.stun = 0.58;
        target._buffer = null;
        setAction(target, 'hurt', 0.58);
        emit(state, 'guardBreak', point);
        state.shake = Math.max(state.shake, 0.32);
      }
      if (target.hp <= 0) setAction(target, 'ko', 2);
      return;
    }
    attacker.combo = attacker._comboTimer > 0 ? attacker.combo + 1 : 1;
    attacker._comboTimer = 1.2;
    const scale = Math.max(0.65, 1 - (attacker.combo - 1) * 0.1);
    const damage = Math.round(move.damage * scale);
    target.hp = Math.max(0, target.hp - damage);
    target.blocking = false;
    target._buffer = null;
    target._hurtChain += 1;
    target.stun = move.stun;
    target._pushX += attacker._attackFace * move.knockback * 12;
    target._pushZ += (target.z - attacker.z) * 1.3;
    if (target._hurtChain >= 3) {
      target._invuln = move.stun + 0.25;
      target._pushX += attacker._attackFace * 7;
      target._hurtChain = 0;
    }
    attacker.energy = clamp(attacker.energy + (name === 'special' ? 0 : 6), 0, 100);
    target.energy = clamp(target.energy + 5, 0, 100);
    setAction(target, target.hp <= 0 ? 'ko' : 'hurt', target.hp <= 0 ? 2 : target.stun);
    state.shake = Math.max(state.shake, name === 'special' ? 0.55 : name === 'kick' ? 0.3 : 0.19);
    emit(state, 'hit', Object.assign({ damage, combo: attacker.combo }, point));
    if (attacker.combo >= 2) emit(state, 'combo', Object.assign({ combo: attacker.combo }, point));
  }

  function separate(state) {
    const [a, b] = state.fighters;
    if (a.hp <= 0 || b.hp <= 0 || Math.abs(a.y - b.y) > 0.85) return;
    const dx = b.x - a.x, dz = b.z - a.z;
    const distance = Math.hypot(dx, dz), minDistance = 0.82;
    if (distance >= minDistance) return;
    const nx = distance > 0.001 ? dx / distance : a.face;
    const nz = distance > 0.001 ? dz / distance : 0;
    const push = (minDistance - distance) * 0.5;
    a.x = clamp(a.x - nx * push, -6, 6); b.x = clamp(b.x + nx * push, -6, 6);
    a.z = clamp(a.z - nz * push, -2, 2); b.z = clamp(b.z + nz * push, -2, 2);
  }

  function tick(state, dt, input) {
    if (state.phase === 'matchOver') return;
    state.elapsed += dt;
    state.phaseTime += dt;
    state.shake *= Math.exp(-9 * dt);
    if (state.phase === 'intro') {
      if (state.phaseTime >= 2) { state.phase = 'fight'; state.phaseTime = 0; }
      return;
    }
    if (state.phase === 'roundOver') {
      for (const f of state.fighters) {
        f.actionTime += dt;
        if (f.y > 0) {
          f._vy -= 20 * dt;
          f.y = Math.max(0, f.y + f._vy * dt);
        }
        f.x = clamp(f.x + f._pushX * dt, -6, 6);
        f.z = clamp(f.z + f._pushZ * dt, -2, 2);
        f._pushX *= Math.exp(-12 * dt);
        f._pushZ *= Math.exp(-12 * dt);
      }
      if (state.phaseTime >= 3) {
        if (state.wins[0] >= 2 || state.wins[1] >= 2) {
          state.phase = 'matchOver'; state.phaseTime = 0;
          state.winner = state.wins[0] >= 2 ? 0 : 1;
          emit(state, 'matchEnd', { winner: state.winner, wins: state.wins.slice() });
        } else resetRound(state);
      }
      return;
    }
    if (!state.training) state.timeLeft = Math.max(0, state.timeLeft - dt);
    const ai = cpuInput(state, dt);
    updateFighter(state, state.fighters[0], input, dt);
    updateFighter(state, state.fighters[1], ai, dt);
    separate(state);
    for (const f of state.fighters) {
      if (!moves[f.action] || !moves[f.action].damage) f.face = state.fighters[1 - f.id].x >= f.x ? 1 : -1;
    }
    // Collect both contacts first so two attacks active in the same simulation
    // slice can trade hits, including a simultaneous knockout.
    const strikes = state.fighters.map(f => collectStrike(state, f)).filter(Boolean);
    strikes.forEach(strike => resolveStrike(state, strike));
    finishRound(state);
  }

  function step(state, dt, input) {
    if (!state || state.phase === 'matchOver' || !Number.isFinite(dt) || dt <= 0) return state;
    let remaining = Math.min(dt, 0.25);
    input = input || { x: 0, z: 0, block: false };
    while (remaining > 0.000001) {
      const slice = Math.min(remaining, 1 / 120);
      tick(state, slice, input);
      remaining -= slice;
    }
    return state;
  }

  global.FightSim = Object.freeze({ createMatch, step, act, moves });
  if (typeof module !== 'undefined' && module.exports) module.exports = global.FightSim;
})(typeof window !== 'undefined' ? window : globalThis);
