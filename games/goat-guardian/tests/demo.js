// Demo build test: node tests/demo.js (builds build/demo first; needs Playwright + Chromium).
// Checks the limits: 3 routes and arenas, 3 breeds, locked modes and editor, the wave cap, the end screen,
// separate save keys, and that the full build is not limited.
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
(async () => {
  execSync('bash tools/build_demo.sh', { cwd: path.resolve(__dirname, '..'), env: Object.assign({}, process.env, { FULL_URL: 'https://example.com/billy?a=1&b=2' }) });
  const b = await chromium.launch();
  const open = async (file) => {
    const p = await b.newPage({ viewport: { width: 480, height: 864 } });
    p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto('file://' + file); await p.waitForTimeout(600);
    await p.evaluate(() => { settings.storySeen = true; settings.fullscreen = false; });
    return p;
  };
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const D = await open(path.resolve(__dirname, '..', 'build/demo/index.html'));
  const F = await open(path.resolve(__dirname, '..', 'index.html'));
  const d = await D.evaluate(async () => {
    const out = { demo: DEMO, url: FULL_GAME_URL, title: document.title };
    progress.medals.escort = progress.medals.escort.map(() => 7); progress.medals.defend = progress.medals.defend.map(() => 7);   // lots of medals: still locked
    out.goat = [0, 1, 2, 3, 8].map(i => skinUnlocked('goat', i)).join();
    out.dog = [0, 1, 2, 3, 9].map(i => skinUnlocked('dog', i)).join();
    // locked modes and maps lead to the upgrade screen, and BACK returns
    goScreen('MODE');
    const modes = screenItems();
    out.modeLocked = ['DAILY', 'ENDLESS', 'VERSUS'].map(n => { goScreen('MODE'); modes.find(m => m.label === n).select(); const r = state + ':' + demoInfo.reason; demoBack(); return r + '>' + state; }).join();
    mode = 'escort'; goScreen('MAPS');
    const maps = screenItems();
    out.map3 = maps[2].value !== 'FULL GAME'; out.map4 = maps[3].value;
    maps[3].select(); out.map4State = state + ':' + demoInfo.reason; demoBack(); out.map4Back = state;
    goScreen('TITLE');
    const ed = screenItems().find(i => i.label === 'MAP EDITOR'); ed.select(); out.editor = state + ':' + demoInfo.reason; demoBack();
    out.preview = screenItems().some(i => i.label === 'WATCH PREVIEW');
    // the third route ends the demo
    mode = 'escort'; enterPlayers('kbL'); players.forEach(q => q.ready = true);
    startMission(3, 12, 2); mission.map = 2; nextMission();
    out.afterRoute3 = state + ':' + demoInfo.reason;
    out.items = screenItems().map(i => i.label).join('|');
    demoBack(); out.afterBack = state;
    // wave cap
    mode = 'defend'; selMap.defend = 0; useMenuWorld(); enterPlayers('kbL'); players.forEach(q => q.ready = true); startDefend(0);
    startWave(DEMO_WAVES); out.wave8 = state;
    startWave(DEMO_WAVES + 1); out.wave9 = state + ':' + demoInfo.reason;
    toTitle();
    // separate save data
    saveSettings(); out.keys = Object.keys(localStorage).filter(k => /goatGuardian/.test(k)).join();
    return out;
  });
  if (!d.demo || !/example.com\/billy\?a=1&b=2/.test(d.url) || d.title !== 'Get em Billy (Demo)') fail('flags ' + JSON.stringify(d));
  if (d.goat !== 'true,true,true,false,false' || d.dog !== 'true,true,true,false,false') fail('breeds ' + JSON.stringify(d));
  if (d.modeLocked !== 'MODE:MODE>MODE'.replace(/MODE:MODE>MODE/, 'DEMOEND:MODE>MODE') + ',DEMOEND:MODE>MODE,DEMOEND:MODE>MODE') fail('modes ' + JSON.stringify(d));
  if (!d.map3 || d.map4 !== 'FULL GAME' || d.map4State !== 'DEMOEND:MAP' || d.map4Back !== 'MAPS') fail('maps ' + JSON.stringify(d));
  if (d.editor !== 'DEMOEND:EDITOR' || !d.preview) fail('editor ' + JSON.stringify(d));
  if (d.afterRoute3 !== 'DEMOEND:ROUTES' || d.afterBack !== 'TITLE' || !/GET THE FULL GAME/.test(d.items)) fail('route end ' + JSON.stringify(d));
  if (d.wave8 === 'DEMOEND' || d.wave9 !== 'DEMOEND:WAVES') fail('waves ' + JSON.stringify(d));
  if (!/goatGuardianDemoSettings/.test(d.keys) || /goatGuardianSettings/.test(d.keys)) fail('save keys ' + d.keys);
  // the full build has no limits
  const f = await F.evaluate(() => { progress.medals.escort = progress.medals.escort.map(() => 7); progress.medals.defend = progress.medals.defend.map(() => 7); return { demo: DEMO, goat: skinUnlocked('goat', 8), dog: skinUnlocked('dog', 9), maps: (mode = 'escort', goScreen('MAPS'), screenItems()[5].value !== 'FULL GAME') }; });
  if (f.demo || !f.goat || !f.dog || !f.maps) fail('full build limited ' + JSON.stringify(f));
  for (const [n, p] of [['demo', D], ['full', F]]) if (p.errs.length) fail(n + ' page errors: ' + p.errs.join(' | '));
  console.log(process.exitCode ? 'DEMO FAILED' : 'DEMO OK');
  await b.close();
})();
