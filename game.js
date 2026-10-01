/* Oil Island (Orelha Edition) — input, match flow, accessibility and progression. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const touchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const mouseDevice = matchMedia('(any-pointer: fine)').matches || !touchDevice;
  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const keys = new Set(), touches = new Map();
  let mouseGuard = false, mouseLook = null;
  const rosterIds = ['veterano','titan','mimico','orelha','pixel'];
  const rosterNotes = {
    veterano: {style:'PRECISÃO / CONTRA-ATAQUE',bio:'Casaco azul-marinho, jeans azul e uma postura firme. Ombros largos, guarda precisa e golpes calculados para abrir o combo.',special:'Quebra de protocolo',super:'Última palavra'},
    titan: {style:'POTÊNCIA / PRESSÃO',bio:'Bucket branco, óculos escuros e camiseta ampla com estampa azul. Short acima do joelho e passos firmes para pressionar com impacto.',special:'Avanço dominante',super:'Domínio absoluto'},
    mimico: {style:'GIROS / DECOLAGENS',bio:'Corte tigela alinhado, óculos alaranjados, jaqueta azul-arroxeada e vermelha e jeans muito largo. Braços em hélice e giros que dominam o espaço.',special:'Hélice Giratória',super:'Decolagem Total'},
    orelha: {style:'MOBILIDADE / CONTROLE',bio:'O mascote da orla. Pelagem escura com marcas caramelo, focinho grisalho e orelhas caídas. Passos leves e a brisa da praia a seu favor.',special:'Brisa da Brava',super:'Maré da Proteção'},
    pixel: {style:'VELOCIDADE / COMBOS',bio:'Cabelo azul preso no alto, barba rosa e roupa gamer com estampa de joystick. Mude de ângulo e conecte sequências rápidas e variadas.',special:'Salto de frame',super:'Overdrive'}
  };
  const levelNames = {easy:'RECRUTA',normal:'COMBATENTE',hard:'LENDA',nightmare:'PESADELO'};
  const levelDescriptions = {
    easy:'Reações mais lentas e aberturas maiores. Aprenda distância, guarda e esquiva.',
    normal:'Pressão constante, defesa e contra-ataques. Vença com ritmo e posicionamento.',
    hard:'O rival pune golpes no vazio, varia combos e escapa da pressão. Domine sua energia.',
    nightmare:'Reações rápidas, pressão implacável e contra-ataques precisos. Mesma vida e mesmas regras.'
  };
  const arenaNames = {island:'OIL ISLAND / MAR ABERTO',nightclub:'AFTER HOURS / PISTA DE LUTA',seaside:'ORLA BRAVA / FIM DE TARDE',helipad:'HELIPONTO / COLISÃO NO CÉU'};
  const arenaIds = Object.keys(arenaNames);
  const arenaCaptions = {
    island:'ILHA TROPICAL · ENTRE ROCHAS E PALMEIRAS',nightclub:'BOATE · O DUELO SEGUE O RITMO',seaside:'CIDADE LITORÂNEA · DA AREIA AO CALÇADÃO',helipad:'HELIPONTO · COLISÃO NO CÉU'
  };
  const arenaDescriptions = {
    island:'Uma ilha cercada pelo mar. A arena entre rochas e palmeiras abre espaço para esquivas e avanços rápidos.',
    nightclub:'A pista vira arena no meio da festa. Luzes, DJ e mezaninos cercam um espaço livre para manter a pressão.',
    seaside:'Uma arena ampla na areia, entre o mar e o calçadão. Circule, mude de ângulo e controle a distância ao entardecer.',
    helipad:'O duelo acontece em um heliponto elevado enquanto dois helicópteros colidem de frente no céu. Mantenha o foco e domine a plataforma.'
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
    showFps: !!(stored && stored.showFps),
    quality: stored && ['auto','high','low'].includes(stored.quality) ? stored.quality : 'auto',
    arena: stored && arenaIds.includes(stored.arena) ? stored.arena : 'island',
    difficulty: stored && levelNames[stored.difficulty] ? stored.difficulty : 'normal',
    character: stored && rosterIds.includes(stored.character) ? stored.character : 'veterano',
    opponent: stored && rosterIds.includes(stored.opponent) ? stored.opponent : 'titan'
  };
  let mode = 'menu', scene, state, run = null, pendingUpgrade = 'power';
  let online = null, onlineEvents = [], playerId = 0, previousPose = null;
  let qualityMode = settings.quality, quality = qualityMode === 'high' ? 'high' : 'low', resolutionScale = 1;
  const governor = NeonPerformance.createGovernor({quality,scale:resolutionScale,allowHigh:qualityMode === 'auto'});
  let previous = performance.now(), accumulator = 0, hudTime = 0, toastTime = 0, comboTime = 0, hitStop = 0;
  let lastAnnouncement = '', resultRecorded = false;
  let renderFrames = 0;
  let fpsElapsed = 0, fpsFrames = 0;
  const graphics = {status:'ready',losses:0,recoveries:0};
  let animationFrame = 0, recoveryTimer = 0, restoreTimer = 0;
  let best = Math.max(0, Number(load('neon-clash-wins', 0)) || 0);
  let bestRun = load('neon-clash-ascent-best', {cleared:0,score:0});
  if (!bestRun || !Number.isInteger(bestRun.cleared) || bestRun.cleared < 0 || bestRun.cleared > 5 || !Number.isFinite(bestRun.score) || bestRun.score < 0) bestRun = {cleared:0,score:0};
  let stats = freshStats(), drag = null, damageTime = 0, locked = true, footstep = 0;
  const comboRoute = [];
  const sound = NeonAudio.create({enabled:settings.sound,music:settings.music,volume:settings.volume/100});
  function freshStats() { return {damage:0,taken:0,combo:0,parries:0}; }
  function show(id, visible) { if ($(id)) $(id).hidden = !visible; }
  function text(id, value) { if ($(id)) $(id).textContent = value; }
  function listen(id, event, fn) { if ($(id)) $(id).addEventListener(event, fn); }
  function toast(message, duration) { text('combat-toast',message); $('combat-toast').classList.add('show'); toastTime = duration || 1.6; }
  function persist() { save('neon-clash-settings-v2',settings); }
  function resetInputs() {
    keys.clear(); touches.clear(); drag = null; mouseGuard = false; mouseLook = null;
    document.querySelectorAll('.touch-controls .active').forEach(el => el.classList.remove('active'));
  }
  function releaseMouse() { if (document.pointerLockElement) document.exitPointerLock(); }
  function clearFeedback() {
    comboRoute.length = 0;
    lastAnnouncement = ''; show('announcement',false); show('combo-display',false); show('hazard-warning',false);
    $('combat-toast').classList.remove('show'); toastTime = comboTime = hitStop = damageTime = 0;
    if ($('damage-flash')) $('damage-flash').style.opacity = '0';
  }
  function updateBest() {
    text('best-score',`${best} ${best === 1 ? 'VITÓRIA' : 'VITÓRIAS'}`);
    text('best-run',`ASCENSÃO ${bestRun.cleared || 0}/5 · ${(bestRun.score || 0).toLocaleString('pt-BR')} PTS`);
  }
  function selectedArena() { return $('arena-select') && arenaIds.includes($('arena-select').value) ? $('arena-select').value : 'island'; }
  function characterInfo(id) { return FightSim.characters && FightSim.characters[id] || {name:({veterano:'Epstein',titan:'Diddy',mimico:'Oliver Tree',orelha:'Orelha',pixel:'Raulzito'})[id] || 'Lutador'}; }
  function fighterName(fighter) { return characterInfo(fighter.character).name.toUpperCase(); }
  function selectedCharacters() {
    const rival = run ? rosterIds[(rosterIds.indexOf(settings.opponent) + run.stage) % rosterIds.length] : settings.opponent;
    return [settings.character,rival];
  }
  function updateCharacterSelection() {
    const id=settings.character, info=characterInfo(id), note=rosterNotes[id];
    document.querySelectorAll('[data-character]').forEach(button => {
      const selected=button.dataset.character===id;
      button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
      button.disabled=!!online;
    });
    text('selected-character-name',info.name.toUpperCase());text('character-style',note.style);
    text('character-description',note.bio);
    text('character-special',info.specialName || note.special);text('character-super',info.superName || note.super);
    const specialMove=FightSim.getMove({id:0,character:id},'special');
    text('character-special-cost',specialMove.cost+' ENERGIA');
    text('character-extra',id==='orelha' ? 'Q · Giro da Orla   /   No ar + Q · Salto do Casamento   /   Shift · Esquiva do Mascote' : id==='mimico' ? 'Q · Chute Rotor / No ar + Q · Pouso de Impacto / E · Hélice em 360° / R · Decolagem Total' : 'J/K/L encadeiam golpes. I apara no impacto; Shift sai da pressão. Câmera automática no alvo.');
    if ($('opponent-select')) $('opponent-select').value=settings.opponent;
    if (mode==='menu' && state) {
      state.fighters[0].character=id;state.fighters[1].character=settings.opponent;
    }
  }
  function disconnectOnline() {
    const client = online; online = null; onlineEvents = [];
    if (client) {
      client.leave();
      text('online-status','Você saiu da sala. Crie outra ou entre com um código.');
    }
    playerId = 0; document.body.classList.remove('local-crimson');
    ['host-button','join-button'].forEach(id => { $(id).disabled = false; });
    show('room-invite',false); show('leave-room-button',false); show('network-indicator',false);
    text('connection-label','SOLO · OFFLINE');
    updateCharacterSelection();
  }
  function startOnlineMatch(next) {
    if (!online) return;
    state = next; playerId = online.playerId; run = null;
    resetInputs(); clearFeedback(); accumulator = hitStop = 0; previousPose = null;
    stats = freshStats(); resultRecorded = false; mode = 'fight';
    document.body.classList.remove('in-menu');
    document.body.classList.toggle('local-crimson',playerId === 1);
    locked = true; scene.setArena(state.arena); scene.resetCamera(state); scene.setLockOn(locked); sound.setArena(state.arena);
    ['menu-screen','pause-screen','result-screen','upgrade-choices','run-progress'].forEach(id => show(id,false));
    ['fight-hud','fight-footer','pause-button','lock-status','fight-reticle','camera-hint','network-indicator'].forEach(id => show(id,true));
    show('camera-button',mouseDevice); show('touch-controls',touchDevice); show('restart-button',false);
    text('player-name',fighterName(state.fighters[playerId])); text('enemy-name',fighterName(state.fighters[1-playerId]));
    text('fight-arena-name',arenaNames[state.arena]); text('fight-mode','ONLINE 1 × 1');
    text('match-label','MELHOR DE 3'); text('enemy-energy-label','JOGADOR ONLINE');
    text('pause-description','A partida online continua. Seus comandos ficam soltos enquanto este menu estiver aberto.');
    $('rematch-button').disabled = false;
    previous = performance.now(); updateHud(); updateCameraHud();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (graphics.status !== 'ready' || document.hidden) pause();
  }
  function connectOnline(code) {
    if (graphics.status !== 'ready') return;
    disconnectOnline(); sound.unlock();
    if (!/^https?:$/.test(location.protocol)) {
      text('online-status','Para jogar online, abra o endereço do servidor no navegador. O arquivo local continua disponível para jogar solo.');
      return;
    }
    const client = NeonNet.create({
      onStatus(info) {
        if (online !== client) return;
        const busy = ['connecting','waiting','playing','result'].includes(info.phase);
        ['host-button','join-button'].forEach(id => { $(id).disabled = busy; });
        show('leave-room-button',busy); show('room-invite',info.phase === 'waiting' && !!info.code);
        text('invite-code',info.code || '');
        text('online-status',info.message || (info.phase === 'connecting' ? 'Conectando…' : busy ? 'Sala conectada.' : 'Você saiu da sala. Crie outra ou entre com um código.'));
        text('connection-label',info.phase === 'waiting' ? 'SALA · AGUARDANDO' : busy ? 'ONLINE · 1 × 1' : 'SOLO · OFFLINE');
        const ping = info.ping === null ? 'medindo ping…' : `${info.ping} ms`;
        text('network-indicator',`SALA ${info.code} · ${ping}`);
        $('network-indicator').classList.toggle('delayed',info.ping > 150);
        if (info.phase === 'result') {
          const ready = info.rematchReady || [];
          $('rematch-button').disabled = !!ready[playerId];
          text('rematch-button',ready[playerId] ? 'AGUARDANDO O RIVAL…' : ready[1-playerId] ? 'ACEITAR REVANCHE ↗' : 'PEDIR REVANCHE ↗');
        }
        if ((info.phase === 'closed' || info.phase === 'error') && info.message) {
          menu(); $('online-panel').open = true; text('online-status',info.message);
        }
      },
      onMatch: startOnlineMatch,
      onEvents(incoming) { if (online === client) onlineEvents.push(...incoming); }
    });
    online = client;
    updateCharacterSelection();
    if (code) client.join(code,settings.character); else client.host(selectedArena(),settings.character);
  }
  function updateSelection() {
    const arena = selectedArena(); settings.arena = arena; settings.difficulty = $('difficulty').value; persist();
    document.querySelectorAll('[data-arena]').forEach(button => {
      const selected = button.dataset.arena === arena; button.classList.toggle('selected',selected); button.setAttribute('aria-pressed',String(selected));
    });
    text('arena-name',arenaNames[arena]); text('arena-description',arenaDescriptions[arena]);
    text('arena-caption-detail',arenaCaptions[arena]);
    text('arena-number',`${String(arenaIds.indexOf(arena)+1).padStart(2,'0')} / ${String(arenaIds.length).padStart(2,'0')}`);
    text('difficulty-description',levelDescriptions[settings.difficulty]);
    text('mode-description',$('mode-select') && $('mode-select').value === 'ascent' ? 'Cinco duelos pelas quatro arenas. Uma melhoria por vitória. Volte à arena inicial para enfrentar o Pesadelo na final.' : 'Duelo livre: escolha arena e rival. Quem vencer dois rounds leva a partida.');
    if (mode === 'menu' && scene) { state.arena = arena; scene.setArena(arena); }
    updateCharacterSelection();
  }
  function startMatch(training, continuing) {
    if (!scene || graphics.status !== 'ready') return;
    disconnectOnline(); previousPose = null;
    resetInputs(); sound.unlock(); sound.play('click'); clearFeedback(); accumulator = 0;
    if (!continuing) run = !training && $('mode-select') && $('mode-select').value === 'ascent' ? NeonRun.create(selectedArena(),$('difficulty').value) : null;
    const stage = run ? NeonRun.stage(run) : null;
    state = FightSim.createMatch({difficulty:stage ? stage.difficulty : $('difficulty').value, arena:stage ? stage.arena : selectedArena(), training:!!training, upgrades:run ? run.upgrades : undefined,characters:selectedCharacters()});
    locked = true; scene.setArena(state.arena); scene.resetCamera(state); scene.setLockOn(locked); sound.setArena(state.arena);
    mode = 'fight'; stats = freshStats(); resultRecorded = false;
    document.body.classList.remove('in-menu');
    ['menu-screen','pause-screen','result-screen'].forEach(id => show(id,false));
    ['fight-hud','fight-footer','pause-button','camera-button','lock-status','fight-reticle','camera-hint'].forEach(id => show(id,true));
    show('camera-button',mouseDevice);
    show('touch-controls',touchDevice); show('upgrade-choices',false); show('run-progress',!!run);
    text('fight-arena-name',arenaNames[state.arena]);
    text('fight-mode',training ? 'TREINO LIVRE' : run ? 'ASCENSÃO' : 'DUELO');
    text('match-label',training ? 'TREINO LIVRE' : 'MELHOR DE 3');
    text('enemy-energy-label',training ? 'ALVO DE TREINO' : levelNames[state.difficulty]);
    text('player-name',fighterName(state.fighters[0])); text('enemy-name',fighterName(state.fighters[1]));
    text('pause-description','A arena pode esperar um pouco.'); show('restart-button',true); $('rematch-button').disabled = false;
    text('run-progress',stage ? `ASCENSÃO ${stage.index+1}/5 · ${stage.name.toUpperCase()}` : '');
    previous = performance.now(); updateHud(); updateCameraHud();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }
  function menu() {
    disconnectOnline(); previousPose = null;
    mode = 'menu'; run = null; releaseMouse(); resetInputs(); clearFeedback();
    state = FightSim.createMatch({training:true,arena:selectedArena(),characters:selectedCharacters()}); state.phase = 'menu'; state.events.length = 0;
    state.fighters[0].x = -1.5; state.fighters[1].x = 1.5;
    document.body.classList.add('in-menu');
    ['fight-hud','fight-footer','pause-button','camera-button','lock-status','fight-reticle','camera-hint','pause-screen','result-screen','touch-controls','run-progress','threat-indicator'].forEach(id => show(id,false));
    show('menu-screen',true); updateBest(); updateSelection();
  }
  function pause() {
    if (mode !== 'fight' || !online && state.phase === 'matchOver') return;
    mode = 'paused'; resetInputs(); releaseMouse(); show('pause-screen',true); show('touch-controls',false); show('announcement',false);
    accumulator = 0; if (online) online.neutralize();
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
    const won = state.winner === playerId;
    show('pause-screen',false);
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
    text('result-score',`${state.wins[playerId]}—${state.wins[1-playerId]}`); text('result-combo',stats.combo); text('result-damage',Math.round(stats.damage));
    text('result-rank',`RANK ${NeonRun.rank(stats,won)}`); show('result-rank',true);
    text('rematch-button',advancing ? 'APLICAR MELHORIA E AVANÇAR →' : run ? 'NOVA ASCENSÃO ↗' : 'REVANCHE ↗');
    if (online) {
      text('result-description','Duelo encerrado. Uma revanche começa quando os dois jogadores aceitarem.');
      text('rematch-button','PEDIR REVANCHE ↗'); $('rematch-button').disabled = false;
    }
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
    const currentMove=FightSim.getMove(state.fighters[playerId],name);
    if (name === 'special' && state.phase === 'fight' && state.fighters[playerId].energy < currentMove.cost) toast(`ESPECIAL PRECISA DE ${currentMove.cost} ENERGIA`,1);
    if (name === 'super' && state.phase === 'fight' && state.fighters[playerId].energy < 100) toast('SUPER PRECISA DE 100 ENERGIA',1);
    if (!online) {
      // Match the online input-before-action order, including keys pressed
      // or released since the last simulation frame.
      const input=readInput(), fighter=state.fighters[playerId];
      fighter._inputX=input.x;fighter._inputZ=input.z;
    }
    const accepted = online ? online.action(name) : FightSim.act(state,0,name);
    if (!online && accepted) updateHud();
    if (accepted && name === 'jump') sound.play(name);
  }
  function toggleLock() {
    if (mode !== 'fight') return;
    locked = !locked; scene.setLockOn(locked); updateCameraHud();
  }
  function updateCameraHud() {
    const captured = document.pointerLockElement === $('game-canvas');
    const lockShortcut = mouseDevice ? 'TAB / MEIO' : 'TOQUE';
    text('lock-status',(locked ? '⊙ ALVO FIXADO · ' : '○ CÂMERA LIVRE · ')+lockShortcut);
    if ($('lock-status')) $('lock-status').setAttribute('aria-pressed',String(locked));
    text('camera-hint',captured ? 'MOUSE OLHA · ESQUERDO GOLPE · DIREITO DEFESA · MEIO ALVO · ESC LIBERA' : touchDevice && !mouseDevice ? 'ARRASTE NA ARENA PARA GIRAR · DEFESA NO IMPACTO APARA' : 'CÂMERA AUTOMÁTICA · WASD MOVER · J/K/L GOLPES · I DEFESA · SHIFT ESQUIVA');
    text('camera-button',captured ? 'MOUSE ATIVO' : 'CAPTURAR MOUSE');
  }
  async function captureMouse() {
    if (mode !== 'fight' || !mouseDevice) return;
    try { if (document.pointerLockElement) { releaseMouse(); return; } await $('game-canvas').requestPointerLock(); }
    catch (_) { toast('USE O BOTÃO DO MEIO OU Z/X PARA GIRAR A CÂMERA'); }
  }
  const actionKeys = {KeyJ:'punch',KeyK:'kick',KeyL:'special',KeyQ:'kick',KeyE:'special',KeyR:'super',Space:'jump',ShiftLeft:'dodge',ShiftRight:'dodge'};
  const playKeys = new Set(['KeyW','KeyA','KeyS','KeyD','KeyI','KeyF','KeyZ','KeyX','KeyC','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',...Object.keys(actionKeys)]);
  window.addEventListener('keydown',event => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
    if (mode === 'fight' && playKeys.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'Escape') { if (mode === 'paused') resume(); else pause(); return; }
    if (event.code === 'KeyM') { toggleSound(); return; }
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
  document.addEventListener('pointerlockerror',() => toast('USE O BOTÃO DO MEIO OU Z/X PARA GIRAR A CÂMERA'));
  const canvas = $('game-canvas');
  // Mouse edges are separate from Pointer Events: pressing/releasing a second
  // button only generates pointermove, which would lose attacks or stick guard.
  canvas.addEventListener('mousedown',event => {
    if (mode !== 'fight' || event.button < 0 || event.button > 2 || event.sourceCapabilities?.firesTouchEvents) return;
    event.preventDefault();sound.unlock();
    if (event.button === 0) action('punch');
    else if (event.button === 2) mouseGuard = true;
    else if (document.pointerLockElement === canvas) toggleLock();
    else mouseLook = {x:event.clientX,y:event.clientY,moved:false};
  });
  function releaseMouseButton(event) {
    if (event.button === 2) mouseGuard = false;
    if (event.button === 1 && mouseLook) {
      const clicked = !mouseLook.moved;
      mouseLook = null;
      if (clicked) toggleLock();
    }
  }
  window.addEventListener('mousemove',event => {
    if (mode !== 'fight' || event.sourceCapabilities?.firesTouchEvents) return;
    if (Number.isInteger(event.buttons)) {
      if (!(event.buttons & 2)) mouseGuard = false;
      if (!(event.buttons & 4)) mouseLook = null;
    }
    const sensitivity = .0035 * settings.sensitivity;
    if (document.pointerLockElement === canvas) scene.rotateCamera(event.movementX*sensitivity,event.movementY*sensitivity);
    else if (mouseLook) {
      const dx=event.clientX-mouseLook.x, dy=event.clientY-mouseLook.y;
      if (!mouseLook.moved && Math.hypot(dx,dy)<5) return;
      mouseLook.moved = true;
      scene.rotateCamera(dx*sensitivity,dy*sensitivity);
      mouseLook.x = event.clientX; mouseLook.y = event.clientY;
    }
  });
  canvas.addEventListener('mouseup',releaseMouseButton);
  window.addEventListener('mouseup',releaseMouseButton);
  canvas.addEventListener('pointerdown',event => {
    if (mode !== 'fight' || event.pointerType !== 'touch') return;
    sound.unlock();
    // Suppress touch-generated mouse edges without blocking our camera drag.
    event.preventDefault();
    if (drag) return;
    drag = {id:event.pointerId,x:event.clientX,y:event.clientY};
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
  });
  window.addEventListener('pointermove',event => {
    if (mode !== 'fight' || event.pointerType !== 'touch') return;
    const sensitivity = .0035 * settings.sensitivity;
    if (drag && drag.id === event.pointerId) {
      scene.rotateCamera((event.clientX-drag.x)*sensitivity,(event.clientY-drag.y)*sensitivity);
      drag.x = event.clientX; drag.y = event.clientY;
    }
  });
  function releasePointer(event) {
    if (event.pointerType === 'mouse' && (event.type === 'pointercancel' || event.type === 'lostpointercapture')) { mouseGuard = false; mouseLook = null; }
    if (drag && drag.id === event.pointerId) drag = null;
  }
  ['pointerup','pointercancel','lostpointercapture'].forEach(name => canvas.addEventListener(name,releasePointer));
  window.addEventListener('pointerup',releasePointer);
  canvas.addEventListener('contextmenu',event => event.preventDefault());
  canvas.addEventListener('auxclick',event => { if (event.button === 1) event.preventDefault(); });
  canvas.addEventListener('wheel',event => { if (mode === 'fight') { event.preventDefault(); scene.zoomCamera(Math.sign(event.deltaY)*.6); } },{passive:false});
  document.querySelectorAll('[data-control]').forEach(button => {
    const name = button.dataset.control;
    button.addEventListener('pointerdown',event => {
      event.preventDefault(); if (mode !== 'fight') return;
      try { button.setPointerCapture(event.pointerId); } catch (_) {}
      if (!touches.has(name)) touches.set(name,new Set());
      touches.get(name).add(event.pointerId); button.classList.add('active');
      if (!['left','right','up','down','block','sprint'].includes(name)) action(name);
    });
    const release = event => {
      event.preventDefault();
      const contacts = touches.get(name);
      if (contacts) { contacts.delete(event.pointerId); if (!contacts.size) touches.delete(name); }
      button.classList.toggle('active',touches.has(name));
    };
    ['pointerup','pointercancel','lostpointercapture'].forEach(name => button.addEventListener(name,release));
    button.addEventListener('contextmenu',event => event.preventDefault());
  });
  function readInput() {
    const x = Number(keys.has('KeyD') || keys.has('ArrowRight') || touches.has('right')) - Number(keys.has('KeyA') || keys.has('ArrowLeft') || touches.has('left'));
    const z = Number(keys.has('KeyS') || keys.has('ArrowDown') || touches.has('down')) - Number(keys.has('KeyW') || keys.has('ArrowUp') || touches.has('up'));
    const world = scene.cameraInput(x,z);
    return {x:world.x,z:world.z,block:mouseGuard || keys.has('KeyI') || touches.has('block'),sprint:keys.has('KeyF') || touches.has('sprint')};
  }
  function events(incoming) {
    for (const event of incoming || state.events.splice(0)) {
      const player = state.fighters[playerId], source = state.fighters[event.attacker ?? event.target ?? playerId];
      const yaw = scene.cameraInfo().yaw;
      const pan = Math.max(-.8,Math.min(.8,-((event.x ?? source.x)-player.x)*Math.cos(yaw)*.13 + ((event.z ?? source.z)-player.z)*Math.sin(yaw)*.13));
      sound.play(event.type,event.move,pan,source.character);
      if (event.type === 'attack' && scene.effect) scene.effect('attack',source);
      if (event.type === 'attack' && event.attacker === playerId) {
        if ((event.chain || 1) === 1 && player.combo < 2) comboRoute.length = 0;
        comboRoute.push(({punch:'J',kick:'K',special:'L',super:'R'})[event.move] || '•');
        if (comboRoute.length > 8) comboRoute.shift();
        text('combo-route',comboRoute.join(' › '));
      }
      if (['hit','block','parry','hazardHit'].includes(event.type)) {
        const feedback = NeonFeedback.impact(event,prefersReduced || !settings.shake);
        const color = event.type === 'parry' ? '#ffffff' : event.kind === 'oil' ? '#a6843f' : event.type === 'block' ? '#dfff80' : event.type === 'hazardHit' ? '#ffad42' : event.attacker === 0 ? '#65edff' : '#ff7459';
        scene.impact(event.x ?? source.x,event.z ?? source.z,color,feedback.power,feedback);
        if (event.attacker === playerId) stats.damage += event.damage || 0;
        if (event.target === playerId) stats.taken += event.damage || 0;
        if (event.type === 'parry') { if (event.target === playerId) stats.parries++; toast(event.target === playerId ? 'DEFESA PERFEITA · CONTRA-ATAQUE!' : 'O RIVAL APAROU SEU GOLPE',1.2); hitStop = feedback.pause; }
        if (event.type === 'hit') {
          hitStop = feedback.pause;
          if (event.attacker === playerId) stats.combo = Math.max(stats.combo,event.combo || 1);
          if (event.attacker === playerId && event.combo > 1) {
            text('combo-count',event.combo);text('combo-tier',event.combo>=8?'IMPLACÁVEL':event.combo>=5?'DOMÍNIO':event.combo>=3?'PRESSÃO':'RITMO');
            $('combo-display').classList.toggle('combo-hot',event.combo>=5);show('combo-display',true);comboTime=1.5;
          }
          if (event.move === 'special' || event.move === 'super') toast((event.moveName || (event.move === 'super' ? characterInfo(source.character).superName : characterInfo(source.character).specialName) || 'IMPACTO').toUpperCase(),1.1);
        }
        if (event.target === playerId && event.damage > 0) damageTime = .24;
      }
      if (event.type === 'guardBreak') toast(event.target === playerId ? 'POSTURA QUEBRADA · SAIA DA PRESSÃO' : 'POSTURA QUEBRADA · FINALIZE!',1.3);
      if (event.type === 'perfectDodge' && event.fighter === playerId) toast('ESQUIVA PERFEITA · +ENERGIA / POSTURA',.85);
      if (event.type === 'hazardWarning') toast('⚠ SOBRECARGA · SAIA DO CÍRCULO',1.6);
      if (event.type === 'roundStart') { comboTime = 0; show('combo-display',false); scene.resetCamera(state); }
      if (event.type === 'matchEnd') result();
    }
  }
  function announcement() {
    const cinematic = mode === 'fight' && state.phase === 'intro' && FightSim.introKind(state) && state.phaseTime < 5.05;
    document.body.classList.toggle('in-cutscene',cinematic);
    if (mode !== 'fight') return;
    let title = '', overline = '', subtitle = '';
    if (state.phase === 'intro') {
      title = cinematic ? '' : state.phaseTime < 1.3 ? state.training ? 'TREINO LIVRE' : `ROUND ${String(state.round).padStart(2,'0')}` : 'LUTE!';
      overline = run ? `ASCENSÃO ${run.stage+1}/5 · ${NeonRun.stage(run).name.toUpperCase()}` : `${arenaNames[state.arena]}`;
      subtitle = state.training ? 'ALVO PASSIVO · EXPERIMENTE COMBOS E ESQUIVAS' : online ? 'DUELO ONLINE · VENÇA DOIS ROUNDS' : `${levelNames[state.difficulty]} · VENÇA DOIS ROUNDS`;
    } else if (state.phase === 'roundOver') {
      title = state.roundWinner === 'draw' ? 'EMPATE' : state.fighters.some(f => f.hp <= 0) ? 'K.O.' : 'TEMPO!';
      overline = 'FIM DO ROUND'; subtitle = state.roundWinner === 'draw' ? 'A LUTA CONTINUA' : `ROUND PARA ${fighterName(state.fighters[state.roundWinner])}`;
    }
    if (title !== lastAnnouncement) { lastAnnouncement = title; text('announcement-title',title); text('announcement-overline',overline); text('announcement-subtitle',subtitle); }
    show('announcement',!!title);
  }
  function updateHud() {
    if (!state) return;
    for (const [prefix,f] of [['player',state.fighters[playerId]],['enemy',state.fighters[1-playerId]]]) {
      const hp = Math.max(0,f.hp / f.maxHp);
      $(prefix+'-health').style.transform = `scaleX(${hp})`; $(prefix+'-trail').style.transform = `scaleX(${hp})`;
      $(prefix+'-energy').style.transform = `scaleX(${f.energy / f.maxEnergy})`; $(prefix+'-guard').style.transform = `scaleX(${f.guard / 100})`;
      text(prefix+'-hp',Math.ceil(f.hp)); $(prefix+'-health').parentElement.setAttribute('aria-label',`Vida ${Math.ceil(f.hp)} de ${f.maxHp}`);
      $(prefix+'-guard').parentElement.setAttribute('aria-valuenow',String(Math.round(f.guard)));
      $(prefix+'-guard').parentElement.setAttribute('aria-label',`Postura ${Math.round(f.guard)} de 100`);
    }
    const player = state.fighters[playerId], enemy = state.fighters[1-playerId];
    if ($('combo-window-fill')) $('combo-window-fill').style.transform = `scaleX(${Math.min(1,Math.max(0,(player._comboTimer||0)/1.2))})`;
    const currentMove = FightSim.getMove(player);
    const chainReady = player._contact && currentMove && player.actionTime >= currentMove.windup + .06 && player._chainIndex < (player._contactBlocked?3:8) && !currentMove.channel;
    text('combo-next',player._buffer ? 'PRÓXIMO GOLPE PREPARADO' : chainReady ? 'J / K / L · CONTINUE' : player.combo>1 ? 'MANTENHA A PRESSÃO' : '');
    if ($('combo-display')) $('combo-display').classList.toggle('combo-open',!!chainReady);
    text('player-energy-label',player.energy >= 100 ? 'SUPER PRONTO · R' : player.energy >= FightSim.getMove(player,'special').cost ? 'ESPECIAL PRONTO · E' : 'RECUPERE ENERGIA');
    if ($('super-indicator')) { $('super-indicator').classList.toggle('ready',player.energy>=100); text('super-indicator',player.energy>=100 ? 'R · '+(characterInfo(player.character).superName || 'SUPER').toUpperCase() : 'R · SUPER '+Math.floor(player.energy)+' / 100'); }
    text('round-time',state.training ? '∞' : Math.ceil(Math.max(0,state.timeLeft)).toString().padStart(2,'0'));
    text('round-label',state.training ? 'TREINO' : `ROUND ${String(state.round).padStart(2,'0')}`);
    document.querySelector('.clock').classList.toggle('urgent',!state.training && state.timeLeft < 15);
    ['player-rounds','enemy-rounds'].forEach((id,index) => $(id).querySelectorAll('b').forEach((pip,win) => pip.classList.toggle('won',state.wins[index === 0 ? playerId : 1-playerId] > win)));
    const hazard = state.hazard;
    show('hazard-warning',mode === 'fight' && !!hazard && (hazard.warning || hazard.active));
    text('hazard-warning',hazard && hazard.active ? '⚠ DESCARGA ATIVA · EVITE O CÍRCULO' : '⚠ REATOR CARREGANDO · SAIA DO CÍRCULO');
    const attack = FightSim.getMove(enemy);
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
    text('quality-button',qualityMode === 'auto' ? 'AUTO' : quality === 'high' ? 'HQ' : 'LQ');
    $('quality-button').setAttribute('aria-label',`Qualidade gráfica ${qualityMode === 'auto' ? 'automática' : quality === 'high' ? 'alta' : 'leve'}`);
  }
  function setResolutionScale(value) {
    resolutionScale = scene && scene.setResolutionScale ? scene.setResolutionScale(value) : value;
  }
  function resetGovernor() {
    governor.reset({quality,scale:resolutionScale,allowHigh:qualityMode === 'auto'});
  }
  function chooseQuality() {
    if (graphics.status !== 'ready') return;
    qualityMode = {auto:'high',high:'low',low:'auto'}[qualityMode];
    settings.quality = qualityMode; persist();
    // Explicit HQ requests full resolution; AUTO inherits the measured safe scale.
    if (qualityMode === 'high') setResolutionScale(1);
    setQuality(qualityMode === 'high' ? 'high' : 'low');
    resetGovernor();
  }
  listen('host-button','click',() => connectOnline());
  document.querySelectorAll('[data-character]').forEach(button => button.addEventListener('click',() => {
    if (mode!=='menu' || online) return;
    settings.character=button.dataset.character;persist();updateCharacterSelection();sound.unlock();sound.play('click');
  }));
  listen('opponent-select','change',() => { if (rosterIds.includes($('opponent-select').value)) { settings.opponent=$('opponent-select').value;persist();updateCharacterSelection(); } });
  listen('join-form','submit',event => { event.preventDefault(); connectOnline($('room-code').value.trim().toUpperCase()); });
  listen('leave-room-button','click',() => { disconnectOnline(); text('online-status','Sala encerrada. Crie outra ou entre com um código.'); });
  listen('copy-room-button','click',async () => {
    if (!online || !online.status.code) return;
    const code = online.status.code, invite = new URL(location.href); invite.searchParams.set('room',code);
    try { await navigator.clipboard.writeText(invite.href); text('online-status','Convite copiado. Envie o link ao outro jogador.'); }
    catch (_) { $('room-code').value = code; $('room-code').focus(); $('room-code').select(); text('online-status',`Compartilhe o endereço desta página e o código ${code}.`); }
  });
  listen('start-button','click',() => startMatch(false)); listen('training-button','click',() => startMatch(true));
  listen('pause-button','click',pause); listen('resume-button','click',resume);
  listen('restart-button','click',() => { if (!online) startMatch(state.training,!!run); });
  listen('rematch-button','click',() => { if (online) { online.rematch(); return; } if (run && run.pendingUpgrade) { NeonRun.advance(run,pendingUpgrade); startMatch(false,true); } else startMatch(false); });
  ['menu-button','result-menu-button'].forEach(id => listen(id,'click',menu));
  listen('brand-link','click',event => { event.preventDefault(); if (mode === 'fight') pause(); else if (mode === 'result') menu(); });
  listen('sound-button','click',toggleSound); listen('camera-button','click',captureMouse); listen('lock-status','click',toggleLock);
  listen('preview-left','click',() => {if(mode==='menu'&&scene)scene.rotatePreview(-Math.PI/4);});
  listen('preview-right','click',() => {if(mode==='menu'&&scene)scene.rotatePreview(Math.PI/4);});
  listen('fps-toggle','change',() => {settings.showFps=$('fps-toggle').checked;persist();show('performance-readout',settings.showFps);});
  listen('quality-button','click',chooseQuality);
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
    // A recovered driver stays in the safe tier until the player explicitly changes it.
    quality = 'low'; qualityMode = settings.quality = 'low'; persist(); resetGovernor(); accumulator = hitStop = 0; previousPose = null;
    pause(); resetInputs(); sound.tick(state,false);
    text('error-eyebrow','RECONSTRUINDO A ARENA'); text('error-title','UM INSTANTE.');
    text('error-message',online ? 'O navegador reiniciou o gráfico 3D. Seus comandos foram soltos; o duelo continua no servidor enquanto restauramos a arena.' : 'O navegador reiniciou o gráfico 3D. Estamos restaurando a arena; sua partida está preservada.');
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
        if (online && online.state) state = online.state;
        setResolutionScale(resolutionScale);
        setQuality('low'); resetGovernor(); scene.update(0,state); scene.render();
        graphics.status = 'ready'; graphics.recoveries++;
        clearTimeout(recoveryTimer); show('error-screen',false); show('error-retry',true);
        previous = performance.now(); accumulator = hudTime = 0;
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
    if (online && online.active) {
      state = online.state;
      if (mode === 'fight') {
        const orbit = Number(keys.has('KeyX')) - Number(keys.has('KeyZ'));
        if (orbit) scene.rotateCamera(orbit*dt*1.7*settings.sensitivity,0);
      }
      accumulator = Math.min(.1,accumulator+dt);
      const input = mode === 'fight' ? readInput() : {};
      while (accumulator >= 1/60 && online && online.active) {
        online.step(input); accumulator -= 1/60;
      }
      // Socket callbacks can end a room between frames; only server events grant hits/results.
      if (online && online.active) {
        state = online.state; events(onlineEvents.splice(0));
        if (online.status.phase === 'result') result();
        announcement();
      }
    } else if (mode === 'fight') {
      const orbit = Number(keys.has('KeyX')) - Number(keys.has('KeyZ'));
      if (orbit) scene.rotateCamera(orbit*dt*1.7*settings.sensitivity,0);
      if (hitStop > 0) { hitStop -= dt; accumulator = 0; }
      else {
        accumulator = Math.min(.1,accumulator+dt);
        const input = readInput();
        while (accumulator >= 1/60 && mode === 'fight') { previousPose = NeonPerformance.pose(state); FightSim.step(state,1/60,input); accumulator -= 1/60; events(); }
      }
      announcement(); if(state.phase === 'matchOver') result();
    }
    if (mode === 'fight') {
      const p = state.fighters[playerId];
      if (state.phase === 'fight' && p.y < .05 && (p.action === 'walk' || p.action === 'sprint')) {
        footstep += dt; if (footstep > (p.sprinting ? .25 : .38)) { sound.play('step'); footstep = 0; }
      } else footstep = 0;
    }
    sound.tick(state,mode === 'fight' && (state.phase === 'fight' || state.phase === 'intro'));
    if (mode !== 'paused' || online && online.active) {
      const renderState = online && online.active ? online.view(dt) : mode === 'fight' ? NeonPerformance.interpolate(previousPose,state,accumulator*60) : state;
      scene.update(dt,renderState || state);
      if(mode === 'menu') for(const f of state.fighters) f.actionTime += dt;
    }
    scene.render(); renderFrames++;
    fpsElapsed += elapsed; fpsFrames++;
    if (fpsElapsed >= 1) { text('performance-readout',Math.round(fpsFrames/fpsElapsed)+' FPS'); fpsElapsed=0;fpsFrames=0; }
    hudTime += dt; if(hudTime >= .05) { if(mode !== 'menu') updateHud(); hudTime = 0; }
    if(toastTime > 0) { toastTime -= dt; if(toastTime <= 0) $('combat-toast').classList.remove('show'); }
    if(comboTime > 0) { comboTime -= dt; if(comboTime <= 0) show('combo-display',false); }
    if(damageTime > 0) { damageTime = Math.max(0,damageTime-dt); if($('damage-flash')) $('damage-flash').style.opacity = String(damageTime * (prefersReduced ? .8 : 2)); }
    if (mode === 'paused' || document.hidden) {
      governor.sample(0,{allowUpgrade:false});
    } else if (qualityMode !== 'high') {
      const adjustment = governor.sample(elapsed,{allowUpgrade:mode === 'fight' && state.phase === 'fight'});
      if (adjustment) {
        if (quality !== adjustment.quality) setQuality(adjustment.quality);
        setResolutionScale(adjustment.scale);
        if (quality !== adjustment.quality || resolutionScale !== adjustment.scale) resetGovernor();
      }
    }
    scheduleFrame();
  }
  try {
    if(!window.THREE || !window.FightSim || !window.NeonScene || !window.NeonRun || !window.NeonNet || !window.NeonPerformance) throw new Error('Arquivos do jogo ausentes. Mantenha todos os arquivos e a pasta vendor juntos.');
    if($('arena-select')) $('arena-select').value = settings.arena;
    $('difficulty').value = settings.difficulty;
    if($('sensitivity')) $('sensitivity').value = settings.sensitivity;
    if($('volume')) $('volume').value = settings.volume;
    if($('shake-toggle')) $('shake-toggle').checked = settings.shake;
    if($('music-toggle')) $('music-toggle').checked = settings.music;
    if($('fps-toggle')) $('fps-toggle').checked = settings.showFps;
    show('performance-readout',settings.showFps);
    $('sound-button').setAttribute('aria-pressed',String(settings.sound));
    scene = NeonScene.create(canvas,{quality,reducedMotion:!settings.shake || prefersReduced});
    scene.setReducedMotion(!settings.shake || prefersReduced); setQuality(quality); resetGovernor(); menu();
    const inviteCode = new URLSearchParams(location.search).get('room');
    if (inviteCode && /^[A-Za-z0-9]{6}$/.test(inviteCode)) { $('room-code').value = inviteCode.toUpperCase(); $('online-panel').open = true; text('online-status','Convite recebido. Clique em ENTRAR para participar.'); }
    // Debug surface for deterministic browser integration checks; never networked.
    window.__NEON__ = Object.freeze({get state(){return state;},get mode(){return mode;},get frames(){return renderFrames;},get quality(){return quality;},get qualityMode(){return qualityMode;},get network(){return online ? online.status : null;},get graphics(){return {...graphics,...(scene.graphicsInfo ? {renderer:scene.graphicsInfo()} : {})};},get stats(){return {...stats};},get run(){return run;},get camera(){return scene.cameraInfo();},get audio(){return {state:sound.context && sound.context.state,nodes:sound.activeNodes};},startMatch,pause,resume,menu});
    scheduleFrame();
  } catch(error) { recoveryFailed(error.message); console.error(error); }
}());
