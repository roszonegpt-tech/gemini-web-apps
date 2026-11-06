// Cloudflare Worker version of the relay (one Durable Object holds all rooms, so it works on the free plan).
// Deploy: cd tools/relay && npx wrangler deploy   (see README.md). Then use the URL it prints as the game's relay.
import { createRelay, corsFor } from './core.mjs';

export class Relay {
  constructor(state) {
    this.state = state;
    this.relay = createRelay();
    // rooms survive the object being unloaded
    state.blockConcurrencyWhile(async () => { this.relay.load(await state.storage.get('rooms')); });
  }
  async fetch(request) {
    const url = new URL(request.url);
    const body = request.method === 'POST' ? await request.text() : '';
    const r = this.relay.handle(request.method, url.pathname, url.searchParams, body, Date.now());
    if (request.method !== 'GET' || url.pathname.endsWith('/host')) await this.state.storage.put('rooms', this.relay.dump());
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
}
// ALLOWED_ORIGINS (see wrangler.toml) limits which sites may use the relay; empty means any.
export default {
  async fetch(request, env) {
    const cors = corsFor(request.headers.get('origin'), env.ALLOWED_ORIGINS);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const res = await env.RELAY.get(env.RELAY.idFromName('main')).fetch(request);
    const headers = new Headers(res.headers);
    for (const k in cors) headers.set(k, cors[k]);
    return new Response(res.body, { status: res.status, headers });
  }
};
