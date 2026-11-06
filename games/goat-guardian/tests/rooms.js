// 6-digit room code test: node tests/rooms.js (needs Playwright + Chromium; starts a local relay).
// A host opens a room, three friends type the code and connect on their own (no pasting), a fourth is told the
// room is full, a wrong code gets a friendly error, then all four play a Defend round.
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const { startRelay } = await import('../tools/relay/node-server.mjs');
  const relay = await startRelay(0, '127.0.0.1');
  const url = 'http://127.0.0.1:' + relay.port;
  const b = await chromium.launch({ args: ['--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const mk = async () => {
    const ctx = await b.newContext({ viewport: { width: 480, height: 864 } });
    const p = await ctx.newPage();
    p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
    await p.waitForTimeout(500);
    await p.evaluate((u) => { settings.storySeen = true; settings.fullscreen = false; settings.music = false; settings.relay = u; }, url);
    return p;
  };
  const until = async (p, fn, ms, label) => { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn)) return true; await p.waitForTimeout(100); } fail('timeout: ' + label); return false; };
  const H = await mk();
  await H.evaluate(() => { goScreen('NET'); netStartHost(); netOpenBox('host'); });
  await until(H, () => /^\d{3} \d{3}$/.test(document.getElementById('nbCode').textContent), 8000, 'room code shown');
  const code = await H.evaluate(() => document.getElementById('nbCode').textContent);
  console.log('room code', code);
  const modeBtn = await H.evaluate(() => document.getElementById('nbMode').textContent);
  if (!/LONG CODES/.test(modeBtn)) fail('long code switch: ' + modeBtn);
  // a wrong code
  const W = await mk();
  await W.evaluate(() => { goScreen('NET'); netOpenBox('join'); });
  await W.fill('#nbNum', '111111'); await W.click('#nbJoinGo');
  await until(W, () => /NO ROOM/.test(document.getElementById('nbStatus').textContent), 5000, 'wrong code message');
  await W.fill('#nbNum', '12'); await W.click('#nbJoinGo');
  await until(W, () => /ALL 6 DIGITS/.test(document.getElementById('nbStatus').textContent), 3000, 'short code message');
  // three friends join by typing the code (once with a space, once without)
  const guests = [W];
  for (let i = 0; i < 2; i++) guests.push(await mk());
  guests.forEach(async () => {});
  for (let i = 0; i < guests.length; i++) {
    const g = guests[i];
    await g.evaluate(() => { goScreen('NET'); netOpenBox('join'); });
    await g.type('#nbNum', i === 1 ? code.replace(' ', '') : code);
    const shown = await g.inputValue('#nbNum');
    if (shown !== code) fail('code box formatting: ' + shown);
    await g.press('#nbNum', 'Enter');
  }
  for (let i = 0; i < guests.length; i++) await until(guests[i], () => state === 'NETWAIT' && net.me, 25000, 'friend ' + (i + 1) + ' connected');
  await until(H, () => net.peers.length === 3, 5000, 'host sees 3 friends');
  const slots = await H.evaluate(() => players.map(p => p.slot).sort().join());
  if (slots !== '1,2,3') fail('friends should take P2-P4 while the host joins as P1: ' + slots);
  // the room is full
  const F = await mk();
  await F.evaluate(() => { goScreen('NET'); netOpenBox('join'); });
  await F.fill('#nbNum', code); await F.click('#nbJoinGo');
  await until(F, () => /ROOM IS FULL/.test(document.getElementById('nbStatus').textContent), 12000, 'full room message');
  // the host can switch to long codes and back
  await H.evaluate(() => netOpenBox('host', true));
  if (await H.evaluate(() => document.getElementById('nbManual').hidden)) fail('long code box');
  await H.evaluate(() => netOpenBox('host', false));
  if (await H.evaluate(() => document.getElementById('nbCode').textContent) !== code) fail('room code changed after switching');
  await H.evaluate(() => netCloseBox());
  // everyone plays a round
  await H.evaluate(() => { mode = 'defend'; selMap.defend = 0; enterPlayers('kbL'); players.forEach(q => q.ready = true); });
  await until(H, () => state === 'PLAYING', 8000, 'host playing');
  for (let i = 0; i < guests.length; i++) await until(guests[i], () => state === 'PLAYING' && players.length === 4 && sheep.length > 0, 14000, 'friend ' + (i + 1) + ' playing');
  // the room stays alive during the game and closes when the host leaves
  const alive = await fetch(url + '/health').then(r => r.json());
  if (alive.rooms < 1) fail('room vanished during the game');
  await H.evaluate(() => netLeave('ROOM CLOSED'));
  await until(guests[0], () => net.role === 'off', 5000, 'friends told the host left');
  await new Promise(r => setTimeout(r, 600));
  const after = await fetch(url + '/health').then(r => r.json());
  if (after.rooms !== 0) fail('room not closed on the relay: ' + after.rooms);
  // relay down: a friendly message, and the host falls back to long codes
  relay.server.close();
  const D = await mk();
  await D.evaluate(() => { goScreen('NET'); netOpenBox('join'); });
  await D.fill('#nbNum', '123456'); await D.click('#nbJoinGo');
  await until(D, () => /CANNOT REACH THE ROOM SERVER/.test(document.getElementById('nbStatus').textContent), 12000, 'relay down message');
  const E = await mk();
  await E.evaluate(() => { netStartHost(); netOpenBox('host'); });
  await until(E, () => !document.getElementById('nbManual').hidden && document.getElementById('nbCode').closest('#nbRoom').hidden, 12000, 'host falls back to long codes');
  for (const [n, p] of [['host', H], ['wrong', W], ['full', F], ['down', D], ['fallback', E]].concat(guests.slice(1).map((g, i) => ['guest' + (i + 2), g]))) if (p.errs.length) fail(n + ' page errors: ' + p.errs.join(' | '));
  console.log(process.exitCode ? 'ROOMS FAILED' : 'ROOMS OK');
  await b.close();
  process.exit(process.exitCode || 0);
})();
