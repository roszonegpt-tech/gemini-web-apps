/* Crown of Dust - persistence (src/core/save.js). One versioned localStorage key holds the campaign; see saves/SAVE_SCHEMA.md. */
(function () {
'use strict';
const CD = window.CD;
const KEY = 'crown_of_dust_save_v1', SET = 'crown_of_dust_settings_v1', LAB = 'chunklab_outlaws_look_v1';
const S = CD.Save = {KEY: KEY};
const get = k => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
S.mem = null;                                 // the last save, kept in memory too, so Continue still works when browser storage is blocked
S.load = () => { const s = get(KEY) || S.mem; return s && s.v === 1 ? s : null; };
S.store = st => { const o = Object.assign({v: 1, at: Date.now()}, st); S.mem = o; return put(KEY, o); };
S.wipe = () => { S.mem = null; try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ } };
S.settings = Object.assign({sound: true, shake: true}, get(SET) || {});
S.saveSettings = () => put(SET, S.settings);
/* the look last edited in the Chunk Lab (same origin), validated against the lab schema so a bad value can never reach the painter */
S.labLook = function () {
  const src = get(LAB), INK = window.INK; if (!src || typeof src !== 'object') return null;
  const out = INK.defaultLook();
  for (const f of INK.SCHEMA) { const v = src[f.key];
    if (f.type === 'choice') { if (f.options.some(o => o[0] === v)) out[f.key] = v; }
    else if (f.type === 'color') { if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) out[f.key] = v.toLowerCase(); }
    else if (f.type === 'toggle') { if (typeof v === 'boolean') out[f.key] = v; } }
  if (INK.WEAPONS.some(w => w[0] === src.weapon)) out.weapon = src.weapon;
  if (INK.EXPRS.some(e => e[0] === src.expr)) out.expr = src.expr;
  const b = INK.kit; if (b.BEAST[out.build] || b.BLOB[out.build]) out.build = 'regular';     // the hero must be able to hold a weapon
  return out;
};
})();
