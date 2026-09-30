/* NEON CLASH — local/offline game shell, input, sound and interface. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const keys = new Set(), touches = new Set();
  const touchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mode = 'menu', state, scene, previous = performance.now(), hudTime = 0;
  let toastTime = 0, comboTime = 0, hitStop = 0, lastAnnouncement = '';
  let quality = touchDevice ? 'low' : 'high', soundEnabled = true, best = 0;
  let stats = { damage: 0, combo: 0 }, resultRecorded = false, renderFrames = 0;
  let fpsClock = 0, fpsFrames = 0, slowSamples = 0;
  try { best = Math.max(0, Number(localStorage.getItem('neon-clash-wins')) || 0); } catch (_) { /* Private browsing is supported. */ }

  // All audio is synthesized locally. Nothing is downloaded or auto-played.
  const sound = {
    context: null, bus: null, nextBeat: 0, beat: 0,
    unlock() {
      if (!soundEnabled) return;
      try {
        if (!this.context) {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (!Audio) return;
          this.context = new Audio(); this.bus = this.context.createGain();
          this.bus.gain.value = .32; this.bus.connect(this.context.destination);
        }
        if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      } catch (_) { /* Sound is optional. */ }
    },
    tone(freq, duration, type, gain, endFreq, offset) {
      if (!soundEnabled || !this.context || this.context.state !== 'running') return;
      const ctx = this.context, at = ctx.currentTime + (offset || 0);
      const osc = ctx.createOscillator(), envelope = ctx.createGain();
      osc.type = type || 'sine'; osc.frequency.setValueAtTime(freq, at);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, at + duration);
      envelope.gain.setValueAtTime(.0001, at); envelope.gain.exponentialRampToValueAtTime(gain || .1, at + .005);
      envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
      osc.connect(envelope); envelope.connect(this.bus); osc.start(at); osc.stop(at + duration + .01);
      osc.onended = () => { osc.disconnect(); envelope.disconnect(); };
    },
    noise(duration, gain, cutoff) {
      if (!soundEnabled || !this.context || this.context.state !== 'running') return;
      const ctx = this.context, length = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), volume = ctx.createGain();
      source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = cutoff || 1800; volume.gain.value = gain;
      source.connect(filter); filter.connect(volume); volume.connect(this.bus); source.start();
      source.onended = () => { source.disconnect(); filter.disconnect(); volume.disconnect(); };
    },
    play(type, move) {
      if (type === 'hit') { this.tone(move === 'special' ? 130 : 175, .17, 'sine', .55, 35); this.noise(.14, .44, 2600); }
      if (type === 'block') { this.tone(580, .09, 'triangle', .18, 220); this.noise(.08, .25, 4500); }
      if (type === 'attack') { this.noise(move === 'special' ? .3 : .1, .10, move === 'special' ? 1100 : 900); if (move === 'special') this.tone(95, .24, 'sawtooth', .12, 420); }
      if (type === 'guardBreak') { this.noise(.3, .45, 5200); this.tone(390, .3, 'triangle', .2, 70); }
      if (type === 'roundStart') { this.tone(220, .16, 'sine', .18); this.tone(440, .3, 'triangle', .1, null, .14); }
      if (type === 'roundEnd') { this.tone(90, .65, 'sine', .5, 25); this.noise(.4, .25, 600); }
      if (type === 'win') [261.6, 329.6, 392, 523.2].forEach((f, i) => this.tone(f, .6, 'triangle', .17, null, i * .12));
      if (type === 'lose') { this.tone(196, .5, 'triangle', .18, 98); this.tone(146.8, .7, 'sine', .2, 73.4, .15); }
      if (type === 'click') this.tone(500, .055, 'sine', .14, 800);
    },
    tick() {
      if (!soundEnabled || !this.context || this.context.state !== 'running' || mode !== 'fight') return;
      const now = this.context.currentTime;
      if (now < this.nextBeat) return;
      this.nextBeat = now + .375;
      const notes = [55,55,65.41,55,82.41,55,65.41,49];
      this.tone(notes[this.beat % 8], .22, 'triangle', .10);
      if (this.beat % 2 === 0) this.tone(110, .1, 'sine', .17, 35);
      else this.noise(.045, .035, 6200);
      if (this.beat % 4 === 3) this.tone(220, .28, 'sine', .025);
      this.beat++;
    }
  };

  function resetInputs() { keys.clear(); touches.clear(); document.querySelectorAll('.touch-controls .active').forEach(el => el.classList.remove('active')); }
  function show(id, visible) { $(id).hidden = !visible; }
  function toast(text, duration) { $('combat-toast').textContent = text; $('combat-toast').classList.add('show'); toastTime = duration || 1.5; }
  function updateBest() { $('best-score').textContent = `${best} ${best === 1 ? 'VITÓRIA' : 'VITÓRIAS'}`; }
  function clearFeedback() { lastAnnouncement = ''; show('announcement', false); show('combo-display', false); $('combat-toast').classList.remove('show'); toastTime = comboTime = hitStop = 0; }

  function startMatch(training) {
    resetInputs(); sound.unlock(); sound.play('click'); clearFeedback();
    state = FightSim.createMatch({ difficulty: $('difficulty').value, training: !!training });
    mode = 'fight'; stats = { damage: 0, combo: 0 }; resultRecorded = false;
    document.body.classList.remove('in-menu');
    ['menu-screen', 'pause-screen', 'result-screen'].forEach(id => show(id, false));
    ['fight-hud', 'fight-footer', 'pause-button'].forEach(id => show(id, true));
    show('touch-controls', touchDevice);
    $('fight-mode').textContent = training ? 'TREINO LIVRE' : 'ARCADE';
    $('match-label').textContent = training ? 'TREINO LIVRE' : 'MELHOR DE 3';
    $('enemy-energy-label').textContent = training ? 'ALVO DE TREINO' : {easy:'INICIANTE',normal:'LUTADOR',hard:'LENDA'}[state.difficulty];
    previous = performance.now(); updateHud();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  function menu() {
    resetInputs(); mode = 'menu'; clearFeedback();
    state = FightSim.createMatch({ training: true }); state.phase = 'menu'; state.events.length = 0;
    state.fighters[0].x = -1.5; state.fighters[1].x = 1.5;
    document.body.classList.add('in-menu');
    ['fight-hud', 'fight-footer', 'pause-button', 'pause-screen', 'result-screen', 'touch-controls'].forEach(id => show(id, false));
    show('menu-screen', true); updateBest();
  }
  function pause() {
    if (mode !== 'fight' || state.phase === 'matchOver') return;
    mode = 'paused'; resetInputs(); show('pause-screen', true); show('touch-controls', false); show('announcement', false);
    $('resume-button').focus({preventScroll:true});
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = 'fight'; resetInputs(); show('pause-screen', false); show('touch-controls', touchDevice); previous = performance.now();
    sound.unlock(); $('resume-button').blur();
  }
  function result() {
    if (resultRecorded) return;
    resultRecorded = true; mode = 'result'; resetInputs(); clearFeedback();
    const won = state.winner === 0;
    if (won) { best++; try { localStorage.setItem('neon-clash-wins', String(best)); } catch (_) {} }
    $('result-title').textContent = won ? 'VITÓRIA.' : 'REVANCHE?';
    $('result-eyebrow').textContent = won ? 'O TERRAÇO TEM UM NOVO DONO.' : 'TODO LUTADOR CAI. OS BONS VOLTAM.';
    $('result-description').textContent = won ? 'Você conquistou a noite. O próximo desafio te espera.' : 'Ajuste a distância, segure a defesa e escolha sua hora.';
    $('result-score').textContent = `${state.wins[0]}—${state.wins[1]}`;
    $('result-combo').textContent = stats.combo;
    $('result-damage').textContent = Math.round(stats.damage);
    document.querySelector('.result-modal').classList.toggle('lost', !won);
    show('result-screen', true); show('touch-controls', false); show('pause-button', false);
    sound.play(won ? 'win' : 'lose'); $('rematch-button').focus({preventScroll:true});
  }
  function action(name) {
    if (mode !== 'fight') return;
    sound.unlock();
    const player = state.fighters[0];
    if (name === 'special' && state.phase === 'fight' && player.energy < 40) toast('ESPECIAL PRECISA DE 40 ENERGIA', 1.0);
    FightSim.act(state, 0, name);
  }
  const actionKeys = {KeyJ:'punch',KeyK:'kick',KeyL:'special',Space:'jump',ShiftLeft:'dodge',ShiftRight:'dodge'};
  const playKeys = new Set(['KeyW','KeyA','KeyS','KeyD','KeyI','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',...Object.keys(actionKeys)]);
  window.addEventListener('keydown', e => {
    if (e.target instanceof HTMLSelectElement) return;
    if (mode === 'fight' && playKeys.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape') { e.preventDefault(); if (mode === 'paused') resume(); else pause(); return; }
    if (e.code === 'KeyM') { toggleSound(); return; }
    if (e.code === 'KeyR' && mode !== 'menu') { startMatch(state.training); return; }
    if (mode !== 'fight') return;
    keys.add(e.code);
    if (actionKeys[e.code]) action(actionKeys[e.code]);
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { resetInputs(); pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { resetInputs(); pause(); } });
  document.querySelectorAll('[data-control]').forEach(button => {
    const name = button.dataset.control;
    button.addEventListener('pointerdown', e => {
      e.preventDefault(); if (mode !== 'fight') return;
      try { button.setPointerCapture(e.pointerId); } catch (_) {}
      touches.add(name); button.classList.add('active');
      if (!['left','right','up','down','block'].includes(name)) action(name);
    });
    const release = e => { e.preventDefault(); touches.delete(name); button.classList.remove('active'); };
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', e => e.preventDefault());
  });
  function readInput() {
    return {
      x: Number(keys.has('KeyD') || keys.has('ArrowRight') || touches.has('right')) - Number(keys.has('KeyA') || keys.has('ArrowLeft') || touches.has('left')),
      z: Number(keys.has('KeyS') || keys.has('ArrowDown') || touches.has('down')) - Number(keys.has('KeyW') || keys.has('ArrowUp') || touches.has('up')),
      block: keys.has('KeyI') || touches.has('block')
    };
  }
  function events() {
    const queue = state.events.splice(0);
    for (const e of queue) {
      sound.play(e.type, e.move);
      if (e.type === 'hit' || e.type === 'block') {
        const attacker = state.fighters[e.attacker || 0];
        if (e.attacker === 0) stats.damage += e.damage || 0;
        scene.impact(e.x ?? attacker.x, e.z ?? attacker.z, e.type === 'block' ? '#dfffaa' : e.attacker === 0 ? '#65edff' : '#ff7459', e.type === 'block' ? .35 : e.move === 'special' ? 1.6 : .8);
        if (e.type === 'hit') {
          hitStop = reducedMotion ? 0 : e.move === 'special' ? .065 : .025;
          if (e.attacker === 0) stats.combo = Math.max(stats.combo, e.combo || 1);
          if (e.attacker === 0 && e.combo > 1) { $('combo-count').textContent = e.combo; show('combo-display', true); comboTime = 1.6; }
          if (e.move === 'special') toast(e.attacker === 0 ? 'NEON IMPACT' : 'CUIDADO COM O ESPECIAL', 1.2);
        } else if (e.target === 0) toast('DEFESA', .65);
      }
      if (e.type === 'combo' && e.attacker === 0) { stats.combo = Math.max(stats.combo, e.combo || 0); }
      if (e.type === 'guardBreak') { toast(e.target === 0 ? 'SUA GUARDA QUEBROU' : 'GUARDA DO RIVAL QUEBRADA', 1.3); }
      if (e.type === 'roundStart') { comboTime = 0; show('combo-display', false); }
      if (e.type === 'matchEnd') result();
    }
  }
  function announcement() {
    if (mode !== 'fight') return;
    let title = '', overline = '', subtitle = '';
    if (state.phase === 'intro') {
      title = state.phaseTime < 1.3 ? (state.training ? 'TREINO LIVRE' : `ROUND ${String(state.round).padStart(2,'0')}`) : 'LUTE!';
      overline = state.training ? 'ENCONTRE SEU RITMO' : 'AZURE VS. CRIMSON';
      subtitle = state.training ? 'O RIVAL NÃO ATACA · ESC PARA SAIR' : 'QUEM VENCER DOIS ROUNDS LEVA A NOITE';
    } else if (state.phase === 'roundOver') {
      const ko = state.fighters.some(f => f.hp <= 0);
      title = state.roundWinner === 'draw' ? 'EMPATE' : ko ? 'K.O.' : 'TEMPO!';
      overline = 'FIM DO ROUND';
      subtitle = state.roundWinner === 'draw' ? 'O CONFRONTO CONTINUA' : state.roundWinner === 0 ? 'ROUND PARA VOCÊ' : 'ROUND PARA CRIMSON';
    }
    if (title !== lastAnnouncement) {
      lastAnnouncement = title; $('announcement-title').textContent = title; $('announcement-overline').textContent = overline; $('announcement-subtitle').textContent = subtitle;
    }
    show('announcement', !!title);
  }
  function updateHud() {
    if (!state) return;
    const [p, e] = state.fighters;
    for (const [prefix, f] of [['player',p],['enemy',e]]) {
      const hp = Math.max(0, f.hp / f.maxHp);
      $(prefix+'-health').style.transform = `scaleX(${hp})`;
      $(prefix+'-trail').style.transform = `scaleX(${hp})`;
      $(prefix+'-energy').style.transform = `scaleX(${f.energy / f.maxEnergy})`;
      $(prefix+'-guard').style.transform = `scaleX(${f.guard / 100})`;
      $(prefix+'-health').parentElement.setAttribute('aria-label', `Vida ${Math.ceil(f.hp)} de ${f.maxHp}`);
    }
    $('player-energy-label').textContent = p.energy >= 40 ? 'ESPECIAL PRONTO' : 'RECARREGANDO';
    $('player-energy-label').style.color = p.energy >= 40 ? '#dfff80' : '';
    $('round-time').textContent = state.training ? '∞' : Math.ceil(Math.max(0,state.timeLeft)).toString().padStart(2,'0');
    $('round-label').textContent = state.training ? 'TREINO' : `ROUND ${String(state.round).padStart(2,'0')}`;
    document.querySelector('.clock').classList.toggle('urgent', !state.training && state.timeLeft < 15);
    ['player-rounds','enemy-rounds'].forEach((id,index) => $(id).querySelectorAll('b').forEach((pip,win) => pip.classList.toggle('won', state.wins[index] > win)));
  }
  function toggleSound() {
    soundEnabled = !soundEnabled; if (soundEnabled) sound.unlock();
    if (sound.bus) sound.bus.gain.value = soundEnabled ? .32 : 0;
    $('sound-button').setAttribute('aria-pressed', String(soundEnabled));
    $('sound-button').setAttribute('aria-label', soundEnabled ? 'Desligar som' : 'Ligar som');
  }
  function setQuality(value) {
    quality = value; if (scene) scene.setQuality(value);
    $('quality-button').textContent = value === 'high' ? 'HQ' : 'LQ';
    $('quality-button').setAttribute('aria-label', `Qualidade gráfica ${value === 'high' ? 'alta' : 'leve'}`);
  }
  $('start-button').addEventListener('click', () => startMatch(false));
  $('training-button').addEventListener('click', () => startMatch(true));
  $('pause-button').addEventListener('click', pause); $('resume-button').addEventListener('click', resume);
  $('restart-button').addEventListener('click', () => startMatch(state.training));
  $('rematch-button').addEventListener('click', () => startMatch(false));
  $('menu-button').addEventListener('click', menu); $('result-menu-button').addEventListener('click', menu);
  $('brand-link').addEventListener('click', e => { e.preventDefault(); if (mode === 'fight') pause(); else if (mode === 'result') menu(); });
  $('sound-button').addEventListener('click', toggleSound);
  $('quality-button').addEventListener('click', () => { slowSamples = -100; setQuality(quality === 'high' ? 'low' : 'high'); });
  $('fullscreen-button').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else toast('USE A OPÇÃO TELA CHEIA DO NAVEGADOR'); } catch (_) { toast('TELA CHEIA INDISPONÍVEL NESTE NAVEGADOR'); }
  });
  $('game-canvas').addEventListener('webglcontextlost', e => { e.preventDefault(); pause(); show('error-screen', true); $('error-message').textContent = 'A conexão com o gráfico 3D foi interrompida. Feche outras abas pesadas e tente novamente.'; });

  function frame(now) {
    const dt = Math.min(.1, Math.max(0, (now - previous) / 1000)); previous = now;
    if (mode === 'fight') {
      if (hitStop > 0) hitStop -= dt; else FightSim.step(state, dt, readInput());
      events(); sound.tick(); announcement();
      if (state.phase === 'matchOver') result();
    }
    if (mode !== 'paused') {
      scene.update(dt, state);
      if (mode === 'menu') { for (const f of state.fighters) f.actionTime += dt; }
    }
    scene.render(); renderFrames++;
    hudTime += dt; if (hudTime > .033) { if (mode !== 'menu') updateHud(); hudTime = 0; }
    if (toastTime > 0) { toastTime -= dt; if (toastTime <= 0) $('combat-toast').classList.remove('show'); }
    if (comboTime > 0) { comboTime -= dt; if (comboTime <= 0) show('combo-display', false); }
    fpsClock += dt; fpsFrames++;
    if (fpsClock >= 1.25) {
      if (quality === 'high' && fpsFrames / fpsClock < 27) slowSamples++; else if (slowSamples > 0) slowSamples--;
      if (slowSamples >= 1) { setQuality('low'); slowSamples = 0; }
      fpsClock = fpsFrames = 0;
    }
    requestAnimationFrame(frame);
  }

  try {
    if (!window.THREE || !window.FightSim || !window.NeonScene) throw new Error('Os arquivos do jogo não foram encontrados. Mantenha index.html, game.js, combat.js, scene.js, style.css e a pasta vendor juntos.');
    scene = NeonScene.create($('game-canvas'), { quality }); setQuality(quality); menu();
    // Read-only entry points for browser QA. Match state remains inspectable.
    window.__NEON__ = Object.freeze({get state(){return state;},get mode(){return mode;},get frames(){return renderFrames;},get quality(){return quality;},get stats(){return {...stats};},startMatch,pause,resume});
    requestAnimationFrame(frame);
  } catch (error) {
    show('error-screen', true); $('error-message').textContent = error.message.includes('arquivos') ? error.message : 'Não foi possível iniciar o 3D. Abra o jogo no Chrome ou Edge com a aceleração gráfica ativada.';
    console.error(error);
  }
}());
