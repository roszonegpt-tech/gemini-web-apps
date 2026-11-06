// Shared by the build scripts: bakes the relay address into a copy of index.html.
// RELAY_URL=https://relay.yourdomain.com node tools/build_site.js   (also build_offline.js)
module.exports = function bakeRelay(html, url) {
  url = String(url || process.env.RELAY_URL || '').trim().replace(/\/+$/, '');
  if (!url) return html;
  if (!/^https?:\/\/[^\s'"\\]+$/.test(url)) { console.error('RELAY_URL must be an http(s) address without quotes or spaces'); process.exit(1); }
  if (!html.includes("const NET_RELAY = '';")) { console.error('could not find NET_RELAY'); process.exit(1); }
  return html.replace("const NET_RELAY = '';", "const NET_RELAY = '" + url + "';");
};
