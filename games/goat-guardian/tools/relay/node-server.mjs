// Run the relay on your own machine or a small server: node tools/relay/node-server.mjs [port]
// Then point the game at it with ?relay=http://your-host:port (or build with RELAY_URL=...).
import http from 'node:http';
import { createRelay, corsFor } from './core.mjs';

// ALLOWED_ORIGINS=https://yourgame.com,https://www.yourgame.com limits which sites may use it (default: any).
export function startRelay(port = 8787, host = '0.0.0.0', allowed = process.env.ALLOWED_ORIGINS) {
  const relay = createRelay();
  const server = http.createServer((req, res) => {
    const CORS = corsFor(req.headers.origin, allowed);
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 20000) req.destroy(); });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const r = relay.handle(req.method, url.pathname, url.searchParams, body, Date.now());
      res.writeHead(r.status, Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, CORS));
      res.end(JSON.stringify(r.json));
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve({ server, port: server.address().port, relay })));
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = +process.argv[2] || 8787;
  startRelay(port).then((r) => console.log('Get em Billy relay listening on port ' + r.port));
}
