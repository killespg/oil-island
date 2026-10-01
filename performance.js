/* Frame pacing policy and render-only interpolation; no browser dependencies. */
(function (global) {
  'use strict';
  function createGovernor(options) {
    let seconds = 0, frames = 0, stable = 0, troubled = 0, triedHigh = false;
    let quality = 'low', scale = 1, allowHigh = true, windowAllowsUpgrade = true;
    function clearSamples() { seconds = frames = stable = troubled = 0; windowAllowsUpgrade = true; }
    function reset(options = {}) {
      clearSamples();
      quality = options.quality === 'high' ? 'high' : 'low';
      scale = Number.isFinite(options.scale) ? Math.max(.65,Math.min(1,options.scale)) : 1;
      allowHigh = options.allowHigh !== false;
      triedHigh = quality === 'high';
    }
    function sample(dt, options = {}) {
      // Suspended tabs, loading gaps and pauses must also break a stable streak.
      if (!Number.isFinite(dt) || dt <= 0 || dt > .25) { clearSamples(); return null; }
      if (options.allowUpgrade === false) { stable = 0; windowAllowsUpgrade = false; }
      seconds += dt; frames++;
      if (seconds < 2 - 1e-9) return null;
      const fps = frames / seconds;
      const canUpgrade = windowAllowsUpgrade;
      seconds = frames = 0;
      windowAllowsUpgrade = true;
      if (fps < (quality === 'low' ? 57 : 50) - 1e-9) {
        stable = 0;
        if (scale > .65) { troubled = 0; scale = Math.max(.65, Math.round((scale - .1) * 100) / 100); return {quality, scale}; }
        if (quality === 'high' && ++troubled >= 2) {
          quality = 'low'; troubled = 0;
          return {quality, scale};
        }
      } else {
        troubled = 0; stable = canUpgrade && fps >= 58 - 1e-9 ? stable + 1 : 0;
        if (stable >= 4 && scale < 1) { scale = Math.min(1, Math.round((scale + .05) * 100) / 100); stable = 0; return {quality, scale}; }
        if (quality === 'low' && scale === 1 && allowHigh && !triedHigh && stable >= 3) {
          triedHigh = true; quality = 'high'; scale = .85; stable = 0;
          return {quality, scale};
        }
      }
      return null;
    }
    reset(options);
    return {sample, reset};
  }
  function pose(state) {
    return {round:state.round, phase:state.phase, fighters:state.fighters.map(f => ({x:f.x,y:f.y,z:f.z,yaw:f.yaw,action:f.action,actionTime:f.actionTime,_attackSerial:f._attackSerial}))};
  }
  function interpolate(previous, current, alpha) {
    if (!previous || previous.round !== current.round || previous.phase !== current.phase) return current;
    alpha = Math.max(0,Math.min(1,alpha));
    const fighters = current.fighters.map((f,i) => {
      const p = previous.fighters[i], result = {...f};
      for (const key of ['x','y','z']) result[key] = p[key] + (f[key] - p[key]) * alpha;
      const turn = Math.atan2(Math.sin(f.yaw-p.yaw),Math.cos(f.yaw-p.yaw));
      result.yaw = p.yaw + turn * alpha;
      if (p.action === f.action && p._attackSerial === f._attackSerial) result.actionTime = p.actionTime + (f.actionTime-p.actionTime)*alpha;
      return result;
    });
    return {...current, fighters};
  }
  const api = Object.freeze({createGovernor,pose,interpolate});
  global.NeonPerformance = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
