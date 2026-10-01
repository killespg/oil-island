/*
 * Real WebGL context-loss regression, intentionally serial to keep SwiftShader load low.
 * Run only after other GPU browser checks have finished:
 *   PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tests/context-recovery.cjs
 * Optional CONTEXT_TIMEOUT_MS sets the upper wait budget for the app's recovery timeout.
 */
'use strict';
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'evidencias', 'v2-context-results.json');
const checks = [], samples = [], pageErrors = [], consoleErrors = [], benignConsole = [], requests = [];
let browser, failure = null;

function check(value, label) {
  if (!value) throw new Error(label);
  checks.push(label);
  console.log('PASS', label);
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function writeEvidence() {
  fs.mkdirSync(path.dirname(evidence), {recursive: true});
  fs.writeFileSync(evidence, JSON.stringify({
    passed: checks.length, checks, samples, pageErrors, consoleErrors, benignConsole, requests,
    failure, testedAt: new Date().toISOString()
  }, null, 2));
}
async function snapshot(page) {
  return page.evaluate(() => {
    const game = window.__NEON__, s = game.state;
    return {
      graphics: {...game.graphics}, mode: game.mode, quality: game.quality,
      frames: game.frames, elapsed: s.elapsed, timeLeft: s.timeLeft,
      hp: s.fighters.map(f => f.hp), wins: [...s.wins], phase: s.phase,
      arena: s.arena, round: s.round, run: game.run ? JSON.parse(JSON.stringify(game.run)) : null,
      sameMatch: !window.__CONTEXT_TEST__.match || window.__CONTEXT_TEST__.match === s,
      sameRun: !window.__CONTEXT_TEST__.run || window.__CONTEXT_TEST__.run === game.run
    };
  });
}
async function waitFrames(page) {
  const before = await page.evaluate(() => window.__NEON__.frames);
  await page.waitForFunction(value => window.__NEON__.frames >= value + 2, before, {polling: 50, timeout: 30000});
}
function checkBudget(renderer, budget, label) {
  check(renderer.pixelWidth > 0 && renderer.pixelHeight > 0 && renderer.pixelWidth <= 2048 && renderer.pixelHeight <= 2048, `${label}: drawing-buffer dimensions are bounded at 2048`);
  check(renderer.pixelWidth * renderer.pixelHeight <= budget, `${label}: drawing-buffer pixel count respects its budget`);
}
async function waitStatus(page, status, timeout = 20000) {
  await page.waitForFunction(value => window.__NEON__?.graphics?.status === value, status,
    {polling: 50, timeout});
}
async function rememberMatch(page) {
  await page.evaluate(() => {
    window.__CONTEXT_TEST__.match = window.__NEON__.state;
    window.__CONTEXT_TEST__.run = window.__NEON__.run;
  });
}
async function lose(page, label) {
  const before = await snapshot(page);
  const supported = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const extension = gl && gl.getExtension('WEBGL_lose_context');
    if (!extension || gl.isContextLost()) return false;
    window.__CONTEXT_TEST__.extension = extension;
    extension.loseContext();
    return true;
  });
  check(supported, `${label}: real WEBGL_lose_context extension is available`);
  await waitStatus(page, 'recovering');
  const frozen = await snapshot(page);
  check(frozen.graphics.losses === before.graphics.losses + 1, `${label}: loss is counted once`);
  await page.waitForTimeout(450);
  const later = await snapshot(page);
  check(later.frames === frozen.frames, `${label}: render loop stops while context is lost`);
  check(later.elapsed === frozen.elapsed && later.timeLeft === frozen.timeLeft && same(later.hp, frozen.hp),
    `${label}: simulation and health freeze during recovery`);
  check(same(later.run, frozen.run), `${label}: ascent progression freezes during recovery`);
  samples.push({label, before, frozen});
  return frozen;
}
async function restore(page, frozen, expectedMode, label) {
  await page.evaluate(() => window.__CONTEXT_TEST__.extension.restoreContext());
  await waitStatus(page, 'ready');
  const restored = await snapshot(page);
  check(restored.graphics.recoveries === frozen.graphics.recoveries + 1,
    `${label}: native restoration is counted once`);
  check(restored.quality === 'low', `${label}: restoration uses low graphics quality`);
  check(!restored.graphics.renderer.postProcessing, `${label}: restoration releases post-processing targets`);
  check(restored.mode === expectedMode, `${label}: restoration returns to ${expectedMode}`);
  check(restored.sameMatch && restored.sameRun, `${label}: original match and ascent objects survive`);
  check(same(restored.hp, frozen.hp) && same(restored.wins, frozen.wins) &&
    restored.round === frozen.round && restored.arena === frozen.arena && same(restored.run, frozen.run),
    `${label}: health, round, arena and upgrades survive restoration`);
  check(!await page.locator('#error-screen').isVisible(), `${label}: recovery dismisses the graphics overlay`);
  samples.push({label: `${label} restored`, snapshot: restored});
  return restored;
}
async function resume(page, label) {
  check(await page.locator('#pause-screen').isVisible(), `${label}: explicit resume is required`);
  const paused = await snapshot(page);
  await page.waitForTimeout(250);
  check(await page.evaluate(() => window.__NEON__.state.elapsed) === paused.elapsed,
    `${label}: restored fight does not resume automatically`);
  await page.locator('#resume-button').click();
  await page.waitForFunction(before => window.__NEON__.frames > before.frames &&
    window.__NEON__.state.elapsed > before.elapsed, paused, {polling: 50, timeout: 15000});
  check(await page.evaluate(() => window.__NEON__.mode) === 'fight', `${label}: resume restarts rendering and simulation`);
}
async function completeMatch(page) {
  await page.evaluate(() => {
    const s = window.__NEON__.state;
    s.wins = [2, 0]; s.winner = 0; s.phase = 'matchOver';
    s.events = [{type: 'matchEnd', winner: 0}];
  });
  await page.locator('#result-screen').waitFor({state: 'visible', timeout: 15000});
}

