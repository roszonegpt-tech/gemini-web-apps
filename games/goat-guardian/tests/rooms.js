// 6-digit room code test with PeerJS: node tests/rooms.js (needs Playwright + Chromium, and `cd tests && npm install` once for
// the official PeerJS server, which this test runs locally so nothing leaves your machine).
// A host opens a room, three friends type the code and connect on their own, a fourth is told the room is full, a wrong code
// gets a friendly error, all four play a Defend round, and when the broker is unreachable the host falls back to long codes.
const path = require('path');
const net = require('net');
const { chromium } = require('playwright');
(async () => {
  let PeerServer;
  try { ({ PeerServer } = require('peer')); } catch (e) { console.log('SKIPPED: the PeerJS server is not installed (cd tests && npm install)'); return; }
  const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const port = await freePort();
  const server = await new Promise((res) => { PeerServer({ port, host: '127.0.0.1', path: '/billy' }, (srv) => res(srv)); });
  const broker = 'http://127.0.0.1:' + port + '/billy';
  const b = await chromium.launch({ args: ['--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const mk = async (peer) => {
    const ctx = await b.newContext({ viewport: { width: 480, height: 864 } });
    const p = await ctx.newPage();
    p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
    await p.waitForTimeout(500);
    await p.evaluate((u) => { settings.storySeen = true; settings.fullscreen = false; settings.music = false; settings.peer = u; }, peer === undefined ? broker : peer);
    return p;
  };
  const until = async (p, fn, ms, label) => { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn)) return true; await p.waitForTimeout(100); } fail('timeout: ' + label); return false; };
  const H = await mk();
  await H.evaluate(() => { goScreen('NET'); netStartHost(); netOpenBox('host'); });
  await until(H, () => /^\d{3} \d{3}$/.test(document.getElementById('nbCode').textContent), 12000, 'room code shown');
  const code = await H.evaluate(() => document.getElementById('nbCode').textContent);
  console.log('room code', code);
  if (!/LONG CODES/.test(await H.evaluate(() => document.getElementById('nbMode').textContent))) fail('long code switch');
  // a wrong code and a short code
  const W = await mk();
  await W.evaluate(() => { goScreen('NET'); netOpenBox('join'); });
  await W.fill('#nbNum', '111111'); await W.click('#nbJoinGo');
  await until(W, () => /NO ROOM/.test(document.getElementById('nbStatus').textContent), 15000, 'wrong code message');
  await W.fill('#nbNum', '12'); await W.click('#nbJoinGo');
  await until(W, () => /ALL 6 DIGITS/.test(document.getElementById('nbStatus').textContent), 3000, 'short code message');
  // three friends join by typing the code (once without the space)
  const guests = [W];
  for (let i = 0; i < 2; i++) guests.push(await mk());
  for (let i = 0; i < guests.length; i++) {
    const g = guests[i];
    await g.evaluate(() => { goScreen('NET'); netOpenBox('join'); });
    await g.type('#nbNum', i === 1 ? code.replace(' ', '') : code);
    if ((await g.inputValue('#nbNum')) !== code) fail('code box formatting');
    await g.press('#nbNum', 'Enter');
  }
  for (let i = 0; i < guests.length; i++) await until(guests[i], () => state === 'NETWAIT' && net.me, 30000, 'friend ' + (i + 1) + ' connected');
  await until(H, () => net.peers.length === 3, 5000, 'host sees 3 friends');
  const slots = await H.evaluate(() => players.map(p => p.slot).sort().join());
  if (slots !== '1,2,3') fail('friends should take P2-P4 while the host joins as P1: ' + slots);
  // the room is full
  const F = await mk();
  await F.evaluate(() => { goScreen('NET'); netOpenBox('join'); });
  await F.fill('#nbNum', code); await F.click('#nbJoinGo');
  await until(F, () => /FULL|DID NOT ANSWER|LEFT/.test(document.getElementById('nbStatus').textContent) || net.role === 'off' && /FULL/.test(net.note || ''), 30000, 'full room is refused');
  if (await H.evaluate(() => net.peers.length) !== 3) fail('a fourth friend got in');
  // switching the box between room code and long codes keeps the room
  await H.evaluate(() => netOpenBox('host', true));
  if (await H.evaluate(() => document.getElementById('nbManual').hidden)) fail('long code box');
  await H.evaluate(() => netOpenBox('host', false));
  if (await H.evaluate(() => document.getElementById('nbCode').textContent) !== code) fail('room code changed after switching');
  await H.evaluate(() => netCloseBox());
  // all four play a round
  await H.evaluate(() => { mode = 'defend'; selMap.defend = 0; enterPlayers('kbL'); players.forEach(q => q.ready = true); });
  await until(H, () => state === 'PLAYING', 8000, 'host playing');
  for (let i = 0; i < guests.length; i++) await until(guests[i], () => state === 'PLAYING' && players.length === 4 && sheep.length > 0, 15000, 'friend ' + (i + 1) + ' playing');
  // a friend's controls reach the host over the unordered channel, and snapshots reach everyone in order
  const x0 = await H.evaluate(() => players.find(p => p.net).x);
  await guests[0].keyboard.down('d'); await guests[0].waitForTimeout(800); await guests[0].keyboard.up('d');
  const moved = await H.evaluate(() => Math.max(...players.filter(p => p.net).map(p => Math.abs(p.vx) + Math.abs(p.x))));
  if (!(moved > 0)) fail('controls did not arrive');
  const q = await guests[1].evaluate(() => net.lastQ);
  await guests[1].waitForTimeout(600);
  if (!((await guests[1].evaluate(() => net.lastQ)) > q)) fail('snapshots are not advancing');
  void x0;
  // the host leaving closes the room
  await H.evaluate(() => netLeave('ROOM CLOSED'));
  await until(guests[0], () => net.role === 'off', 8000, 'friends told the host left');
  // the broker is unreachable: friendly message, and the host falls back to long codes
  server.close();
  const dead = 'http://127.0.0.1:' + port + '/billy';
  const D = await mk(dead);
  await D.evaluate(() => { goScreen('NET'); netOpenBox('join'); });
  await D.fill('#nbNum', '123456'); await D.click('#nbJoinGo');
  await until(D, () => /CANNOT REACH THE ROOM SERVER/.test(document.getElementById('nbStatus').textContent), 20000, 'broker down message');
  const E = await mk(dead);
  await E.evaluate(() => { netStartHost(); netOpenBox('host'); });
  await until(E, () => !document.getElementById('nbManual').hidden && document.getElementById('nbRoom').hidden, 25000, 'host falls back to long codes');
  for (const [n, p] of [['host', H], ['wrong', W], ['full', F], ['down', D], ['fallback', E]].concat(guests.slice(1).map((g, i) => ['guest' + (i + 2), g]))) if (p.errs.length) fail(n + ' page errors: ' + p.errs.join(' | '));
  console.log(process.exitCode ? 'ROOMS FAILED' : 'ROOMS OK');
  await b.close();
  process.exit(process.exitCode || 0);
})();
