/* OIL ISLAND (ORELHA EDITION) — procedural arena music and spatial combat audio. */
(function (global) {
  'use strict';
  function create(options) {
    options = options || {};
    let context, master, musicBus, fxBus, limiter, noiseBuffer;
    let enabled = options.enabled !== false, music = options.music !== false;
    let volume = Number.isFinite(options.volume) ? options.volume : .65;
    let nextBeat = 0, beat = 0, arena = 'island', active = false, nodes = 0;
    let introTime = -1, rotorStep = -1, crashPlayed = false, oilPulse = -1, chaseTime = -1, chaseStep = -1;
    const musicVoices = new Set();
    const tempos = {island:112, nightclub:128, seaside:100, helipad:134};
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    function unlock() {
      try {
        if (!context) {
          const Audio = global.AudioContext || global.webkitAudioContext;
          if (!Audio) return;
          context = new Audio(); master = context.createGain();
          musicBus = context.createGain(); fxBus = context.createGain();
          limiter = context.createDynamicsCompressor();
          limiter.threshold.value = -15; limiter.knee.value = 12; limiter.ratio.value = 6;
          limiter.attack.value = .003; limiter.release.value = .2;
          musicBus.gain.value = music ? .48 : 0; fxBus.gain.value = .8;
          musicBus.connect(limiter); fxBus.connect(limiter); limiter.connect(master); master.connect(context.destination);
          master.gain.value = enabled ? volume * .72 : 0;
          noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
          const data = noiseBuffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        if (context.state === 'suspended') context.resume().catch(() => {});
      } catch (_) { /* Audio support is optional; the game remains playable. */ }
    }
    function canPlay(bus) {
      // Reserve 32 voices for hits, parries and supers even during dense music.
      return context && enabled && context.state === 'running' && nodes < (bus === musicBus ? 48 : 80);
    }
    function stopMusic() {
      if (!context) return;
      const now = context.currentTime;
      musicVoices.forEach(voice => {
        if (voice.stopping) return;
        voice.stopping = true;
        const gain = voice.envelope.gain;
        if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
        else { gain.cancelScheduledValues(now); gain.setValueAtTime(Math.max(.0001, gain.value), now); }
        gain.exponentialRampToValueAtTime(.0001, now + .025);
        voice.source.stop(now + .035);
      });
    }
    function route(source, duration, gain, offset, bus, pan, filter) {
      if (!canPlay(bus)) return;
      const at = context.currentTime + Math.max(0, offset || 0);
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(.0001, at);
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), at + .008);
      envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
      const chain = [source];
      let head = source;
      if (filter) { head.connect(filter); head = filter; chain.push(filter); }
      head.connect(envelope); head = envelope; chain.push(envelope);
      if (context.createStereoPanner) {
        const panner = context.createStereoPanner(); panner.pan.value = clamp(pan || 0, -.85, .85);
        head.connect(panner); head = panner; chain.push(panner);
      }
      head.connect(bus || fxBus);
      source.start(at); source.stop(at + duration + .02); nodes++;
      const voice = {source, envelope, stopping:false};
      if (bus === musicBus) musicVoices.add(voice);
      source.onended = () => { nodes--; musicVoices.delete(voice); chain.forEach(n => n.disconnect()); };
    }
    function tone(freq, duration, type, gain, end, offset, bus, pan, cutoff) {
      if (!canPlay(bus)) return;
      const osc = context.createOscillator(), at = context.currentTime + (offset || 0);
      osc.type = type || 'sine'; osc.frequency.setValueAtTime(freq, at);
      if (end) osc.frequency.exponentialRampToValueAtTime(end, at + duration);
      let filter;
      if (cutoff) { filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = .6; }
      route(osc, duration, gain, offset, bus, pan, filter);
    }
    function noise(duration, gain, cutoff, offset, bus, pan, highpass) {
      if (!canPlay(bus)) return;
      const source = context.createBufferSource(), filter = context.createBiquadFilter();
      source.buffer = noiseBuffer; filter.type = highpass ? 'highpass' : 'lowpass';
      filter.frequency.value = cutoff || 2000;
      route(source, duration, gain, offset, bus, pan, filter);
    }
    function play(type, move, pan, character) {
      const heavy = move === 'special' || move === 'super';
      if (type === 'hit' || type === 'hazardHit') {
        tone(heavy ? 100 : 155, .21, 'sine', .7, 32, 0, null, pan);
        noise(heavy ? .3 : .13, .46, heavy ? 1600 : 2900, 0, null, pan);
        if (heavy) { tone(58, .5, 'triangle', .2, 28); noise(.5, .15, 400); }
      } else if (type === 'block') {
        tone(560, .12, 'triangle', .2, 220, 0, null, pan); noise(.08, .27, 5500, 0, null, pan);
      } else if (type === 'parry') {
        [740, 1110, 1480].forEach((f, i) => tone(f, .28, 'sine', .19, f * .98, i * .025, null, pan));
        noise(.07, .28, 6500, 0, null, pan, true);
      } else if (type === 'attack') {
        if (character === 'titan' && move === 'special') {
          tone(148,.12,'triangle',.10,66,0,null,pan);
          noise(.19,.09,1200,0,null,pan);
          return;
        }
        if (character === 'mimico' && heavy) {
          const pulses=move==='super'?10:7;
          for(let beat=0;beat<pulses;beat++) {
            const at=beat*.075;
            noise(.07,.13,700+beat*70,at,null,pan);
            tone(55+beat*4,.085,'triangle',.12,38,at,null,pan);
          }
          return;
        }
        noise(heavy ? .32 : .11, .11, heavy ? 1200 : 2000, 0, null, pan);
        if (heavy) tone(75, .34, 'sawtooth', .12, 380, 0, null, pan);
        if (move === 'super') { [98,146.8,196].forEach((f,i)=>tone(f,.5,'triangle',.12,f*2,i*.055,null,pan)); noise(.5,.13,900,0,null,pan); }
      } else if (type === 'projectile') { noise(.23,.16,3400,0,null,pan); tone(280,.2,'sine',.1,680,0,null,pan);
      } else if (type === 'step') { noise(.065, .08, arena === 'helipad' ? 1900 : 950); tone(90,.065,'sine',.10,45); }
      else if (type === 'dodge') { noise(.17, .13, 2200, 0, null, pan); }
      else if (type === 'jump') { tone(95, .13, 'sine', .12, 180); }
      else if (type === 'guardBreak') { noise(.4, .42, 7000); tone(320, .4, 'sawtooth', .2, 42); }
      else if (type === 'hazardWarning') { [0,.18,.36].forEach(at => tone(660, .09, 'triangle', .13, 660, at)); }
      else if (type === 'roundStart') { [164.8, 220, 329.6].forEach((f,i) => tone(f, .34, 'triangle', .16, null, i * .12)); }
      else if (type === 'roundEnd') { tone(85, .8, 'sine', .7, 25); noise(.55, .25, 600); }
      else if (type === 'win') { [261.6,329.6,392,523.2,659.3].forEach((f,i) => tone(f, .65, 'triangle', .16, null, i*.13)); }
      else if (type === 'lose') { tone(196, .7, 'triangle', .2, 98); tone(146.8, .9, 'sine', .23, 55, .15); }
      else if (type === 'click') tone(680, .065, 'sine', .12, 1000);
    }
    function islandBeat(step, at, intensity) {
      const root = 65.406, chord = [1, 1, 1.3348, 1.4983][(beat / 16 | 0) % 4];
      if (step === 0 || step === 8) tone(112, .15, 'sine', .34, 42, at, musicBus);
      if (step === 4 || step === 7 || step === 12 || step === 15) {
        tone(step % 4 ? 330 : 225, .11, 'sine', .12, 105, at, musicBus, step < 8 ? -.36 : .36);
        noise(.028, .04, 1400, at, musicBus);
      }
      if (step % 2 === 1) noise(.035, .038, 5500, at, musicBus, step % 4 === 1 ? -.4 : .4, true);
      if (step === 0 || step === 6 || step === 8 || step === 14) tone(root * chord, .27, 'triangle', .19, null, at, musicBus);
      if ([0, 3, 6, 10, 12, 14].includes(step) || intensity > .6 && step === 7) {
        const note = [1, 1.2599, 1.4983, 2, 1.6818, 1.4983, 1.2599, 1.4983][(beat / 2 | 0) % 8];
        tone(root * 4 * note, .28, 'sine', .095, null, at, musicBus, step < 8 ? -.3 : .3);
        tone(root * 8 * note, .075, 'sine', .021, null, at, musicBus);
      }
      if (step === 0) noise(1.8, .016, 430, at, musicBus, -.55);
    }
    function nightclubBeat(step, at, intensity) {
      const root = 49 * [1, 1, .8909, 1.1892][(beat / 16 | 0) % 4];
      if (step % 4 === 0) tone(154, .19, 'sine', .5, 38, at, musicBus);
      if (step === 4 || step === 12) {
        noise(.14, .18, 2600, at, musicBus, 0, true);
        noise(.065, .075, 4200, at + .018, musicBus, .15, true);
      }
      if (step % 2 === 0 || intensity > .55) noise(step % 4 === 2 ? .065 : .024, step % 4 === 2 ? .065 : .037, 6800, at, musicBus, step % 4 ? -.28 : .28, true);
      if (step % 4 === 2 || step === 7 || step === 15) {
        const note = root * (step === 15 ? 1.4983 : 1);
        tone(note, .18, 'triangle', .25, null, at, musicBus);
        tone(note * 2, .16, 'sawtooth', .048, null, at, musicBus, 0, 750);
      }
      if (step % 4 === 3) [1, 1.1892, 1.4983].forEach((n, i) => {
        tone(root * 8 * n, .14, 'sawtooth', .023, null, at, musicBus, (i - 1) * .4, 1400 + intensity * 600);
      });
      if (intensity > .4 && step % 2 === 1) tone(root * 8 * [1, 2, 1.4983, 1.1892][(beat / 2 | 0) % 4], .12, 'sine', .043, null, at, musicBus, Math.sin(beat) * .5);
    }
    function seasideBeat(step, at) {
      const root = 73.416 * [1, 1.3348, 1.4983, 1][(beat / 16 | 0) % 4];
      if (step === 0 || step === 8) tone(105, .16, 'sine', .27, 38, at, musicBus);
      if (step === 4 || step === 12) { noise(.065, .075, 2400, at, musicBus); tone(230, .065, 'triangle', .055, 145, at, musicBus); }
      if (step % 4 === 2) noise(.045, .033, 5000, at, musicBus, step < 8 ? -.4 : .4, true);
      if (step === 0 || step === 6 || step === 10) tone(root, .35, 'sine', .19, null, at, musicBus);
      if (step === 0) {
        [1, 1.2599, 1.4983, 1.8877].forEach((n, i) => tone(root * 2 * n, 1.5, 'triangle', .026, null, at + i * .017, musicBus, (i - 1.5) * .3, 1500));
        noise(1.85, .019, 650, at, musicBus, -.55);
        noise(1.4, .014, 850, at + .25, musicBus, .55);
      }
      if (step === 3 || step === 7 || step === 10 || step === 14) {
        tone(root * 4 * [1.4983, 1.2599, 1, 1.2599][(beat / 4 | 0) % 4], .42, 'sine', .075, null, at, musicBus, .25);
      }
    }
    function helipadBeat(step, at, intensity) {
      const root = 55;
      const scale = [1, 1, 1.1892, 1, 1.4983, 1.3348, 1.1892, .8909];
      if (step % 4 === 0) tone(140, .16, 'sine', .44, 36, at, musicBus);
      if (step === 4 || step === 12) { noise(.14, .16, 2600, at, musicBus, 0, true); tone(170,.1,'triangle',.11,80,at,musicBus); }
      if (step % 2 === 0 || intensity > .55) noise(.027, step % 4 === 2 ? .075 : .045, 6500, at, musicBus, step % 4 ? -.25 : .25, true);
      if (step % 2 === 0) tone(root * scale[(beat / 2 | 0) % 8], .17, 'triangle', .25, null, at, musicBus);
      if (step % 2 === 1) { noise(.055,.027,480,at,musicBus,step<8?-.35:.35); tone(48,.055,'sine',.025,36,at,musicBus); }
      if (step % 4 === 2 || intensity > .4 && step % 2 === 1) {
        const note = root * 4 * [1,1.4983,2,1.1892][(beat / 2 | 0) % 4];
        tone(note, .24, 'sine', .06 + intensity * .05, null, at, musicBus, Math.sin(beat) * .6);
      }
      if (step === 0) [1,1.1892,1.4983].forEach((n,i) => tone(root * 2 * n, 1.3, 'sine', .055, null, at, musicBus, (i-1)*.4));
    }
    function helicopterIntro(state) {
      const t = Math.max(0,Number(state.phaseTime)||0);
      if (introTime < 0 || t < .25 && introTime > .5) { rotorStep = -1; crashPlayed = false; }
      introTime = t;
      const pulse = Math.floor(t / .13);
      if (t < 3.8 && pulse !== rotorStep) {
        rotorStep = pulse;
        const approach = clamp(t / 2.7,0,1), pan = pulse % 2 ? -.58 + approach*.4 : .58 - approach*.4;
        noise(.10,.055+approach*.035,500+approach*250,0,null,pan);
        tone(48+approach*13,.105,'triangle',.045,37,0,null,pan,600);
      }
      if (t >= 3.8 && !crashPlayed) {
        crashPlayed = true;
        // A resumed/backgrounded tab does not replay an impact whose image passed.
        if (t < 4.12) { noise(.65,.23,1800); tone(85,.58,'sine',.27,24); noise(.23,.09,5000,.055,null,0,true); }
      }
    }
    function oilStream(state) {
      if (!state || state.phase !== 'fight' || !state.fighters) return;
      const spraying = state.fighters.some(f => f.character === 'titan' && f.action === 'special' && f.hp > 0 && (f.actionTime || 0) >= .18 && (f.actionTime || 0) < 5.18);
      const pulse = Math.floor(context.currentTime / .16);
      if (spraying && pulse !== oilPulse) { oilPulse=pulse;noise(.19,.044,1050);tone(115,.085,'sine',.025,62); }
    }
    function tick(state, playing) {
      if (!context || context.state !== 'running') return;
      if (!playing) { if (active) { stopMusic(); nextBeat = 0; beat = 0; } active = false; return; }
      const cinematic = state && state.arena === 'helipad' && state.phase === 'intro' && state.round === 1 && !state.training;
      if (cinematic) {
        if (active) { stopMusic(); nextBeat=0; beat=0; }
        active=false; helicopterIntro(state); return;
      }
      const chase = state && state.arena === 'seaside' && state.phase === 'intro' && state.round === 1 && !state.training && state.fighters && state.fighters.some(f => f.character === 'orelha');
      if (chase) {
        if (active) { stopMusic(); nextBeat=0; beat=0; }
        active=false;
        const t=state.phaseTime||0, step=Math.floor(t/.16);
        if(t<chaseTime)chaseStep=-1;
        chaseTime=t;
        // Follow the visible paws; never queue missed footsteps after a pause.
        if(enabled && t<4.8 && step!==chaseStep){chaseStep=step;noise(.055,.038,820);tone(75,.04,'sine',.026,48);}
        return;
      }
      chaseTime=chaseStep=-1;
      introTime=-1; rotorStep=-1; crashPlayed=false;
      if (state && state.phase === 'intro') return;
      active = true;
      oilStream(state);
      if (!enabled || !music) return;
      const now = context.currentTime;
      // Restart after a hidden tab/long frame; never enqueue all missed beats.
      if (nextBeat === 0 || nextBeat < now - .3) { stopMusic(); nextBeat = now; beat = 0; }
      const intensity = state ? Math.max(0, 1 - Math.min(...state.fighters.map(f => f.hp / f.maxHp))) : 0;
      const interval = 60 / tempos[arena] / 4;
      // Short scheduling horizon keeps musical timing independent of render rate.
      while (nextBeat < now + .09) {
        const at = Math.max(0, nextBeat - now), step = beat % 16;
        if (arena === 'island') islandBeat(step, at, intensity);
        else if (arena === 'nightclub') nightclubBeat(step, at, intensity);
        else if (arena === 'seaside') seasideBeat(step, at);
        else helipadBeat(step, at, intensity);
        beat++; nextBeat += interval;
      }
    }
    function setEnabled(value) { enabled = !!value; if (enabled) unlock(); else stopMusic(); nextBeat = 0; beat = 0; if(master) master.gain.setTargetAtTime(enabled ? volume*.72 : 0,context.currentTime,.025); }
    function setVolume(value) { volume = clamp(Number(value) || 0,0,1); if(master) master.gain.setTargetAtTime(enabled ? volume*.72 : 0,context.currentTime,.025); }
    function setMusic(value) { music = !!value; if (!music) stopMusic(); if(musicBus) musicBus.gain.setTargetAtTime(music ? .48 : 0,context.currentTime,.05); nextBeat = 0; beat = 0; }
    function setArena(value) { stopMusic(); arena = Object.prototype.hasOwnProperty.call(tempos, value) ? value : 'island'; beat = 0; nextBeat = 0; introTime=-1; rotorStep=-1; crashPlayed=false; oilPulse=-1; chaseTime=chaseStep=-1; }
    return {unlock,play,tick,setEnabled,setVolume,setMusic,setArena,get context(){return context;},get activeNodes(){return nodes;}};
  }
  global.NeonAudio = {create};
})(window);