(async () => {
  browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROME_PATH || undefined,
    args: ['--enable-unsafe-swiftshader', '--disable-background-networking', '--no-sandbox']
  });
  // Desktop must also start with the compatible renderer before its first frame.
  const context = await browser.newContext({viewport: {width: 960, height: 640}, hasTouch: false, offline: true});
  await context.addInitScript(() => {
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const pending = new Set();
    const audit = {requests: 0, callbacks: 0, cancellations: 0, maxPending: 0,
      duplicateTimestamps: 0, previousTimestamp: null};
    window.__CONTEXT_TEST__ = {audit};
    window.requestAnimationFrame = function request(callback) {
      if (callback.name !== 'frame') return nativeRequest(callback);
      let id;
      id = nativeRequest(timestamp => {
        pending.delete(id); audit.callbacks++;
        if (timestamp === audit.previousTimestamp) audit.duplicateTimestamps++;
        audit.previousTimestamp = timestamp;
        callback(timestamp);
      });
      audit.requests++; pending.add(id);
      audit.maxPending = Math.max(audit.maxPending, pending.size);
      return id;
    };
    window.cancelAnimationFrame = function cancel(id) {
      if (pending.delete(id)) audit.cancellations++;
      return nativeCancel(id);
    };
  });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/^(?:WebGL:|THREE\.WebGLRenderer:).*?(?:CONTEXT_LOST_WEBGL|context lost)/i.test(text)) benignConsole.push(text);
    else consoleErrors.push(text);
  });
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.waitForFunction(() => window.__NEON__?.graphics?.status === 'ready' && window.__NEON__.frames > 0,
    null, {polling: 50, timeout: 30000});
  check(await page.evaluate(() => window.__NEON__.quality) === 'low', 'Game starts in low quality before context loss');
  check(await page.locator('#menu-screen').isVisible(), 'Offline menu initializes');

  // Carry a real chosen upgrade into stage two before losing the context.
  await page.locator('#mode-select').selectOption('ascent');
  await page.locator('#difficulty').selectOption('easy');
  await page.locator('#start-button').click();
  await completeMatch(page);
  await page.locator('[data-upgrade="flow"]').click();
  await page.locator('#rematch-button').click();
  await page.evaluate(() => {
    const s = window.__NEON__.state;
    s.phase = 'fight'; s.phaseTime = 0; s.events = []; s.timeLeft = 59;
    s.fighters[0].hp = 61; s.fighters[1].hp = 73;
    s.fighters[0].x = -7; s.fighters[1].x = 7;
    // Keep the proof about recovery independent of enemy reaction timing.
    s.fighters[1].stun = 30;
  });
  check(await page.evaluate(() => window.__NEON__.run.stage === 1 && window.__NEON__.run.upgrades.flow === 1),
    'Recovery test uses a live ascent stage with a selected upgrade');
  await rememberMatch(page);
  await page.locator('#quality-button').click();
  await waitFrames(page);
  const initialHigh = await snapshot(page);
  check(initialHigh.quality === 'high' && initialHigh.graphics.renderer.postProcessing, 'HQ creates post-processing targets before the first context loss');
  check(initialHigh.graphics.renderer.postTargetType === 'UnsignedByteType' && initialHigh.graphics.renderer.samples === 0, 'HQ uses unsigned-byte targets without framebuffer multisampling');
  samples.push({label: 'Initial HQ before loss', snapshot: initialHigh});
  const first = await lose(page, 'HQ fight loss');
  await restore(page, first, 'paused', 'Fight recovery');
  await resume(page, 'Fight recovery');

  await page.setViewportSize({width: 3840, height: 2160});
  await waitFrames(page);
  const low4k = await snapshot(page);
  checkBudget(low4k.graphics.renderer, 700000, '4K low');
  await page.locator('#quality-button').click();
  await waitFrames(page);
  const high4k = await snapshot(page);
  check(high4k.quality === 'high' && high4k.graphics.renderer.postProcessing, 'HQ can be enabled again after native restoration');
  check(high4k.graphics.renderer.postTargetType === 'UnsignedByteType' && high4k.graphics.renderer.samples === 0, 'Restored HQ retains safe framebuffer settings');
  checkBudget(high4k.graphics.renderer, 1800000, '4K HQ');
  await page.locator('#quality-button').click();
  await waitFrames(page);
  const lowAgain = await snapshot(page);
  check(lowAgain.quality === 'low' && !lowAgain.graphics.renderer.postProcessing, 'Returning from restored HQ to low disposes post-processing targets');
  checkBudget(lowAgain.graphics.renderer, 700000, '4K low after HQ');
  samples.push({label: '4K allocation limits after recovery', low: low4k.graphics.renderer, high: high4k.graphics.renderer, lowAgain: lowAgain.graphics.renderer});
  await page.setViewportSize({width: 960, height: 640});
  await waitFrames(page);

  for (let cycle = 1; cycle <= 2; cycle++) {
    const lost = await lose(page, `Repeated loss ${cycle}`);
    await restore(page, lost, 'paused', `Repeated recovery ${cycle}`);
    await resume(page, `Repeated recovery ${cycle}`);
  }

  await page.evaluate(() => window.__NEON__.menu());
  await rememberMatch(page);
  const menuLoss = await lose(page, 'Menu loss');
  await restore(page, menuLoss, 'menu', 'Menu recovery');
  check(await page.locator('#menu-screen').isVisible() && !await page.locator('#pause-screen').isVisible(),
    'Menu restoration preserves menu controls without a fight pause');

  await page.locator('#start-button').click();
  await completeMatch(page);
  await rememberMatch(page);
  const resultTitle = await page.locator('#result-title').textContent();
  const resultLoss = await lose(page, 'Result loss');
  await restore(page, resultLoss, 'result', 'Result recovery');
  check(await page.locator('#result-screen').isVisible() && await page.locator('#upgrade-choices').isVisible(),
    'Result restoration preserves the pending upgrade decision');
  check(await page.locator('#result-title').textContent() === resultTitle,
    'Result restoration does not resolve or count the match again');

  const audit = await page.evaluate(() => ({...window.__CONTEXT_TEST__.audit}));
  samples.push({label: 'RAF audit after five real recovery cycles', audit});
  check(audit.callbacks > 0 && audit.requests > 0, 'RAF regression instrumentation observes the application frame callback');
  check(audit.maxPending === 1 && audit.duplicateTimestamps === 0,
    'Repeated context restoration maintains exactly one animation-frame chain');

  // Intentionally never restore this final lost context: exercise the real timeout fallback.
  await page.evaluate(() => window.__NEON__.menu());
  await rememberMatch(page);
  const timeoutLoss = await lose(page, 'Unrestored loss');
  const timeoutBudget = Math.max(5000, Number(process.env.CONTEXT_TIMEOUT_MS) || 30000);
  await waitStatus(page, 'failed', timeoutBudget);
  const failed = await snapshot(page);
  check(failed.frames === timeoutLoss.frames && failed.elapsed === timeoutLoss.elapsed,
    'Recovery timeout leaves simulation and renderer stopped');
  check(await page.locator('#error-screen').isVisible(), 'Recovery timeout displays a persistent graphics error');
  check((await page.locator('#error-message').textContent()).trim().length > 15,
    'Recovery timeout explains the failure');
  check(await page.locator('#error-screen button').isVisible(), 'Recovery timeout offers a reload action');
  samples.push({label: 'Timed-out context', snapshot: failed, message: await page.locator('#error-message').textContent()});

  await page.locator('#error-screen button').click();
  await page.waitForFunction(() => window.__NEON__?.graphics?.status === 'ready' && window.__NEON__.frames > 0,
    null, {polling: 50, timeout: 30000});
  check(await page.locator('#menu-screen').isVisible() && !await page.locator('#error-screen').isVisible(),
    'Fallback reload creates a healthy graphics session');
  check(pageErrors.length === 0, `No uncaught JavaScript errors (${pageErrors.join('; ')})`);
  check(consoleErrors.length === 0, `No unexpected console errors (${consoleErrors.join('; ')})`);
  check(requests.length === 0, 'Context recovery and fallback require no network requests');
})().catch(error => {
  failure = String(error && error.stack || error);
  console.error(error); process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  writeEvidence();
  console.log(`${checks.length} context recovery checks ${failure ? 'completed before failure' : 'passed'}.`);
});
