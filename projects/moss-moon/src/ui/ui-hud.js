/* Moss & Moon — HUD (owner: UI agent). Vitals, objective, time chip, region banner, boss bar, spell hotbar,
 * potion slot, interaction prompt, message line, save indicator. Reads MM.campaign / MM.world when present,
 * baseline globals otherwise. Hidden whenever MM.state is not 'play' or a UI screen is open. */
(function () {
  'use strict';
  const MM = window.MM, ui = MM && MM.ui;
  if (!ui || ui.hud) return;
  const { h, safe, clamp } = ui;
  const D = ui.data;

  const SPELL_STYLE = {
    moonbolt: ['moonbolt', '#b9d3fb'], emberbloom: ['emberbloom', '#f7905c'], ember_bloom: ['emberbloom', '#f7905c'], thornbind: ['thornbind', '#8fcf7f'],
    frostbell: ['frostbell', '#9fe1f3'], starfall: ['starfall', '#f6dc96'],
  };
  const SCHOOL_COLOR = { Moon: '#b9d3fb', Fire: '#f7905c', Nature: '#8fcf7f', Frost: '#9fe1f3', Astral: '#f6dc96', Storm: '#f4de74', Arcane: '#c3aef3' };
  ui.spellStyle = function (s) {
    const id = String(s && s.id || '').toLowerCase();
    const st = SPELL_STYLE[id] || null;
    return { icon: (s && s.icon && ui.ICONS[s.icon]) ? s.icon : st ? st[0] : ui.iconFor(id + ' ' + (s && s.name || '').toLowerCase()), color: (st && st[1]) || (s && s.color) || SCHOOL_COLOR[s && s.school] || '#e9cf98' };
  };

  const hud = ui.hud = { el: null, visible: false };
  let E = {};
  const cache = {};
  const set = (key, el, prop, val) => { if (cache[key] !== val) { cache[key] = val; if (prop === 'text') el.textContent = val; else if (prop === 'w') el.style.width = val; else el.style.setProperty(prop, val); } };

  function bar(cls, label, icon) {
    const fill = h('i', { class: 'mm-bar-fill' }), ghost = h('i', { class: 'mm-bar-ghost' }), txt = h('span', { class: 'mm-bar-text' });
    const el = h('div', { class: 'mm-bar ' + cls, role: 'meter', 'aria-label': label, 'aria-valuemin': '0' }, ui.icon(icon, { cls: 'mm-bar-icon' }), h('div', { class: 'mm-bar-track' }, ghost, fill), txt);
    return { el, fill, ghost, txt };
  }

  hud.build = function () {
    const L = ui.layers.hud;
    L.innerHTML = '';
    const hp = bar('mm-bar-hp', 'Health', 'heart'), mp = bar('mm-bar-mp', 'Mana', 'drop');
    E = {
      hp, mp,
      name: h('span', { class: 'mm-vit-name' }),
      lvl: h('span', { class: 'mm-vit-lvl' }),
      xp: h('i', { class: 'mm-xp-fill' }),
      gold: h('span', { class: 'mm-gold-num' }),
      objTitle: h('strong', { class: 'mm-obj-title' }), objHint: h('span', { class: 'mm-obj-hint' }),
      timeIcon: h('span', { class: 'mm-time-icon' }), timeMain: h('strong'), timeSub: h('span'),
      banner: h('div', { class: 'mm-banner', 'aria-live': 'polite' }),
      boss: h('div', { class: 'mm-boss', hidden: true }),
      msg: h('div', { class: 'mm-msg', 'aria-live': 'polite' }),
      prompt: h('button', { type: 'button', class: 'mm-prompt', hidden: true, 'aria-label': 'Interact' }),
      hotbar: h('div', { class: 'mm-hotbar', role: 'toolbar', 'aria-label': 'Spells' }),
      spellName: h('div', { class: 'mm-spellname' }),
      potion: h('button', { type: 'button', class: 'mm-slot mm-slot-potion', 'aria-label': 'Drink potion (H)' }),
      save: h('div', { class: 'mm-saveind', hidden: true }, ui.icon('moon'), h('span', null, 'Saved')),
    };
    const medal = h('div', { class: 'mm-medal', 'aria-hidden': 'true' }, ui.icon('moon'), E.lvl);
    const vitals = h('div', { class: 'mm-vitals mm-glass' }, medal,
      h('div', { class: 'mm-vit-main' },
        h('div', { class: 'mm-vit-top' }, E.name, h('span', { class: 'mm-gold', title: 'Gold' }, ui.icon('coin'), E.gold)),
        hp.el, mp.el, h('div', { class: 'mm-xp', role: 'meter', 'aria-label': 'Experience' }, E.xp)));
    const obj = h('div', { class: 'mm-objective mm-glass', 'aria-live': 'polite' }, ui.icon('flag', { cls: 'mm-obj-icon' }), h('div', null, E.objTitle, E.objHint));
    E.obj = obj;
    const pauseBtn = ui.button('', () => ui.openPause(), { cls: 'mm-btn-icon mm-pausebtn', icon: 'pause', aria: 'Pause menu (Esc)', title: 'Pause (Esc)' });
    const timeChip = h('div', { class: 'mm-time mm-glass', title: 'Day, time, season and weather' }, E.timeIcon, h('div', null, E.timeMain, E.timeSub));
    E.potion.append(ui.icon('potion'), h('span', { class: 'mm-slot-count' }), h('kbd', { class: 'mm-slot-key' }, 'H'));
    E.potion.addEventListener('click', () => { ui.input && ui.input.action('potion'); });
    E.prompt.addEventListener('click', () => { ui.input && ui.input.action('interact'); });

    L.append(
      h('div', { class: 'mm-hud-tl' }, vitals, obj),
      h('div', { class: 'mm-hud-tc' }, E.banner, E.boss),
      h('div', { class: 'mm-hud-tr' }, timeChip, pauseBtn, E.save),
      h('div', { class: 'mm-hud-bc' }, E.msg, E.prompt, E.spellName, h('div', { class: 'mm-hotrow' }, E.hotbar, E.potion)),
    );
    hud.el = L;
  };

  // ---------------------------------------------------------------- hotbar
  let hotSig = '';
  function renderHotbar(spells) {
    const sig = spells.map((s) => s.id + (s.unlocked === false ? '0' : '1')).join(',');
    if (sig === hotSig) return;
    hotSig = sig;
    cache.method = null;
    E.hotbar.innerHTML = '';
    E.slots = spells.map((s, i) => {
      const st = ui.spellStyle(s);
      const b = h('button', { type: 'button', class: 'mm-slot', 'data-spell': s.id, style: { '--spell': st.color }, 'aria-label': (s.name || s.id) + ' (key ' + (s.key || i + 1) + ')' + (s.unlocked === false ? ' — locked' : '') },
        ui.icon(s.unlocked === false ? 'lock' : st.icon), h('i', { class: 'mm-cd' }), h('kbd', { class: 'mm-slot-key' }, s.key || String(i + 1)));
      b.addEventListener('click', () => {
        if (s.unlocked === false) { ui.toast((s.name || 'This spell') + ' is still sealed' + (s.lockReason ? ' — ' + s.lockReason : '.'), 'info', { icon: 'lock' }); return; }
        D.selectSpell(s); ui.sfx('ui_move');
      });
      E.hotbar.appendChild(b);
      return b;
    });
  }

  // ---------------------------------------------------------------- prompt (MM.world interactables, else farm plots)
  hud.promptInfo = function () {
    const g = ui.base.player(), w = ui.base.world();
    if (!g || !w) return null;
    const key = ui.glyph('interact');
    if (MM.world && typeof MM.world.currentPrompt === 'function') {
      const c = safe(() => MM.world.currentPrompt(), null);
      if (c && c.prompt) return { text: c.prompt, key, source: c.kind || 'world', dim: !!c.locked };
      if (!safe(() => w.region === 'grove' && w.mode === 'outside', false)) return null;
    } else {
      const near = MM.world && typeof MM.world.nearestInteractable === 'function' ? safe(() => MM.world.nearestInteractable(g.x, g.y), null) : null;
      if (near && near.prompt) return { text: near.prompt, key, source: 'world' };
    }
    if (w.region !== 'grove' || w.mode !== 'outside' || !Array.isArray(w.plots)) return null;
    const dist = (p) => safe(() => screenDistance(g, p), Infinity); // eslint-disable-line no-undef
    let best = null, bd = Infinity;
    for (const p of w.plots) { const d = dist(p); if (d < bd) { bd = d; best = p; } }
    if (!best || bd > 52) return null;
    const S = ui.base.seeds();
    const nm = (id) => (S[id] && S[id].name) || id;
    if (!best.seed) { const n = (w.seeds && w.seeds[w.seed]) || 0; return { text: n > 0 ? 'Plant ' + nm(w.seed) + ' (' + n + ')' : 'No ' + nm(w.seed) + ' seeds', key, dim: n <= 0, source: 'plot' }; }
    if (best.growth >= 100) return { text: 'Harvest ' + nm(best.seed), key, source: 'plot', ready: true };
    if (!best.watered) return { text: 'Water ' + nm(best.seed), key, source: 'plot' };
    return { text: nm(best.seed) + ' · ' + Math.floor(best.growth) + '% grown', key, dim: true, source: 'plot' };
  };

  // ---------------------------------------------------------------- banner / message / save indicator
  let bannerTimer = 0, lastRegionKey = null;
  hud.banner = function (title, sub) {
    E.banner.innerHTML = '';
    E.banner.append(h('span', { class: 'mm-banner-orn', 'aria-hidden': 'true' }), h('strong', null, title));
    if (sub) E.banner.append(h('small', null, sub));
    E.banner.classList.remove('mm-show'); void E.banner.offsetWidth; E.banner.classList.add('mm-show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => E.banner.classList.remove('mm-show'), 3400);
  };
  let msgTimer = 0, lastMsg = '', lastPolled = '';
  hud.message = function (text) {
    if (!text) return;
    if (ui._lastToast && ui._lastToast.text === String(text) && Date.now() - ui._lastToast.t < 1500) return; // already shown as a toast
    if (text === lastMsg && E.msg.classList.contains('mm-show')) { clearTimeout(msgTimer); } else { E.msg.textContent = text; E.msg.classList.remove('mm-show'); void E.msg.offsetWidth; E.msg.classList.add('mm-show'); }
    lastMsg = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => E.msg.classList.remove('mm-show'), 2200);
  };
  let saveTimer = 0;
  hud.saved = function (ok) {
    if (!E.save) return;
    E.save.hidden = false;
    E.save.classList.toggle('mm-bad', ok === false);
    E.save.lastChild.textContent = ok === false ? 'Save failed' : 'Saved';
    E.save.classList.remove('mm-show'); void E.save.offsetWidth; E.save.classList.add('mm-show');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { E.save.classList.remove('mm-show'); }, 1800);
  };

  // ---------------------------------------------------------------- per-frame update
  function visibleNow() {
    return ui.inGameplay() && !ui.isOpen();
  }
  let lastText = 0;
  hud.update = function (force) {
    const vis = visibleNow();
    if (vis !== hud.visible) {
      hud.visible = vis;
      ui.layers.hud.classList.toggle('mm-hidden', !vis);
      ui.layers.hud.setAttribute('aria-hidden', String(!vis));
      if (vis) force = true;
    }
    if (!vis) return;
    const v = D.vitals();
    if (v) {
      const hpP = clamp(v.hp / v.maxHp, 0, 1), mpP = clamp(v.mana / v.maxMana, 0, 1);
      set('hpw', E.hp.fill, 'w', (hpP * 100).toFixed(1) + '%');
      set('mpw', E.mp.fill, 'w', (mpP * 100).toFixed(1) + '%');
      set('hpt', E.hp.txt, 'text', Math.ceil(v.hp) + ' / ' + Math.round(v.maxHp));
      set('mpt', E.mp.txt, 'text', Math.floor(v.mana) + ' / ' + Math.round(v.maxMana));
      E.hp.el.classList.toggle('mm-low', hpP < 0.3);
      set('xpw', E.xp, 'w', (clamp(v.xp / v.xpNext, 0, 1) * 100).toFixed(1) + '%');
      set('gold', E.gold, 'text', v.gold.toLocaleString());
      set('lvl', E.lvl, 'text', String(v.level));
      set('pot', E.potion.querySelector('.mm-slot-count'), 'text', String(v.potions));
      E.potion.classList.toggle('mm-empty', v.potions < 1);
      if (cache.hpAria !== Math.round(v.hp)) { cache.hpAria = Math.round(v.hp); E.hp.el.setAttribute('aria-valuenow', String(cache.hpAria)); E.hp.el.setAttribute('aria-valuemax', String(Math.round(v.maxHp))); }
    }
    // spells every frame (cooldown rings)
    const spells = D.spells();
    renderHotbar(spells);
    let sel = null;
    spells.forEach((s, i) => {
      const b = E.slots && E.slots[i]; if (!b) return;
      const cd = D.cooldown(s);
      set('cd' + i, b, '--cd', String(Math.round(cd * 1000) / 1000));
      b.classList.toggle('mm-selected', !!s.selected);
      b.classList.toggle('mm-locked', s.unlocked === false);
      b.classList.toggle('mm-nomana', !!(v && s.cost && v.mana < s.cost && s.unlocked !== false));
      if (s.selected) sel = s;
    });
    const now = performance.now();
    if (!force && now - lastText < 150) return;
    lastText = now;
    const method = ui.method();
    if (cache.method !== method) {
      cache.method = method;
      ui.layers.hud.dataset.method = method;
      if (E.slots) E.slots.forEach((b, i) => { const k = b.querySelector('.mm-slot-key'); if (k) k.textContent = method === 'gamepad' ? (i === 0 ? 'RB' : '') : method === 'touch' ? '' : String(i + 1); });
      E.potion.querySelector('.mm-slot-key').textContent = method === 'touch' ? '' : ui.glyph('potion');
    }
    set('spn', E.spellName, 'text', sel ? sel.name + (sel.cost ? ' · ' + sel.cost + ' mana' : '') : '');
    set('name', E.name, 'text', D.playerName());
    const o = D.objective();
    set('ot', E.objTitle, 'text', o ? o.title : '');
    set('oh', E.objHint, 'text', o ? (o.hint || o.why || '') : '');
    E.obj.hidden = !o;
    const t = D.time();
    if (t) {
      set('tm', E.timeMain, 'text', 'Day ' + t.day + ' · ' + t.label);
      set('ts', E.timeSub, 'text', t.season + ' · ' + t.weather);
      const icon = t.weather === 'Rain' ? 'rain' : t.weather === 'Wind' ? 'wind' : t.night ? 'moon' : 'sun';
      if (cache.ticon !== icon) { cache.ticon = icon; E.timeIcon.innerHTML = ''; E.timeIcon.appendChild(ui.icon(icon)); E.timeIcon.dataset.kind = icon; }
    }
    const r = D.region();
    if (r && r.key !== lastRegionKey) {
      const first = lastRegionKey === null;
      lastRegionKey = r.key;
      if (!first || force) hud.banner(r.name, r.sub || null);
    }
    // boss bar
    const boss = ui.base.enemies().find((e) => e && e.boss && !e.dead && e.hp > 0);
    const bossInfo = boss || hud.bossOverride;
    if (bossInfo) {
      E.boss.hidden = false;
      if (cache.bossName !== bossInfo.name) {
        cache.bossName = bossInfo.name;
        E.boss.innerHTML = '';
        E.bossFill = h('i', { class: 'mm-boss-fill' });
        E.boss.append(h('div', { class: 'mm-boss-name' }, ui.icon('crown'), h('span', null, bossInfo.name || 'Guardian')), h('div', { class: 'mm-boss-track', role: 'meter', 'aria-label': (bossInfo.name || 'Boss') + ' health' }, E.bossFill));
      }
      E.bossFill.style.width = (clamp(bossInfo.hp / (bossInfo.maxHP || 1), 0, 1) * 100).toFixed(1) + '%';
    } else if (!E.boss.hidden) { E.boss.hidden = true; cache.bossName = null; }
    // prompt
    const pi = hud.promptInfo();
    if (pi) {
      const sig = pi.text + '|' + pi.key + '|' + !!pi.dim;
      if (cache.prompt !== sig) {
        cache.prompt = sig;
        E.prompt.innerHTML = '';
        E.prompt.append(h('kbd', { class: 'mm-kbd' }, pi.key), h('span', null, pi.text));
        E.prompt.classList.toggle('mm-dim', !!pi.dim);
        E.prompt.setAttribute('aria-label', pi.text);
      }
      E.prompt.hidden = false;
    } else if (!E.prompt.hidden) { E.prompt.hidden = true; cache.prompt = null; }
    // baseline message() line (polled; the bus 'message' event feeds the same line)
    const m = ui.base.message();
    if (m && m !== lastPolled) hud.message(m);
    lastPolled = m;
  };


  hud.init = function () {
    hud.build();
    ui.layers.hud.classList.add('mm-hidden');
    ui.on('message', (d) => hud.message(d && (d.text || d)));
    ui.on('save', (d) => { if (!d || d.ok !== false) hud.saved(true); else hud.saved(false); });
    ui.on('levelup', (d) => ui.toast('Level ' + ((d && d.level) || '') + '! You feel the moon’s favour.', 'level'));
    ui.on('objective', () => { if (E.obj) { E.obj.classList.remove('mm-pulse'); void E.obj.offsetWidth; E.obj.classList.add('mm-pulse'); } hud.update(true); });
    ui.on('region', (d) => { /* banner handled by region polling; force refresh */ lastRegionKey = lastRegionKey === null ? null : lastRegionKey; hud.update(true); });
    ui.on('boss', (d) => {
      if (!d) return;
      if (d.phase === 'spawn' && d.enemy) ui.toast((d.enemy.name || 'A guardian') + ' awakens!', 'warn', { icon: 'crown' });
      if (d.phase === 'defeated' && d.enemy) ui.toast((d.enemy.name || 'The guardian') + ' is defeated!', 'good', { icon: 'crown' });
      if (d.name && typeof d.hp === 'number') hud.bossOverride = d.phase === 'defeated' ? null : { name: d.name, hp: d.hp, maxHP: d.maxHP || d.maxHp || 1 };
    });
    ui.on('state', (d) => {
      if (d && ui.GAME_STATES.includes(d.to) && !ui.GAME_STATES.includes(d.from) && !['menu', 'dialogue'].includes(d.from)) {
        setTimeout(() => { const r = D.region(); if (r) { lastRegionKey = r.key; if (ui.inGameplay() && !ui.stateIs('interior')) hud.banner(r.name, r.sub || null); } }, 60);
      }
    });
    ui.tick(() => hud.update(false));
  };
})();
