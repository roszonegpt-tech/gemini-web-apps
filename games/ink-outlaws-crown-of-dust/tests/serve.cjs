/* Tiny static server for the tests: node tests/serve.cjs [port] (serves the project folder). */
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), TYPES = {'.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png'};
module.exports = function serve(port) {
  return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p);
    if (!f.startsWith(root)) { r.writeHead(403); return r.end(); }
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end('not found'); } else { r.writeHead(200, {'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store'}); r.end(d); } }); });
    s.listen(port || 0, () => res(s)); });
};
if (require.main === module) module.exports(+process.argv[2] || 8080).then(s => console.log('http://localhost:' + s.address().port + '/'));
