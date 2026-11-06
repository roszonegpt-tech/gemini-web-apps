// Relay logic test: node tests/relay_core.js (no browser needed; the same core runs in Node and in the Cloudflare Worker).
(async () => {
  const { createRelay, LIMITS, corsFor } = await import('../tools/relay/core.mjs');
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const R = createRelay();
  let t = 1000;
  const call = (m, p, body, q) => R.handle(m, p, q || '', body ? JSON.stringify(body) : '', t);
  // codes: six digits, unique
  const seen = new Set();
  for (let i = 0; i < 300; i++) { const r = call('POST', '/room'); if (r.status !== 200 || !/^\d{6}$/.test(r.json.code) || seen.has(r.json.code) || r.json.key.length < 16) fail('create ' + JSON.stringify(r)); seen.add(r.json.code); }
  const R2 = createRelay();
  const room = R2.handle('POST', '/room', '', '', t).json, code = room.code, key = room.key;
  const c2 = (m, p, body, q) => R2.handle(m, p, q || '', body ? JSON.stringify(body) : '', t);
  const gid = 'abcdef0123456789';
  // joining
  if (c2('POST', '/room/123456/join', { gid }).status !== 404) fail('unknown room');
  if (c2('POST', '/room/' + code + '/join', { gid: 'x' }).status !== 400) fail('bad gid');
  if (c2('POST', '/room/' + code + '/join', { gid }).status !== 200) fail('join');
  // host mailbox: needs the key, is cleared when read
  if (c2('GET', '/room/' + code + '/host').status !== 403) fail('host without key');
  const m1 = c2('GET', '/room/' + code + '/host', null, 'key=' + key).json.msgs;
  if (m1.length !== 1 || m1[0].t !== 'join' || m1[0].gid !== gid) fail('host msgs ' + JSON.stringify(m1));
  if (c2('GET', '/room/' + code + '/host', null, 'key=' + key).json.msgs.length !== 0) fail('mailbox not cleared');
  // offer -> guest, answer -> host
  if (c2('POST', '/room/' + code + '/to/' + gid, { offer: 'OFFER' }, 'key=wrong').status !== 403) fail('offer without key');
  if (c2('POST', '/room/' + code + '/to/' + gid, { offer: 'OFFER' }, 'key=' + key).status !== 200) fail('offer');
  const g1 = c2('GET', '/room/' + code + '/guest/' + gid).json.msgs;
  if (g1.length !== 1 || g1[0].offer !== 'OFFER') fail('guest msgs ' + JSON.stringify(g1));
  if (c2('POST', '/room/' + code + '/answer', { gid, answer: 'ANSWER' }).status !== 200) fail('answer');
  const m2 = c2('GET', '/room/' + code + '/host', null, 'key=' + key).json.msgs;
  if (m2.length !== 1 || m2[0].answer !== 'ANSWER') fail('answer msgs ' + JSON.stringify(m2));
  // limits
  if (c2('POST', '/room/' + code + '/answer', { gid, answer: 'x'.repeat(LIMITS.maxBody + 10) }).status !== 413) fail('size limit');
  for (let i = 0; i < LIMITS.maxJoins + 2; i++) c2('POST', '/room/' + code + '/join', { gid: 'f'.repeat(8) + String(i).padStart(8, '0') });
  if (c2('POST', '/room/' + code + '/join', { gid: 'e'.repeat(16) }).status !== 429) fail('join cap');
  // persistence round trip
  const R3 = createRelay(); R3.load(JSON.parse(JSON.stringify(R2.dump())));
  if (R3.handle('GET', '/room/' + code + '/host', 'key=' + key, '', t).status !== 200) fail('restore');
  // expiry and closing
  t += LIMITS.roomTtl + 1;
  if (c2('GET', '/room/' + code + '/host', null, 'key=' + key).status !== 404) fail('expiry');
  const r4 = R2.handle('POST', '/room', '', '', t).json;
  if (R2.handle('DELETE', '/room/' + r4.code, 'key=bad', '', t).status !== 403) fail('close without key');
  if (R2.handle('DELETE', '/room/' + r4.code, 'key=' + r4.key, '', t).status !== 200) fail('close');
  if (R2.handle('POST', '/room/' + r4.code + '/join', '', JSON.stringify({ gid }), t).status !== 404) fail('closed room');
  if (R2.handle('GET', '/health', '', '', t).json.ok !== true) fail('health');
  // CORS: open by default, or limited to your own site
  if (corsFor('https://a.com', '')['access-control-allow-origin'] !== '*') fail('cors open');
  if (corsFor('https://a.com', 'https://a.com, https://www.a.com/')['access-control-allow-origin'] !== 'https://a.com') fail('cors allowed');
  if (corsFor('https://evil.com', 'https://a.com')['access-control-allow-origin'] !== undefined) fail('cors blocked');
  if (corsFor(undefined, 'https://a.com')['access-control-allow-origin'] !== undefined) fail('cors no origin');
  console.log(process.exitCode ? 'RELAY CORE FAILED' : 'RELAY CORE OK');
})();
