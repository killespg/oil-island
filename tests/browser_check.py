"""Offline Chromium integration checks. Run: python tests/browser_check.py.

Uses an existing Chrome installation and local Python Playwright in .tools/python.
Screenshots and machine-readable results are saved in evidencias/.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".tools" / "python"))
from playwright.sync_api import sync_playwright


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)
    RESULTS.append(message)


def prepare_fight(page, *, player_x=-0.55, enemy_x=0.55, enemy_hp=100):
    page.evaluate("""args => {
        const s = window.__NEON__.state;
        s.phase = 'fight'; s.timeLeft = 70; s.phaseTime = 0;
        const [p, e] = s.fighters;
        for (const f of s.fighters) {
            f.z = 0; f.y = 0; f.stun = 0; f.action = 'idle';
            f.actionTime = 0; f.blocking = false; f.vx = 0; f.vz = 0;
            f.energy = 100; f.guard = 100;
            f._vy = 0; f._pushX = 0; f._pushZ = 0; f._invuln = 0;
            f._buffer = null; f._guardLock = 0; f._guardDelay = 0;
        }
        p.x = args.playerX; p.hp = 100;
        e.x = args.enemyX; e.hp = args.enemyHP;
        e._think = 5; e._aiWait = 5; e._aiBlock = 0;
        e._aiX = 0; e._aiZ = 0;
    }""", {"playerX": player_x, "enemyX": enemy_x, "enemyHP": enemy_hp})


RESULTS: list[str] = []
errors: list[str] = []
external_requests: list[str] = []
EVIDENCE = ROOT / "evidencias"
EVIDENCE.mkdir(exist_ok=True)
started = time.time()

with sync_playwright() as playwright:
    executable = Path("C:/Program Files/Google/Chrome/Application/chrome.exe")
    if not executable.is_file():
        executable = Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe")
    browser = playwright.chromium.launch(
        executable_path=str(executable), headless=True,
        args=["--enable-unsafe-swiftshader", "--disable-background-networking"],
    )
    context = browser.new_context(viewport={"width": 1440, "height": 900}, offline=True)
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.on("request", lambda request: external_requests.append(request.url)
            if request.url.startswith(("https://", "http://")) else None)
    page.goto((ROOT / "index.html").as_uri(), wait_until="load")
    page.wait_for_function("window.__NEON__ && window.__NEON__.state")
    page.locator("#menu-screen").wait_for(state="visible")
    page.screenshot(path=str(EVIDENCE / "desktop-menu.png"))
    check(page.locator("#game-canvas").is_visible(), "Desktop WebGL canvas is visible")
    check(page.evaluate("() => document.documentElement.scrollWidth <= innerWidth"),
          "Desktop layout has no horizontal overflow")
    initial_sound = page.locator("#sound-button").get_attribute("aria-pressed")
    page.locator("#sound-button").click()
    check(page.locator("#sound-button").get_attribute("aria-pressed") != initial_sound,
          "Sound toggle updates its accessible state")
    page.locator("#sound-button").click()

    page.locator("#training-button").click()
    page.wait_for_function("window.__NEON__.state.phase === 'fight'", timeout=12000)
    check(page.evaluate("window.__NEON__.state.training === true"), "Training mode starts")
    start_x = page.evaluate("window.__NEON__.state.fighters[0].x")
    page.keyboard.down("d")
    page.wait_for_timeout(250)
    page.keyboard.up("d")
    check(page.evaluate("window.__NEON__.state.fighters[0].x") > start_x,
          "Real keyboard movement moves the player")

    prepare_fight(page)
    page.keyboard.press("j")
    page.wait_for_timeout(550)
    check(page.evaluate("window.__NEON__.state.fighters[1].hp") < 100,
          "Real keyboard punch damages a nearby opponent")

    for key, move in [("k", "kick"), ("l", "special")]:
        prepare_fight(page)
        page.keyboard.press(key)
        page.wait_for_function("window.__NEON__.state.fighters[1].hp < 100", timeout=5000)
        check(page.evaluate("window.__NEON__.state.fighters[0].energy") < 100,
              "Real keyboard " + move + " lands and consumes energy")

    prepare_fight(page, player_x=-3, enemy_x=3)
    page.keyboard.down("i")
    page.wait_for_function("window.__NEON__.state.fighters[0].blocking")
    page.keyboard.up("i")
    check(True, "Real keyboard guard activates")

    prepare_fight(page, player_x=-3, enemy_x=3)
    page.keyboard.press("j")
    page.wait_for_timeout(550)
    check(page.evaluate("window.__NEON__.state.fighters[1].hp") == 100,
          "An out-of-range punch cannot hit the opponent")
    page.wait_for_function("window.__NEON__.state.fighters[0].action === 'idle'", timeout=5000)
    page.keyboard.press("Space")
    page.wait_for_function("window.__NEON__.state.fighters[0].y > 0", timeout=5000)
    check(True, "Real keyboard jump lifts the player")
    page.wait_for_function("window.__NEON__.state.fighters[0].y === 0", timeout=5000)

    page.keyboard.press("Escape")
    page.locator("#pause-screen").wait_for(state="visible")
    paused_time = page.evaluate("window.__NEON__.state.timeLeft")
    page.wait_for_timeout(250)
    check(page.evaluate("window.__NEON__.state.timeLeft") == paused_time,
          "Pause freezes the match timer")
    page.locator("#resume-button").click()
    page.locator("#pause-screen").wait_for(state="hidden")
    check(True, "Resume returns to the fight")
    if page.evaluate("window.__NEON__.quality") != "low":
        page.locator("#quality-button").click()
    prepare_fight(page, player_x=-0.65, enemy_x=0.65)
    sample_start = page.evaluate("({frames:window.__NEON__.frames, time:performance.now()})")
    page.keyboard.down("d")
    page.wait_for_timeout(150)
    page.keyboard.up("d")
    for attack in ["j", "k", "l", "j"]:
        page.keyboard.press(attack)
        page.wait_for_timeout(650)
    page.wait_for_timeout(350)
    sample_end = page.evaluate("({frames:window.__NEON__.frames, time:performance.now()})")
    game_low_performance = {
        "fps": round((sample_end["frames"] - sample_start["frames"]) * 1000 /
                     (sample_end["time"] - sample_start["time"]), 2),
        "measuredFrames": sample_end["frames"] - sample_start["frames"],
        "milliseconds": round(sample_end["time"] - sample_start["time"]),
        "scenario": "Real keyboard movement and four attacks in training, HUD and audio enabled",
    }
    page.screenshot(path=str(EVIDENCE / "desktop-fight.png"))

    page.keyboard.press("Escape")
    page.locator("#restart-button").click()
    page.wait_for_function("window.__NEON__.state.round === 1 && window.__NEON__.state.fighters[1].hp === 100")
    check(True, "Restart resets fighter health and rounds")

    # Use normal versus mode for a real two-round match; state changes only
    # arrange deterministic low-health situations for genuine keyboard strikes.
    page.keyboard.press("Escape")
    page.locator("#menu-button").click()
    page.locator("#menu-screen").wait_for(state="visible")
    page.locator("#difficulty").select_option("easy")
    page.locator("#start-button").click()
    page.wait_for_function("window.__NEON__.state.phase === 'fight'", timeout=12000)
    check(page.evaluate("window.__NEON__.state.difficulty") == "easy",
          "Selected difficulty is applied to the next match")
    for win in range(1, 3):
        prepare_fight(page, enemy_hp=1)
        page.keyboard.press("j")
        page.wait_for_function("window.__NEON__.state.wins[0] >= " + str(win), timeout=6000)
        if win == 1:
            page.wait_for_function("window.__NEON__.state.round === 2 && window.__NEON__.state.phase === 'fight'", timeout=15000)
            check(True, "A knockout awards a round and starts round two")
    page.locator("#result-screen").wait_for(state="visible", timeout=12000)
    check(page.evaluate("window.__NEON__.state.wins[0]") == 2,
          "Two round wins show the match result")
    page.screenshot(path=str(EVIDENCE / "desktop-victory.png"))
    page.locator("#rematch-button").click()
    page.wait_for_function("window.__NEON__.state.wins[0] === 0 && window.__NEON__.state.round === 1")
    check(True, "Rematch creates a clean match")
    initial_quality = page.evaluate("window.__NEON__.quality")
    page.locator("#quality-button").click()
    check(page.evaluate("window.__NEON__.quality") != initial_quality,
          "Graphics quality can be switched during play")
    if page.evaluate("window.__NEON__.quality") != "high":
        page.locator("#quality-button").click()
    prepare_fight(page, player_x=-0.7, enemy_x=0.7)
    page.keyboard.press("k")
    page.wait_for_function("window.__NEON__.state.fighters[1].hp < 100", timeout=5000)
    page.screenshot(path=str(EVIDENCE / "desktop-action-hq.png"))

    mobile_context = browser.new_context(viewport={"width": 844, "height": 390},
                                         is_mobile=True, has_touch=True,
                                         device_scale_factor=1, offline=True)
    mobile = mobile_context.new_page()
    mobile.on("pageerror", lambda error: errors.append(str(error)))
    mobile.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    mobile.on("request", lambda request: external_requests.append(request.url)
              if request.url.startswith(("https://", "http://")) else None)
    mobile.goto((ROOT / "index.html").as_uri(), wait_until="load")
    mobile.locator("#training-button").click()
    mobile.wait_for_function("window.__NEON__.state.phase === 'fight'", timeout=12000)
    check(mobile.locator("[data-control]").first.is_visible(), "Touch controls are visible on mobile")
    prepare_fight(mobile)
    mobile.locator('[data-control="punch"]').tap()
    mobile.wait_for_function("window.__NEON__.state.fighters[1].hp < 100", timeout=5000)
    check(True, "Real mobile touch punch damages the opponent")
    mobile.screenshot(path=str(EVIDENCE / "mobile-fight.png"))
    check(mobile.evaluate("() => document.documentElement.scrollWidth <= innerWidth"),
          "Mobile landscape layout has no horizontal overflow")
    mobile.set_viewport_size({"width": 390, "height": 844})
    mobile.screenshot(path=str(EVIDENCE / "mobile-portrait.png"))
    check(mobile.evaluate("() => document.documentElement.scrollWidth <= innerWidth"),
          "Mobile portrait layout has no horizontal overflow")
    page.close()
    mobile_context.close()

    # Verify the adaptive 3D camera at opposite arena boundaries using its
    # actual projection matrix, independent of the combat fixtures above.
    camera_page = context.new_page()
    camera_page.on("pageerror", lambda error: errors.append(str(error)))
    camera_page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    camera_page.goto((ROOT / "vendor" / "THREE-LICENSE.txt").as_uri())
    camera_page.set_content('<body style="margin:0"><canvas style="width:100vw;height:100vh;display:block"></canvas></body>')
    camera_page.add_script_tag(path=str(ROOT / "vendor" / "three.min.js"))
    camera_page.add_script_tag(path=str(ROOT / "scene.js"))
    camera_page.evaluate("""() => {
        window.preview = NeonScene.create(document.querySelector('canvas'), {quality:'low'});
        window.edgeState = {phase:'fight',fighters:[
            {id:0,x:-6,z:-2,y:0,face:1,hp:100,action:'idle'},
            {id:1,x:6,z:2,y:0,face:-1,hp:100,action:'idle'}]};
    }""")
    projections = {}
    for name, width, height in [("landscape", 844, 390), ("portrait", 390, 844)]:
        camera_page.set_viewport_size({"width": width, "height": height})
        points = camera_page.evaluate("""() => {
            preview.resize();
            for(let i=0;i<240;i++) preview.update(1/60, edgeState);
            preview.render();
            return edgeState.fighters.map(f => {
                const p = new THREE.Vector3(f.x,1.4,f.z).project(preview.camera);
                return {x:p.x,y:p.y};
            });
        }""")
        projections[name] = points
        check(all(abs(point["x"]) < .95 and abs(point["y"]) < .95 for point in points),
              "Mobile " + name + " camera frames both fighters at opposite arena edges")
        camera_page.screenshot(path=str(EVIDENCE / ("mobile-boundaries-" + name + ".png")))

    camera_page.set_viewport_size({"width": 1440, "height": 900})
    renderer_info = camera_page.evaluate("""() => {
        const gl=preview.renderer.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }""")
    performance_results = {}
    for quality in ["high", "low"]:
        performance_results[quality] = camera_page.evaluate("""async quality => {
            preview.setQuality(quality);
            const state={phase:'fight'};
            for(let i=0;i<120;i++)preview.update(1/60,state);
            preview.render();
            let frames=0, first=0, last=0;
            await new Promise(resolve => {
                function measure(now) {
                    if(!first)first=now;
                    last=now;frames++;
                    preview.update(1/60,state);preview.render();
                    if(now-first<3000)requestAnimationFrame(measure);else resolve();
                }
                requestAnimationFrame(measure);
            });
            return {fps:Math.round((frames-1)*1000/(last-first)*100)/100,
                    measuredFrames:frames, milliseconds:Math.round(last-first)};
        }""", quality)

    engine_page = context.new_page()
    engine_page.on("pageerror", lambda error: errors.append(str(error)))
    engine_page.goto((ROOT / "tests" / "combat-tests.html").as_uri())
    engine_results = engine_page.evaluate("window.COMBAT_TEST_RESULTS")
    check(engine_results["failed"] == 0 and engine_results["passed"] >= 15,
          "All combat engine tests pass")
    (EVIDENCE / "combat-results.json").write_text(json.dumps(engine_results, indent=2), encoding="utf-8")

    check(not external_requests, "Game runs offline without external HTTP requests")
    check(not errors, "Browser emitted no JavaScript or console errors: " + repr(errors))
    browser.close()

report = {"passed": len(RESULTS), "checks": RESULTS, "browser": str(executable),
          "durationSeconds": round(time.time() - started, 2),
          "javascriptErrors": errors, "externalRequests": external_requests,
          "engine": engine_results, "cameraProjections": projections,
          "renderer": renderer_info, "performance1440x900": performance_results,
          "performanceGameLow1440x900": game_low_performance}
(EVIDENCE / "browser-results.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps(report, indent=2, ensure_ascii=False))
