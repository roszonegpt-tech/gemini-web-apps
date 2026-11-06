// Shared by the build scripts: bakes the address of your own PeerServer into a copy of index.html (optional).
// By default the game uses the free PeerJS cloud broker. PEER_URL=https://peer.yourdomain.com/billy node tools/build_site.js
module.exports = function bakePeer(html, url) {
  url = String(url || process.env.PEER_URL || '').trim().replace(/\/+$/, '');
  if (!url) return html;
  if (!/^https?:\/\/[^\s'"\\]+$/.test(url)) { console.error('PEER_URL must be an http(s) address without quotes or spaces'); process.exit(1); }
  if (!html.includes("const NET_PEER = '';")) { console.error('could not find NET_PEER'); process.exit(1); }
  return html.replace("const NET_PEER = '';", "const NET_PEER = '" + url + "';");
};
