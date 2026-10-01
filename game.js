/* NEON CLASH — input, match flow, accessibility, feedback and progression. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const touchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const keys = new Set(), touches = new Set();
  const levelNames = {easy:'RECRUTA',normal:'COMBATENTE',hard:'LENDA',nightmare:'PESADELO'};
  const levelDescriptions = {
    easy:'Reações mais lentas e aberturas maiores. Aprenda distância, guarda e esquiva.',
    normal:'Pressão constante, defesa e contra-ataques. Vença com ritmo e posicionamento.',
    hard:'O rival pune golpes no vazio, varia combos e escapa da pressão. Domine sua energia.',
    nightmare:'Reações rápidas, pressão implacável e contra-ataques precisos. Mesma vida e mesmas regras.'
  };
  const arenaNames = {skyline:'SKYLINE / CHUVA NEON',reactor:'REATOR / ZONA CRÍTICA',void:'VOID / ÚLTIMO SINAL'};
  const arenaDescriptions = {
    skyline:'Um terraço sob a chuva. Espaço para circular, encurtar distância e dominar o duelo.',
    reactor:'O núcleo descarrega energia no piso. Leia o aviso, saia da área ou pule no momento certo.',
    void:'Uma plataforma suspensa no vazio. A arena mais ampla exige controle de distância.'
  };
  function load(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key)); return value === null ? fallback : value; } catch (_) { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  const stored = load('neon-clash-settings-v2', {});
  const settings = {
    sensitivity: Math.max(.4, Math.min(2, Number(stored && stored.sensitivity) || 1)),
    volume: Math.max(0, Math.min(100, Number.isFinite(stored && stored.volume) ? stored.volume : 65)),
    shake: !prefersReduced && (!stored || stored.shake !== false),
    music: !stored || stored.music !== false,
    sound: !stored || stored.sound !== false,
    arena: stored && arenaNames[stored.arena] ? stored.arena : 'skyline',
    difficulty: stored && levelNames[stored.difficulty] ? stored.difficulty : 'normal'
  };
  let mode = 'menu', scene, state, run = null, pendingUpgrade = 'power';
  let previous = performance.now(), accumulator = 0, hudTime = 0, toastTime = 0, comboTime = 0, hitStop = 0;
  let lastAnnouncement = '', resultRecorded = false, quality = 'low';
  let renderFrames = 0, fpsClock = 0, fpsFrames = 0, slowSamples = 0, qualityManual = false;
  const graphics = {status:'ready',losses:0,recoveries:0};
  let animationFrame = 0, recoveryTimer = 0, restoreTimer = 0;
  let best = Math.max(0, Number(load('neon-clash-wins', 0)) || 0);
  let bestRun = load('neon-clash-ascent-best', {cleared:0,score:0});
  if (!bestRun || !Number.isInteger(bestRun.cleared) || bestRun.cleared < 0 || bestRun.cleared > 5 || !Number.isFinite(bestRun.score) || bestRun.score < 0) bestRun = {cleared:0,score:0};
  let stats = freshStats(), drag = null, damageTime = 0, locked = true, footstep = 0;
  const sound = NeonAudio.create({enabled:settings.sound,music:settings.music,volume:settings.volume/100});
  function freshStats() { return {damage:0,taken:0,combo:0,parries:0}; }
  function show(id, visible) { if ($(id)) $(id).hidden = !visible; }
  function text(id, value) { if ($(id)) $(id).textContent = value; }
  function listen(id, event, fn) { if ($(id)) $(id).addEventListener(event, fn); }
  function toast(message, duration) { text('combat-toast',message); $('combat-toast').classList.add('show'); toastTime = duration || 1.6; }
  function persist() { save('neon-clash-settings-v2',settings); }
  function resetInputs() {
    keys.clear(); touches.clear(); drag = null;
    document.querySelectorAll('.touch-controls .active').forEach(el => el.classList.remove('active'));
  }
  function releaseMouse() { if (document.pointerLockElement) document.exitPointerLock(); }
  function clearFeedback() {
    lastAnnouncement = ''; show('announcement',false); show('combo-display',false); show('hazard-warning',false);
    $('combat-toast').classList.remove('show'); toastTime = comboTime = hitStop = damageTime = 0;
    if ($('damage-flash')) $('damage-flash').style.opacity = '0';
  }
  function updateBest() {
    text('best-score',`${best} ${best === 1 ? 'VITÓRIA' : 'VITÓRIAS'}`);
    text('best-run',`ASCENSÃO ${bestRun.cleared || 0}/5 · ${(bestRun.score || 0).toLocaleString('pt-BR')} PTS`);
  }
  function selectedArena() { return $('arena-select') && arenaNames[$('arena-select').value] ? $('arena-select').value : 'skyline'; }
  function updateSelection() {
    const arena = selectedArena(); settings.arena = arena; settings.difficulty = $('difficulty').value; persist();
    document.querySelectorAll('[data-arena]').forEach(button => {
      const selected = button.dataset.arena === arena; button.classList.toggle('selected',selected); button.setAttribute('aria-pressed',String(selected));
    });
    text('arena-name',arenaNames[arena]); text('arena-description',arenaDescriptions[arena]);
    text('arena-caption-detail',{skyline:'NEO CITY · ACIMA DO CAOS',reactor:'ZONA ZERO · NÚCLEO INSTÁVEL',void:'DIMENSÃO X · ALÉM DO SINAL'}[arena]);
    text('arena-number',`${String(['skyline','reactor','void'].indexOf(arena)+1).padStart(2,'0')} / 03`);
    text('difficulty-description',levelDescriptions[settings.difficulty]);
    text('mode-description',$('mode-select') && $('mode-select').value === 'ascent' ? 'Cinco duelos. Uma melhoria por vitória. A última etapa exige vencer o Pesadelo.' : 'Duelo livre: escolha arena e rival. Quem vencer dois rounds leva a noite.');
    if (mode === 'menu' && scene) { state.arena = arena; scene.setArena(arena); }
  }
  function startMatch(training, continuing) {
    if (!scene || graphics.status !== 'ready') return;
    resetInputs(); sound.unlock(); sound.play('click'); clearFeedback(); accumulator = 0;
    if (!continuing) run = !training && $('mode-select') && $('mode-select').value === 'ascent' ? NeonRun.create(selectedArena(),$('difficulty').value) : null;
    const stage = run ? NeonRun.stage(run) : null;
    state = FightSim.createMatch({difficulty:stage ? stage.difficulty : $('difficulty').value, arena:stage ? stage.arena : selectedArena(), training:!!training, upgrades:run ? run.upgrades : undefined});
    scene.setArena(state.arena); scene.resetCamera(state); scene.setLockOn(locked); sound.setArena(state.arena);
    mode = 'fight'; stats = freshStats(); resultRecorded = false;
    document.body.classList.remove('in-menu');
    ['menu-screen','pause-screen','result-screen'].forEach(id => show(id,false));
    ['fight-hud','fight-footer','pause-button','camera-button','lock-status','fight-reticle','camera-hint'].forEach(id => show(id,true));
    show('camera-button',!touchDevice);
    show('touch-controls',touchDevice); show('upgrade-choices',false); show('run-progress',!!run);
    text('fight-arena-name',arenaNames[state.arena]);
    text('fight-mode',training ? 'TREINO LIVRE' : run ? 'ASCENSÃO' : 'DUELO');
    text('match-label',training ? 'TREINO LIVRE' : 'MELHOR DE 3');
    text('enemy-energy-label',training ? 'ALVO DE TREINO' : levelNames[state.difficulty]);
    text('run-progress',stage ? `ASCENSÃO ${stage.index+1}/5 · ${stage.name.toUpperCase()}` : '');
    previous = performance.now(); updateHud(); updateCameraHud();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }
  function menu() {
    mode = 'menu'; run = null; releaseMouse(); resetInputs(); clearFeedback();
    state = FightSim.createMatch({training:true,arena:selectedArena()}); state.phase = 'menu'; state.events.length = 0;
    state.fighters[0].x = -1.5; state.fighters[1].x = 1.5;
    document.body.classList.add('in-menu');
    ['fight-hud','fight-footer','pause-button','camera-button','lock-status','fight-reticle','camera-hint','pause-screen','result-screen','touch-controls','run-progress','threat-indicator'].forEach(id => show(id,false));
    show('menu-screen',true); updateBest(); updateSelection();
  }
  function pause() {
    if (mode !== 'fight' || state.phase === 'matchOver') return;
    mode = 'paused'; resetInputs(); releaseMouse(); show('pause-screen',true); show('touch-controls',false); show('announcement',false);
    $('resume-button').focus({preventScroll:true});
  }
  function resume() {
    if (mode !== 'paused' || graphics.status !== 'ready') return;
    mode = 'fight'; resetInputs(); accumulator = 0; show('pause-screen',false); show('touch-controls',touchDevice);
    previous = performance.now(); sound.unlock(); $('resume-button').blur();
  }
  function result() {
    if (resultRecorded) return;
    resultRecorded = true; mode = 'result'; releaseMouse(); resetInputs(); clearFeedback();
    const won = state.winner === 0;
    if (won) { best++; save('neon-clash-wins',best); }
    if (run) {
      NeonRun.finish(run,won,stats);
      if (run.cleared > bestRun.cleared || run.cleared === bestRun.cleared && run.score > bestRun.score) {
        bestRun = {cleared:run.cleared,score:run.score}; save('neon-clash-ascent-best',bestRun);
      }
    }
    const advancing = run && run.pendingUpgrade;
    text('result-title',advancing ? 'SUBA MAIS.' : won ? run ? 'ASCENSÃO.' : 'VITÓRIA.' : 'LEVANTE.');
    text('result-eyebrow',advancing ? `ETAPA ${run.cleared}/5 CONCLUÍDA · ESCOLHA UMA MELHORIA` : won ? run ? 'CINCO ETAPAS. VOCÊ CONQUISTOU O SINAL.' : 'A ARENA TEM UM NOVO DONO.' : 'A DERROTA TAMBÉM ENSINA.');
    text('result-description',run ? `${run.cleared}/5 etapas · ${run.score.toLocaleString('pt-BR')} pontos · ${run.parries} defesas perfeitas${advancing ? '. Escolha sua melhoria e continue.' : '.'}` : won ? 'Bom combate. Mude a arena ou encare um rival mais difícil.' : 'Ataque só quando alcançar. Use defesa perfeita, esquiva e contra-ataques.');
    text('result-score',`${state.wins[0]}—${state.wins[1]}`); text('result-combo',stats.combo); text('result-damage',Math.round(stats.damage));
    text('result-rank',`RANK ${NeonRun.rank(stats,won)}`); show('result-rank',true);
    text('rematch-button',advancing ? 'APLICAR MELHORIA E AVANÇAR →' : run ? 'NOVA ASCENSÃO ↗' : 'REVANCHE ↗');
    document.querySelector('.result-modal').classList.toggle('lost',!won);
    show('upgrade-choices',!!advancing); pendingUpgrade = 'power'; updateUpgrades();
    show('result-screen',true); ['touch-controls','pause-button','camera-button','fight-reticle','camera-hint','threat-indicator'].forEach(id => show(id,false));
    sound.play(won ? 'win' : 'lose'); $('rematch-button').focus({preventScroll:true}); updateBest();
  }
  function updateUpgrades() {
    document.querySelectorAll('[data-upgrade]').forEach(button => {
      const key = button.dataset.upgrade, perk = NeonRun.upgrades[key];
      if (!perk) return;
      const selected = key === pendingUpgrade;
      button.classList.toggle('selected',selected); button.setAttribute('aria-pressed',String(selected));
      button.title = perk.description;
      const count = run ? run.upgrades[key] : 0;
      button.innerHTML = `<strong>${perk.name}</strong><span>${perk.description}</span><small>NÍVEL ${count} → ${count+1}</small>`;
    });
  }
  function action(name) {
    if (name === 'lock') { toggleLock(); return; }
    if (mode !== 'fight') return;
    sound.unlock();
    if (name === 'special' && state.phase === 'fight' && state.fighters[0].energy < 40) toast('ESPECIAL PRECISA DE 40 ENERGIA',1);
    const accepted = FightSim.act(state,0,name);
    if (accepted && name === 'jump') sound.play(name);
  }
  function toggleLock() {
    if (mode !== 'fight') return;
    locked = !locked; scene.setLockOn(locked); updateCameraHud();
  }
  function updateCameraHud() {
    const captured = document.pointerLockElement === $('game-canvas');
    text('lock-status',locked ? '⊙ ALVO FIXADO · TAB' : '○ CÂMERA LIVRE · TAB');
    if ($('lock-status')) $('lock-status').setAttribute('aria-pressed',String(locked));
    text('camera-hint',touchDevice ? 'ARRASTE NA ARENA PARA GIRAR A CÂMERA' : captured ? 'MOUSE CÂMERA · CLIQUE SOCO · DIREITO CHUTE · ESC LIBERA' : 'ARRASTE O MOUSE OU Q/E PARA GIRAR · C RECENTRALIZA');
    text('camera-button',captured ? 'MOUSE ATIVO' : 'CAPTURAR MOUSE');
  }
  async function captureMouse() {
    if (mode !== 'fight' || touchDevice) return;
    try { if (document.pointerLockElement) { releaseMouse(); return; } await $('game-canvas').requestPointerLock(); }
    catch (_) { toast('ARRASTE NA ARENA OU USE Q/E PARA GIRAR A CÂMERA'); }
  }
  const actionKeys = {KeyJ:'punch',KeyK:'kick',KeyL:'special',Space:'jump',ShiftLeft:'dodge',ShiftRight:'dodge'};
  const playKeys = new Set(['KeyW','KeyA','KeyS','KeyD','KeyI','KeyF','KeyQ','KeyE','KeyC','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',...Object.keys(actionKeys)]);
  window.addEventListener('keydown',event => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
    if (mode === 'fight' && playKeys.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'Escape') { if (mode === 'paused') resume(); else pause(); return; }
    if (event.code === 'KeyM') { toggleSound(); return; }
    if (event.code === 'KeyR' && (mode === 'fight' || mode === 'paused')) { startMatch(state.training,!!run); return; }
    if (mode !== 'fight') return;
    keys.add(event.code);
    if (event.code === 'Tab') toggleLock();
    if (event.code === 'KeyC') scene.resetCamera(state);
    if (actionKeys[event.code]) action(actionKeys[event.code]);
  });
  window.addEventListener('keyup',event => keys.delete(event.code));
  window.addEventListener('blur',() => { resetInputs(); pause(); });
  document.addEventListener('visibilitychange',() => { if (document.hidden) { resetInputs(); pause(); } });
  document.addEventListener('pointerlockchange',() => {
    updateCameraHud();
    if (!document.pointerLockElement && mode === 'fight') pause();
  });
  document.addEventListener('pointerlockerror',() => toast('USE ARRASTAR OU Q/E PARA CONTROLAR A CÂMERA'));
  const canvas = $('game-canvas');
  canvas.addEventListener('pointerdown',event => {
    if (mode !== 'fight') return;
    sound.unlock();
    if (document.pointerLockElement === canvas) { if (event.button === 0) action('punch'); else if (event.button === 2) action('kick'); return; }
    if (drag) return;
    drag = {id:event.pointerId,x:event.clientX,y:event.clientY};
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
  });
  window.addEventListener('pointermove',event => {
    if (mode !== 'fight') return;
    const sensitivity = .0035 * settings.sensitivity;
    if (document.pointerLockElement === canvas) scene.rotateCamera(event.movementX*sensitivity,event.movementY*sensitivity);
    else if (drag && drag.id === event.pointerId) {
      scene.rotateCamera((event.clientX-drag.x)*sensitivity,(event.clientY-drag.y)*sensitivity);
      drag.x = event.clientX; drag.y = event.clientY;
    }
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(name => canvas.addEventListener(name,event => { if (drag && drag.id === event.pointerId) drag = null; }));
  canvas.addEventListener('contextmenu',event => event.preventDefault());
  canvas.addEventListener('wheel',event => { if (mode === 'fight') { event.preventDefault(); scene.zoomCamera(Math.sign(event.deltaY)*.6); } },{passive:false});
  document.querySelectorAll('[data-control]').forEach(button => {
    const name = button.dataset.control;
    button.addEventListener('pointerdown',event => {
      event.preventDefault(); if (mode !== 'fight') return;
      try { button.setPointerCapture(event.pointerId); } catch (_) {}
      touches.add(name); button.classList.add('active');
      if (!['left','right','up','down','block','sprint'].includes(name)) action(name);
    });
    const release = event => { event.preventDefault(); touches.delete(name); button.classList.remove('active'); };
    ['pointerup','pointercancel','lostpointercapture'].forEach(name => button.addEventListener(name,release));
    button.addEventListener('contextmenu',event => event.preventDefault());
  });
  function readInput() {
    const x = Number(keys.has('KeyD') || keys.has('ArrowRight') || touches.has('right')) - Number(keys.has('KeyA') || keys.has('ArrowLeft') || touches.has('left'));
    const z = Number(keys.has('KeyS') || keys.has('ArrowDown') || touches.has('down')) - Number(keys.has('KeyW') || keys.has('ArrowUp') || touches.has('up'));
    const world = scene.cameraInput(x,z);
    return {x:world.x,z:world.z,block:keys.has('KeyI') || touches.has('block'),sprint:keys.has('KeyF') || touches.has('sprint')};
  }
  function events() {
    for (const event of state.events.splice(0)) {
      const player = state.fighters[0], source = state.fighters[event.attacker || 0];
      const yaw = scene.cameraInfo().yaw;
      const pan = Math.max(-.8,Math.min(.8,-((event.x ?? source.x)-player.x)*Math.cos(yaw)*.13 + ((event.z ?? source.z)-player.z)*Math.sin(yaw)*.13));
      sound.play(event.type,event.move,pan);
      if (event.type === 'attack' && scene.effect) scene.effect('attack',source);
      if (['hit','block','parry','hazardHit'].includes(event.type)) {
        const color = event.type === 'parry' ? '#ffffff' : event.type === 'block' ? '#dfff80' : event.type === 'hazardHit' ? '#ffad42' : event.attacker === 0 ? '#65edff' : '#ff7459';
        scene.impact(event.x ?? source.x,event.z ?? source.z,color,event.type === 'parry' ? 1.3 : event.type === 'block' ? .3 : event.move === 'special' ? 1.6 : .7);
        if (event.attacker === 0) stats.damage += event.damage || 0;
        if (event.target === 0) stats.taken += event.damage || 0;
        if (event.type === 'parry') { if (event.target === 0) stats.parries++; toast(event.target === 0 ? 'DEFESA PERFEITA · CONTRA-ATAQUE!' : 'O RIVAL APAROU SEU GOLPE',1.2); hitStop = prefersReduced ? 0 : .065; }
        if (event.type === 'hit') {
          hitStop = prefersReduced ? 0 : event.move === 'special' ? .055 : .022;
          if (event.attacker === 0) stats.combo = Math.max(stats.combo,event.combo || 1);
          if (event.attacker === 0 && event.combo > 1) { text('combo-count',event.combo); show('combo-display',true); comboTime = 1.5; }
          if (event.move === 'special') toast(event.attacker === 0 ? 'NEON IMPACT' : 'IMPACTO CRÍTICO',1.1);
        }
        if (event.target === 0 && event.damage > 0) damageTime = .24;
      }
      if (event.type === 'guardBreak') toast(event.target === 0 ? 'GUARDA QUEBRADA · SAIA DA PRESSÃO' : 'GUARDA ABERTA · ATAQUE!',1.3);
      if (event.type === 'hazardWarning') toast('⚠ SOBRECARGA · SAIA DO CÍRCULO',1.6);
      if (event.type === 'roundStart') { comboTime = 0; show('combo-display',false); scene.resetCamera(state); }
      if (event.type === 'matchEnd') result();
    }
  }
  function announcement() {
    if (mode !== 'fight') return;
    let title = '', overline = '', subtitle = '';
    if (state.phase === 'intro') {
      title = state.phaseTime < 1.3 ? state.training ? 'TREINO LIVRE' : `ROUND ${String(state.round).padStart(2,'0')}` : 'LUTE!';
      overline = run ? `ASCENSÃO ${run.stage+1}/5 · ${NeonRun.stage(run).name.toUpperCase()}` : `${arenaNames[state.arena]}`;
      subtitle = state.training ? 'ALVO PASSIVO · EXPERIMENTE COMBOS E ESQUIVAS' : `${levelNames[state.difficulty]} · VENÇA DOIS ROUNDS`;
    } else if (state.phase === 'roundOver') {
      title = state.roundWinner === 'draw' ? 'EMPATE' : state.fighters.some(f => f.hp <= 0) ? 'K.O.' : 'TEMPO!';
      overline = 'FIM DO ROUND'; subtitle = state.roundWinner === 'draw' ? 'A LUTA CONTINUA' : state.roundWinner === 0 ? 'ROUND PARA AZURE' : 'ROUND PARA CRIMSON';
    }
    if (title !== lastAnnouncement) { lastAnnouncement = title; text('announcement-title',title); text('announcement-overline',overline); text('announcement-subtitle',subtitle); }
    show('announcement',!!title);
  }
  function updateHud() {
    if (!state) return;
    for (const [prefix,f] of [['player',state.fighters[0]],['enemy',state.fighters[1]]]) {
      const hp = Math.max(0,f.hp / f.maxHp);
      $(prefix+'-health').style.transform = `scaleX(${hp})`; $(prefix+'-trail').style.transform = `scaleX(${hp})`;
      $(prefix+'-energy').style.transform = `scaleX(${f.energy / f.maxEnergy})`; $(prefix+'-guard').style.transform = `scaleX(${f.guard / 100})`;
      text(prefix+'-hp',Math.ceil(f.hp)); $(prefix+'-health').parentElement.setAttribute('aria-label',`Vida ${Math.ceil(f.hp)} de ${f.maxHp}`);
    }
    const [player,enemy] = state.fighters;
    text('player-energy-label',player.energy >= 40 ? 'ESPECIAL PRONTO · L' : 'RECUPERE ENERGIA');
    text('round-time',state.training ? '∞' : Math.ceil(Math.max(0,state.timeLeft)).toString().padStart(2,'0'));
    text('round-label',state.training ? 'TREINO' : `ROUND ${String(state.round).padStart(2,'0')}`);
    document.querySelector('.clock').classList.toggle('urgent',!state.training && state.timeLeft < 15);
    ['player-rounds','enemy-rounds'].forEach((id,index) => $(id).querySelectorAll('b').forEach((pip,win) => pip.classList.toggle('won',state.wins[index] > win)));
    const hazard = state.hazard;
    show('hazard-warning',mode === 'fight' && !!hazard && (hazard.warning || hazard.active));
    text('hazard-warning',hazard && hazard.active ? '⚠ DESCARGA ATIVA · EVITE O CÍRCULO' : '⚠ REATOR CARREGANDO · SAIA DO CÍRCULO');
    const attack = FightSim.moves[enemy.action];
    const dangerous = mode === 'fight' && state.phase === 'fight' && attack && attack.damage && enemy.actionTime < attack.windup && Math.hypot(enemy.x-player.x,enemy.z-player.z) < 5;
    show('threat-indicator',!!dangerous);
    text('threat-indicator',enemy.action === 'special' ? '⚡ ESPECIAL · ESQUIVE OU APARE' : enemy.action === 'kick' ? '↗ CHUTE CARREGANDO' : '• ATAQUE');
  }
  function toggleSound() {
    settings.sound = !settings.sound; sound.setEnabled(settings.sound); persist();
    $('sound-button').setAttribute('aria-pressed',String(settings.sound)); $('sound-button').setAttribute('aria-label',settings.sound ? 'Desligar som' : 'Ligar som');
  }
  function setQuality(value) {
    quality = scene ? scene.setQuality(value) : value;
    text('quality-button',quality === 'high' ? 'HQ' : 'LQ'); $('quality-button').setAttribute('aria-label',`Qualidade gráfica ${quality === 'high' ? 'alta' : 'leve'}`);
  }
  listen('start-button','click',() => startMatch(false)); listen('training-button','click',() => startMatch(true));
  listen('pause-button','click',pause); listen('resume-button','click',resume);
  listen('restart-button','click',() => startMatch(state.training,!!run));
  listen('rematch-button','click',() => { if (run && run.pendingUpgrade) { NeonRun.advance(run,pendingUpgrade); startMatch(false,true); } else startMatch(false); });
  ['menu-button','result-menu-button'].forEach(id => listen(id,'click',menu));
  listen('brand-link','click',event => { event.preventDefault(); if (mode === 'fight') pause(); else if (mode === 'result') menu(); });
  listen('sound-button','click',toggleSound); listen('camera-button','click',captureMouse); listen('lock-status','click',toggleLock);
  listen('quality-button','click',() => { if (graphics.status !== 'ready') return; qualityManual = true; setQuality(quality === 'high' ? 'low' : 'high'); });
  listen('fullscreen-button','click',async () => { try { if(document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch (_) { toast('TELA CHEIA INDISPONÍVEL'); } });
  document.querySelectorAll('[data-arena]').forEach(button => button.addEventListener('click',() => { $('arena-select').value = button.dataset.arena; sound.unlock(); sound.play('click'); updateSelection(); }));
  document.querySelectorAll('[data-upgrade]').forEach(button => button.addEventListener('click',() => { pendingUpgrade = button.dataset.upgrade; sound.play('click'); updateUpgrades(); }));
  listen('difficulty','change',updateSelection); listen('mode-select','change',updateSelection);
  listen('sensitivity','input',event => { settings.sensitivity = Number(event.target.value); persist(); });
  listen('volume','input',event => { settings.volume = Number(event.target.value); sound.unlock(); sound.setVolume(settings.volume/100); persist(); });
  listen('music-toggle','change',event => { settings.music = event.target.checked; sound.setMusic(settings.music); persist(); });
  listen('shake-toggle','change',event => { settings.shake = event.target.checked; scene.setReducedMotion(!settings.shake || prefersReduced); persist(); });
  function scheduleFrame() {
    if (!animationFrame && graphics.status === 'ready') animationFrame = requestAnimationFrame(frame);
  }
  function recoveryFailed(message) {
    graphics.status = 'failed';
    text('error-eyebrow','RENDERIZADOR INDISPONÍVEL'); text('error-title','TENTE DE NOVO.');
    text('error-message',message || 'O navegador ainda não restaurou o 3D. Reabra no modo compatível. No Linux, o iniciador Abrir jogo.sh também seleciona a RX 7600 quando disponível.');
    text('error-retry','REABRIR NO MODO COMPATÍVEL ↻'); show('error-retry',true); show('error-screen',true);
  }
  canvas.addEventListener('webglcontextlost',event => {
    event.preventDefault();
    if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = 0; }
    clearTimeout(recoveryTimer); clearTimeout(restoreTimer);
    graphics.status = 'recovering'; graphics.losses++;
    if (scene) scene.prepareContextRecovery();
    quality = 'low'; qualityManual = false; accumulator = hitStop = 0;
    pause(); resetInputs(); sound.tick(state,false);
    text('error-eyebrow','RECONSTRUINDO A ARENA'); text('error-title','UM INSTANTE.');
    text('error-message','O navegador reiniciou o gráfico 3D. Estamos restaurando a arena; sua partida está preservada.');
    show('error-retry',false); show('error-screen',true);
    recoveryTimer = setTimeout(() => { if (graphics.status === 'recovering') recoveryFailed(); },12000);
  });
  canvas.addEventListener('webglcontextrestored',() => {
    const generation = graphics.losses;
    // This handler is registered before THREE's. A task, rather than a
    // microtask, lets all renderer restore listeners finish rebuilding GL.
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
      if (generation !== graphics.losses || graphics.status === 'ready' || !scene) return;
      try {
        if (!scene.restoreContext()) throw new Error('O navegador não conseguiu restaurar o renderizador.');
        setQuality('low'); scene.update(0,state); scene.render();
        graphics.status = 'ready'; graphics.recoveries++;
        clearTimeout(recoveryTimer); show('error-screen',false); show('error-retry',true);
        previous = performance.now(); accumulator = hudTime = fpsClock = fpsFrames = slowSamples = 0;
        toast('GRÁFICO RESTAURADO · MODO COMPATÍVEL',3);
        if (mode === 'paused') $('resume-button').focus({preventScroll:true});
        scheduleFrame();
      } catch (error) { recoveryFailed(error.message); }
    },0);
  });
  listen('error-retry','click',() => location.reload());
  function frame(now) {
    animationFrame = 0;
    if (graphics.status !== 'ready') return;
    // isContextLost can change before the loss event is dispatched. Never
    // advance combat while its canvas cannot display the result.
    if (scene.renderer.getContext().isContextLost()) { previous = now; scheduleFrame(); return; }
    const elapsed = Math.max(0,(now-previous)/1000), dt = Math.min(.1,elapsed); previous = now;
    if (mode === 'fight') {
      const orbit = Number(keys.has('KeyE')) - Number(keys.has('KeyQ'));
      if (orbit) scene.rotateCamera(orbit*dt*1.7*settings.sensitivity,0);
      if (hitStop > 0) { hitStop -= dt; accumulator = 0; }
      else {
        accumulator = Math.min(.1,accumulator+dt);
        const input = readInput();
        while (accumulator >= 1/60 && mode === 'fight') { FightSim.step(state,1/60,input); accumulator -= 1/60; events(); }
      }
      announcement(); if(state.phase === 'matchOver') result();
      const p = state.fighters[0];
      if (state.phase === 'fight' && p.y < .05 && (p.action === 'walk' || p.action === 'sprint')) {
        footstep += dt; if (footstep > (p.sprinting ? .25 : .38)) { sound.play('step'); footstep = 0; }
      } else footstep = 0;
    }
    sound.tick(state,mode === 'fight' && state.phase === 'fight');
    if (mode !== 'paused') { scene.update(dt,state); if(mode === 'menu') for(const f of state.fighters) f.actionTime += dt; }
    scene.render(); renderFrames++;
    hudTime += dt; if(hudTime >= .05) { if(mode !== 'menu') updateHud(); hudTime = 0; }
    if(toastTime > 0) { toastTime -= dt; if(toastTime <= 0) $('combat-toast').classList.remove('show'); }
    if(comboTime > 0) { comboTime -= dt; if(comboTime <= 0) show('combo-display',false); }
    if(damageTime > 0) { damageTime = Math.max(0,damageTime-dt); if($('damage-flash')) $('damage-flash').style.opacity = String(damageTime * (prefersReduced ? .8 : 2)); }
    fpsClock += elapsed; fpsFrames++;
    if(fpsClock >= 2) {
      if(!qualityManual && quality === 'high' && fpsFrames/fpsClock < 29) slowSamples++; else slowSamples = 0;
      if(slowSamples >= 2) { setQuality('low'); slowSamples = 0; }
      fpsClock = fpsFrames = 0;
    }
    scheduleFrame();
  }
  try {
    if(!window.THREE || !window.FightSim || !window.NeonScene || !window.NeonRun) throw new Error('Arquivos do jogo ausentes. Mantenha todos os arquivos e a pasta vendor juntos.');
    if($('arena-select')) $('arena-select').value = settings.arena;
    $('difficulty').value = settings.difficulty;
    if($('sensitivity')) $('sensitivity').value = settings.sensitivity;
    if($('volume')) $('volume').value = settings.volume;
    if($('shake-toggle')) $('shake-toggle').checked = settings.shake;
    if($('music-toggle')) $('music-toggle').checked = settings.music;
    $('sound-button').setAttribute('aria-pressed',String(settings.sound));
    scene = NeonScene.create(canvas,{quality,reducedMotion:!settings.shake || prefersReduced});
    scene.setReducedMotion(!settings.shake || prefersReduced); setQuality(quality); menu();
    // Debug surface for deterministic browser integration checks; never networked.
    window.__NEON__ = Object.freeze({get state(){return state;},get mode(){return mode;},get frames(){return renderFrames;},get quality(){return quality;},get graphics(){return {...graphics,...(scene.graphicsInfo ? {renderer:scene.graphicsInfo()} : {})};},get stats(){return {...stats};},get run(){return run;},get camera(){return scene.cameraInfo();},get audio(){return {state:sound.context && sound.context.state,nodes:sound.activeNodes};},startMatch,pause,resume,menu});
    scheduleFrame();
  } catch(error) { recoveryFailed(error.message); console.error(error); }
}());
