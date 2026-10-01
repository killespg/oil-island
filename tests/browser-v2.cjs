/* Browser acceptance checks. Run npm install, then CHROME_PATH=/path/to/chrome npm run test:browser. */
'use strict';
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname,'..');
const evidence = path.join(root,'evidencias'); fs.mkdirSync(evidence,{recursive:true});
const checks=[], errors=[], requests=[];
function check(value,label) { if(!value) throw new Error(label); checks.push(label); console.log('PASS',label); }
async function active(page) {
  await page.evaluate(() => { const s=__NEON__.state; s.phase='fight';s.phaseTime=0;s.events=[];s.timeLeft=120; });
}
async function resolveMatch(page,won) {
  await page.evaluate(won => { const s=__NEON__.state;s.wins=won?[2,0]:[0,2];s.winner=won?0:1;s.phase='matchOver';s.events=[{type:'matchEnd',winner:s.winner}]; },won);
  await page.locator('#result-screen').waitFor({state:'visible'});
}
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || undefined,args:['--enable-unsafe-swiftshader','--disable-background-networking','--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:900},offline:true});
  const page=await context.newPage();
  page.on('pageerror',e => errors.push(String(e))); page.on('console',m => { if(m.type()==='error') errors.push(m.text()); });
  page.on('request',r=>{if(/^https?:/.test(r.url())) requests.push(r.url());});
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);
  await page.waitForFunction(()=>!!window.__NEON__,{},{timeout:30000});
  check(await page.locator('#menu-screen').isVisible(),'Menu renders offline');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Desktop has no horizontal overflow');
  check(await page.locator('[data-arena]').count()===4,'Four selectable arenas');
  check(await page.locator('#difficulty option').count()===4,'Four difficulty tiers');
  await page.screenshot({path:path.join(evidence,'v2-menu.png')});
  for(const arena of ['island','nightclub','seaside','helipad']) {
    await page.locator(`[data-arena="${arena}"]`).click();
    await page.waitForTimeout(300);
    check(await page.evaluate(()=>__NEON__.state.arena)===arena,`Preview switches to ${arena}`);
  }
  await page.locator('#difficulty').selectOption('nightmare');
  await page.locator('#training-button').click(); await active(page);
  check(await page.evaluate(()=>__NEON__.state.training),'Training is a passive practice mode');
  await page.waitForTimeout(700);
  const before=await page.evaluate(()=>({...__NEON__.camera}));
  await page.keyboard.down('KeyX'); await page.waitForTimeout(500); await page.keyboard.up('KeyX');
  const after=await page.evaluate(()=>({...__NEON__.camera}));
  check(after.yaw-before.yaw>.1,'X orbits camera naturally to the right');
  await page.keyboard.press('Tab');
  check(await page.evaluate(()=>!__NEON__.camera.locked),'Target lock toggles off');
  const lateralBefore=await page.evaluate(()=>({x:__NEON__.state.fighters[0].x,z:__NEON__.state.fighters[0].z,yaw:__NEON__.camera.yaw}));
  await page.keyboard.down('KeyD');await page.waitForTimeout(350);await page.keyboard.up('KeyD');
  const lateralAfter=await page.evaluate(()=>({x:__NEON__.state.fighters[0].x,z:__NEON__.state.fighters[0].z}));
  check((lateralAfter.x-lateralBefore.x)*-Math.cos(lateralBefore.yaw)+(lateralAfter.z-lateralBefore.z)*Math.sin(lateralBefore.yaw)>.4,'D moves toward screen right rather than mirrored left');
  await page.keyboard.press('Tab');
  check(await page.evaluate(()=>__NEON__.camera.locked),'Target lock toggles on');
  const pos=await page.evaluate(()=>({x:__NEON__.state.fighters[0].x,z:__NEON__.state.fighters[0].z}));
  await page.keyboard.down('KeyW');await page.waitForTimeout(500);await page.keyboard.up('KeyW');
  const moved=await page.evaluate(()=>({x:__NEON__.state.fighters[0].x,z:__NEON__.state.fighters[0].z}));
  check(Math.hypot(moved.x-pos.x,moved.z-pos.z)>.7,'W moves player relative to the camera');
  const dragBefore=await page.evaluate(()=>__NEON__.camera.yaw);
  await page.mouse.move(1000,550);await page.mouse.down({button:'middle'});await page.mouse.move(1190,590,{steps:8});await page.mouse.up({button:'middle'});
  const dragged=await page.evaluate(()=>__NEON__.camera.yaw);
  check(dragged-dragBefore<-.15,'Dragging the canvas rotates camera');
  const zoomBefore=await page.evaluate(()=>__NEON__.camera.distance);
  await page.mouse.wheel(0,500);await page.waitForTimeout(200);
  check(await page.evaluate(()=>__NEON__.camera.distance)>zoomBefore,'Mouse wheel adjusts follow distance');
  await page.evaluate(()=>{const s=__NEON__.state;const[p,e]=s.fighters;p.x=0;p.z=0;p.y=0;p.stun=0;p.action='idle';p.actionDuration=0;e.x=0;e.z=1.35;e.hp=100;e.stun=0;e._invuln=0;});
  await page.keyboard.press('KeyJ');await page.waitForTimeout(400);
  check(await page.evaluate(()=>__NEON__.state.fighters[1].hp)<100,'Player punches target along the Z axis');
  await page.keyboard.press('Escape');check(await page.locator('#pause-screen').isVisible(),'Escape pauses the game');
  const paused=await page.evaluate(()=>__NEON__.state.elapsed);await page.waitForTimeout(250);
  check(await page.evaluate(()=>__NEON__.state.elapsed)===paused,'Simulation freezes while paused');
  await page.locator('#resume-button').click();check(await page.evaluate(()=>__NEON__.mode)==='fight','Resume continues the match');
  check(await page.evaluate(()=>__NEON__.audio.state)==='running','Audio context unlocks after gesture');
  await page.keyboard.press('KeyM');check(await page.locator('#sound-button').getAttribute('aria-pressed')==='false','Mute toggles');
  await page.keyboard.press('KeyM');
  await page.screenshot({path:path.join(evidence,'v2-island-fight.png')});
  await page.evaluate(()=>__NEON__.menu());
  for(const arena of ['nightclub','seaside','helipad']) {
    await page.locator(`[data-arena="${arena}"]`).click();await page.locator('#start-button').click();await active(page);
    await page.waitForTimeout(600);check(await page.evaluate(()=>__NEON__.state.arena)===arena,`Fight starts in ${arena}`);
    await page.screenshot({path:path.join(evidence,`v2-${arena}-fight.png`)});
    await page.locator('#quality-button').click();await page.waitForTimeout(100);await page.locator('#quality-button').click();
    check(!await page.locator('#error-screen').isVisible(),`Quality changes preserve ${arena}`);
    await page.evaluate(()=>__NEON__.menu());
  }
  await page.locator('#mode-select').selectOption('ascent');await page.locator('#difficulty').selectOption('easy');
  await page.locator('#start-button').click();await active(page);
  check(await page.evaluate(()=>__NEON__.run.stage)===0,'Ascent begins at stage one');
  await resolveMatch(page,true);
  await page.screenshot({path:path.join(evidence,'v2-upgrades.png')});
  check(await page.locator('#upgrade-choices').isVisible(),'Victory offers upgrades');
  await page.locator('[data-upgrade="flow"]').click();await page.locator('#rematch-button').click();await active(page);
  check(await page.evaluate(()=>__NEON__.run.stage===1 && __NEON__.run.upgrades.flow===1),'Chosen upgrade carries into the next stage');
  check(await page.evaluate(()=>__NEON__.state.upgrades.flow)===1,'Progression perk reaches combat simulation');
  await page.keyboard.press('Escape');await page.locator('#restart-button').click();await active(page);
  check(await page.evaluate(()=>__NEON__.run.stage===1 && __NEON__.state.upgrades.flow===1),'Restart preserves current ascent stage and perks');
  for(let i=1;i<5;i++) { await resolveMatch(page,true);if(i<4) {await page.locator('#rematch-button').click();await active(page);} }
  check(await page.evaluate(()=>__NEON__.run.ended && __NEON__.run.cleared===5),'Five victories finish the ascent');
  check(!await page.locator('#upgrade-choices').isVisible(),'Completed ascent offers no sixth upgrade');
  await page.locator('#rematch-button').click();await active(page);await resolveMatch(page,false);
  check(await page.evaluate(()=>__NEON__.run.ended && __NEON__.run.cleared===0),'Loss ends a fresh ascent');
  await page.evaluate(()=>__NEON__.menu());
  await page.reload();await page.waitForFunction(()=>!!window.__NEON__);
  check((await page.locator('#best-run').innerText()).includes('5/5'),'Best ascent persists across reload');
  await page.setViewportSize({width:390,height:844});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Portrait menu fits without horizontal overflow');
  check(await page.locator('#start-button').isVisible(),'Portrait start action remains accessible');
  await page.screenshot({path:path.join(evidence,'v2-mobile-menu.png')});
  await page.evaluate(()=>localStorage.setItem('neon-clash-ascent-best','{"score":500}'));
  await page.reload();await page.waitForFunction(()=>!!window.__NEON__);
  check((await page.locator('#best-run').innerText()).includes('0/5'),'Malformed stored record resets safely');
  const mobile=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,offline:true});
  const touch=await mobile.newPage();touch.on('pageerror',e=>errors.push(String(e)));
  await touch.goto(pathToFileURL(path.join(root,'index.html')).href);await touch.waitForFunction(()=>!!window.__NEON__);
  await touch.locator('#training-button').click();await active(touch);
  check(await touch.locator('#touch-controls').isVisible(),'Touch controls appear on touch devices');
  await touch.locator('[data-control="punch"]').dispatchEvent('pointerdown',{pointerId:12,pointerType:'touch'});
  await touch.locator('[data-control="punch"]').dispatchEvent('pointerup',{pointerId:12,pointerType:'touch'});
  check(await touch.evaluate(()=>__NEON__.state.fighters[0].action)==='punch','Touch attack triggers combat');
  await touch.screenshot({path:path.join(evidence,'v2-mobile-fight.png')});
  check(requests.length===0,'No external network requests during offline play');
  check(errors.length===0,`No browser errors (${errors.join('; ')})`);
  fs.writeFileSync(path.join(evidence,'v2-browser-results.json'),JSON.stringify({passed:checks.length,checks,errors,requests,testedAt:new Date().toISOString()},null,2));
  await browser.close();console.log(`${checks.length} browser checks passed.`);
})().catch(error=>{fs.writeFileSync(path.join(evidence,'v2-browser-results.json'),JSON.stringify({passed:checks.length,checks,errors,failure:String(error)},null,2));console.error(error);process.exit(1);});
