/* NEON CLASH — original procedural soundtrack and spatial combat audio. */
(function (global) {
  'use strict';
  function create(options) {
    options = options || {};
    let context, master, musicBus, fxBus, limiter, noiseBuffer;
    let enabled = options.enabled !== false, music = options.music !== false;
    let volume = Number.isFinite(options.volume) ? options.volume : .65;
    let nextBeat = 0, beat = 0, arena = 'skyline', active = false, nodes = 0;
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
    function route(source, duration, gain, offset, bus, pan, filter) {
      if (!context || nodes > 80 || !enabled || context.state !== 'running') return;
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
      source.onended = () => { nodes--; chain.forEach(n => n.disconnect()); };
    }
    function tone(freq, duration, type, gain, end, offset, bus, pan) {
      if (!context || !enabled || context.state !== 'running' || nodes > 80) return;
      const osc = context.createOscillator(), at = context.currentTime + (offset || 0);
      osc.type = type || 'sine'; osc.frequency.setValueAtTime(freq, at);
      if (end) osc.frequency.exponentialRampToValueAtTime(end, at + duration);
      route(osc, duration, gain, offset, bus, pan);
    }
    function noise(duration, gain, cutoff, offset, bus, pan, highpass) {
      if (!context || !enabled || context.state !== 'running' || nodes > 80) return;
      const source = context.createBufferSource(), filter = context.createBiquadFilter();
      source.buffer = noiseBuffer; filter.type = highpass ? 'highpass' : 'lowpass';
      filter.frequency.value = cutoff || 2000;
      route(source, duration, gain, offset, bus, pan, filter);
    }
    function play(type, move, pan) {
      const heavy = move === 'special';
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
        noise(heavy ? .32 : .11, .11, heavy ? 1200 : 2000, 0, null, pan);
        if (heavy) tone(75, .34, 'sawtooth', .12, 380, 0, null, pan);
      } else if (type === 'step') { noise(.065, .08, arena === 'reactor' ? 1900 : 950); tone(90,.065,'sine',.10,45); }
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
    function tick(state, playing) {
      if (!context || context.state !== 'running') return;
      if (!playing) { if (active) nextBeat = 0; active = false; return; }
      active = true;
      if (!enabled || !music) return;
      const now = context.currentTime;
      if (nextBeat < now - .3) nextBeat = now;
      const intensity = state ? Math.max(0, 1 - Math.min(...state.fighters.map(f => f.hp / f.maxHp))) : 0;
      const interval = 60 / (arena === 'reactor' ? 140 : arena === 'void' ? 128 : 132) / 4;
      // Short scheduling horizon keeps musical timing independent of render rate.
      while (nextBeat < now + .09) {
        const at = Math.max(0, nextBeat - now), step = beat % 16;
        const root = arena === 'void' ? 46.25 : arena === 'reactor' ? 41.2 : 55;
        const scale = [1, 1, 1.1892, 1, 1.4983, 1.3348, 1.1892, .8909];
        if (step % 4 === 0) tone(140, .16, 'sine', .64, 36, at, musicBus);
        if (step === 4 || step === 12) { noise(.14, .24, 2600, at, musicBus, 0, true); tone(170,.1,'triangle',.17,80,at,musicBus); }
        if (step % 2 === 0 || intensity > .55) noise(.027, step % 4 === 2 ? .12 : .065, 6500, at, musicBus, step % 4 ? -.25 : .25, true);
        if (step % 2 === 0) tone(root * scale[(beat / 2 | 0) % 8], .17, 'triangle', .25, null, at, musicBus);
        if (step % 4 === 2 || intensity > .4 && step % 2 === 1) {
          const note = root * 4 * [1,1.4983,2,1.1892][(beat / 2 | 0) % 4];
          tone(note, .24, 'sine', .06 + intensity * .05, null, at, musicBus, Math.sin(beat) * .6);
        }
        if (step === 0) [1,1.1892,1.4983].forEach((n,i) => tone(root * 2 * n, 1.3, 'sine', .055, null, at, musicBus, (i-1)*.4));
        beat++; nextBeat += interval;
      }
    }
    function setEnabled(value) { enabled = !!value; if (enabled) unlock(); if(master) master.gain.setTargetAtTime(enabled ? volume*.72 : 0,context.currentTime,.025); }
    function setVolume(value) { volume = clamp(Number(value) || 0,0,1); if(master) master.gain.setTargetAtTime(enabled ? volume*.72 : 0,context.currentTime,.025); }
    function setMusic(value) { music = !!value; if(musicBus) musicBus.gain.setTargetAtTime(music ? .48 : 0,context.currentTime,.05); nextBeat = 0; }
    function setArena(value) { arena = value; beat = 0; nextBeat = 0; }
    return {unlock,play,tick,setEnabled,setVolume,setMusic,setArena,get context(){return context;},get activeNodes(){return nodes;}};
  }
  global.NeonAudio = {create};
})(window);
