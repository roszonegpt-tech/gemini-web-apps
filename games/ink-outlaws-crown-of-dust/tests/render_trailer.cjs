/* Renders a film frame by frame and encodes it with ffmpeg (H.264 + AAC, 30 fps).
   node tests/render_trailer.cjs yt|tt [out dir] [--film trailer|guide] [--sheet] [--frames N]
   trailer: canvas frames into build/trailer.  guide: page screenshots (menus, HUD, captions) into build/guide, plus .srt and chapters;
   run build/make_vo.py first for the narration.
   --sheet writes one JPG per shot (contact sheet) instead of a video. Needs Playwright (Chromium) and ffmpeg on PATH. */
const { chromium } = require('playwright'), serve = require('./serve.cjs'), fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
(async () => {
  const args = process.argv.slice(2), fmt = args[0] === 'tt' ? 'tt' : 'yt', root = path.resolve(__dirname, '..');
  const film0 = args.indexOf('--film') >= 0 ? args[args.indexOf('--film') + 1] : 'trailer', out = path.resolve(args[1] && !args[1].startsWith('--') ? args[1] : path.join(root, 'build', film0 === 'guide' ? 'guide' : 'trailer'));
  const sheet = args.includes('--sheet'), fi = args.indexOf('--frames'), maxF = fi >= 0 ? +args[fi + 1] : 0, fl = args.indexOf('--film'), film = fl >= 0 ? args[fl + 1] : 'trailer', guide = film === 'guide';
  const size = guide ? (fmt === 'tt' ? {width: 540, height: 960} : {width: 1280, height: 720}) : (fmt === 'tt' ? {width: 1080, height: 1920} : {width: 1920, height: 1080}), dsf = guide ? (fmt === 'tt' ? 2 : 1.5) : 1;
  const name = 'Crown_of_Dust_' + (guide ? 'Guide' : 'Trailer') + (fmt === 'tt' ? '_TikTok_1080x1920' : '_YouTube_1080p');
  fs.mkdirSync(out, {recursive: true});
  const s = await serve(0), b = await chromium.launch({args: ['--js-flags=--max-old-space-size=4096']}), pg = await b.newPage({viewport: size, deviceScaleFactor: dsf}); let errs = 0;
  pg.on('pageerror', e => { errs++; console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(1, 4).join(' | ')); }); pg.on('console', m => { if (m.type() === 'error') { errs++; console.log('[console.error]', m.text().slice(0, 400)); } });
  await pg.goto('http://localhost:' + s.address().port + '/trailer/' + (guide ? 'guide' : 'index') + '.html#' + fmt + '-render'); await pg.waitForFunction(() => window.TR && TR.ready, null, {timeout: 30000}); await pg.waitForTimeout(300);
  const info = await pg.evaluate(() => ({frames: TR.frames, duration: TR.duration, cuts: TR.cuts()})); const N = maxF || info.frames;
  console.log(fmt, 'frames', info.frames, 'duration', info.duration.toFixed(2), 'shots', info.cuts.length);
  const t0 = Date.now();
  if (sheet) {
    for (let i = 0; i < info.cuts.length; i++) { const nx = i + 1 < info.cuts.length ? info.cuts[i + 1] : info.duration, f = Math.min(info.frames - 1, Math.round(((info.cuts[i] + nx) / 2) * 30));
      const file = path.join(out, fmt + '_shot' + String(i).padStart(2, '0') + '.jpg');
      if (guide) { await pg.evaluate(f => TR.render(f), f); await pg.waitForTimeout(60); await pg.screenshot({path: file, type: 'jpeg', quality: 80}); }
      else { const d = await pg.evaluate(f => { TR.render(f); return TR.grab('image/jpeg', 0.85); }, f); fs.writeFileSync(file, Buffer.from(d.split(',')[1], 'base64')); } }
    console.log('sheet done in', ((Date.now() - t0) / 1000).toFixed(1), 's, errors', errs); await b.close(); s.close(); process.exit(errs ? 1 : 0);
  }
  const vid = path.join(out, name + '.video.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(process.env.CRF || 20), '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', vid], {stdio: ['pipe', 'inherit', 'inherit']});
  for (let f = 0; f < N; f++) {
    let buf;
    if (guide) { await pg.evaluate(f => TR.render(f), f); buf = await pg.screenshot({type: 'jpeg', quality: 92}); }
    else { const d = await pg.evaluate(f => { TR.render(f); return TR.grab('image/jpeg', 0.95); }, f); buf = Buffer.from(d.split(',')[1], 'base64'); }
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 150 === 0) console.log('frame', f, '/', N, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  const wav = path.join(out, 'soundtrack_' + fmt + '.wav'); fs.writeFileSync(wav, Buffer.from(await pg.evaluate(d => TR.audioWav(d), N / 30 + 0.3), 'base64'));
  const final = path.join(out, name + '.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', vid, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final]);
  fs.unlinkSync(vid);
  if (guide) {                                                 // subtitles and chapter list from the director's caption plan
    const caps = await pg.evaluate(() => TR.captions()), chaps = await pg.evaluate(() => TR.chapters()), tc = (t, ms) => { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s2 = Math.floor(t % 60), f = Math.round((t % 1) * 1000) % 1000; return (ms ? [h, m, s2].map(v => String(v).padStart(2, '0')).join(':') + ',' + String(f).padStart(3, '0') : m + ':' + String(s2).padStart(2, '0')); };
    fs.writeFileSync(path.join(out, name + '.srt'), caps.map((c, i) => (i + 1) + '\n' + tc(c.t0, 1) + ' --> ' + tc(Math.min(c.t1, i + 1 < caps.length ? caps[i + 1].t0 : c.t1), 1) + '\n' + c.text + '\n').join('\n'));
    fs.writeFileSync(path.join(out, name + '_chapters.txt'), chaps.map(c => tc(c.t) + ' ' + c.title).join('\n') + '\n');
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, N / 30 - 2.2)), '-i', final, '-frames:v', '1', '-q:v', '3', path.join(out, name + '_poster.jpg')]);
  console.log('wrote', final, (fs.statSync(final).size / 1e6).toFixed(1) + ' MB in', ((Date.now() - t0) / 1000).toFixed(0) + 's, sound events', await pg.evaluate(() => TR.log.length), 'errors', errs);
  await b.close(); s.close(); process.exit(errs ? 1 : 0);
})();
