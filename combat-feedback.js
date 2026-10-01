/* Shared presentation rules. These never alter simulation time or hitboxes. */
(function (global) {
  'use strict';
  const clamp = (n, a, b) => Math.min(b, Math.max(a, Number.isFinite(n) ? n : a));
  function impact(event, reduced) {
    event = event || {};
    const combo = clamp(event.combo || 1, 1, 12), oil = event.kind === 'oil';
    const parry = event.type === 'parry', blocked = event.type === 'block';
    const finisher = event.move === 'super' || combo >= 8;
    const power = oil ? .08 : parry ? 1.4 : blocked ? .25 : clamp(.65 + (combo-1)*.12 + (event.move==='special'?.25:0) + (finisher?.25:0), .65, 2);
    return {
      power,
      pause: reduced || oil || blocked ? 0 : parry ? .04 : finisher ? .036 : combo >= 4 ? .012 : .018,
      shake: reduced || oil ? 0 : blocked ? .012 : clamp(.025 + power*.035,0,.105),
      zoom: reduced || oil || blocked ? 0 : finisher ? 3 : parry ? 1.8 : .25 + combo*.09,
      roll: reduced || oil || blocked ? 0 : (combo%2?1:-1)*Math.min(.009,.002+combo*.0007)
    };
  }
  function framing(fighters, reduced) {
    if(reduced) return 0;
    let intensity = 0;
    for(const f of fighters || []) {
      if(f && f.hp > 0 && f._comboTimer > 0) intensity = Math.max(intensity, clamp((f.combo-2)*1.15,0,6));
    }
    return intensity;
  }
  global.NeonFeedback = Object.freeze({impact,framing});
  if(typeof module !== 'undefined' && module.exports) module.exports=global.NeonFeedback;
}(typeof window !== 'undefined' ? window : globalThis));
