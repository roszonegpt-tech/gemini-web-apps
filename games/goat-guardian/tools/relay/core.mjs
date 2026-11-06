// Get em Billy relay: the tiny matchmaking service behind 6-digit room codes.
// It only passes small handshake messages between a host and the friends joining; no game data goes through it.
// Pure logic (no network, no clock of its own) so the same code runs in Node and in a Cloudflare Worker.
//
//   POST   /room                      -> { code, key }          the host opens a room (6-digit code, secret key)
//   POST   /room/:code/join {gid}     -> { ok }                 a friend asks to join (gid: their random id)
//   GET    /room/:code/host?key=      -> { msgs: [...] }        the host reads (and clears) its mailbox
//   POST   /room/:code/to/:gid?key=   {offer}  -> { ok }        the host answers a friend with a connection offer
//   GET    /room/:code/guest/:gid     -> { msgs: [...] }        the friend reads (and clears) its mailbox
//   POST   /room/:code/answer {gid, answer} -> { ok }           the friend sends back its reply
//   DELETE /room/:code?key=           -> { ok }                 the host closes the room
export const LIMITS = { roomTtl: 20 * 60 * 1000, maxRooms: 5000, maxBody: 6000, maxQueue: 24, maxJoins: 40, maxGuestBoxes: 24 };
const hex = (n, rnd) => { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(rnd() * 16).toString(16); return s; };

export function createRelay(opts = {}) {
  const rnd = opts.random || Math.random;
  const rooms = new Map();
  const out = (status, json) => ({ status, json });
  const err = (status, msg) => out(status, { error: msg });
  function sweep(now) {
    for (const [c, r] of rooms) if (now - r.seen > LIMITS.roomTtl) rooms.delete(c);
  }
  function push(box, msg) { if (box.length >= LIMITS.maxQueue) box.shift(); box.push(msg); }
  function handle(method, path, query, bodyText, now) {
    sweep(now);
    const q = query instanceof URLSearchParams ? query : new URLSearchParams(query || '');
    const parts = path.replace(/^\/+|\/+$/g, '').split('/');
    if (parts[0] === '' || parts[0] === 'health') return out(200, { ok: true, rooms: rooms.size, service: 'get-em-billy-relay' });
    if (parts[0] !== 'room') return err(404, 'NOT FOUND');
    let body = {};
    if (method === 'POST') {
      if ((bodyText || '').length > LIMITS.maxBody) return err(413, 'MESSAGE TOO BIG');
      try { body = bodyText ? JSON.parse(bodyText) : {}; } catch (e) { return err(400, 'BAD REQUEST'); }
    }
    if (method === 'POST' && parts.length === 1) {
      if (rooms.size >= LIMITS.maxRooms) return err(503, 'THE RELAY IS BUSY, TRY AGAIN');
      let code = '';
      for (let i = 0; i < 60; i++) { const c = String(100000 + Math.floor(rnd() * 900000)); if (!rooms.has(c)) { code = c; break; } }
      if (!code) return err(503, 'THE RELAY IS BUSY, TRY AGAIN');
      const key = hex(24, rnd);
      rooms.set(code, { key, created: now, seen: now, host: [], guests: new Map(), joins: 0 });
      return out(200, { code, key });
    }
    const code = parts[1];
    const room = rooms.get(code);
    if (!/^\d{6}$/.test(code || '') || !room) return err(404, 'NO ROOM WITH THAT CODE');
    const isHost = () => q.get('key') === room.key;
    const sub = parts[2];
    if (method === 'POST' && sub === 'join') {
      const gid = String(body.gid || '');
      if (!/^[0-9a-f]{8,32}$/.test(gid)) return err(400, 'BAD REQUEST');
      if (room.joins >= LIMITS.maxJoins) return err(429, 'TOO MANY TRIES FOR THIS ROOM');
      room.joins++;
      if (!room.guests.has(gid)) { if (room.guests.size >= LIMITS.maxGuestBoxes) return err(429, 'TOO MANY TRIES FOR THIS ROOM'); room.guests.set(gid, []); }
      push(room.host, { t: 'join', gid });
      return out(200, { ok: true });
    }
    if (method === 'GET' && sub === 'host') {
      if (!isHost()) return err(403, 'NOT YOUR ROOM');
      room.seen = now;
      const msgs = room.host.splice(0);
      return out(200, { msgs });
    }
    if (method === 'POST' && sub === 'to') {
      if (!isHost()) return err(403, 'NOT YOUR ROOM');
      const gid = parts[3], box = room.guests.get(gid);
      if (!box) return err(404, 'NO SUCH PLAYER');
      if (typeof body.offer !== 'string') return err(400, 'BAD REQUEST');
      room.seen = now;
      push(box, { t: 'offer', offer: body.offer });
      return out(200, { ok: true });
    }
    if (method === 'GET' && sub === 'guest') {
      const box = room.guests.get(parts[3]);
      if (!box) return err(404, 'NO SUCH PLAYER');
      return out(200, { msgs: box.splice(0) });
    }
    if (method === 'POST' && sub === 'answer') {
      const gid = String(body.gid || '');
      if (!room.guests.has(gid) || typeof body.answer !== 'string') return err(400, 'BAD REQUEST');
      push(room.host, { t: 'answer', gid, answer: body.answer });
      return out(200, { ok: true });
    }
    if (method === 'DELETE' && parts.length === 2) {
      if (!isHost()) return err(403, 'NOT YOUR ROOM');
      rooms.delete(code);
      return out(200, { ok: true });
    }
    return err(404, 'NOT FOUND');
  }
  // rooms can be saved and restored (the Cloudflare version keeps them in Durable Object storage)
  const dump = () => [...rooms].map(([c, r]) => [c, { key: r.key, created: r.created, seen: r.seen, host: r.host, joins: r.joins, guests: [...r.guests] }]);
  const load = (a) => { rooms.clear(); for (const [c, r] of a || []) rooms.set(c, { key: r.key, created: r.created, seen: r.seen, host: r.host, joins: r.joins, guests: new Map(r.guests) }); };
  return { handle, dump, load, size: () => rooms.size };
}

// CORS headers for browsers. Empty list = any page may use the relay; otherwise only the listed origins
// (for example "https://yourgame.com"). The relay holds no secrets, this just keeps other sites from using your quota.
export function corsFor(origin, allowed) {
  const list = String(allowed || '').split(',').map((x) => x.trim().replace(/\/+$/, '')).filter(Boolean);
  const h = { 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' };
  if (!list.length) h['access-control-allow-origin'] = '*';
  else if (origin && list.indexOf(origin) >= 0) h['access-control-allow-origin'] = origin;
  return h;
}
