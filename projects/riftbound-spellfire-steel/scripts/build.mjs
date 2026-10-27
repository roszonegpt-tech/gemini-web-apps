// Build script: bundles src/ (TypeScript) into assets/js/riftbound.js (classic IIFE
// script so index.html also works from file://), then writes a fully standalone
// single-file build to dist/index.html plus a versioned copy in dist/releases/.
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const watch = process.argv.includes('--watch');

const options = {
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  minify: !watch,
  sourcemap: false,
  legalComments: 'eof',
  target: ['chrome90', 'firefox88', 'safari14.1', 'edge90'],
  outfile: join(root, 'assets/js/riftbound.js'),
  define: {
    __BUILD_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  logLevel: 'info',
};

function writeStandalone() {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const css = readFileSync(join(root, 'assets/css/style.css'), 'utf8');
  const js = readFileSync(join(root, 'assets/js/riftbound.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  let out = html.replace(/<link rel="stylesheet" href="assets\/css\/style\.css">/, () => `<style>\n${css}\n</style>`);
  out = out.replace(/<script src="assets\/js\/riftbound\.js"><\/script>/, () => `<script>\n${js}\n</script>`);
  if (out.includes('assets/js/riftbound.js') || out.includes('assets/css/style.css')) {
    throw new Error('standalone build: failed to inline css/js (check index.html tags)');
  }
  mkdirSync(join(root, 'dist/releases'), { recursive: true });
  writeFileSync(join(root, 'dist/index.html'), out);
  writeFileSync(join(root, `dist/releases/riftbound-v${pkg.version}.html`), out);
  console.log(`standalone: dist/index.html + dist/releases/riftbound-v${pkg.version}.html (${(out.length / 1024).toFixed(0)} KB)`);
}

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('watching src/ … (standalone dist is only written by a full build)');
} else {
  await esbuild.build(options);
  writeStandalone();
}
