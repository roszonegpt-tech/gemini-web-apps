# Get em Billy relay (for 6-digit room codes)

A tiny matchmaking service. When a player hosts, it hands out a 6-digit code; friends type the code and the relay passes the
two small handshake messages they need to connect. **No game data goes through it**, the players connect directly (WebRTC).
Without a relay the game still works with long copy-and-paste codes.

## Run it yourself (any machine with Node 18+)
    node tools/relay/node-server.mjs 8787
Open the game as `index.html?relay=http://YOUR-ADDRESS:8787` once; the game remembers it. The page and the relay must be reachable
by every player (use `https://` for the relay if the page is served over `https://`).

## Deploy it free on Cloudflare (recommended)
1. Make a free Cloudflare account and install Node.
2. `cd tools/relay && npx wrangler login && npx wrangler deploy`
   (Cloudflare's current docs: "Durable Objects" and "Wrangler deploy"; the config is in `wrangler.toml`.)
3. It prints a URL like `https://get-em-billy-relay.YOURNAME.workers.dev`. Test it: open that URL, you should see `{"ok":true,...}`.
4. Build the game with it baked in: `RELAY_URL=https://get-em-billy-relay.YOURNAME.workers.dev node tools/build_offline.js`
   (the same variable works for `tools/build_demo.sh`), or set `NET_RELAY` near the top of `index.html`, or open the game once with `?relay=URL`.

## Limits and safety
- Rooms live 20 minutes after the host last checked in. At most 5000 rooms; a room allows 40 join attempts.
- A 6-digit code can be guessed, so the host sees every player who joins and can kick them; games can't be joined once they start.
- The relay never sees game data. Handshake messages contain network addresses, as in any peer-to-peer game.
- Tests: `node tests/relay_core.js` (the logic) and `node tests/online.js` (two browsers through a local relay).
