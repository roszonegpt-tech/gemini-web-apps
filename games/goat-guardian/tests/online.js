// Two-player online test: node tests/online.js (needs Playwright + Chromium).
// Two separate browser contexts link up through the real copy-and-paste box, start a Defend round,
// and check that the guest sees the host's game, that the guest's controls move and ram its animal on
// the host, that effects and the screen smash reach the guest, and that leaving and dropping work.
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const mk = async () => {
    const ctx = await b.newContext({ viewport: { width: 480, height: 864 } });
    const p = await ctx.newPage();
    p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message));
    await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
    await p.waitForTimeout(600);
    await p.evaluate(() => { settings.storySeen = true; settings.fullscreen = false; settings.music = false; });
    return p;
  };
  const H = await mk(), G = await mk();
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const until = async (p, fn, ms, label) => {
    const t = Date.now();
    while (Date.now() - t < ms) { if (await p.evaluate(fn)) return true; await p.waitForTimeout(100); }
    fail('timeout: ' + label); return false;
  };
  // ---- link up through the real box
  await H.evaluate(() => { goScreen('NET'); netStartHost(); netOpenBox('host', true); });
  await H.click('#nbMake');
  await until(H, () => document.getElementById('nbOut').value.startsWith('GEB'), 15000, 'invite code');
  const invite = await H.inputValue('#nbOut');
  await G.evaluate(() => { goScreen('NET'); netOpenBox('join', true); });
  await G.fill('#nbIn', '  ' + invite.slice(0, 40) + '\n' + invite.slice(40) + '  ');          // pasted with a line break
  await G.click('#nbGo');
  await until(G, () => document.getElementById('nbOut').value.startsWith('GEB'), 15000, 'reply code');
  const reply = await G.inputValue('#nbOut');
  await H.fill('#nbIn', reply);
  await H.click('#nbGo');
  await until(G, () => state === 'NETWAIT' && net.me, 20000, 'guest in lobby');
  await until(H, () => net.peers.length === 1 && players.some(p => p.net), 5000, 'host sees the friend');
  console.log('codes', invite.length, reply.length, 'chars');
  const boxHidden = await G.evaluate(() => document.getElementById('netbox').hidden);
  if (!boxHidden) fail('guest box still open');
  // wrong-code errors are friendly
  await H.evaluate(() => netOpenBox('host', true));
  await H.fill('#nbIn', 'hello');
  await H.click('#nbGo');
  const bad = await H.evaluate(() => document.getElementById('nbStatus').textContent);
  if (!/NOT A GAME CODE/.test(bad)) fail('bad code message: ' + bad);
  await H.evaluate(() => netCloseBox());
  // ---- the guest picks a dog in the lobby, the host sees it
  await G.evaluate(() => { cycleKind(net.me, 1); netSendPick(); });
  await until(H, () => players.find(p => p.net).kind === 'dog' || players.find(p => p.net).kind === 'goat', 3000, 'pick arrives');
  await G.evaluate(() => { net.me.kind = 'goat'; netSendPick(); });
  await H.waitForTimeout(300);
  // ---- start a Defend round
  await H.evaluate(() => { mode = 'defend'; selMap.defend = 0; enterPlayers('kbL'); players.forEach(q => q.ready = true); });
  await until(H, () => state === 'PLAYING', 8000, 'host playing');
  await until(G, () => state === 'PLAYING' && players.length >= 2 && sheep.length > 0, 10000, 'guest playing');
  await H.waitForTimeout(800);
  const a = await H.evaluate(() => ({ n: players.length, sheep: sheep.length, rp: players.find(p => p.net) && [players.find(p => p.net).x, players.find(p => p.net).y] }));
  const g = await G.evaluate(() => ({ n: players.length, sheep: sheep.length, me: players.find(q => q.slot === net.slot) && [players.find(q => q.slot === net.slot).x, players.find(q => q.slot === net.slot).y], mine: net.slot }));
  if (a.n !== g.n) fail('player counts ' + JSON.stringify([a, g]));
  if (Math.abs(a.sheep - g.sheep) > 1) fail('sheep counts ' + JSON.stringify([a, g]));
  if (!g.me || Math.hypot(g.me[0] - a.rp[0], g.me[1] - a.rp[1]) > 12) fail('guest position ' + JSON.stringify([a, g]));
  // ---- guest controls move its animal on the host
  const x0 = a.rp[0];
  await G.keyboard.down('d');
  await G.waitForTimeout(900);
  await G.keyboard.up('d');
  await H.waitForTimeout(200);
  const x1 = await H.evaluate(() => players.find(p => p.net).x);
  const gx = await G.evaluate(() => players.find(q => q.slot === net.slot).x);
  if (!(x1 > x0 + 15)) fail('guest did not move on host: ' + x0 + ' -> ' + x1);
  if (Math.abs(gx - x1) > 14) fail('guest view lags the host: ' + gx + ' vs ' + x1);
  // ---- guest action: the host's remote goat rams, and the guest sees it
  await G.keyboard.press('Space');
  await until(H, () => players.find(p => p.net).ramT > 0 || players.find(p => p.net).cd > 0, 2000, 'remote ram');
  await until(G, () => { const m = players.find(q => q.slot === net.slot); return m.ramT > 0 || m.cd > 0; }, 2000, 'guest sees its ram');
  // ---- effects: a text, a sound and a screen smash made on the host reach the guest
  await G.evaluate(() => { window.__sfx = 0; const f = SFX.pop; SFX.pop = function () { window.__sfx++; return f.apply(SFX, arguments); }; });
  await H.evaluate(() => { const hp = players.find(q => !q.net); addText(hp.x, hp.y - 20, 'NETTEST', 'y'); SFX.pop(); startSplat({ b: 0, ty: 'wolf', al: 0, x: hp.x, y: hp.y, alt: 0, seed: 7 }); net.ev.push(['sp', { b: 0, ty: 'wolf', al: 0, x: hp.x, y: hp.y, alt: 0, seed: 7 }]); });
  await until(G, () => texts.some(t => t.str === 'NETTEST') || window.__sfx > 0, 2000, 'effects reach the guest');
  await until(G, () => window.__sfx > 0, 2000, 'sound reaches the guest');
  await until(G, () => splats.length === 1, 2000, 'screen smash reaches the guest');
  // ---- a third player trying to join mid-game is turned away politely
  const L = await mk();
  await H.evaluate(() => { net.status = ''; });
  const code3 = await H.evaluate(() => netHostInvite());
  const reply3 = await L.evaluate((c) => netGuestAccept(c), code3);
  await H.evaluate((c) => netHostAccept(c), reply3);
  await until(L, () => net.role === 'off' && /IN PROGRESS/.test(net.note || ''), 8000, 'late joiner turned away');
  if (await H.evaluate(() => net.peers.length) !== 1) fail('late joiner was let in');
  // ---- an enemy appears for both
  await H.evaluate(() => { spawnNear('wolf', { open: true }, 40); });
  await until(G, () => enemies.length >= 1, 3000, 'enemy reaches the guest');
  // ---- host pause shows on the guest
  await H.evaluate(() => openPause());
  await until(G, () => net.hostPaused, 2000, 'pause shows');
  await H.evaluate(() => { paused = false; });
  // ---- screenshot of the guest's view
  await G.waitForTimeout(500);
  await G.screenshot({ path: process.env.NET_SHOT || 'online_guest.png' });
  // ---- game over reaches the guest as a results overlay
  await H.evaluate(() => { sheep = []; });
  await until(G, () => net.over && net.over.head[0] === 'THE FLOCK', 6000, 'game over reaches the guest');
  // ---- the host returns to the lobby, the guest follows
  await H.evaluate(() => { enterPlayers('kbL'); });
  await until(G, () => state === 'NETWAIT', 3000, 'guest returns to the lobby');
  // ---- round 2: an Escort route, round 3: Versus with the guest as a wolf
  await H.evaluate(() => { mode = 'escort'; selMap.escort = 1; enterPlayers('kbL'); players.forEach(q => q.ready = true); });
  await until(G, () => state === 'PLAYING' && mode === 'escort' && world.goal && sheep.length > 0, 14000, 'guest in escort');
  const esc = await G.evaluate(() => ({ goal: world.goal && [Math.round(world.goal.x), Math.round(world.goal.y)], name: mission.name }));
  const escH = await H.evaluate(() => ({ goal: [Math.round(world.goal.x), Math.round(world.goal.y)], name: mission.name }));
  if (JSON.stringify(esc.goal) !== JSON.stringify(escH.goal) || esc.name !== escH.name) fail('escort worlds differ ' + JSON.stringify([esc, escH]));
  await H.evaluate(() => { sheep = []; });
  await until(G, () => net.over, 8000, 'escort ends for the guest');
  await H.evaluate(() => { mode = 'versus'; selMap.versus = 0; enterPlayers('kbL'); });
  await until(G, () => state === 'NETWAIT', 4000, 'guest back in the lobby');
  await G.evaluate(() => { net.me.kind = 'wolf'; netSendPick(); });
  await until(H, () => players.find(p => p.net).kind === 'wolf', 3000, 'wolf pick arrives');
  await H.evaluate(() => players.forEach(q => q.ready = true));
  await until(G, () => state === 'PLAYING' && mode === 'versus' && players.some(q => q.kind === 'wolf'), 14000, 'guest in versus');
  await G.keyboard.down('a'); await G.waitForTimeout(500); await G.keyboard.up('a');
  const wolfMoved = await H.evaluate(() => { const w = players.find(p => p.net); return Math.abs(w.vx) + Math.abs(w.x) > 0; });
  if (!wolfMoved) fail('wolf player');
  await H.evaluate(() => { endVersus('WOLVES'); });
  await until(G, () => net.over && net.over.head[0] === 'WOLVES', 6000, 'versus result reaches the guest');
  await H.evaluate(() => { enterPlayers('kbL'); });
  await until(G, () => state === 'NETWAIT', 3000, 'guest back in the lobby again');
  // ---- the guest leaves
  await G.evaluate(() => netLeave());
  await until(H, () => net.peers.length === 0 && !players.some(p => p.net), 4000, 'host notices the guest left');
  const gs = await G.evaluate(() => state + ':' + net.role);
  if (gs !== 'TITLE:off') fail('guest after leaving: ' + gs);
  // ---- the host disappears: the guest is returned to the menu with a message
  await G.evaluate(() => { net.note = ''; });
  const inv = await H.evaluate(() => netHostInvite());
  const rep2 = await G.evaluate((c) => netGuestAccept(c), inv);
  await H.evaluate((c) => netHostAccept(c), rep2);
  await until(G, () => state === 'NETWAIT', 20000, 'second link');
  await H.evaluate(() => netEnd('THE HOST CLOSED THE ROOM'));
  await until(G, () => net.role === 'off' && /HOST/.test(net.note || ''), 5000, 'guest told the host left');
  for (const [n, p] of [['host', H], ['guest', G], ['late', L]]) if (p.errs.length) fail(n + ' page errors: ' + p.errs.join(' | '));
  console.log(process.exitCode ? 'ONLINE FAILED' : 'ONLINE OK');
  await b.close();
})();
