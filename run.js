/* Pure progression rules: a five-duel ascent, with one upgrade per victory. */
(function (global) {
  'use strict';
  const arenas = ['skyline', 'reactor', 'void'];
  const difficulties = ['easy', 'normal', 'hard', 'nightmare'];
  const names = ['O chamado', 'Sob pressão', 'Ponto de ruptura', 'Sem retorno', 'O último sinal'];
  const upgrades = Object.freeze({
    power: {name: 'Núcleo de impacto', description: '+8% de dano por nível. Faça cada abertura valer.'},
    flow: {name: 'Fluxo de energia', description: '+15% de regeneração por nível. Mais esquivas e especiais.'},
    guard: {name: 'Guarda reforçada', description: '12% menos desgaste da guarda por nível. Resista à pressão.'}
  });
  function create(arena, difficulty) {
    return {stage: 0, cleared: 0, arena: arenas.includes(arena) ? arena : 'skyline',
      difficulty: difficulties.includes(difficulty) ? difficulty : 'normal',
      upgrades: {power: 0, flow: 0, guard: 0}, damage: 0, taken: 0, parries: 0, combo: 0,
      score: 0, pendingUpgrade: false, ended: false};
  }
  function stage(run) {
    const index = Math.min(4, run.stage);
    return {index, name: names[index], arena: arenas[(arenas.indexOf(run.arena) + index) % arenas.length],
      difficulty: difficulties[index === 4 ? 3 : Math.min(3, difficulties.indexOf(run.difficulty) + Math.floor(index / 2))]};
  }
  function finish(run, won, stats) {
    if (run.ended || run.pendingUpgrade) return false;
    run.damage += stats.damage || 0; run.taken += stats.taken || 0;
    run.parries += stats.parries || 0; run.combo = Math.max(run.combo, stats.combo || 0);
    run.score += Math.max(0, Math.round((stats.damage || 0) * 8 + (stats.parries || 0) * 120 + (stats.combo || 0) * 60 - (stats.taken || 0) * 2 + (won ? 1000 : 0)));
    if (won) run.cleared++;
    run.ended = !won || run.cleared >= 5;
    run.pendingUpgrade = !run.ended;
    return true;
  }
  function advance(run, upgrade) {
    if (!run.pendingUpgrade || run.ended || !upgrades[upgrade]) return false;
    run.upgrades[upgrade]++; run.stage++; run.pendingUpgrade = false;
    return true;
  }
  function rank(stats, won) {
    if (!won) return 'D';
    const merit = (stats.parries || 0) * 35 + (stats.combo || 0) * 12 - (stats.taken || 0) * .65;
    return merit > 115 ? 'S' : merit > 45 ? 'A' : merit > -45 ? 'B' : 'C';
  }
  global.NeonRun = Object.freeze({create,stage,finish,advance,rank,upgrades});
  if (typeof module !== 'undefined' && module.exports) module.exports = global.NeonRun;
})(typeof window !== 'undefined' ? window : globalThis);
