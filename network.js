/* NEON CLASH: authoritative online combat with local prediction and presentation-only interpolation. */
(function (global) {
  'use strict';
  const Sim = typeof module !== 'undefined' && module.exports ? require('./combat.js') : global.FightSim;
  const TICK = 1 / 60, DELAY_TICKS = 5, MAX_PENDING = 180, MAX_BUFFERED_BYTES = 65536;
  const neutral = () => ({ x: 0, z: 0, block: false, sprint: false });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const cleanInput = input => ({ x: clamp(Number.isFinite(input && input.x) ? input.x : 0, -1, 1), z: clamp(Number.isFinite(input && input.z) ? input.z : 0, -1, 1), block: !!(input && input.block), sprint: !!(input && input.sprint) });
  const angle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  function create(options) {
    options = options || {};
    const WebSocketClass = options.WebSocket || global.WebSocket;
    const now = options.now || (() => global.performance ? global.performance.now() : Date.now());
    const every = options.setInterval || global.setInterval.bind(global), cancel = options.clearInterval || global.clearInterval.bind(global);
    const callback = (name, value) => { if (typeof options[name] === 'function') options[name](value); };
    let socket = null, heartbeat = null, generation = 0, state = null, playerId = null;
    let pending = [], actions = [], seq = 0, ack = 0, tick = -1, matchId = null, seenMatches = new Set();
    let snapshots = [], playback = null, previous = null, steppedAt = now(), lastReceived = now(), lastPing = 0;
    let correction = { x: 0, y: 0, z: 0 }, lastInput = neutral();
    let status = { phase: 'closed', code: '', ping: null, message: '', rematchReady: [false, false] };
    const isOpen = () => !!socket && socket.readyState === 1;
    const isActive = () => isOpen() && !!state && (status.phase === 'playing' || status.phase === 'result');
    function updateStatus(patch) { status = Object.assign({}, status, patch); callback('onStatus', Object.assign({}, status)); }
    function send(packet) {
      if (!isOpen()) return false;
      if (socket.bufferedAmount > MAX_BUFFERED_BYTES) { fail('Conexão congestionada. Entre novamente na sala.'); return false; }
      try { socket.send(JSON.stringify(packet)); return true; } catch (_) { fail('A conexão com a sala foi interrompida.'); return false; }
    }
    function stop() {
      generation++;
      if (heartbeat !== null) { cancel(heartbeat); heartbeat = null; }
      const old = socket; socket = null;
      if (old) { old.onopen = old.onmessage = old.onclose = old.onerror = null; try { old.close(); } catch (_) {} }
      pending = []; actions = []; lastInput = neutral();
    }
    function fail(message) { stop(); updateStatus({ phase: 'error', message }); }
    function leave() {
      stop(); state = null; previous = null; playerId = null; snapshots = []; matchId = null; seenMatches.clear();
      updateStatus({ phase: 'closed', code: '', ping: null, message: '', rematchReady: [false, false] });
    }
    function endpoint() {
      if (options.url) return options.url;
      if (!global.location || !/^https?:$/.test(global.location.protocol)) throw new Error('Abra o jogo pelo endereço do servidor para jogar online.');
      return `${global.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${global.location.host}/ws`;
    }
    function connect(request) {
      leave();
      updateStatus({ phase: 'connecting', message: 'Conectando à arena…' });
      const current = generation;
      try {
        if (!WebSocketClass) throw new Error('Este navegador não oferece WebSocket.');
        socket = new WebSocketClass(endpoint());
      } catch (error) { fail(error.message || 'Não foi possível conectar ao servidor.'); return; }
      lastReceived = now(); lastPing = 0;
      socket.onopen = () => { if (current === generation) { lastReceived = now(); send(request); } };
      socket.onmessage = event => {
        if (current !== generation) return;
        lastReceived = now();
        let packet;
        try { packet = JSON.parse(event.data); } catch (_) { fail('O servidor enviou uma resposta inválida.'); return; }
        receive(packet);
      };
      socket.onerror = () => { if (current === generation) fail('Não foi possível acessar o servidor online. Confira o endereço e a conexão.'); };
      socket.onclose = () => { if (current === generation) fail('A conexão com a sala foi encerrada. Entre novamente para jogar.'); };
      heartbeat = every(() => {
        if (current !== generation) return;
        const time = now();
        if (time - lastReceived > 10000) { fail('O servidor deixou de responder. Entre novamente na sala.'); return; }
        if (isOpen() && time - lastPing >= 2000) { lastPing = time; send({ type: 'ping', at: time }); }
      }, 1000);
      if (heartbeat && typeof heartbeat.unref === 'function') heartbeat.unref();
    }
    function predict(target, packet) {
      const remote = target.fighters[1 - playerId];
      const inputs = [neutral(), neutral()];
      inputs[playerId] = packet.input;
      inputs[1 - playerId] = { x: remote._inputX, z: remote._inputZ, block: remote._blockHeld, sprint: remote.sprinting };
      const fighter = target.fighters[playerId];
      fighter._inputX = packet.input.x; fighter._inputZ = packet.input.z;
      for (const name of packet.actions) Sim.act(target, playerId, name);
      Sim.stepPlayers(target, TICK, inputs);
      target.events.length = 0;
    }
    function receive(packet) {
      if (!packet || typeof packet !== 'object') return;
      if (packet.type === 'welcome') {
        if (packet.playerId !== 0 && packet.playerId !== 1) { fail('Identificação de jogador inválida.'); return; }
        playerId = packet.playerId; updateStatus({ phase: 'waiting', code: String(packet.code || ''), message: 'Aguardando outro jogador…' });
      } else if (packet.type === 'waiting') {
        updateStatus({ phase: 'waiting', code: String(packet.code || status.code), message: 'Compartilhe o código da sala.' });
      } else if (packet.type === 'error') {
        fail(String(packet.message || 'Não foi possível entrar na sala.'));
      } else if (packet.type === 'peerLeft') {
        stop(); updateStatus({ phase: 'closed', message: 'O outro jogador saiu da sala.' });
      } else if (packet.type === 'rematch') {
        if (Array.isArray(packet.ready)) updateStatus({ rematchReady: [!!packet.ready[0], !!packet.ready[1]] });
      } else if (packet.type === 'pong') {
        if (Number.isFinite(packet.at) && packet.at <= now()) updateStatus({ ping: Math.round(clamp(now() - packet.at, 0, 10000)) });
      } else if (packet.type === 'state') {
        if (playerId === null || typeof packet.matchId !== 'string' || !Number.isInteger(packet.tick) || packet.tick < 0 || !Array.isArray(packet.ack)) return;
        const incomingAck = packet.ack[playerId];
        if (!Number.isInteger(incomingAck) || incomingAck < 0) return;
        const fresh = packet.matchId !== matchId;
        if (fresh && seenMatches.has(packet.matchId)) return;
        if (!fresh && (packet.tick <= tick || incomingAck < ack || incomingAck > seq)) return;
        let authoritative;
        try { authoritative = Sim.restore(packet.state); } catch (_) { fail('O estado recebido da arena é inválido.'); return; }
        if (fresh) {
          if (matchId !== null) seenMatches.add(matchId);
          if (seenMatches.size > 32) seenMatches.delete(seenMatches.values().next().value);
          matchId = packet.matchId; pending = []; actions = []; seq = incomingAck; ack = incomingAck;
          snapshots = []; playback = null; correction = { x: 0, y: 0, z: 0 }; previous = null; lastInput = neutral();
        }
        const authoritativePhase = authoritative.phase;
        tick = packet.tick; ack = incomingAck;
        const old = state && state.fighters[playerId];
        const discontinuity = fresh || !state || state.round !== authoritative.round || state.phase !== authoritative.phase;
        snapshots.push({ tick, receivedAt: now(), state: packet.state });
        if (snapshots.length > 24) snapshots.shift();
        if (playback === null || discontinuity) playback = tick - DELAY_TICKS;
        pending = pending.filter(input => input.seq > ack);
        state = authoritative; state.localPlayer = playerId;
        for (const input of pending) predict(state, input);
        const local = state.fighters[playerId];
        if (old && !discontinuity && Math.hypot(old.x - local.x, old.z - local.z) < 3) {
          correction.x += old.x - local.x; correction.y += old.y - local.y; correction.z += old.z - local.z;
        } else correction = { x: 0, y: 0, z: 0 };
        previous = Sim.snapshot(state); steppedAt = now();
        updateStatus({ phase: authoritativePhase === 'matchOver' ? 'result' : 'playing', message: '', rematchReady: fresh ? [false, false] : status.rematchReady });
        if (fresh) callback('onMatch', state);
        if (Array.isArray(packet.events) && packet.events.length) callback('onEvents', packet.events);
      }
    }
    function step(input) {
      if (!isActive() || status.phase !== 'playing') return state;
      if (pending.length >= MAX_PENDING) { fail('A conexão está atrasada demais para continuar a partida. Entre novamente.'); return state; }
      lastInput = cleanInput(input);
      const packet = { type: 'input', seq: ++seq, input: lastInput, actions: actions.splice(0, 2) };
      if (!send(packet)) return state;
      pending.push(packet); previous = Sim.snapshot(state); steppedAt = now(); predict(state, packet);
      return state;
    }
    function action(name) {
      if (!isActive() || status.phase !== 'playing' || !Object.prototype.hasOwnProperty.call(Sim.moves, name) || actions.length >= 8) return false;
      actions.push(name); return true;
    }
    function neutralize() {
      actions = []; lastInput = neutral();
      // Blur and lost graphics must release held controls even when the render loop stops.
      if (isActive() && status.phase === 'playing') step(lastInput);
    }
    function view(dt) {
      if (!state) return null;
      const result = Sim.snapshot(state); result.localPlayer = playerId;
      const frame = clamp(Number.isFinite(dt) ? dt : TICK, 0, .1);
      const blend = clamp((now() - steppedAt) / (TICK * 1000), 0, 1);
      const local = result.fighters[playerId], prior = previous && previous.fighters[playerId];
      if (prior && previous.round === state.round && previous.phase === state.phase) {
        for (const key of ['x', 'y', 'z']) local[key] = prior[key] + (local[key] - prior[key]) * blend;
        local.yaw = angle(prior.yaw, local.yaw, blend);
      }
      const decay = Math.exp(-14 * frame);
      for (const key of ['x', 'y', 'z']) { correction[key] *= decay; local[key] += correction[key]; }
      if (snapshots.length) {
        const latest = snapshots[snapshots.length - 1];
        const target = latest.tick + clamp((now() - latest.receivedAt) / 1000, 0, .15) / TICK - DELAY_TICKS;
        playback += frame / TICK;
        playback += clamp(target - playback, -3, 3) * Math.min(1, frame * 4);
        playback = clamp(playback, snapshots[0].tick, latest.tick + 2);
        let a = snapshots[0], b = a;
        for (let i = 1; i < snapshots.length; i++) {
          b = snapshots[i]; if (b.tick >= playback) break; a = b;
        }
        const remoteId = 1 - playerId, fa = a.state.fighters[remoteId], fb = b.state.fighters[remoteId];
        const sameRound = a.state.round === b.state.round && b.state.round === state.round;
        if (sameRound) {
          const t = a.tick === b.tick ? 1 : clamp((playback - a.tick) / (b.tick - a.tick), 0, 1);
          const remote = Object.assign({}, t < .5 ? fa : fb);
          for (const key of ['x', 'y', 'z']) remote[key] = fa[key] + (fb[key] - fa[key]) * t;
          remote.yaw = angle(fa.yaw, fb.yaw, t);
          const sameAction = fa.action === fb.action && fa._attackSerial === fb._attackSerial && fb.actionTime >= fa.actionTime;
          if (sameAction) remote.actionTime = fa.actionTime + (fb.actionTime - fa.actionTime) * t;
          if (playback > b.tick && b.state.phase === 'fight') {
            const lead = Math.min(2 * TICK, (playback - b.tick) * TICK);
            const arena = Sim.arenas[state.arena];
            remote.actionTime += lead;
            remote.x = clamp(remote.x + fb.vx * lead, -arena.halfX, arena.halfX);
            remote.z = clamp(remote.z + fb.vz * lead, -arena.halfZ, arena.halfZ);
          }
          result.fighters[remoteId] = remote;
        }
      }
      return result;
    }
    return {
      host(arena) { connect({ type: 'host', arena: Sim.arenas[arena] ? arena : 'skyline' }); },
      join(code) { connect({ type: 'join', code: String(code || '').trim().toUpperCase() }); },
      leave, step, action, neutralize, view,
      rematch() { return isActive() && status.phase === 'result' ? send({ type: 'rematch' }) : false; },
      get state() { return state; }, get status() { return Object.assign({}, status); },
      get playerId() { return playerId; }, get active() { return isActive(); }
    };
  }
  global.NeonNet = Object.freeze({ create, tickDuration: TICK });
  if (typeof module !== 'undefined' && module.exports) module.exports = global.NeonNet;
})(typeof window !== 'undefined' ? window : globalThis);
