/* Moss & Moon — menus (owner: UI agent): pause, inventory, equipment, spellbook, crafting, journal, map,
 * settings, controls, credits, memories, travel, shop. Data comes from MM.campaign.* with clearly marked
 * baseline FALLBACKs (used only while a campaign accessor is missing). */
(function () {
  'use strict';
  const MM = window.MM, ui = MM && MM.ui;
  if (!ui || ui._menus) return;
  ui._menus = true;
  const { h, safe, clamp } = ui;
  const D = ui.data;
  const result = (r, okMsg) => {
    if (r && typeof r === 'object') { if (r.msg) ui.toast(r.msg, r.ok === false ? 'warn' : 'good'); return r.ok !== false; }
    if (r === false) return false;
    if (okMsg) ui.toast(okMsg, 'good');
    return true;
  };
  const W = () => ui.base.world();
  const titleCase = (s) => String(s || '').replace(/(^|[\s_-])(\w)/g, (m, a, b) => (a ? ' ' : '') + b.toUpperCase()).trim();

  // ============================================================ PAUSE
  ui.openPause = function () {
    if (!ui.stateIs('play') && !ui.stateIs('menu')) return;
    if (!ui.isOpen('pause')) ui.open('pause');
  };
  ui.resume = function () { ui.closeAll(); ui.syncState(); };

  ui.registerScreen('pause', () => {
    const r = D.region(), t = D.time();
    const p = ui.panel({ title: 'Paused', subtitle: [r && r.name, t && ('Day ' + t.day + ' · ' + t.label)].filter(Boolean).join(' · '), icon: 'moon', cls: 'mm-panel-pause', onClose: () => ui.resume() });
    const grid = h('div', { class: 'mm-pause-grid' });
    const go = (id) => () => ui.open(id);
    const resume = ui.button('Resume', () => ui.resume(), { cls: 'mm-btn-primary mm-pause-resume', icon: 'play', key: 'Esc', silent: true });
    resume.dataset.autofocus = '1';
    const items = [
      ['Inventory', 'bag', go('inventory'), 'I'], ['Equipment', 'shield', go('equipment')], ['Spellbook', 'book', go('spellbook'), 'K'],
      ['Crafting & Brewing', 'cauldron', go('crafting')], ['Quest Journal', 'scroll', go('journal'), 'J'], ['Map', 'map', go('map'), 'M'],
    ];
    if (D.memories().length) items.push(['Memories', 'film', go('memories')]);
    items.push(['Settings', 'sliders', go('settings')], ['Controls', 'gamepad', go('controls')]);
    items.forEach(([l, ic, fn, k]) => grid.appendChild(ui.button(l, fn, { icon: ic, key: k })));
    const saveB = ui.button('Save Game', () => doSave(), { icon: 'bookmark' });
    const titleB = ui.button('Save & Return to Title', () => saveAndQuit(), { icon: 'exit', cls: 'mm-btn-ghost' });
    const o = D.objective();
    const objEl = o ? h('div', { class: 'mm-pause-obj' }, ui.icon('flag'), h('div', null, h('small', null, 'Current objective'), h('strong', null, o.title), o.hint ? h('span', null, o.hint) : null)) : null;
    p.body.append(resume, objEl, grid, h('div', { class: 'mm-pause-row' }, saveB, titleB));
    return { el: p.el, state: 'menu', label: 'Pause menu', back() { ui.resume(); return true; } };
  });

  function canSave() { return MM.game && typeof MM.game.safeToSave === 'function' ? safe(() => MM.game.safeToSave(), true) !== false : true; }
  function saveNow() {
    if (MM.game && typeof MM.game.saveNow === 'function') return safe(() => MM.game.saveNow(), false);
    if (ui.base.has('saveWorld')) { ui.base.call('saveWorld'); return true; } // FALLBACK: baseline save
    return false;
  }
  function doSave() {
    if (!canSave()) { ui.toast('You can’t save with enemies close by. Move somewhere calmer.', 'warn'); return false; }
    const ok = saveNow();
    if (ok === false) { ui.toast('Saving failed — storage may be full or disabled.', 'warn'); return false; }
    ui.toast('Journey saved.', 'save'); ui.sfx('save');
    return true;
  }
  async function saveAndQuit() {
    let ok = canSave() && saveNow() !== false;
    if (!ok) {
      const yes = await ui.confirm({ title: 'Leave without saving?', body: canSave() ? 'Saving failed. Progress since your last save will be lost if you return to the title now.' : 'It isn’t safe to save here — enemies are nearby. Progress since your last save will be lost.', yes: 'Return to Title', no: 'Stay', danger: true, icon: 'warn' });
      if (!yes) return;
    }
    ui.toTitle();
  }
  ui.toTitle = function () {
    ui.closeAll();
    if (MM.game && typeof MM.game.toTitle === 'function') { safe(() => MM.game.toTitle()); }
    if (!ui.stateIs('title')) ui.go('title');
    if (!ui.isOpen('title')) ui.open('title');
  };
  ui.doSave = doSave;

  // ============================================================ BOOK (tabbed panels)
  const BOOK = [['inventory', 'Inventory', 'bag'], ['equipment', 'Equipment', 'shield'], ['spellbook', 'Spellbook', 'book'], ['crafting', 'Crafting', 'cauldron'], ['journal', 'Journal', 'scroll'], ['map', 'Map', 'map']];
  function book(id, subtitle) {
    const meta = BOOK.find((b) => b[0] === id);
    const p = ui.panel({ title: meta[1], subtitle, icon: meta[2], cls: 'mm-panel-book' });
    const tabs = h('nav', { class: 'mm-tabs', role: 'tablist', 'aria-label': 'Journal sections' });
    BOOK.forEach(([tid, label, ic]) => {
      const b = h('button', { type: 'button', class: 'mm-tab', role: 'tab', 'aria-selected': String(tid === id), 'data-tab': tid }, ui.icon(ic), h('span', null, label));
      b.addEventListener('click', () => { if (tid !== id) { ui.sfx('ui_move'); ui.replace(tid); } });
      tabs.appendChild(b);
    });
    p.panel.insertBefore(tabs, p.body);
    const cycle = (dir) => { const i = BOOK.findIndex((b) => b[0] === id); ui.sfx('ui_move'); ui.replace(BOOK[(i + dir + BOOK.length) % BOOK.length][0]); };
    const inst = {
      el: p.el, label: meta[1], tabs,
      onKey(e) {
        const k = e.key.toLowerCase();
        if (k === 'q' || k === 'pageup' || k === '[') { cycle(-1); return true; }
        if ((k === 'e' && !e.target.closest('input')) || k === 'pagedown' || k === ']') { cycle(1); return true; }
        return false;
      },
      cycle,
    };
    return { p, inst };
  }
  ui.cycleBook = (dir) => { const t = ui.top(); if (t && t.cycle) t.cycle(dir); };

  // Detail pane used by inventory/equipment
  function detail(item, actions) {
    const box = h('div', { class: 'mm-detail' });
    if (!item) { box.appendChild(ui.empty('sparkle', 'Select an item', 'Choose something on the left to see details.')); return box; }
    box.append(
      h('div', { class: 'mm-detail-head' }, h('div', { class: 'mm-detail-icon' }, ui.itemIcon(item, 48)), h('div', null, h('h3', null, item.name || titleCase(item.id)), item.sub ? h('span', { class: 'mm-detail-sub' }, item.sub) : null)),
      item.desc ? h('p', { class: 'mm-detail-desc' }, item.desc) : null,
      item.stats && item.stats.length ? h('dl', { class: 'mm-stats' }, item.stats.map(([k, v]) => [h('dt', null, k), h('dd', null, String(v))])) : null,
      actions && actions.length ? h('div', { class: 'mm-detail-actions' }, actions) : null);
    return box;
  }

  // ============================================================ INVENTORY
  // FALLBACK inventory from baseline world (seeds, harvest, consumables, gear).
  function baselineInventory() {
    const w = W(); if (!w) return { groups: [] };
    const S = ui.base.seeds();
    const nm = (id) => (S[id] && S[id].name) || titleCase(id);
    const groups = [
      { name: 'Consumables', items: [
        { id: 'potion', name: 'Moon Tonic', count: w.potions, desc: 'Restores 40 health and 25 mana. Brewed from 2 wheat.', usable: true, kind: 'consumable' },
        { id: 'bomb', name: 'Ember Bomb', count: w.bombs, desc: 'A fiery bomb crafted from an ember pepper.', kind: 'consumable' },
        { id: 'rune', name: 'Rune Stone', count: w.runes, desc: 'Socket into equipment or empower a farm ward.', kind: 'material' }] },
      { name: 'Harvest', items: Object.keys(w.harvest || {}).map((k) => ({ id: 'harvest_' + k, name: nm(k), count: w.harvest[k], desc: 'Fresh from your garden. Used in brewing and sold at the village.', sellPrice: 9, kind: 'harvest' })) },
      { name: 'Seeds', items: Object.keys(w.seeds || {}).map((k) => ({ id: 'seed_' + k, name: nm(k) + ' Seeds', count: w.seeds[k], desc: (S[k] && S[k].season ? 'Grows best in ' + S[k].season + '. ' : '') + 'Plant in an empty garden plot.', kind: 'seed' })) },
    ];
    groups.forEach((g) => { g.items = g.items.filter((i) => i.count > 0); });
    return { groups: groups.filter((g) => g.items.length), fallback: true };
  }
  function getInventory() {
    const inv = ui.camp('inventory');
    if (inv && Array.isArray(inv.groups)) return inv;
    return baselineInventory();
  }
  ui.itemCounts = function () {
    const map = {};
    getInventory().groups.forEach((g) => (g.items || []).forEach((i) => { map[i.id] = (map[i.id] || 0) + (i.count || 0); }));
    return map;
  };
  function useItem(item) {
    if (ui.hasCamp('useItem')) return result(ui.camp('useItem', item.id));
    if (item.id === 'potion') { ui.base.call('drink'); return true; } // FALLBACK
    ui.toast('That can’t be used right now.', 'info');
    return false;
  }
  let invSort = 'group', invSel = null;
  ui.registerScreen('inventory', () => {
    const { p, inst } = book('inventory', 'Everything you carry');
    const sortSeg = ui.segmented('Sort items', [['group', 'Type'], ['name', 'Name'], ['count', 'Count']], invSort, (v) => { invSort = v; render(); });
    const list = h('div', { class: 'mm-inv-list' }), side = h('div', { class: 'mm-inv-side' });
    const goldEl = h('span', { class: 'mm-gold mm-gold-lg' }, ui.icon('coin'), h('span'));
    p.body.append(h('div', { class: 'mm-toolbar' }, h('span', { class: 'mm-toolbar-label' }, ui.icon('sort'), 'Sort'), sortSeg, goldEl), h('div', { class: 'mm-split' }, list, side));
    function render() {
      const inv = getInventory();
      goldEl.lastChild.textContent = String(Math.floor((W() && W().gold) || 0));
      list.innerHTML = '';
      let groups = inv.groups.map((g) => ({ name: g.name, items: (g.items || []).slice() }));
      if (invSort !== 'group') {
        const all = groups.flatMap((g) => g.items);
        all.sort(invSort === 'name' ? (a, b) => String(a.name).localeCompare(String(b.name)) : (a, b) => (b.count || 0) - (a.count || 0));
        groups = all.length ? [{ name: invSort === 'name' ? 'A – Z' : 'Most held', items: all }] : [];
      }
      const flat = groups.flatMap((g) => g.items);
      if (!flat.length) { list.appendChild(ui.empty('bag', 'Your satchel is empty', 'Harvest crops, brew potions and explore to fill it.')); showDetail(null); return; }
      if (!invSel || !flat.some((i) => i.id === invSel)) invSel = flat[0].id;
      groups.forEach((g) => {
        const grid = h('div', { class: 'mm-grid', role: 'listbox', 'aria-label': g.name });
        g.items.forEach((it) => {
          const cell = h('button', { type: 'button', class: 'mm-cell', role: 'option', 'aria-selected': String(it.id === invSel), 'aria-label': (it.name || it.id) + ' ×' + (it.count || 0), 'data-item': it.id, title: (it.name || it.id) + (it.desc ? ' — ' + it.desc : '') },
            ui.itemIcon(it, 32), h('span', { class: 'mm-cell-count' }, String(it.count || 0)), h('span', { class: 'mm-cell-name' }, it.name || titleCase(it.id)));
          const pick = () => { invSel = it.id; list.querySelectorAll('.mm-cell').forEach((c) => c.setAttribute('aria-selected', String(c === cell))); showDetail(it); };
          cell.addEventListener('click', () => { ui.sfx('ui_move'); pick(); });
          cell.addEventListener('focus', pick);
          if (it.id === invSel) cell.dataset.autofocus = '1';
          grid.appendChild(cell);
        });
        list.append(h('h4', { class: 'mm-group-title' }, g.name), grid);
      });
      showDetail(flat.find((i) => i.id === invSel));
    }
    function showDetail(it) {
      side.innerHTML = '';
      const acts = [];
      if (it && it.usable) acts.push(ui.button('Use', () => { useItem(it); render(); }, { cls: 'mm-btn-primary', icon: 'sparkle' }));
      if (it && it.equippable) acts.push(ui.button('Equip', () => { result(ui.camp('equip', it.id)); render(); }, { icon: 'shield' }));
      if (it && it.sellPrice) acts.push(h('p', { class: 'mm-note' }, ui.icon('coin'), 'Sells for ' + it.sellPrice + 'g at Pip’s stall in the village.'));
      side.appendChild(detail(it && Object.assign({ sub: '×' + (it.count || 0) + (it.kind ? ' · ' + titleCase(it.kind) : '') }, it), acts));
    }
    render();
    inst.refresh = render;
    return inst;
  });

  // ============================================================ EQUIPMENT
  // FALLBACK equipment from baseline world.gear / world.equipped (one focus slot).
  function getEquipment() {
    const e = ui.camp('equipment');
    if (e && (Array.isArray(e.slots) || Array.isArray(e.owned))) return { slots: e.slots || [], owned: e.owned || [] };
    const w = W(); if (!w) return { slots: [], owned: [] };
    const gear = (w.gear || []).map((g, i) => ({ id: 'gear:' + i, name: g.name, slot: 'focus', rarity: g.rarity, power: g.power, affix: g.affix, sockets: g.sockets, maxSockets: g.maxSockets, equipped: w.equipped === i + 1, kind: 'gear', icon: ui.iconFor(g.name), fallbackIndex: i }));
    return { slots: [{ id: 'focus', name: 'Focus', item: gear.find((g) => g.equipped) || null }], owned: gear, fallback: true };
  }
  function equip(item) {
    if (ui.hasCamp('equip')) return result(ui.camp('equip', item.id));
    const w = W(); if (!w || item.fallbackIndex == null) return false; // FALLBACK
    w.equipped = item.fallbackIndex + 1; ui.base.call('message', 'Equipped ' + item.name); ui.toast('Equipped ' + item.name, 'good');
    return true;
  }
  let eqSel = null;
  ui.registerScreen('equipment', () => {
    const { p, inst } = book('equipment', 'Gear that strengthens your magic');
    const slotsEl = h('div', { class: 'mm-eq-slots' }), list = h('div', { class: 'mm-inv-list' }), side = h('div', { class: 'mm-inv-side' });
    p.body.append(slotsEl, h('div', { class: 'mm-split' }, list, side));
    const itemStats = (it) => [it.slot && ['Slot', titleCase(it.slot)], it.rarity && ['Rarity', it.rarity], it.power != null && ['Power', '+' + it.power], it.affix && ['Affix', it.affix], it.maxSockets ? ['Sockets', (it.sockets || 0) + ' / ' + it.maxSockets] : null].filter(Boolean);
    function render() {
      const eq = getEquipment();
      slotsEl.innerHTML = '';
      eq.slots.forEach((s) => {
        const it = s.item || null;
        slotsEl.appendChild(h('div', { class: 'mm-eq-slot' + (it ? ' mm-filled' : '') }, h('div', { class: 'mm-eq-icon' }, it ? ui.itemIcon(it, 32) : ui.icon('plus')), h('div', null, h('small', null, s.name || titleCase(s.id || s.slot)), h('strong', null, it ? it.name : 'Empty'))));
      });
      list.innerHTML = '';
      if (!eq.owned.length) { list.appendChild(ui.empty('shield', 'No equipment yet', 'Bosses and dungeon chests drop wands, robes, rings and charms.')); side.innerHTML = ''; return; }
      if (!eqSel || !eq.owned.some((i) => i.id === eqSel)) eqSel = (eq.owned.find((i) => i.equipped) || eq.owned[0]).id;
      const grid = h('div', { class: 'mm-list', role: 'listbox', 'aria-label': 'Owned equipment' });
      eq.owned.forEach((it) => {
        const row = h('button', { type: 'button', class: 'mm-row' + (it.rarity ? ' mm-rar-' + String(it.rarity).toLowerCase() : ''), role: 'option', 'aria-selected': String(it.id === eqSel), 'data-item': it.id },
          h('span', { class: 'mm-row-icon' }, ui.itemIcon(it, 28)), h('span', { class: 'mm-row-main' }, h('strong', null, it.name), h('small', null, [it.rarity, it.slot && titleCase(it.slot), it.power != null && ('Power ' + it.power)].filter(Boolean).join(' · '))),
          it.equipped ? h('span', { class: 'mm-badge' }, 'Equipped') : null);
        const pick = () => { eqSel = it.id; grid.querySelectorAll('.mm-row').forEach((c) => c.setAttribute('aria-selected', String(c === row))); show(it); };
        row.addEventListener('click', () => { ui.sfx('ui_move'); pick(); });
        row.addEventListener('focus', pick);
        if (it.id === eqSel) row.dataset.autofocus = '1';
        grid.appendChild(row);
      });
      list.appendChild(grid);
      show(eq.owned.find((i) => i.id === eqSel));
    }
    function show(it) {
      side.innerHTML = '';
      const acts = it && !it.equipped ? [ui.button('Equip', () => { equip(it); render(); }, { cls: 'mm-btn-primary', icon: 'shield' })] : it ? [h('p', { class: 'mm-note' }, ui.icon('check'), 'Currently equipped.')] : [];
      side.appendChild(detail(it && Object.assign({ stats: itemStats(it), sub: it.rarity || '' }, it), acts));
    }
    render();
    inst.refresh = render;
    return inst;
  });

  // ============================================================ SPELLBOOK
  ui.registerScreen('spellbook', () => {
    const { p, inst } = book('spellbook', 'Choose the spell you cast with Space');
    const list = h('div', { class: 'mm-spell-list' });
    p.body.appendChild(list);
    function render() {
      list.innerHTML = '';
      const spells = D.spells();
      if (!spells.length) { list.appendChild(ui.empty('book', 'No spells learned', 'Your grandmother’s spellbook is blank… for now.')); return; }
      spells.forEach((s, i) => {
        const st = ui.spellStyle(s), locked = s.unlocked === false;
        const card = h('button', { type: 'button', class: 'mm-spell' + (s.selected ? ' mm-selected' : '') + (locked ? ' mm-locked' : ''), style: { '--spell': st.color }, 'aria-pressed': String(!!s.selected), 'data-spell': s.id, 'aria-label': (s.name || s.id) + (locked ? ', locked' : s.selected ? ', selected' : '') },
          h('span', { class: 'mm-spell-icon' }, ui.icon(locked ? 'lock' : st.icon)),
          h('span', { class: 'mm-spell-main' },
            h('span', { class: 'mm-spell-top' }, h('strong', null, s.name || titleCase(s.id)), h('kbd', { class: 'mm-kbd' }, s.key || String(i + 1))),
            h('small', { class: 'mm-spell-meta' }, [s.school, s.cost != null && (s.cost + ' mana'), s.cooldown != null && s.cooldown > 0.4 && (s.cooldown + 's cooldown')].filter(Boolean).join(' · ')),
            h('span', { class: 'mm-spell-desc' }, locked ? (s.lockReason || s.reason || 'Not yet learned.') : (s.desc || s.description || ''))),
          s.selected ? h('span', { class: 'mm-badge' }, 'Selected') : null);
        if (s.selected) card.dataset.autofocus = '1';
        card.addEventListener('click', () => {
          if (locked) { ui.toast((s.name || 'This spell') + ' is still sealed.', 'info', { icon: 'lock' }); return; }
          D.selectSpell(s); ui.sfx('ui_move'); setTimeout(render, 0);
        });
        list.appendChild(card);
      });
      if (spells.some((s) => s.fallback)) list.appendChild(h('p', { class: 'mm-note' }, ui.icon('info'), 'Showing the practice spells (keys 1–5). Signature spells arrive with the campaign.'));
    }
    render();
    inst.refresh = render;
    return inst;
  });

  // ============================================================ CRAFTING
  // FALLBACK recipes: baseline brew() and brewBomb().
  function getRecipes() {
    const r = ui.camp('recipes');
    if (Array.isArray(r)) return r;
    return [
      { id: 'potion', name: 'Moon Tonic', desc: 'Restores 40 health and 25 mana.', ingredients: { harvest_wheat: 2 }, makes: 1, icon: 'potion', unlocked: true, fallback: 'brew' },
      { id: 'bomb', name: 'Ember Bomb', desc: 'A fiery bomb that bursts and burns.', ingredients: { harvest_ember: 1 }, makes: 1, icon: 'bomb', unlocked: true, fallback: 'brewBomb' },
    ];
  }
  function itemName(id) {
    let n = null;
    getInventory().groups.forEach((g) => (g.items || []).forEach((i) => { if (i.id === id) n = i.name; }));
    if (n) return n;
    const S = ui.base.seeds(), k = String(id).replace(/^harvest_/, '');
    return (S[k] && S[k].name) || titleCase(id);
  }
  ui.registerScreen('crafting', () => {
    const { p, inst } = book('crafting', 'Brew potions and craft at the cauldron');
    const list = h('div', { class: 'mm-recipe-list' });
    p.body.appendChild(list);
    function render() {
      list.innerHTML = '';
      const recipes = getRecipes(), have = ui.itemCounts();
      if (!recipes.length) { list.appendChild(ui.empty('cauldron', 'No recipes yet', 'Wren the herbalist can teach you new brews.')); return; }
      let first = true;
      recipes.forEach((rc) => {
        const ings = Object.entries(rc.ingredients || {});
        const enough = ings.every(([id, n]) => (have[id] || 0) >= n);
        const locked = rc.unlocked === false;
        const btn = ui.button(locked ? 'Locked' : 'Craft', () => {
          if (rc.fallback) { const w = W(), before = w && JSON.stringify([w.potions, w.bombs]); ui.base.call(rc.fallback); const okk = w && JSON.stringify([w.potions, w.bombs]) !== before; ui.toast(okk ? 'Crafted ' + rc.name + '.' : 'Missing ingredients.', okk ? 'good' : 'warn'); ui.sfx(okk ? 'brew' : 'ui_error'); }
          else { const okk = result(ui.camp('craft', rc.id), 'Crafted ' + rc.name + '.'); ui.sfx(okk ? 'brew' : 'ui_error'); }
          render();
        }, { cls: enough && !locked ? 'mm-btn-primary' : '', icon: locked ? 'lock' : 'cauldron', disabled: locked || !enough, silent: true, aria: (locked ? 'Locked: ' : 'Craft ') + rc.name });
        if (first && enough && !locked) { btn.dataset.autofocus = '1'; first = false; }
        const card = h('article', { class: 'mm-recipe' + (locked ? ' mm-locked' : '') + (enough ? ' mm-ready' : '') },
          h('div', { class: 'mm-recipe-icon' }, ui.itemIcon({ id: rc.id, icon: rc.icon, kind: 'consumable' }, 40)),
          h('div', { class: 'mm-recipe-main' },
            h('h3', null, rc.name, rc.makes > 1 ? h('small', null, ' ×' + rc.makes) : null),
            rc.desc ? h('p', null, rc.desc) : null,
            h('ul', { class: 'mm-ings', 'aria-label': 'Ingredients' }, ings.map(([id, n]) => {
              const hv = have[id] || 0;
              return h('li', { class: hv >= n ? 'mm-ok' : 'mm-miss' }, ui.itemIcon({ id }, 20), h('span', null, itemName(id)), h('b', null, hv + ' / ' + n));
            })),
            !enough && !locked ? h('small', { class: 'mm-why' }, 'You need more ingredients.') : locked ? h('small', { class: 'mm-why' }, rc.reason || 'Learn this recipe first.') : null),
          h('div', { class: 'mm-recipe-act' }, btn));
        list.appendChild(card);
      });
    }
    render();
    inst.refresh = render;
    return inst;
  });

  // ============================================================ JOURNAL
  function getQuests() {
    const q = ui.camp('quests');
    if (Array.isArray(q)) return q;
    const w = W(); if (!w) return [];
    // FALLBACK: the baseline's repeating village request.
    const n = (w.requests || 0) + 1, need = n * 2;
    return [{ id: 'village_request', title: 'Village Request #' + n, desc: 'The village keeper needs help: harvest crops and clear monsters.', giver: 'Village Keeper', status: 'active', progress: { have: Math.min(w.harvested || 0, need) + Math.min(w.kills || 0, need), need: need * 2, label: (w.harvested || 0) + '/' + need + ' harvests · ' + (w.kills || 0) + '/' + need + ' defeats' }, reward: '45 gold · 30 XP' }];
  }
  ui.registerScreen('journal', () => {
    const { p, inst } = book('journal', 'Quests, requests and your path');
    const box = h('div', { class: 'mm-journal' });
    p.body.appendChild(box);
    let filter = 'active';
    function render() {
      box.innerHTML = '';
      const o = D.objective();
      if (o) box.appendChild(h('section', { class: 'mm-objcard' }, h('small', null, ui.icon('flag'), 'Current objective'), h('h3', null, o.title), o.why ? h('p', null, o.why) : null, o.hint ? h('p', { class: 'mm-hint' }, ui.icon('sparkle'), o.hint) : null,
        o.target && o.target.region ? h('p', { class: 'mm-hint' }, ui.icon('pin'), 'Head to ' + D.regionName(o.target.region)) : null));
      const qs = getQuests();
      const counts = { active: 0, offered: 0, done: 0 };
      qs.forEach((q) => { const s = q.status === 'done' || q.status === 'complete' ? 'done' : q.status === 'offered' ? 'offered' : 'active'; counts[s]++; q._s = s; });
      const seg = ui.segmented('Quest filter', [['active', 'Active (' + counts.active + ')'], ['offered', 'Offered (' + counts.offered + ')'], ['done', 'Completed (' + counts.done + ')']], filter, (v) => { filter = v; render(); setTimeout(() => { const b = box.querySelector('.mm-seg [aria-checked="true"]'); if (b) b.focus(); }, 0); });
      box.appendChild(seg);
      const shown = qs.filter((q) => q._s === filter);
      if (!shown.length) { box.appendChild(ui.empty('scroll', filter === 'done' ? 'Nothing completed yet' : 'No quests here', filter === 'offered' ? 'Villagers with requests have a glowing marker over their heads.' : 'Talk to the villagers and check the notice board.')); return; }
      const list = h('div', { class: 'mm-quests' });
      shown.forEach((q) => {
        const pr = q.progress && q.progress.need ? clamp(q.progress.have / q.progress.need, 0, 1) : null;
        list.appendChild(h('article', { class: 'mm-quest mm-q-' + q._s, tabindex: '0', 'aria-label': q.title },
          h('div', { class: 'mm-quest-head' }, h('h4', null, q.title), q.giver ? h('small', null, ui.icon('chat'), q.giver) : null),
          q.desc ? h('p', null, q.desc) : null,
          pr != null ? h('div', { class: 'mm-progress' }, h('div', { class: 'mm-progress-track' }, h('i', { style: { width: (pr * 100).toFixed(0) + '%' } })), h('small', null, q.progress.label || (q.progress.have + ' / ' + q.progress.need))) : null,
          q.reward ? h('p', { class: 'mm-reward' }, ui.icon('star'), 'Reward: ' + q.reward) : null));
      });
      box.appendChild(list);
    }
    render();
    inst.refresh = render;
    return inst;
  });

  // ============================================================ MAP + TRAVEL
  const MAP_POS = { grove: [50, 62], village: [70, 72], forest: [24, 44], swamp: [34, 84], mountain: [62, 18], crypt: [86, 44], sky: [86, 12], moonwell: [50, 48] };
  // FALLBACK regions from baseline REGIONS (unlock rule mirrors goRegion: sky needs broom 2).
  function getRegions() {
    const r = ui.camp('regions');
    if (Array.isArray(r) && r.length) return r;
    const m = ui.camp('map');
    if (m && Array.isArray(m.regions) && m.regions.length) return m.regions;
    const R = ui.base.regions(), w = W();
    const DESC = { grove: 'Your homestead and garden beside the fading Moonwell.', forest: 'Twisted trees and thorny blight creep across the old paths.', swamp: 'Whispers drift over still water and glowing caps.', mountain: 'Frozen peaks where the wind never rests.', crypt: 'An old crypt that hums with restless bones.', sky: 'Floating isles of stardust, reachable only by a swift broom.' };
    return Object.entries(R).map(([id, x]) => ({ id, name: x.name, desc: DESC[id] || '', level: x.level, recommended: x.level, locked: id === 'sky' && w && w.broom < 2, reason: id === 'sky' ? 'Needs a level 2 broom' : '', fallback: true }));
  }
  function playerRegion() { const m = ui.camp('map'); return (m && m.player && m.player.region) || (W() && W().region); }
  function travelTo(id) {
    if (ui.hasCamp('travelTo')) {
      const r = ui.camp('travelTo', id);
      if (r && r.ok === false) { ui.toast(r.msg || 'You can’t travel there yet.', 'warn'); ui.sfx('ui_error'); return false; }
      ui.closeAll(); ui.syncState(); return true;
    }
    ui.closeAll(); ui.syncState(); ui.base.call('goRegion', id); // FALLBACK
    return true;
  }
  ui.travelTo = travelTo;
  function regionCard(r, cur, opts) {
    const locked = !!r.locked, here = r.id === cur;
    const btn = ui.button(here ? 'You are here' : locked ? 'Locked' : 'Travel', () => travelTo(r.id), { cls: !locked && !here ? 'mm-btn-primary' : '', icon: locked ? 'lock' : here ? 'pin' : 'signpost', disabled: locked || here, aria: (here ? 'Current region: ' : locked ? 'Locked: ' : 'Travel to ') + r.name });
    return h('article', { class: 'mm-region' + (locked ? ' mm-locked' : '') + (here ? ' mm-here' : '') + (r.restored ? ' mm-restored' : ''), 'data-region': r.id },
      h('div', { class: 'mm-region-art', 'data-region': r.id, 'aria-hidden': 'true' }, ui.icon(locked ? 'lock' : r.restored ? 'moon' : r.boss ? 'crown' : 'map')),
      h('div', { class: 'mm-region-main' },
        h('h3', null, r.name),
        h('div', { class: 'mm-chips' },
          (r.recommended || r.level) ? h('span', { class: 'mm-chip' }, 'Lv ' + (r.recommended || r.level)) : null,
          r.boss ? h('span', { class: 'mm-chip' }, ui.icon('crown'), typeof r.boss === 'string' ? r.boss : 'Guardian') : null,
          r.restored ? h('span', { class: 'mm-chip mm-chip-good' }, ui.icon('check'), 'Restored') : null),
        r.desc ? h('p', null, r.desc) : null,
        locked && r.reason ? h('p', { class: 'mm-why' }, ui.icon('lock'), r.reason) : null),
      opts && opts.noButton ? null : h('div', { class: 'mm-region-act' }, btn));
  }
  ui.registerScreen('travel', (a) => {
    const p = ui.panel({ title: 'Travel', subtitle: 'Where will your broom take you?', icon: 'signpost', cls: 'mm-panel-wide' });
    const list = h('div', { class: 'mm-region-list' });
    p.body.appendChild(list);
    const inst = { el: p.el, label: 'Travel' };
    function render() {
      list.innerHTML = '';
      const regs = getRegions(), cur = playerRegion();
      if (!regs.length) { list.appendChild(ui.empty('signpost', 'No destinations yet', 'The roads beyond the grove are still overgrown.')); return; }
      regs.forEach((r) => {
        const c = regionCard(r, cur);
        if (a && a.focus === r.id) { const b = c.querySelector('button'); if (b) b.dataset.autofocus = '1'; }
        list.appendChild(c);
      });
      if (!list.querySelector('[data-autofocus]')) { const b = list.querySelector('button:not([disabled])'); if (b) b.dataset.autofocus = '1'; }
    }
    render();
    inst.refresh = render;
    return inst;
  });
  let mapSel = null;
  ui.registerScreen('map', () => {
    const { p, inst } = book('map', 'The lands around Moonflower Grove');
    const wrap = h('div', { class: 'mm-map-wrap' }), side = h('div', { class: 'mm-map-side' });
    p.body.appendChild(h('div', { class: 'mm-split mm-split-map' }, wrap, side));
    function render() {
      const regs = getRegions(), cur = playerRegion();
      wrap.innerHTML = '';
      const map = h('div', { class: 'mm-map', role: 'group', 'aria-label': 'World map' });
      const pos = (r, i) => MAP_POS[r.id] || [15 + ((i * 37) % 70), 15 + ((i * 53) % 70)];
      // paths (SVG) from the homestead to each region
      const home = MAP_POS.grove;
      let svg = '<svg class="mm-map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">';
      regs.forEach((r, i) => { if (r.id === 'grove') return; const [x, y] = pos(r, i); svg += '<path d="M' + home[0] + ' ' + home[1] + ' Q ' + ((home[0] + x) / 2 + 6) + ' ' + ((home[1] + y) / 2 - 4) + ' ' + x + ' ' + y + '" class="' + (r.locked ? 'mm-locked' : '') + '"/>'; });
      svg += '</svg>';
      map.innerHTML = svg;
      if (!mapSel || !regs.some((r) => r.id === mapSel)) mapSel = cur || (regs[0] && regs[0].id);
      regs.forEach((r, i) => {
        const [x, y] = pos(r, i);
        const node = h('button', { type: 'button', class: 'mm-map-node' + (r.locked ? ' mm-locked' : '') + (r.id === cur ? ' mm-here' : '') + (r.restored ? ' mm-restored' : ''), style: { left: x + '%', top: y + '%' }, 'aria-pressed': String(r.id === mapSel), 'aria-label': r.name + (r.id === cur ? ' (you are here)' : r.locked ? ' (locked)' : ''), 'data-region': r.id },
          h('span', { class: 'mm-map-dot' }, ui.icon(r.id === cur ? 'pin' : r.locked ? 'lock' : r.boss ? 'crown' : r.restored ? 'moon' : 'star')), h('span', { class: 'mm-map-label' }, r.name));
        const pick = () => { mapSel = r.id; map.querySelectorAll('.mm-map-node').forEach((n) => n.setAttribute('aria-pressed', String(n === node))); show(r, cur); };
        node.addEventListener('click', () => { ui.sfx('ui_move'); pick(); });
        node.addEventListener('focus', pick);
        if (r.id === mapSel) node.dataset.autofocus = '1';
        map.appendChild(node);
      });
      wrap.appendChild(map);
      show(regs.find((r) => r.id === mapSel), cur);
    }
    function show(r, cur) {
      side.innerHTML = '';
      if (!r) return;
      side.appendChild(regionCard(r, cur, { noButton: true }));
      if (r.id !== cur && !r.locked) side.appendChild(ui.button('Plan travel', () => ui.open('travel', { focus: r.id }), { icon: 'signpost', cls: 'mm-btn-primary' }));
    }
    render();
    inst.refresh = render;
    return inst;
  });

  // ============================================================ SHOP
  // FALLBACK shop (no MM.campaign.shop): baseline seed packs / runes / crop sale.
  function fallbackShop() {
    const w = W(); const S = ui.base.seeds();
    const seedCost = w && w.requests >= 1 ? 9 : 12;
    return {
      name: 'Village Stall', fallback: true,
      stock: Object.keys(S).map((k) => ({ id: 'seed_' + k, name: S[k].name + ' Seeds ×3', desc: 'A pack of three seeds.', price: seedCost, kind: 'seed', icon: 'seed', _seed: k }))
        .concat([{ id: 'rune', name: 'Rune Stone', desc: 'Socket into gear or empower a ward.', price: w && w.requests >= 2 ? 24 : 30, kind: 'material', icon: 'rune' }]),
      sell: Object.fromEntries(Object.keys((w && w.harvest) || {}).map((k) => ['harvest_' + k, 9])),
    };
  }
  function fbBuy(item, qty) {
    const w = W(); if (!w) return { ok: false };
    let n = 0;
    for (let i = 0; i < qty; i++) {
      const g = w.gold;
      if (item._seed) { const prev = w.seed; w.seed = item._seed; ui.base.call('buySeeds'); w.seed = prev; } else ui.base.call('buyRune');
      if (w.gold < g) n++; else break;
    }
    return n ? { ok: true, msg: 'Bought ' + item.name + (n > 1 ? ' ×' + n : '') } : { ok: false, msg: 'Not enough gold.' };
  }
  function fbSell(id, qty) {
    const w = W(), k = id.replace(/^harvest_/, '');
    if (!w || !w.harvest || (w.harvest[k] || 0) < qty) return { ok: false, msg: 'You don’t have that many.' };
    w.harvest[k] -= qty; w.gold += qty * 9; return { ok: true, msg: 'Sold for ' + qty * 9 + 'g' };
  }
  ui.registerScreen('shop', (a) => {
    const npc = (a && a.npc) || 'pip';
    const data0 = ui.camp('shop', npc) || fallbackShop();
    const p = ui.panel({ title: data0.name || 'Shop', subtitle: 'Buy supplies and sell your harvest', icon: 'shop', cls: 'mm-panel-wide' });
    const goldEl = h('span', { class: 'mm-gold mm-gold-lg', 'aria-live': 'polite' }, ui.icon('coin'), h('span'));
    let tab = 'buy', sel = null, qty = 1;
    const seg = ui.segmented('Shop mode', [['buy', 'Buy'], ['sell', 'Sell']], tab, (v) => { tab = v; sel = null; qty = 1; render(); });
    const list = h('div', { class: 'mm-inv-list' }), side = h('div', { class: 'mm-inv-side' });
    p.body.append(h('div', { class: 'mm-toolbar' }, seg, goldEl), h('div', { class: 'mm-split' }, list, side));
    const inst = { el: p.el, label: 'Shop', state: 'menu' };
    const shopData = () => ui.camp('shop', npc) || fallbackShop();
    function entries() {
      const s = shopData();
      if (tab === 'buy') return (s.stock || []).map((x) => Object.assign({ unit: x.price }, x));
      const counts = {}, names = {};
      getInventory().groups.forEach((g) => (g.items || []).forEach((i) => { counts[i.id] = i.count; names[i.id] = i; }));
      return Object.entries(s.sell || {}).filter(([id]) => (counts[id] || 0) > 0).map(([id, price]) => Object.assign({}, names[id] || { id, name: itemName(id) }, { id, unit: price, count: counts[id] }));
    }
    function render() {
      goldEl.lastChild.textContent = String(Math.floor((W() && W().gold) || 0));
      const es = entries();
      list.innerHTML = '';
      if (!es.length) { list.appendChild(ui.empty(tab === 'buy' ? 'shop' : 'bag', tab === 'buy' ? 'Sold out' : 'Nothing to sell', tab === 'buy' ? 'Pip restocks every morning.' : 'Harvest crops or find treasures to sell.')); side.innerHTML = ''; return; }
      if (!sel || !es.some((e) => e.id === sel)) { sel = es[0].id; qty = 1; }
      const grid = h('div', { class: 'mm-list', role: 'listbox', 'aria-label': tab === 'buy' ? 'For sale' : 'Your items' });
      es.forEach((it) => {
        const row = h('button', { type: 'button', class: 'mm-row', role: 'option', 'aria-selected': String(it.id === sel), 'data-item': it.id },
          h('span', { class: 'mm-row-icon' }, ui.itemIcon(it, 28)), h('span', { class: 'mm-row-main' }, h('strong', null, it.name), h('small', null, tab === 'buy' ? (it.stockLeft != null ? it.stockLeft + ' left' : titleCase(it.kind || '')) : 'You have ' + it.count)),
          h('span', { class: 'mm-price' }, ui.icon('coin'), String(it.unit)));
        const pick = () => { if (sel !== it.id) qty = 1; sel = it.id; grid.querySelectorAll('.mm-row').forEach((c) => c.setAttribute('aria-selected', String(c === row))); show(it); };
        row.addEventListener('click', () => { ui.sfx('ui_move'); pick(); });
        row.addEventListener('focus', pick);
        if (it.id === sel) row.dataset.autofocus = '1';
        grid.appendChild(row);
      });
      list.appendChild(grid);
      show(es.find((e) => e.id === sel));
    }
    function show(it) {
      side.innerHTML = '';
      if (!it) return;
      const gold = Math.floor((W() && W().gold) || 0);
      const max = tab === 'buy' ? Math.max(1, Math.min(it.stockLeft != null ? it.stockLeft : 99, Math.floor(gold / Math.max(1, it.unit)) || 1)) : it.count;
      qty = clamp(qty, 1, max);
      const qv = h('output', { class: 'mm-qty-val', 'aria-live': 'polite' }, String(qty));
      const total = h('strong', { class: 'mm-total' });
      const upd = () => { qv.textContent = String(qty); total.textContent = (tab === 'buy' ? 'Cost ' : 'Earn ') + qty * it.unit + 'g'; act.disabled = tab === 'buy' && qty * it.unit > gold; total.classList.toggle('mm-bad', act.disabled); };
      const minus = ui.button('', () => { qty = Math.max(1, qty - 1); upd(); }, { cls: 'mm-btn-icon', icon: 'minus', aria: 'Decrease quantity', sound: 'ui_move' });
      const plus = ui.button('', () => { qty = Math.min(max, qty + 1); upd(); }, { cls: 'mm-btn-icon', icon: 'plus', aria: 'Increase quantity', sound: 'ui_move' });
      const act = ui.button(tab === 'buy' ? 'Buy' : 'Sell', () => {
        const r = tab === 'buy' ? (ui.hasCamp('buy') ? ui.camp('buy', it.id, qty) : fbBuy(it, qty)) : (ui.hasCamp('sell') ? ui.camp('sell', it.id, qty) : fbSell(it.id, qty));
        const ok = result(r, (tab === 'buy' ? 'Bought ' : 'Sold ') + it.name + (qty > 1 ? ' ×' + qty : ''));
        ui.sfx(ok ? 'shop_buy' : 'ui_error');
        qty = 1; render();
      }, { cls: 'mm-btn-primary', icon: tab === 'buy' ? 'coin' : 'bag', silent: true });
      side.appendChild(detail(Object.assign({ sub: (tab === 'buy' ? 'Price ' : 'Sells for ') + it.unit + 'g each' }, it), [
        h('div', { class: 'mm-qty', role: 'group', 'aria-label': 'Quantity' }, minus, qv, plus), total, act]));
      upd();
    }
    render();
    inst.refresh = render;
    inst.onKey = (e) => {
      if (e.key === '+' || e.key === '=') { const b = side.querySelector('[aria-label="Increase quantity"]'); if (b) b.click(); return true; }
      if (e.key === '-' || e.key === '_') { const b = side.querySelector('[aria-label="Decrease quantity"]'); if (b) b.click(); return true; }
      return false;
    };
    return inst;
  });

  // ============================================================ SETTINGS
  const QUALITY = { low: { softFilter: 'off', bloom: 'off', particles: 'low' }, medium: { softFilter: 'low', bloom: 'low', particles: 'medium' }, high: { softFilter: 'medium', bloom: 'high', particles: 'high' } };
  let setTab = 'audio';
  ui.applyAudio = function () {
    const A = MM.audio; if (!A || !A.setVolume) return;
    safe(() => { A.setVolume('master', ui.setting('volMaster')); A.setVolume('music', ui.setting('volMusic')); A.setVolume('sfx', ui.setting('volSfx')); A.setVolume('cine', ui.setting('volCine')); });
  };
  ui.registerScreen('settings', (a) => {
    const p = ui.panel({ title: 'Settings', subtitle: 'Changes apply immediately and are saved on this device', icon: 'sliders', cls: 'mm-panel-wide mm-panel-settings' });
    const TABS = [['audio', 'Audio', 'speaker'], ['graphics', 'Graphics', 'eye'], ['access', 'Accessibility', 'access'], ['game', 'Game', 'sliders']];
    const tabs = h('nav', { class: 'mm-tabs', role: 'tablist', 'aria-label': 'Settings sections' });
    const body = h('div', { class: 'mm-settings' });
    const controls = {};
    TABS.forEach(([id, l, ic]) => {
      const b = h('button', { type: 'button', class: 'mm-tab', role: 'tab', 'aria-selected': String(id === setTab), 'data-tab': id }, ui.icon(ic), h('span', null, l));
      b.addEventListener('click', () => { setTab = id; tabs.querySelectorAll('.mm-tab').forEach((t) => t.setAttribute('aria-selected', String(t === b))); ui.sfx('ui_move'); render(); });
      tabs.appendChild(b);
    });
    p.panel.insertBefore(tabs, p.body);
    p.body.appendChild(body);
    const row = (label, desc, control) => h('div', { class: 'mm-set-row' }, h('div', { class: 'mm-set-label' }, h('strong', null, label), desc ? h('small', null, desc) : null), h('div', { class: 'mm-set-ctl' }, control));
    const set = (k, v) => { ui.setSetting(k, v); ui.applySettings(); if (/^vol/.test(k)) ui.applyAudio(); if (k === 'touchControls' && ui.input) ui.input.updateTouch(); if (k === 'subtitles') safe(() => MM.cine.setSubtitles(!!v)); if (k === 'reducedMotion') safe(() => MM.cine.setReducedMotion(!!v)); };
    const seg = (k, label, opts, onPick) => { const s = ui.segmented(label, opts, ui.setting(k), (v) => { set(k, v); onPick && onPick(v); }); controls[k] = s; return s; };
    const tog = (k, label) => { const t = ui.toggle(label, !!ui.setting(k), (v) => set(k, v)); controls[k] = t; return t; };
    const slider = (k, label) => {
      const val = Math.round((Number(ui.setting(k)) || 0) * 100);
      const out = h('output', { class: 'mm-range-val' }, val + '%');
      const r = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(val), 'aria-label': label, class: 'mm-range', 'data-setting': k });
      const paint = () => r.style.setProperty('--v', r.value + '%');
      r.addEventListener('input', () => { out.textContent = r.value + '%'; paint(); set(k, Number(r.value) / 100); });
      r.addEventListener('change', () => ui.sfx('ui_move'));
      paint();
      return h('div', { class: 'mm-range-wrap' }, r, out);
    };
    function render() {
      body.innerHTML = '';
      if (setTab === 'audio') {
        body.append(row('Master volume', null, slider('volMaster', 'Master volume')), row('Music', null, slider('volMusic', 'Music volume')), row('Sound effects', null, slider('volSfx', 'Sound effects volume')), row('Cinematics', 'Voice-over and story scenes', slider('volCine', 'Cinematic volume')));
      } else if (setTab === 'graphics') {
        const custom = () => { if (ui.setting('quality') !== 'custom') { ui.setSetting('quality', 'custom'); controls.quality && controls.quality.setValue('custom'); } };
        body.append(
          row('Quality preset', 'Sets filter, bloom and particles together', seg('quality', 'Quality preset', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['custom', 'Custom']], (v) => { const q = QUALITY[v]; if (q) Object.entries(q).forEach(([k, x]) => { set(k, x); controls[k] && controls[k].setValue(x); }); })),
          row('Soft filter', 'Gentle painterly softening of the scene', seg('softFilter', 'Soft filter', [['off', 'Off'], ['low', 'Low'], ['medium', 'Medium']], custom)),
          row('Bloom', 'Glow around lights and magic', seg('bloom', 'Bloom', [['off', 'Off'], ['low', 'Low'], ['high', 'High']], custom)),
          row('Particles', null, seg('particles', 'Particles', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], custom)),
          row('Screen shake', null, seg('shake', 'Screen shake', [['off', 'Off'], ['low', 'Low'], ['full', 'Full']])),
          row('Reduce flashes', 'Softens bright flashes from spells and hits', tog('reducedFlashes', 'Reduce flashes')),
          row('Reduce motion', 'Calmer animations, no shake, instant text', tog('reducedMotion', 'Reduce motion')));
      } else if (setTab === 'access') {
        body.append(
          row('Subtitles', 'Captions for cinematics', tog('subtitles', 'Subtitles')),
          row('Text size', 'Scales all menus and HUD text', seg('textScale', 'Text size', [[0.9, 'Small'], [1, 'Default'], [1.15, 'Large'], [1.3, 'Huge']])),
          row('Damage numbers', 'Show numbers when spells hit', tog('damageNumbers', 'Damage numbers')),
          row('Reduce motion', 'Also follows your system setting', tog('reducedMotion', 'Reduce motion')));
      } else {
        const inGame = !ui.isOpen('title');
        body.append(
          row('Autosave', 'Saves at safe moments while you play', tog('autosave', 'Autosave')),
          row('Touch controls', 'On-screen pad and action buttons', seg('touchControls', 'Touch controls', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']])),
          row('Reset settings', 'Restore every option to its default', ui.button('Reset', async () => {
            if (await ui.confirm({ title: 'Reset all settings?', body: 'Audio, graphics and accessibility options return to their defaults. Your save is not affected.', yes: 'Reset settings', danger: true })) {
              safe(() => ui.settings().reset()); ui.applySettings(); ui.applyAudio(); ui.input && ui.input.updateTouch(); ui.toast('Settings restored to defaults.', 'good'); render();
            }
          }, { icon: 'retry', id: 'reset-settings' })),
          row('Erase save data', inGame ? 'Deletes your journey and returns to the title' : 'Permanently deletes your saved journey', ui.button('Erase…', async () => {
            if (!(await ui.confirm({ title: 'Erase your save?', body: 'Your journey, garden and story progress will be deleted from this device.', yes: 'Continue', danger: true }))) return;
            if (!(await ui.confirm({ title: 'This cannot be undone', body: 'Are you absolutely sure? The save is gone for good.', yes: 'Erase forever', no: 'Keep my save', danger: true }))) return;
            const ok = MM.save && MM.save.erase ? safe(() => MM.save.erase(), true) !== false : safe(() => { localStorage.removeItem('moss-moon-adventure-v1'); return true; }, false);
            ui.toast(ok ? 'Save data erased.' : 'Could not erase save data.', ok ? 'good' : 'warn');
            if (inGame) ui.toTitle(); else { const t = ui.get('title'); if (t && t.refresh) t.refresh(); render(); }
          }, { icon: 'warn', cls: 'mm-btn-danger', id: 'erase-save' })));
      }
      if (!(a && a.noAutofocus)) { const f = body.querySelector('button,input'); if (f) f.dataset.autofocus = '1'; }
    }
    render();
    const inst = { el: p.el, label: 'Settings', onKey(e) { const k = e.key.toLowerCase(); if (k === 'q' || k === 'pageup' || k === ']' || k === 'e' || k === 'pagedown' || k === '[') { const i = TABS.findIndex((t) => t[0] === setTab), d = (k === 'q' || k === 'pageup' || k === '[') ? -1 : 1; setTab = TABS[(i + d + TABS.length) % TABS.length][0]; tabs.querySelectorAll('.mm-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === setTab))); ui.sfx('ui_move'); render(); ui.focusFirst(body); return true; } return false; } };
    inst.refresh = render;
    return inst;
  });

  // ============================================================ CONTROLS / CREDITS / MEMORIES
  ui.registerScreen('controls', () => {
    const p = ui.panel({ title: 'Controls', subtitle: 'Keyboard, gamepad and touch', icon: 'gamepad', cls: 'mm-panel-wide' });
    const table = (title, icon, rows) => h('section', { class: 'mm-ctl-col', tabindex: '0', 'aria-label': title + ' controls' }, h('h3', null, ui.icon(icon), title), h('dl', { class: 'mm-ctl' }, rows.map(([k, v]) => [h('dt', null, k.split(' / ').map((x, i) => [i ? ' ' : null, h('kbd', { class: 'mm-kbd' }, x)])), h('dd', null, v)])));
    p.body.appendChild(h('div', { class: 'mm-ctl-grid' },
      table('Keyboard & mouse', 'keyboard', [['W A S D / Arrows', 'Move'], ['Space', 'Cast selected spell'], ['1 – 5', 'Choose spell'], ['E', 'Interact · tend garden'], ['B', 'Mount / land broom'], ['H', 'Drink potion'], ['Click', 'Walk to · target enemy'], ['Esc / P', 'Pause menu'], ['I / K / J / M', 'Inventory · Spells · Journal · Map']]),
      table('Gamepad', 'gamepad', [['Left stick / D-pad', 'Move'], ['A', 'Cast'], ['X', 'Interact'], ['Y', 'Broom'], ['B', 'Potion'], ['LB / RB', 'Cycle spells'], ['Start', 'Pause'], ['Menus', 'D-pad move · A select · B back']]),
      table('Touch', 'touch', [['Left pad', 'Drag to move'], ['Cast', 'Cast selected spell'], ['Hand', 'Interact'], ['Broom', 'Mount / land'], ['Potion', 'Drink potion'], ['Swap', 'Next spell'], ['Tap enemy', 'Target & cast'], ['❚❚', 'Pause']]),
    ));
    p.body.appendChild(h('p', { class: 'mm-note' }, ui.icon('info'), 'Menus: arrows or WASD move, Enter or Space selects, Esc goes back, Q / E switch tabs.'));
    return { el: p.el, label: 'Controls' };
  });

  ui.registerScreen('credits', () => {
    const p = ui.panel({ title: 'Credits', subtitle: 'Moss & Moon', icon: 'quill', cls: 'mm-panel-credits' });
    p.body.appendChild(h('div', { class: 'mm-credits', tabindex: '0', 'aria-label': 'Credits text' },
      h('h3', { class: 'mm-credits-title' }, 'MOSS & MOON'),
      h('p', { class: 'mm-credits-lead' }, 'A young witch, a quiet homestead, and a Moonwell waiting to shine again.'),
      h('dl', null,
        h('dt', null, 'Game design, code & writing'), h('dd', null, 'The Moss & Moon project — built in the open as a small multi-agent collaboration'),
        h('dt', null, 'Pixel art tooling'), h('dd', null, h('strong', null, 'claude-pxl'), ' by ', h('strong', null, 'crsolver'), ' — MIT License'),
        h('dt', null, 'Original character & spell demo'), h('dd', null, 'Isometric Witch Character Demo (baseline of this project)'),
        h('dt', null, 'Music & sound'), h('dd', null, 'Procedural Web Audio score and effects, generated in your browser'),
        h('dt', null, 'Type'), h('dd', null, 'Your system’s serif and rounded fonts — no downloads')),
      h('p', { class: 'mm-credits-thanks' }, ui.icon('moon'), 'Thank you for tending the grove.')));
    return { el: p.el, label: 'Credits' };
  });

  ui.playMemory = async function (id) {
    if (!MM.cine || typeof MM.cine.play !== 'function') { ui.toast('Cinematics are unavailable right now.', 'warn'); return; }
    ui.go('cine', { replay: id });
    try { await MM.cine.play(id, { skippable: true, replay: true }); } catch (e) { console.error(e); }
    if (ui.stateIs('cine')) {
      // return to the state implied by the open screens (title / menu)
      const want = (ui.stack.slice().reverse().find((s) => s.state) || {}).state || (ui.stack.length ? 'menu' : 'play');
      ui.go(want);
    }
    const t = ui.top(); if (t) ui.focusFirst(t.el);
  };
  ui.registerScreen('memories', () => {
    const p = ui.panel({ title: 'Memories', subtitle: 'Relive the moments of your journey', icon: 'film', cls: 'mm-panel-wide' });
    const list = h('div', { class: 'mm-mem-list' });
    p.body.appendChild(list);
    function render() {
      list.innerHTML = '';
      const unlocked = D.memories(), all = D.cineList();
      if (!all.length) { list.appendChild(ui.empty('film', 'No memories yet', 'Story scenes you witness will be kept here.')); return; }
      let first = true;
      all.forEach((c, i) => {
        const open = unlocked.includes(c.id);
        const b = ui.button(open ? c.title : 'Unseen memory', () => ui.playMemory(c.id), { icon: open ? 'play' : 'lock', disabled: !open, sub: open ? Math.round(c.duration || 0) + 's' : 'Continue your journey to unlock', cls: 'mm-mem' + (open ? '' : ' mm-locked') });
        b.prepend(h('span', { class: 'mm-mem-num', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')));
        if (open && first) { b.dataset.autofocus = '1'; first = false; }
        list.appendChild(b);
      });
    }
    render();
    return { el: p.el, label: 'Memories', refresh: render };
  });
})();
