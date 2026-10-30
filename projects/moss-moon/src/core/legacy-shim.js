// Moss & Moon legacy UI shim (audit §8, recommendation 1). Loaded BEFORE baseline.js.
// The baseline captures 59 sidebar element ids at load time and writes some of them every frame.
// The old sidebar is gone (menus are built by the UI agent under #mm-ui), so this creates a hidden
// #mm-legacy-ui holding every id the baseline expects. baseline.js also has a null-safe uiEl() seam (S1),
// so this shim is belt-and-braces: either one alone keeps the baseline from crashing.
// Ids that already exist in the page are left alone (never duplicated).
(function () {
  'use strict';
  const SELECTS = ['spellSelect', 'classSelect', 'seedSelect', 'regionSelect', 'familiarSelect', 'p2Class', 'p2Spell', 'gearSelect'];
  const TEXT = ['debug', 'modeLabel', 'modeDetail', 'spellDesc', 'dummyStatus', 'worldHud', 'areaLabel', 'areaSub', 'classDesc',
    'farmInfo', 'adventureInfo', 'progressInfo', 'gearInfo', 'questInfo'];
  const BUTTONS = ['mount', 'touchMount', 'debugToggle', 'castButton', 'resetDummy', 'reset',
    'farmAction', 'buildWard', 'empowerWard', 'restTime', 'brewPotion', 'usePotion', 'brewBomb', 'throwBomb', 'sellCrops',
    'travelRegion', 'enterDungeon', 'nextFloor', 'exitDungeon', 'openRift', 'skill0', 'skill1', 'skill2', 'equipGear',
    'socketRune', 'collectLoot', 'finishQuest', 'buySeed', 'buyRune', 'upgradeBroom', 'discoverStar', 'toggleCoop',
    'lootMode', 'p2Cast', 'depositP2', 'touchActor', 'saveGame'];
  const host = document.getElementById('mm-legacy-ui') || document.createElement('div');
  host.id = 'mm-legacy-ui'; host.hidden = true; host.setAttribute('aria-hidden', 'true'); host.setAttribute('inert', '');
  host.style.display = 'none';
  let created = 0;
  const add = (id, tag) => {
    if (document.getElementById(id)) return;
    const el = document.createElement(tag); el.id = id;
    if (tag === 'button') el.type = 'button';
    el.tabIndex = -1; host.appendChild(el); created++;
  };
  SELECTS.forEach((id) => add(id, 'select'));
  TEXT.forEach((id) => add(id, 'span'));
  BUTTONS.forEach((id) => add(id, 'button'));
  if (!host.parentNode) (document.body || document.documentElement).appendChild(host);
  window.MM = window.MM || {};
  window.MM.legacyShim = { ids: SELECTS.concat(TEXT, BUTTONS), created, host };
})();
