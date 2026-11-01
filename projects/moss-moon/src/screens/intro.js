// Moss & Moon — intro state 'intro' (owner: SCREENS). Hosts the cinematics agent's MM.cine.play('intro') inside its own
// application state (nothing of the game is simulated or drawn). Persistent, focusable "Skip intro" button (+ Esc, and the
// player's own Space/Enter/click/hold-to-skip), captions and reduced motion come from MM.cine + settings. On end or skip →
// MM.flow.afterIntro() (sets introSeen, → title). Replays from the main menu re-enter this state each time.
(function () {
  'use strict';
  const MM = window.MM;
  if (!MM || !MM.flow || !MM.flow.kit) return;
  const K = MM.flow.kit, { el } = K;
  let S = null, token = 0;

  function enter(data) {
    const sess = K.session('intro'), my = ++token;
    S = { sess, my, t: 0, replay: !!(data && data.replay), done: false, result: null, started: false };
    sess.htmlClass('mm-scr-intro');
    sess.ambient('intro', null);
    // Our chrome lives in #mm-ui (z 100) so it sits above the cinematic overlay (z 50).
    const host = document.getElementById('mm-ui') || document.getElementById('mm-stage') || document.body;
    const chrome = sess.root('mm-intro-chrome', host);
    const skip = el('button', { type: 'button', class: 'mm-scr-skip mm-on', 'aria-label': 'Skip intro', 'aria-keyshortcuts': 'Escape' },
      el('span', { text: 'Skip intro' }), el('kbd', { class: 'mm-scr-skip-key', 'aria-hidden': 'true', text: 'Esc' }), el('i', { class: 'mm-scr-skip-ico', 'aria-hidden': 'true' }));
    const live = el('p', { class: 'mm-scr-sr', 'aria-live': 'polite', text: S.replay ? 'Replaying the intro. Press Escape to skip.' : 'The story begins. Press Escape to skip.' });
    chrome.append(skip, live);
    S.skipBtn = skip;
    sess.on(skip, 'click', (e) => { e.stopPropagation(); doSkip(); });
    sess.on(skip, 'pointerdown', (e) => e.stopPropagation());
    // The cinematic swallows keys in its own capture listener while it plays; this one only matters before it starts / if it is missing.
    sess.on(document, 'keydown', (e) => { if (e.key === 'Escape' && !K.uiBusy()) { e.preventDefault(); doSkip(); } });
    start(my);
  }
  function start(my) {
    const C = MM.cine;
    if (!C || typeof C.play !== 'function' || (C.has && !C.has('intro'))) { finish({ id: 'intro', completed: false, reason: 'no-cine' }); return; }
    S.started = true;
    let p;
    try { p = C.play('intro', { skippable: true, force: true, replay: S.replay }); } catch (e) { console.warn('[intro]', e); p = null; }
    if (!p || typeof p.then !== 'function') { finish({ id: 'intro', completed: false, reason: 'play-failed' }); return; }
    p.then((r) => { if (S && S.my === my) finish(r || {}); }, () => { if (S && S.my === my) finish({ id: 'intro', completed: false, reason: 'error' }); });
  }
  function doSkip() {
    if (!S || S.done) return;
    S.skipBtn.disabled = true;
    const C = MM.cine;
    if (C && typeof C.isPlaying === 'function' && C.isPlaying() && typeof C.skip === 'function') { K.safe(() => C.skip()); return; } // resolves the promise → finish
    finish({ id: 'intro', skipped: true, completed: true });
  }
  function finish(r) {
    if (!S || S.done) return; S.done = true; S.result = r;
    MM.bus && MM.bus.emit && MM.bus.emit('intro:end', { skipped: !!r.skipped, completed: r.completed !== false, replay: S.replay });
    if (r.completed === false && r.reason !== 'no-cine') { MM.flow.toTitle(); return; }
    if (r.reason === 'no-cine') { MM.flow.toTitle(); return; }
    MM.flow.afterIntro(r);
  }
  function update(dt) { if (S) S.t += dt; }
  function exit() {
    // Leaving early (e.g. a test or another flow call): make sure the cinematic closes too.
    if (S && !S.done) { S.done = true; const C = MM.cine; if (C && C.isPlaying && C.isPlaying()) K.safe(() => C.skip()); }
  }
  function cleanup() { if (S) { S.sess.dispose(); S = null; } }
  const def = {
    sim: 'none', draw: 'none', audio: { keep: true },
    enter, update, exit, cleanup,
    _debug: () => (S ? { t: S.t, replay: S.replay, done: S.done, started: S.started } : null),
  };
  if (MM.screens && typeof MM.screens.register === 'function') MM.screens.register('intro', def);
  MM.flow.intro = def;
})();
