# Sprite Fusion pixel-art VFX (vendored source)

Source: https://www.spritefusion.com/pixel-art-vfx  (25 effects, one dependency-free TypeScript file each).
License: MIT, Copyright (c) 2026 Hugo Duprez — the notice is kept in the header of every file.
Downloaded unmodified from `/downloads/pixel-art-vfx/<name>.zip`. Do not edit these files; they are
converted to classic-script JS by `node tools/port-sfvfx.js`, which writes `src/systems/sfvfx.js`
(`MM.sfvfx.<camelName>(options)` -> `{update(dt), draw(frame, layer?), done()}`).

Frame = `{w,h,ox,oy,color:Uint32Array,light:Uint32Array}` in *logical pixels*; effect coordinates are in
"units" where 1 logical pixel = `PX` (=2) units. See `src/systems/vfx-bridge.js` for how the game maps these.
