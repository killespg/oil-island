/* Oil Island (Orelha Edition): deterministic, camera-independent arena combat. */
(function (global) {
  'use strict';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const inputBufferDuration = .18;
  const confirmDelay = .06;
  const maxChainLength = 8;
  const maxGuardChainLength = 3;
  const roundDuration = 120;
  const fighterHealth = 300;
  const moves = Object.freeze({
    punch: Object.freeze({ duration: 0.30, windup: 0.10, active: 0.10, range: 2.0, cone: 0.72, depth: 1.05, height: 1.05, damage: 9, cost: 5, stun: 0.20, knockback: 0.32, guardDamage: 16 }),
    kick: Object.freeze({ duration: 0.51, windup: 0.24, active: 0.13, range: 2.7, cone: 0.85, depth: 1.1, height: 1.65, damage: 16, cost: 12, stun: 0.30, knockback: 0.75, guardDamage: 29 }),
    special: Object.freeze({ duration: 1.0, windup: 0.43, active: 0.20, range: 3.45, cone: 0.94, depth: 1.55, height: 1.9, damage: 28, cost: 40, stun: 0.44, knockback: 1.35, guardDamage: 55 }),
    super: Object.freeze({ duration: 1.02, windup: .32, active: .22, range: 3.8, cone: 1.05, depth: 1.7, height: 2.1, damage: 38, cost: 100, stun: .42, knockback: 1.4, guardDamage: 68 }),
    dodge: Object.freeze({ duration: 0.28, cost: 15, cooldown: 0.58, invulnerability: .16, speed: 23 }),
    jump: Object.freeze({ duration: 0.78, cost: 0 })
  });
  const characters = Object.freeze({
    veterano: Object.freeze({ id: 'veterano', name: 'Epstein', title: 'Precisão e experiência', description: 'Alcance equilibrado e golpes diretos para confirmar sequências.', color: '#32e7ff', specialName: 'Impacto Vetorial', superName: 'Última Linha' }),
    titan: Object.freeze({ id: 'titan', name: 'Diddy', title: 'Força e presença', description: 'Golpes fortes e uma arma que dispara óleo durante cinco segundos.', color: '#ff4879', specialName: 'Rajada de Óleo', superName: 'Queda do Colosso' }),
    mimico: Object.freeze({ id: 'mimico', name: 'Oliver Tree', title: 'Giros e decolagens', description: 'Braços como hélices, chutes giratórios e uma decolagem curta para controlar o espaço ao redor.', color: '#bc91ff', specialName: 'Hélice Giratória', superName: 'Decolagem Total', kickName: 'Chute Rotor', airName: 'Pouso de Impacto' }),
    orelha: Object.freeze({ id: 'orelha', name: 'Orelha', title: 'Guardião da Brava', description: 'Ágil e protetor: vento e areia de perto, rasteira e uma maré que devolve o rival ao centro.', color: '#ffcf79', specialName: 'Brisa da Brava', superName: 'Maré da Proteção', kickName: 'Giro da Orla', airName: 'Salto do Casamento', dodgeName: 'Esquiva do Mascote' }),
    pixel: Object.freeze({ id: 'pixel', name: 'Raulzito', title: 'Velocidade e risco', description: 'O mais veloz: avanços curtos e baratos, com menos força e alcance nos golpes básicos.', color: '#9cf36a', specialName: 'Salto de Quadro', superName: 'Overclock' })
  });
  const has = (object, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(object, key);
  const characterId = (id, slot) => has(characters, id) ? id : slot === 1 ? 'titan' : 'veterano';
  const profiles = Object.freeze({
    veterano: { speed: 1, moves: {} },
    titan: { speed: .92, moves: { punch: { damage: 11, range: 2.18, cost: 6 }, kick: { damage: 19, range: 2.85, cost: 14 }, special: { duration: 5.3, windup: .18, active: 5, damage: 2, range: 7.2, cone: .3, lunge: 0, cost: 44, stun: .04, knockback: .02, guardDamage: 2, blockDamage: .25, shake: .04, projectile: true, projectileKind: 'oil', projectileSpeed: 22, projectileRadius: .22, channel: true, projectileInterval: .25 }, super: { damage: 42, range: 4.05, cone: Math.PI, windup: .4, guardDamage: 76 } } },
    mimico: { speed: 1.04, moves: { punch: { damage: 8, cost: 4 }, kick: { duration: .56, windup: .20, active: .15, damage: 15, cone: Math.PI, lunge: 0, lift: 4.4 }, special: { duration: .8, windup: .20, active: .30, range: 3, cone: Math.PI, damage: 11, cost: 36, stun: .23, knockback: .26, guardDamage: 23, lunge: 0, hits: [0, .20], hitWindow: .10 }, super: { duration: 1.04, windup: .20, active: .50, damage: 13, range: 3.4, cone: Math.PI, knockback: .28, stun: .23, guardDamage: 24, lunge: 3.2, lift: 5.2, hits: [0, .20, .40], hitWindow: .10 } } },
    orelha: { speed: 1.07, moves: { punch: { damage: 8 }, kick: { damage: 14, windup: .20, cone: 1.9, height: .55, cost: 10 }, special: { duration: .61, windup: .17, active: .12, range: 4.4, damage: 18, cost: 30, stun: .24, knockback: .55, guardDamage: 30, lunge: 0, projectile: true, projectileSpeed: 18, projectileRadius: .40 }, super: { duration: 1.02, windup: .15, active: .51, range: 2.5, cone: Math.PI, damage: 11, stun: .22, knockback: .38, guardDamage: 22, lunge: 13, hits: [0, .20, .40], hitWindow: .11, centerPush: true } } },
    pixel: { speed: 1.12, moves: { punch: { damage: 8, range: 1.9, cost: 4 }, kick: { damage: 14, range: 2.55, cost: 10 }, special: { duration: .64, windup: .20, active: .14, range: 2.65, damage: 22, cost: 32, knockback: .8, stun: .32, guardDamage: 42, lunge: 9 }, super: { duration: .9, windup: .23, active: .2, range: 3, damage: 34, lunge: 14 } } }
  });
  function extendMeleeReach(move, scale = 1.28) {
    if (move.damage && !move.projectile) {
      const previous = move.range;
      move.range *= scale;
      // Presentation can extend the pose by this amount without moving the
      // authoritative fighter or silently changing the attack's lunge.
      move.reachExtension = move.range - previous;
    }
    return move;
  }
  const characterMoves = {};
  for (const id of Object.keys(characters)) {
    const list = {};
    for (const name of Object.keys(moves)) {
      // Wide multi-hit rotors receive a smaller increase to their full circle.
      const reachScale = id === 'mimico' && (name === 'special' || name === 'super') ? 1.2 : 1.28;
      const move = extendMeleeReach(Object.assign({}, moves[name], profiles[id].moves[name]), reachScale);
      if (move.hits) move.hits = Object.freeze(move.hits.slice());
      list[name] = Object.freeze(move);
    }
    characterMoves[id] = Object.freeze(list);
  }
  const orelhaAirKick = Object.freeze(extendMeleeReach(Object.assign({}, characterMoves.orelha.kick, { damage: 17, height: 2.1, range: 2.85, cone: 1.1 })));
  const mimicoAirKick = Object.freeze(extendMeleeReach(Object.assign({}, characterMoves.mimico.kick, { damage: 17, windup: .13, height: 2.1, range: 2.8, cone: 1.2, lift: 0, dive: -5.5 })));
  function getMove(f, name) {
    name = name || f.action;
    if (!has(moves, name)) return null;
    const id = characterId(f.character, f.id);
    if (name === 'kick' && f._airAttack) {
      if (id === 'orelha') return orelhaAirKick;
      if (id === 'mimico') return mimicoAirKick;
    }
    return characterMoves[id][name];
  }
  function moveName(f, name) {
    const data = characters[characterId(f.character, f.id)];
    return name === 'super' ? data.superName : name === 'special' ? data.specialName : name === 'kick' && f._airAttack ? data.airName || 'Golpe aéreo' : name === 'kick' ? data.kickName || 'Chute' : name === 'dodge' ? data.dodgeName || 'Esquiva' : name === 'punch' ? 'Soco' : 'Salto';
  }
  // Difficulty changes decisions, reaction latency and pressure, never health,
  // damage, hit boxes, animation speed, movement speed or available resources.
  const levels = Object.freeze({
    easy: Object.freeze({ id: 'easy', name: 'INICIANTE', think: .26, reaction: .32, delay: .62, defense: .20, pressure: .48, combo: .05, escape: .05, orbit: .04 }),
    normal: Object.freeze({ id: 'normal', name: 'COMBATENTE', think: .15, reaction: .23, delay: .34, defense: .48, pressure: .73, combo: .38, escape: .35, orbit: .18 }),
    hard: Object.freeze({ id: 'hard', name: 'EXECUTOR', think: .075, reaction: .16, delay: .12, defense: .78, pressure: .94, combo: .78, escape: .78, orbit: .35 }),
    nightmare: Object.freeze({ id: 'nightmare', name: 'PESADELO', think: .045, reaction: .12, delay: .045, defense: .94, pressure: .99, combo: .95, escape: .94, orbit: .48 })
  });
  const arenas = Object.freeze({
    island: Object.freeze({ id: 'island', name: 'OIL ISLAND', halfX: 13.5, halfZ: 13.5, description: 'Uma arena tropical entre rochas, palmeiras e mar aberto.' }),
    nightclub: Object.freeze({ id: 'nightclub', name: 'AFTER HOURS', halfX: 12, halfZ: 12, description: 'Uma pista de boate cercada por música, luzes e festa.' }),
    seaside: Object.freeze({ id: 'seaside', name: 'ORLA BRAVA', halfX: 14, halfZ: 14, description: 'Areia, calçadão e a cidade litorânea ao entardecer.' }),
    helipad: Object.freeze({ id: 'helipad', name: 'HELIPONTO', halfX: 13, halfZ: 13, description: 'Uma arena elevada sob dois helicópteros em colisão no céu.' })
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
  function fighter(id, selectedCharacter) {
    const yaw = id === 0 ? Math.PI / 2 : -Math.PI / 2;
    const character = characterId(selectedCharacter, id);
    return {
      id, character, moveName: '', x: id === 0 ? -2.8 : 2.8, z: 0, y: 0, yaw, face: id === 0 ? 1 : -1,
      hp: fighterHealth, maxHp: fighterHealth, energy: 100, maxEnergy: 100, guard: 100,
      blocking: false, sprinting: false, action: 'idle', actionTime: 0, actionDuration: 0,
      stun: 0, vx: 0, vz: 0, combo: 0, color: characters[character].color,
      _vy: 0, _pushX: 0, _pushZ: 0, _invuln: 0, _dodgeCooldown: 0, _dodgeX: 0, _dodgeZ: 0,
      _guardLock: 0, _guardDelay: 0, _comboTimer: 0, _hurtChain: 0,
      _lastHitAgo: 10, _think: .3, _aiWait: .5, _aiBlock: 0, _aiReaction: null,
      _aiX: 0, _aiZ: 0, _aiOrbit: id === 0 ? 1 : -1, _aiOrbitTime: 0,
      _inputX: 0, _inputZ: 0, _buffer: null, _hitDone: false, _contact: false, _contactBlocked: false,
      _attackFace: id === 0 ? 1 : -1, _attackYaw: yaw, _respawn: 0,
      _attackSerial: 0, _chainIndex: 0, _comboRewardSerial: -1, _perfectDodgeSerial: -1, _aiRead: -1, _aiComboRead: -1,
      _entryFrom: '', _entryWindow: 0,
      _blockHeld: false, _guardPress: 0, _parryWindow: 0, _parryCooldown: 0, _hazardHit: -1,
      _airAttack: false, _hitMask: 0, _projectileSpawned: false, _projectileShots: 0
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
    for (const key of ['power', 'flow', 'guard']) upgrades[key] = options.multiplayer ? 0 : clamp(Math.floor(Number(options.upgrades && options.upgrades[key]) || 0), 0, 10);
    const state = {
      phase: 'intro', phaseTime: 0, round: 1, timeLeft: roundDuration, winner: null, roundWinner: null, wins: [0, 0],
      fighters: [fighter(0, options.characters && options.characters[0]), fighter(1, options.characters && options.characters[1])], events: [], shake: 0, projectiles: [], _projectileSerial: 0,
      difficulty: levels[options.difficulty] ? options.difficulty : 'normal',
      arena: Object.prototype.hasOwnProperty.call(arenas, options.arena) ? options.arena : 'island', hazard: freshHazard(), upgrades,
      training: !options.multiplayer && !!options.training, multiplayer: !!options.multiplayer, elapsed: 0, _rng: seed
    };
    attachRandom(state);
    emit(state, 'roundStart', { round: state.round, training: state.training });
    return state;
  }
  function attachRandom(state) {
    // The generator's complete state travels with every authoritative snapshot.
    state._random = function () { let seed = state._rng >>> 0; seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; state._rng = seed >>> 0; return state._rng / 4294967296; };
    return state;
  }
  function snapshot(state) {
    return JSON.parse(JSON.stringify(state, (key, value) => key === '_random' || key === 'localPlayer' ? undefined : key === 'events' ? [] : value));
  }
  function restore(data) {
    if (!data || !Array.isArray(data.fighters) || data.fighters.length !== 2 || !Object.prototype.hasOwnProperty.call(arenas, data.arena) || !Number.isFinite(data._rng)) throw new TypeError('Invalid combat snapshot');
    const state = snapshot(data);
    state.fighters = state.fighters.map((f, id) => Object.assign(fighter(id, f.character), f, { character: characterId(f.character, id) }));
    state.projectiles = Array.isArray(state.projectiles) ? state.projectiles : [];
    state._projectileSerial = state._projectileSerial || 0;
    return attachRandom(state);
  }
  function setAction(f, name, duration) { f.action = name; f.actionTime = 0; f.actionDuration = duration || 0; }
  function dodgeDirection(state, f) {
    const length = Math.hypot(f._inputX, f._inputZ);
    if (length > .1) return { x: f._inputX / length, z: f._inputZ / length };
    const target = direction(f, state.fighters[1 - f.id]);
    const sign = f.character === 'orelha' ? 1 : -1;
    return { x: sign * target.x, z: sign * target.z };
  }
  function defenseWait(f, name) {
    if (f.y > (name === 'jump' ? .05 : .1) || (name === 'jump' && f._vy > 0)) return Infinity;
    let recovery = moves[f.action] && f.action !== 'jump' ? Math.max(0, f.actionDuration - f.actionTime) : 0;
    if (isStrike(f)) {
      const move = getMove(f);
      recovery = Math.max(0, move.windup + (move.channel ? 0 : move.active) - f.actionTime);
    }
    return Math.max(f.stun, name === 'dodge' ? f._dodgeCooldown : 0, recovery);
  }
  function startAction(state, f, name, dodgeVector) {
    // Select from the new action's launch height, not a previous air attack's
    // stale flag. This also keeps a ground rotor's hop distinct from its dive.
    const airborne = f.y > .1;
    const move = getMove({ character: f.character, id: f.id, _airAttack: airborne }, name);
    if (!move || f.energy + .00001 < move.cost) return false;
    if (name === 'dodge' && (f._dodgeCooldown > 0 || f.y > .1)) return false;
    if (name === 'jump' && (f.y > .05 || f._vy > 0)) return false;
    const chained = isStrike(f) && f._contact;
    f._entryFrom = move.damage && !chained ? f.sprinting ? 'sprint' : f._entryWindow > 0 ? 'dodge' : '' : '';
    f._entryWindow = 0;
    const opponent = state.fighters[1 - f.id];
    faceTarget(f, opponent);
    f.energy = clamp(f.energy - move.cost, 0, 100);
    f.blocking = false; f.sprinting = false; f._parryWindow = 0;
    f._buffer = null; f._contact = false; f._contactBlocked = false; f._hitDone = false; f._hitMask = 0; f._projectileSpawned = false; f._projectileShots = 0;
    f._airAttack = airborne; f.moveName = moveName(f, name);
    f._attackFace = f.face; f._attackYaw = f.yaw;
    setAction(f, name, move.duration);
    if (name === 'dodge') {
      const vector = dodgeVector || dodgeDirection(state, f);
      f._dodgeX = vector.x; f._dodgeZ = vector.z;
      f._dodgeCooldown = move.cooldown; f._invuln = move.invulnerability;
      emit(state, 'dodge', { fighter: f.id, character: f.character, moveName: f.moveName, x: f.x, z: f.z });
    } else if (name === 'jump') { f._vy = 7.8; f._chainIndex = 0; }
    else {
      if (move.lift && !airborne) f._vy = move.lift;
      if (move.dive && airborne) f._vy = Math.min(f._vy, move.dive);
      f._attackSerial += 1;
      // Cancel chains count contact, including a blocked strike. Damage-combo
      // timers cannot enforce this cap because guard does not add a damage hit.
      f._chainIndex = chained ? f._chainIndex + 1 : 1;
      emit(state, 'attack', { attacker: f.id, target: opponent.id, character: f.character, move: name, moveName: f.moveName, chain: f._chainIndex, entryFrom: f._entryFrom, x: f.x, z: f.z, yaw: f.yaw });
    }
    return true;
  }
  function canChain(f) {
    const move = getMove(f);
    return isStrike(f) && f.action !== 'super' && !move.channel && f.stun <= 0 &&
      f._contact && f.actionTime >= move.windup + confirmDelay && f._chainIndex < (f._contactBlocked ? maxGuardChainLength : maxChainLength);
  }
  function act(state, playerIndex, name) {
    if (!state || state.phase !== 'fight' || !Object.prototype.hasOwnProperty.call(moves, name)) return false;
    const f = state.fighters[playerIndex];
    if (!f || f.hp <= 0 || (state.training && playerIndex === 1)) return false;
    if (name === 'dodge' || name === 'jump') {
      if (f.energy + .00001 < getMove(f, name).cost) return false;
      const wait = defenseWait(f, name);
      if (wait <= 0) return startAction(state, f, name);
      if (wait > inputBufferDuration) return false;
      // One intent slot: a late defense replaces an old attack, snapshots its
      // direction, and pays neither meter nor invulnerability before control.
      f._buffer = Object.assign({ name, ttl: inputBufferDuration }, name === 'dodge' ? dodgeDirection(state, f) : {});
      return true;
    }
    if (f.stun > 0) return false;
    if (moves[f.action] && f.action !== 'jump') {
      const previous = getMove(f);
      if (previous.channel) return false;
      if (f.action === 'super' || (f.action === 'dodge' && f.actionDuration - f.actionTime > inputBufferDuration)) return false;
      if (f.energy + .00001 < getMove(f, name).cost) return false;
      // One short input buffer: mashing cannot stack an invisible attack queue.
      f._buffer = { name, ttl: inputBufferDuration };
      if (canChain(f)) return startAction(state, f, name);
      return true;
    }
    return startAction(state, f, name);
  }
  function resetRound(state) {
    state.round += 1; state.phase = 'intro'; state.phaseTime = 0; state.timeLeft = roundDuration;
    state.roundWinner = null; state.shake = 0; state.hazard = freshHazard(); state.projectiles = [];
    // Replace every transient field, including AI reactions, dodge vectors and parry state.
    state.fighters.forEach((f, id) => Object.assign(f, fighter(id, f.character)));
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
    state.projectiles = [];
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
      // A visibly continuing string updates the threat, not the reaction
      // clock. Otherwise jabs faster than that clock prevent any response.
      if (cpu._aiReaction) cpu._aiReaction.serial = player._attackSerial;
      else cpu._aiReaction = { serial: player._attackSerial, remaining: skill.reaction + random() * .045, defend: random() < skill.defense };
    }
    if (cpu._aiReaction) {
      cpu._aiReaction.remaining -= dt;
      // Like a held human defense, a finished decision waits for legal
      // control after hitstun, and is discarded when the threat goes away.
      if (cpu._aiReaction.remaining <= 0 && (!isStrike(player) || distance >= 4.5)) cpu._aiReaction = null;
      else if (cpu._aiReaction.remaining <= 0 && isFree(cpu)) {
        const reaction = cpu._aiReaction; cpu._aiReaction = null;
        if (reaction.defend && isFree(cpu) && isStrike(player) && player._attackSerial === reaction.serial && distance < getMove(player).range + .45) {
          const dangerous = player.action === 'special' || player.action === 'super' || cpu.guard < 35;
          if ((dangerous || random() < .24) && cpu.energy >= 22 && cpu._dodgeCooldown <= 0 && cpu.y < .1) {
            cpu._inputX = dir.z * cpu._aiOrbit - dir.x * .25;
            cpu._inputZ = -dir.x * cpu._aiOrbit - dir.z * .25;
            if (act(state, 1, 'dodge')) cpu._aiWait = .22;
          } else cpu._aiBlock = Math.max(.18, getMove(player).windup + getMove(player).active - player.actionTime + .08);
        }
      }
    }
    if (cpu._think <= 0) {
      cpu._think = skill.think * (.85 + random() * .3);
      if (cpu._aiOrbitTime <= 0) { cpu._aiOrbit = random() < .5 ? -1 : 1; cpu._aiOrbitTime = 1.3 + random() * 1.4; }
      const recovering = isStrike(player) && player.actionTime > getMove(player).windup + getMove(player).active && !player._contact;
      const reserve = cpu.energy < 24;
      const preferred = reserve ? 3.7 : cpu._aiWait > .16 ? 2.6 : 1.5;
      const radial = distance > preferred + .22 ? 1 : distance < preferred - .22 ? -.8 : 0;
      const orbit = distance < 4.4 ? skill.orbit * cpu._aiOrbit : 0;
      cpu._aiX = dir.x * radial + dir.z * orbit;
      cpu._aiZ = dir.z * radial - dir.x * orbit;
      // Refuse to orbit into the wall; inward steering prevents corner loops.
      const arena = arenas[state.arena];
      if (Math.abs(cpu.x) > arena.halfX - .75) cpu._aiX -= Math.sign(cpu.x) * .8;
      if (Math.abs(cpu.z) > arena.halfZ - .75) cpu._aiZ -= Math.sign(cpu.z) * .8;
      const pressured = player.combo >= 2 || cpu.guard < 30;
      if (pressured && isFree(cpu) && distance < 3.1 && cpu.y < .1 && cpu._dodgeCooldown <= 0 && cpu.energy >= 22 && random() < skill.escape) {
        cpu._inputX = dir.z * cpu._aiOrbit - dir.x * .4; cpu._inputZ = -dir.x * cpu._aiOrbit - dir.z * .4;
        if (act(state, 1, 'dodge')) { cpu._aiBlock = 0; cpu._aiWait = .28; }
      }
      // The CPU voluntarily chooses short three-action strings; the shared
      // confirmed offense permits eight. Whiffs never cancel offensively.
      if (isStrike(cpu) && cpu._contact && cpu._chainIndex < 3 && cpu.actionTime >= getMove(cpu).windup + .065 && cpu._aiComboRead !== cpu._attackSerial) {
        cpu._aiComboRead = cpu._attackSerial;
        if (random() < skill.combo) {
          const followup = cpu._chainIndex >= 2 || distance > 1.8 ? 'kick' : 'punch';
          if (cpu.energy >= getMove(cpu, followup).cost + 12) { act(state, 1, followup); cpu._aiWait = skill.delay + .25; }
        }
      }
      if (isFree(cpu) && cpu._aiBlock <= 0 && (cpu._aiWait <= 0 || (recovering && skill.combo > .5)) && distance < 3.4) {
        const roll = random();
        // Neutral initiations use a readable kick; fast jabs punish a visible
        // recovery or continue a confirmed string, rather than ambushing.
        let name = recovering && distance <= 2.05 ? 'punch' : 'kick';
        if (cpu.energy >= 54 && (player.blocking || distance > 2.65 || roll < .12 * skill.pressure)) name = 'special';
        else if (distance < 2.6 && (player.guard < 45 || roll > .68)) name = 'kick';
        if (cpu.energy >= 100 && distance < 2.8 && (recovering || player.guard < 35) && skill.combo >= .78) name = 'super';
        if (distance < getMove(cpu, name).range - .08 && random() < skill.pressure) {
          if (act(state, 1, name)) cpu._aiWait = getMove(cpu, name).duration + skill.delay + random() * .14;
        } else cpu._aiWait = .12;
      }
    }
    const sprint = distance > 5 && cpu.energy > 35 && skill.pressure > .8;
    return { x: cpu._aiX, z: cpu._aiZ, block: cpu._aiBlock > 0, sprint };
  }
  function bound(state, f) { const a = arenas[state.arena]; f.x = clamp(f.x, -a.halfX, a.halfX); f.z = clamp(f.z, -a.halfZ, a.halfZ); }
  function updateFighter(state, f, input, dt) {
    const oldX = f.x, oldZ = f.z;
    const defenseBefore = f._buffer && (f._buffer.name === 'dodge' || f._buffer.name === 'jump') ? defenseWait(f, f._buffer.name) : Infinity;
    f._inputX = clamp(Number.isFinite(input.x) ? input.x : 0, -1, 1); f._inputZ = clamp(Number.isFinite(input.z) ? input.z : 0, -1, 1);
    for (const key of ['_invuln', '_dodgeCooldown', '_guardLock', '_guardDelay', '_guardPress', '_parryWindow', '_parryCooldown', '_comboTimer', '_entryWindow']) f[key] = Math.max(0, f[key] - dt);
    if (input.block && !f._blockHeld) f._guardPress = .12;
    if (!input.block) f._guardPress = 0;
    f._lastHitAgo += dt; if (f._lastHitAgo > .9) f._hurtChain = 0;
    if (!f._comboTimer) { f.combo = 0; if (!isStrike(f)) f._chainIndex = 0; }
    f.actionTime += dt; f.stun = Math.max(0, f.stun - dt);
    if (f._buffer) {
      const ttl = f._buffer.ttl;
      f._buffer.ttl -= dt;
      // A substep can cross both the cooldown and buffer deadline. Honor the
      // accepted intent when its legal instant was inside that exact window.
      if (f._buffer.ttl <= 0 && !(defenseBefore <= ttl + 1e-8 && defenseWait(f, f._buffer.name) <= 0)) f._buffer = null;
    }
    if (f.y > 0 || f._vy > 0) { f._vy -= 20 * dt; f.y = Math.max(0, f.y + f._vy * dt); if (f.y === 0) f._vy = 0; }
    if (f.hp <= 0) {
      f.blocking = false; f.sprinting = false;
      if (state.training) {
        f._respawn += dt;
        if (f._respawn >= 1.6) {
          const x = f.x, z = f.z;
          Object.assign(f, fighter(f.id, f.character), { x, z, _invuln: .4 });
          faceTarget(f, state.fighters[1 - f.id]);
        }
      }
      f.vx = 0; f.vz = 0; return;
    }
    if (f.actionDuration > 0 && f.actionTime >= f.actionDuration && f.stun <= 0 && f.action !== 'ko') {
      const buffered = f._buffer;
      const defensive = buffered && (buffered.name === 'dodge' || buffered.name === 'jump');
      if (!defensive || input.block) f._buffer = null;
      if (f.action === 'dodge') f._entryWindow = inputBufferDuration;
      f._entryFrom = '';
      setAction(f, f.y > 0 ? 'jump' : 'idle', f.y > 0 ? .5 : 0);
      if (buffered && !defensive && !input.block) startAction(state, f, buffered.name);
    }
    if (f._buffer && (f._buffer.name === 'dodge' || f._buffer.name === 'jump')) {
      if (input.block) f._buffer = null;
      else if (defenseWait(f, f._buffer.name) <= 0) startAction(state, f, f._buffer.name, f._buffer);
    }
    // Consume an early press at the first legal confirmed cancel, rather than
    // forcing another press or waiting for full recovery. Held guard wins.
    if (f._buffer && moves[f._buffer.name].damage && !input.block && canChain(f)) startAction(state, f, f._buffer.name);
    const currentMove = getMove(f);
    // Defensive cancels begin in recovery, including a whiff. Startup and
    // active frames remain committed; the oil channel can stop after startup.
    if (input.block && isStrike(f) && f.actionTime >= currentMove.windup + (currentMove.channel ? 0 : currentMove.active) && f.stun <= 0) {
      f._buffer = null; f._entryFrom = ''; setAction(f, f.y > 0 ? 'jump' : 'idle', 0);
    }
    const busy = !!moves[f.action] && f.action !== 'jump';
    f.blocking = !!input.block && !busy && f.stun <= 0 && f.y < .08 && f._guardLock <= 0;
    if (f.blocking && f._guardPress > 0 && f._parryCooldown <= 0 && f.energy >= 8) {
      f._parryWindow = f._guardPress; f._guardPress = 0; f._parryCooldown = .48;
    }
    f._blockHeld = !!input.block;
    const moving = Math.hypot(f._inputX, f._inputZ) > .1;
    f.sprinting = !!input.sprint && moving && !busy && !f.blocking && f.stun <= 0 && f.y < .05 && f.energy >= 1;
    const mobility = profiles[characterId(f.character, f.id)].speed;
    const speed = (f.blocking ? 2.8 : f.y > 0 ? 5.6 : f.sprinting ? 10.5 : 6.4) * mobility;
    if (!busy && f.stun <= 0) {
      const length = Math.max(1, Math.hypot(f._inputX, f._inputZ));
      f.x += f._inputX / length * speed * dt; f.z += f._inputZ / length * speed * dt;
      if (f.y <= 0 && f._vy <= 0) { const name = moving ? (f.sprinting ? 'sprint' : 'walk') : 'idle'; if (f.action !== name) setAction(f, name, 0); }
    } else if (f.action === 'dodge' && f.stun <= 0) {
      const roll = getMove(f);
      const speedDodge = roll.speed * mobility * Math.max(0, 1 - f.actionTime / roll.duration);
      f.x += f._dodgeX * speedDodge * dt; f.z += f._dodgeZ * speedDodge * dt;
    } else if (isStrike(f) && f.actionTime < currentMove.windup) {
      const lunge = (currentMove.lunge === undefined ? f.action === 'special' || f.action === 'super' ? 1.2 : .52 : currentMove.lunge) * dt;
      f.x += Math.sin(f._attackYaw) * lunge; f.z += Math.cos(f._attackYaw) * lunge;
    }
    f.x += f._pushX * dt; f.z += f._pushZ * dt;
    f._pushX *= Math.exp(-12 * dt); f._pushZ *= Math.exp(-12 * dt); bound(state, f);
    f.vx = (f.x - oldX) / dt; f.vz = (f.z - oldZ) / dt;
    const regen = (state.training ? 22 : f.blocking ? 3.5 : 9) * (f.id === 0 ? 1 + state.upgrades.flow * .15 : 1);
    f.energy = clamp(f.energy + (f.sprinting ? -12 : regen) * dt, 0, 100);
    if (f._guardDelay <= 0 && !f.blocking) f.guard = clamp(f.guard + 24 * dt, 0, 100);
    if (state.training && f._lastHitAgo > 3 && f.hp > 0) f.hp = clamp(f.hp + 20 * dt, 0, f.maxHp);
  }
  function collectStrike(state, attacker) {
    const move = getMove(attacker);
    if (!move || !move.damage || attacker.hp <= 0 || attacker._hitDone || attacker.stun > 0) return null;
    if (move.projectile) {
      const age = attacker.actionTime - move.windup;
      const total = move.channel ? Math.ceil(move.active / move.projectileInterval) : 1;
      const due = age < 0 ? 0 : move.channel ? Math.min(total, Math.floor(age / move.projectileInterval) + 1) : 1;
      while (attacker._projectileShots < due) {
        attacker._projectileSpawned = true; attacker._projectileShots++;
        attacker._hitDone = attacker._projectileShots >= total;
        const muzzle = move.channel ? 1 : 0, dx = Math.sin(attacker._attackYaw), dz = Math.cos(attacker._attackYaw);
        const projectile = { id: ++state._projectileSerial, owner: attacker.id, character: attacker.character, move: attacker.action, moveName: attacker.moveName, attackSerial: attacker._attackSerial,
          x: attacker.x + dx * muzzle, y: attacker.y + (move.channel ? 1.6 : .85), z: attacker.z + dz * muzzle, dx, dz, remaining: move.range - muzzle, speed: move.projectileSpeed, radius: move.projectileRadius };
        if (move.projectileKind) projectile.kind = move.projectileKind;
        state.projectiles.push(projectile);
        emit(state, 'projectile', { attacker: attacker.id, character: attacker.character, move: attacker.action, moveName: attacker.moveName, kind: move.projectileKind, x: projectile.x, y: projectile.y, z: projectile.z, yaw: attacker._attackYaw });
      }
      return null;
    }
    if (attacker.actionTime > move.windup + move.active) {
      attacker._hitDone = true;
      if (!attacker._contact) emit(state, 'whiff', { attacker: attacker.id, move: attacker.action, x: attacker.x, z: attacker.z });
      return null;
    }
    if (attacker.actionTime < move.windup) return null;
    let hitIndex = 0;
    if (move.hits) {
      const age = attacker.actionTime - move.windup;
      hitIndex = move.hits.findIndex((offset, index) => age >= offset && age <= offset + move.hitWindow && !(attacker._hitMask & (1 << index)));
      if (hitIndex < 0) return null;
    }
    const target = state.fighters[1 - attacker.id];
    if (target.hp <= 0) return null;
    const d = direction(attacker, target);
    const alignment = d.x * Math.sin(attacker._attackYaw) + d.z * Math.cos(attacker._attackYaw);
    if (d.distance > move.range || alignment < Math.cos(move.cone) || Math.abs(target.y - attacker.y) > move.height) return null;
    if (target._invuln > 0) { rewardPerfectDodge(state, attacker, target, attacker._attackSerial, attacker.action); return null; }
    attacker._hitMask |= 1 << hitIndex;
    if (!move.hits) attacker._hitDone = true;
    const guardAlignment = -d.x * Math.sin(target.yaw) - d.z * Math.cos(target.yaw);
    const blocked = target.blocking && guardAlignment >= .15;
    const push = move.centerPush && Math.hypot(target.x, target.z) > .01 ? direction(target, { x: 0, z: 0 }) : d;
    return { attacker, target, move, name: attacker.action, moveName: attacker.moveName, serial: attacker._attackSerial, blocked, parried: blocked && target._parryWindow > 0 && target.energy >= 8, nx: push.x, nz: push.z };
  }
  function collectProjectiles(state, dt) {
    const strikes = [], remaining = [];
    for (const projectile of state.projectiles) {
      const attacker = state.fighters[projectile.owner], target = state.fighters[1 - projectile.owner];
      const move = characterMoves[projectile.character][projectile.move];
      const travel = Math.min(projectile.remaining, projectile.speed * dt);
      projectile.x += projectile.dx * travel; projectile.z += projectile.dz * travel; projectile.remaining -= travel;
      const near = Math.hypot(target.x - projectile.x, target.z - projectile.z) <= projectile.radius + .4;
      const contact = target.hp > 0 && near && Math.abs(target.y + .85 - projectile.y) <= .8;
      if (contact && target._invuln > 0) rewardPerfectDodge(state, attacker, target, projectile.attackSerial, projectile.move);
      if (contact && target._invuln <= 0) {
        const blocked = target.blocking && -projectile.dx * Math.sin(target.yaw) - projectile.dz * Math.cos(target.yaw) >= .15;
        strikes.push({ attacker, target, move, name: projectile.move, moveName: projectile.moveName, serial: projectile.attackSerial, projectile: true, kind: projectile.kind,
          blocked, parried: blocked && target._parryWindow > 0 && target.energy >= 8, nx: projectile.dx, nz: projectile.dz });
      } else if (projectile.remaining > .000001) remaining.push(projectile);
      else emit(state, 'whiff', { attacker: attacker.id, move: projectile.move, x: projectile.x, z: projectile.z });
    }
    state.projectiles = remaining;
    return strikes;
  }
  function rewardPerfectDodge(state, attacker, target, serial, name) {
    if (target.action !== 'dodge' || serial <= target._perfectDodgeSerial) return;
    target._perfectDodgeSerial = serial;
    target.energy = clamp(target.energy + 10, 0, target.maxEnergy);
    target.guard = clamp(target.guard + 12, 0, 100);
    emit(state, 'perfectDodge', { fighter: target.id, attacker: attacker.id, serial, move: name, x: target.x, z: target.z });
  }
  function resolveStrike(state, strike) {
    const { attacker, target, move, name, blocked, parried, nx, nz } = strike;
    const point = { attacker: attacker.id, target: target.id, character: attacker.character, x: (attacker.x + target.x) * .5, z: (attacker.z + target.z) * .5, move: name, moveName: strike.moveName };
    if (strike.kind) point.kind = strike.kind;
    target._lastHitAgo = 0; target._guardDelay = 1.2;
    if (parried) {
      target.energy = clamp(target.energy - 8, 0, 100); target.guard = clamp(target.guard + 18, 0, 100); target._parryWindow = 0;
      if (attacker.hp > 0) {
        attacker._contact = false; attacker._buffer = null; attacker._entryFrom = ''; attacker._entryWindow = 0; attacker.stun = .42; attacker._pushX -= nx * 2; attacker._pushZ -= nz * 2;
        setAction(attacker, 'hurt', .42);
      }
      state.shake = Math.max(state.shake, .3);
      emit(state, 'parry', Object.assign({ damage: 0 }, point)); return;
    }
    if (strike.serial === attacker._attackSerial) { attacker._contact = true; attacker._contactBlocked = blocked; }
    if (blocked) {
      const damage = move.blockDamage === undefined ? name === 'super' ? move.hits ? 2 : 6 : name === 'special' ? move.hits ? 2 : 5 : name === 'kick' ? 2 : 1 : move.blockDamage;
      target.hp = Math.max(0, target.hp - damage);
      const guardScale = target.id === 0 ? Math.max(.5, 1 - state.upgrades.guard * .12) : 1;
      target.guard = Math.max(0, target.guard - move.guardDamage * guardScale);
      target._pushX += nx * move.knockback * 4.5; target._pushZ += nz * move.knockback * 4.5;
      target.energy = clamp(target.energy + 3, 0, 100); attacker.energy = clamp(attacker.energy + 2, 0, 100);
      emit(state, 'block', Object.assign({ damage }, point)); state.shake = Math.max(state.shake, .1);
      if (target.guard <= 0) {
        target.guard = 25; target.blocking = false; target._guardLock = 1.1; target.stun = .58; target._buffer = null; target._entryFrom = ''; target._entryWindow = 0;
        setAction(target, 'hurt', .58); emit(state, 'guardBreak', point); state.shake = Math.max(state.shake, .32);
      }
      if (target.hp <= 0) setAction(target, 'ko', 2);
      return;
    }
    attacker.combo = attacker._comboTimer > 0 ? attacker.combo + 1 : 1; attacker._comboTimer = 1.2;
    const scale = Math.max(.4, 1 - (attacker.combo - 1) * .1);
    const power = attacker.id === 0 ? 1 + state.upgrades.power * .08 : 1;
    const damage = Math.round(move.damage * scale * power);
    target.hp = Math.max(0, target.hp - damage); target.blocking = false; target._buffer = null; target._hurtChain += 1; target.stun = move.stun;
    target._pushX += nx * move.knockback * 12; target._pushZ += nz * move.knockback * 12;
    if (target._hurtChain >= 3) { target._invuln = move.stun + .25; target._pushX += nx * 7; target._pushZ += nz * 7; target._hurtChain = 0; }
    attacker.energy = clamp(attacker.energy + (name === 'special' || name === 'super' ? 0 : 6), 0, 100); target.energy = clamp(target.energy + 5, 0, 100);
    if (attacker.combo >= 2 && strike.serial > attacker._comboRewardSerial) {
      attacker._comboRewardSerial = strike.serial;
      attacker.energy = clamp(attacker.energy + 3, 0, attacker.maxEnergy);
      attacker.guard = clamp(attacker.guard + 4, 0, 100);
    }
    target._entryFrom = ''; target._entryWindow = 0;
    setAction(target, target.hp <= 0 ? 'ko' : 'hurt', target.hp <= 0 ? 2 : target.stun);
    state.shake = Math.max(state.shake, move.shake === undefined ? name === 'super' ? .6 : name === 'special' ? .55 : name === 'kick' ? .3 : .19 : move.shake);
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
  function introKind(state) {
    if (state.round !== 1 || state.training) return null;
    if (state.arena === 'helipad') return 'helicopter';
    if (state.arena === 'seaside' && state.fighters.some(f => f.character === 'orelha')) return 'orelha-chase';
    return null;
  }
  function introDuration(state) {
    return introKind(state) ? 6.2 : 2;
  }
  function tick(state, dt, input, otherInput) {
    if (state.phase === 'matchOver') return;
    state.elapsed += dt; state.phaseTime += dt; state.shake *= Math.exp(-9 * dt);
    if (state.phase === 'intro') { if (state.phaseTime >= introDuration(state)) { state.phase = 'fight'; state.phaseTime = 0; } return; }
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
    const ai = otherInput === undefined ? cpuInput(state, dt) : otherInput;
    updateFighter(state, state.fighters[0], input, dt); updateFighter(state, state.fighters[1], ai, dt); separate(state);
    for (const f of state.fighters) if (!isStrike(f)) faceTarget(f, state.fighters[1 - f.id]);
    // Snapshot both contacts before applying damage: honest trades and double KOs.
    const strikes = state.fighters.map(f => collectStrike(state, f)).filter(Boolean);
    strikes.push(...collectProjectiles(state, dt));
    strikes.forEach(strike => resolveStrike(state, strike)); finishRound(state);
  }
  function step(state, dt, input) {
    if (!state || state.phase === 'matchOver' || !Number.isFinite(dt) || dt <= 0) return state;
    let remaining = Math.min(dt, .25); input = input || {};
    while (remaining > .000001) { const slice = Math.min(remaining, 1 / 120); tick(state, slice, input); remaining -= slice; }
    return state;
  }
  function stepPlayers(state, dt, inputs) {
    if (!state || state.phase === 'matchOver' || !Number.isFinite(dt) || dt <= 0) return state;
    let remaining = Math.min(dt, .25); inputs = inputs || [];
    while (remaining > .000001) { const slice = Math.min(remaining, 1 / 120); tick(state, slice, inputs[0] || {}, inputs[1] || {}); remaining -= slice; }
    return state;
  }
  global.FightSim = Object.freeze({ createMatch, step, stepPlayers, snapshot, restore, introKind, introDuration, act, getMove, moves, characters, levels, difficulties: levels, arenas });
  if (typeof module !== 'undefined' && module.exports) module.exports = global.FightSim;
})(typeof window !== 'undefined' ? window : globalThis);
