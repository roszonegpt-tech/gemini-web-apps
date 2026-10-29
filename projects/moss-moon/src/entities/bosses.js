'use strict';
// Moss & Moon — bosses + shared combat kit (owner: CAMPAIGN). Loads AFTER baseline.js, BEFORE src/systems/campaign.js.
// Exposes MM.bosses: spawn(id,x,y), active(), update(dt), onKill(enemy), damageFactor(target,spell), drawEnemy(e,pos),
// clear(), kit {telegraph, zone, shot, hurt, update, draw, clear, inShape}. All geometry is in baseline TILE coords.
// Bosses are ordinary entries of the baseline `enemies` array (boss:true, mmBoss:id) so spells, targeting, statuses,
// damage numbers and kills all go through baseline code. Their AI runs from MM.campaign's updateWorld wrapper.
(function () {
  const MM = window.MM = window.MM || {};
  try { void world; void enemies; void game; } catch (e) { console.warn('[bosses] baseline not available', e); return; }
  const D = () => MM.CAMPAIGN_DATA || {};
  const emit = (n, d) => { try { MM.bus?.emit?.(n, d); } catch (e) { console.error('[bosses] emit', n, e); } };
  const toast = (text, kind) => { if (MM.campaign?.toast) MM.campaign.toast(text, kind || 'boss'); else { emit('toast', { text, kind: kind || 'boss' }); try { message(text); } catch (_) { } } };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clampMap = v => Math.max(1.2, Math.min(18.8, v));
  const shake = (a, d) => { try { MM.camera?.shake?.(a, d); } catch (_) { } };
  const focus = (o) => { try { MM.camera?.focus?.(o); } catch (_) { } };
  const freeSpot = (x, y) => { x = clampMap(x); y = clampMap(y); try { if (blockedAt(x, y)) { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, nx = clampMap(x + Math.cos(a)), ny = clampMap(y + Math.sin(a)); if (!blockedAt(nx, ny)) return { x: nx, y: ny }; } } } catch (_) { } return { x, y }; };

  // =============================================================== combat kit
  const kit = { telegraphs: [], zones: [], shots: [], now: 0, iframes: 0 };
  // Telegraph: {shape:'circle'|'line'|'ring', x,y,r | x2,y2,w, dur, kind, friendly, onEnd(tg), safe:[{x,y,r}]}
  kit.telegraph = function (o) {
    const tg = Object.assign({ t: 0, shape: 'circle', r: 1, w: .8, dur: 1, kind: 'danger' }, o);
    if (tg.shape === 'line' && tg.x2 == null) { tg.x2 = tg.x + Math.cos(tg.dir || 0) * (tg.len || 5); tg.y2 = tg.y + Math.sin(tg.dir || 0) * (tg.len || 5); }
    if (tg.shape === 'line') { tg.dir = Math.atan2(tg.y2 - tg.y, tg.x2 - tg.x); tg.len = Math.hypot(tg.x2 - tg.x, tg.y2 - tg.y); }
    if (typeof MM.fx?.telegraph === 'function' && tg.kind !== 'safe') {
      try { MM.fx.telegraph({ shape: tg.shape, x: tg.x, y: tg.y, r: tg.r, w: tg.w, h: tg.len, len: tg.len, dir: tg.dir, x2: tg.x2, y2: tg.y2, dur: tg.dur, kind: tg.kind, friendly: !!tg.friendly, color: tg.color }); tg.fxDrawn = true; } catch (e) { console.warn('[bosses] fx.telegraph failed', e); }
    }
    kit.telegraphs.push(tg); return tg;
  };
  kit.zone = function (o) { const z = Object.assign({ t: 0, dur: 4, r: 1, every: .6, acc: 0, kind: 'poison' }, o); kit.zones.push(z); return z; };
  kit.shot = function (o) { const s = Object.assign({ life: 2, r: .4, dmg: 10, hit: false }, o); kit.shots.push(s); return s; };
  kit.inShape = function (tg, x, y) {
    if (tg.shape === 'line') {
      const dx = tg.x2 - tg.x, dy = tg.y2 - tg.y, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - tg.x) * dx + (y - tg.y) * dy) / L2));
      return Math.hypot(x - (tg.x + dx * t), y - (tg.y + dy * t)) <= tg.w / 2;
    }
    return Math.hypot(x - tg.x, y - tg.y) <= tg.r;
  };
  kit.inZone = (z, p) => Math.hypot(p.x - z.x, p.y - z.y) <= z.r;
  kit.clear = function () { kit.telegraphs.length = 0; kit.zones.length = 0; kit.shots.length = 0; };

  // Player damage (single entry point for all campaign damage). opts: {kind, source, melee, ignoreWard}
  kit.hurt = function (amount, opts) {
    opts = opts || {};
    if (MM.campaign?.isDown?.()) return 0;
    if (MM.state && MM.state.current && MM.state.current !== 'play') return 0;
    if (opts.melee && world.cloak > 0) return 0;
    let dmg = Math.max(0, amount * (MM.campaign?.damageTakenMul?.(opts) ?? 1));
    if (!dmg) return 0;
    if (world.ward > 0 && !opts.ignoreWard) { const used = Math.min(world.ward, dmg); world.ward -= used; dmg -= used; }
    dmg = Math.round(dmg);
    if (dmg > 0) {
      world.lastDamage = dmg; world.hp -= dmg;
      try { numbers.push({ value: String(dmg), color: '#ff9a86', life: .9, offset: 0, x: game.x, y: game.y }); if (numbers.length > 40) numbers.shift(); } catch (_) { }
      try { addParticles(game, '#ee8b77', '#ffdbbf', 6, .7); } catch (_) { }
      if (!opts.melee) shake(2.5, .18);
    }
    emit('hurt', { amount: dmg, kind: opts.kind || (opts.melee ? 'melee' : 'attack'), from: opts.source || null });
    if (world.hp <= 0) { if (MM.campaign?.onPlayerDown) MM.campaign.onPlayerDown(opts); else { try { resetPlayer(); } catch (_) { } } }
    return dmg;
  };

  kit.update = function (dt) {
    kit.now += dt;
    for (let i = kit.telegraphs.length - 1; i >= 0; i--) {
      const tg = kit.telegraphs[i]; tg.t += dt;
      if (tg.t >= tg.dur) { kit.telegraphs.splice(i, 1); try { tg.onEnd && tg.onEnd(tg); } catch (e) { console.error('[bosses] telegraph onEnd', e); } }
    }
    for (let i = kit.zones.length - 1; i >= 0; i--) {
      const z = kit.zones[i]; z.t += dt; z.acc += dt;
      if (z.acc >= z.every) { z.acc -= z.every; try { z.onTick && z.onTick(z); } catch (e) { console.error('[bosses] zone tick', e); } }
      if (z.t >= z.dur) kit.zones.splice(i, 1);
    }
    for (let i = kit.shots.length - 1; i >= 0; i--) {
      const s = kit.shots[i]; s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (!s.hit && Math.hypot(s.x - game.x, s.y - game.y) <= s.r + .25) { s.hit = true; kit.hurt(s.dmg, { kind: s.kind || 'shot' }); s.life = Math.min(s.life, .12); }
      if (s.life <= 0 || s.x < 0 || s.y < 0 || s.x > 20 || s.y > 20) kit.shots.splice(i, 1);
    }
  };

  // ---------------------------------------------------------------- drawing (built-in fallback visuals)
  const RX = 22.63, RY = 11.31;  // screen half-axes of a 1-tile radius circle
  function tileEllipse(ctx, x, y, r) { const p = worldToCanvas(x, y); ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(1, r * RX), Math.max(1, r * RY), 0, 0, Math.PI * 2); }
  function linePath(ctx, tg, frac) {
    const nx = -Math.sin(tg.dir) * tg.w / 2, ny = Math.cos(tg.dir) * tg.w / 2, ex = tg.x + (tg.x2 - tg.x) * frac, ey = tg.y + (tg.y2 - tg.y) * frac;
    const pts = [[tg.x + nx, tg.y + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [tg.x - nx, tg.y - ny]].map(([a, b]) => worldToCanvas(a, b));
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath();
  }
  const PAL = {
    danger: ['rgba(240,96,74,', 'rgba(255,190,160,'], friendly: ['rgba(245,213,140,', 'rgba(255,249,219,'],
    safe: ['rgba(214,236,255,', 'rgba(255,255,255,'], darkness: ['rgba(22,12,44,', 'rgba(150,120,210,'], poison: ['rgba(130,190,90,', 'rgba(210,240,160,'],
    frost: ['rgba(160,220,245,', 'rgba(240,255,255,']
  };
  kit.draw = function (ctx) {
    const reduced = !!MM.settings?.get?.('reducedFlashes');
    // zones (persistent ground areas)
    for (const z of kit.zones) {
      const fade = Math.min(1, z.t / .25, (z.dur - z.t) / .4), col = z.color || ({ poison: '#6fae5a', blizzard: '#bfe6f6', bloom: '#f47c46', thorn: '#5f9a55' }[z.kind] || '#999');
      ctx.globalAlpha = .28 * fade; ctx.fillStyle = col; tileEllipse(ctx, z.x, z.y, z.r); ctx.fill();
      ctx.globalAlpha = .7 * fade; ctx.strokeStyle = col; ctx.lineWidth = 1; tileEllipse(ctx, z.x, z.y, z.r); ctx.stroke();
      const p = worldToCanvas(z.x, z.y), n = z.kind === 'thorn' ? 10 : 7;
      for (let i = 0; i < n; i++) {
        const a = i * 2.39 + (z.kind === 'thorn' ? 0 : kit.now * (z.kind === 'blizzard' ? 2 : .8)), rr = (.3 + (i % 3) * .25) * z.r;
        const x = p.x + Math.cos(a) * rr * RX, y = p.y + Math.sin(a) * rr * RY;
        if (z.kind === 'thorn') { ctx.fillStyle = '#3f6b3c'; ctx.fillRect(Math.round(x), Math.round(y - 4), 1, 4); ctx.fillStyle = '#9fd17d'; ctx.fillRect(Math.round(x) - 1, Math.round(y - 5), 3, 1); }
        else if (z.kind === 'bloom') { ctx.fillStyle = i % 2 ? '#ffd27a' : '#f47c46'; ctx.fillRect(Math.round(x), Math.round(y - 2 - ((kit.now * 9 + i) % 4)), 2, 2); }
        else { ctx.fillStyle = z.kind === 'blizzard' ? '#ffffff' : '#c8eaa0'; ctx.fillRect(Math.round(x), Math.round(y - ((kit.now * 12 + i * 3) % 6)), 1, 1); }
      }
      ctx.globalAlpha = 1;
    }
    // telegraphs
    for (const tg of kit.telegraphs) {
      if (tg.fxDrawn) continue;
      const q = Math.min(1, tg.t / tg.dur), pal = PAL[tg.kind] || PAL.danger, pulse = reduced ? .5 : .5 + .5 * Math.sin(kit.now * 14);
      if (tg.shape === 'ring' || tg.kind === 'darkness') {
        ctx.fillStyle = pal[0] + (.18 + .22 * q) + ')'; tileEllipse(ctx, tg.x, tg.y, tg.r); ctx.fill();
        ctx.strokeStyle = pal[1] + (.5 + .3 * pulse) + ')'; ctx.lineWidth = 1; tileEllipse(ctx, tg.x, tg.y, tg.r * q); ctx.stroke();
        continue;
      }
      ctx.fillStyle = pal[0] + (.14 + .1 * pulse) + ')';
      if (tg.shape === 'line') linePath(ctx, tg, 1); else tileEllipse(ctx, tg.x, tg.y, tg.r); ctx.fill();
      ctx.fillStyle = pal[0] + (.22 + .2 * q) + ')';
      if (tg.shape === 'line') linePath(ctx, tg, q); else tileEllipse(ctx, tg.x, tg.y, tg.r * q); ctx.fill();
      ctx.strokeStyle = pal[1] + (.55 + .35 * pulse) + ')'; ctx.lineWidth = 1;
      if (tg.shape === 'line') linePath(ctx, tg, 1); else tileEllipse(ctx, tg.x, tg.y, tg.r); ctx.stroke();
    }
    // safe light spots are always drawn here (FX may add glow on top)
    for (const tg of kit.telegraphs) {
      if (tg.kind !== 'safe') continue;
      const pulse = reduced ? .5 : .5 + .5 * Math.sin(kit.now * 8);
      ctx.fillStyle = 'rgba(226,240,255,' + (.38 + .2 * pulse) + ')'; tileEllipse(ctx, tg.x, tg.y, tg.r); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1; tileEllipse(ctx, tg.x, tg.y, tg.r); ctx.stroke();
      const p = worldToCanvas(tg.x, tg.y); ctx.fillStyle = 'rgba(255,255,240,.5)'; ctx.fillRect(p.x - 1, p.y - 26, 2, 26);
    }
    // projectiles
    for (const s of kit.shots) {
      const p = worldToCanvas(s.x, s.y), y = p.y - 14;
      ctx.fillStyle = 'rgba(190,170,255,.45)'; ctx.fillRect(Math.round(p.x - s.vx * 2.2) - 1, Math.round(y - s.vy * 1.1) - 1, 3, 3);
      ctx.fillStyle = s.color || '#c9b8ff'; ctx.beginPath(); ctx.arc(p.x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(p.x - 1, y - 2, 2, 2);
      ctx.fillStyle = 'rgba(40,30,70,.25)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
    }
  };

  // =============================================================== bosses
  const B = { list: [] };
  const def = id => (D().bosses || {})[id];
  const alive = () => enemies.filter(e => e.mmBoss && e.hp > 0 && !e.dead);
  const player = () => ({ x: game.x, y: game.y });
  const aim = (e, p) => Math.atan2((p || game).y - e.y, (p || game).x - e.x);
  const nightvision = () => !!MM.campaign?.hasBuff?.('nightvision');
  const adds = (e, arch) => enemies.filter(a => a.hp > 0 && !a.dead && a.mmOwner === e.id && (!arch || a.mmArch === arch));

  function spawnAdd(owner, arch, x, y) {
    const s = freeSpot(x, y);
    let a = MM.campaign?.spawnArch?.(arch, s.x, s.y);
    if (!a) { const A = (D().archetypes || {})[arch] || { kind: 'slime', hp: 40 }; a = { id: worldId++, type: A.kind, x: s.x, y: s.y, hp: A.hp, maxHP: A.hp, boss: false, name: '', status: {}, flash: 0, attack: 9, special: 9, dead: false, age: 0, mmArch: arch }; enemies.push(a); }
    a.mmOwner = owner.id; try { addParticles(a, '#9fd17d', '#f3ffd0', 8, .7); } catch (_) { } return a;
  }
  function lines(e, n, spread, len, w, dur, dmg, extra) {
    const base = aim(e), hit = { done: false };
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread;
      kit.telegraph(Object.assign({ shape: 'line', x: e.x, y: e.y, x2: e.x + Math.cos(a) * len, y2: e.y + Math.sin(a) * len, w, dur, kind: 'danger', onEnd(tg) {
        if (!hit.done && kit.inShape(tg, game.x, game.y)) { hit.done = true; kit.hurt(dmg, { kind: 'slam', source: e }); }
        try { for (let k = 1; k <= 4; k++) addParticles({ x: tg.x + (tg.x2 - tg.x) * k / 4, y: tg.y + (tg.y2 - tg.y) * k / 4 }, '#b9a07a', '#f3e2bf', 4, .6); } catch (_) { }
      } }, extra || {}));
    }
    shake(1.5, .15);
  }
  function circles(e, spots, r, dur, onHit, kind) {
    const hit = { done: false };
    for (const s of spots) kit.telegraph({ shape: 'circle', x: s.x, y: s.y, r, dur, kind: kind || 'danger', onEnd(tg) { if (!hit.done && kit.inShape(tg, game.x, game.y)) { hit.done = true; onHit && onHit(tg); } tg.after && tg.after(tg); } });
  }
  const around = (p, d1, d2) => { const a = Math.random() * Math.PI * 2, d = rand(d1, d2); return freeSpot(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d); };

  // Each brain: attacks(e) -> list of attack names cycled; attack fns create telegraphs; cooldown(e)
  const brains = {
    bramble_warden: {
      speed: .8, cooldown: e => e.mmPhase >= 1 ? 1.6 : 2.3,
      attacks: e => e.mmPhase >= 1 ? ['slam', 'sprouts', 'slam', 'slam'] : ['slam', 'sprouts', 'slam'],
      slam(e) { const a = def(e.mmBoss).attacks.slam, enr = e.mmPhase >= 1; lines(e, enr ? 5 : 3, enr ? .38 : .45, 6.5, .9, enr ? .85 : a.windup, a.dmg); return enr ? .85 : a.windup; },
      sprouts(e) {
        const have = adds(e, 'thorn_sprout').length; if (have >= 4) return brains.bramble_warden.slam(e);
        const n = Math.min(3, 4 - have), spots = []; for (let i = 0; i < n; i++) spots.push(around(player(), 1.6, 2.8));
        const w = def(e.mmBoss).attacks.sprouts.windup;
        for (const s of spots) kit.telegraph({ shape: 'circle', x: s.x, y: s.y, r: .55, dur: w, kind: 'danger', onEnd: tg => { spawnAdd(e, 'thorn_sprout', tg.x, tg.y); if (kit.inShape(tg, game.x, game.y)) kit.hurt(6, { kind: 'thorn', source: e }); } });
        if (!e.mmArmorTold) { e.mmArmorTold = true; setTimeout(() => toast('Thorn sprouts shield the Warden with bark armour — clear them to hurt it fully!'), 900); }
        return w;
      },
      phase(e, i) { if (i === 1) toast('The Warden\'s bark splits open — it\'s enraged! Faster slams incoming.'); }
    },
    mire_heart: {
      speed: .55, cooldown: e => e.mmPhase === 1 ? 3.0 : e.mmPhase >= 2 ? 1.7 : 2.3,
      attacks: e => e.mmPhase === 1 ? ['pools'] : ['pools', 'hands', 'hands'],
      pools(e) {
        const a = def(e.mmBoss).attacks.pools, w = 1.1, spots = [freeSpot(game.x, game.y), around(player(), 1.4, 2.4), around(player(), 1.4, 2.6)];
        for (const s of spots) kit.telegraph({ shape: 'circle', x: s.x, y: s.y, r: .85, dur: w, kind: 'poison', onEnd: tg => {
          kit.zone({ kind: 'poison', x: tg.x, y: tg.y, r: .85, dur: a.dur, every: .6, onTick: z => { if (kit.inZone(z, game)) { kit.hurt(a.dmg, { kind: 'poison', source: e }); MM.campaign?.slowPlayer?.(.7, .7, 'poison'); } } });
        } });
        return w;
      },
      hands(e) {
        const a = def(e.mmBoss).attacks.hands, w = 1.0;
        circles(e, [freeSpot(game.x, game.y)], .7, w, () => { kit.hurt(a.dmg, { kind: 'grab', source: e }); MM.campaign?.slowPlayer?.(.35, 1.2, 'grab'); });
        return w;
      },
      phase(e, i) {
        if (i === 1) {
          e.mmInvuln = true; e.mmHidden = true; e.mmWisps = [];
          for (let k = 0; k < 3; k++) { const a = spawnAdd(e, 'mire_wisp', e.x + Math.cos(k * 2.1) * 2.2, e.y + Math.sin(k * 2.1) * 2.2); e.mmWisps.push(a.id); }
          toast('The Mire Heart sinks and splits into three wisps! Defeat the wisps to drag it back up.');
        } else if (i === 2) toast('The Mire Heart resurfaces, furious and weakened!');
      },
      onAddKilled(e, a) {
        if (!e.mmWisps || !e.mmWisps.includes(a.id)) return;
        e.hp = Math.max(Math.round(e.maxHP * .26), e.hp - Math.round(e.maxHP * .08)); e.flash = .3;
        if (!adds(e, 'mire_wisp').length && e.mmInvuln) { e.mmInvuln = false; e.mmHidden = false; e.hp = Math.min(e.hp, Math.round(e.maxHP * .25)); setPhase(e, 2); }
      },
      manualPhases: [2]
    },
    frost_wyrm: {
      speed: .9, cooldown: e => e.mmPhase >= 1 ? 1.8 : 2.3,
      attacks: e => e.mmPhase >= 1 ? ['lances', 'charge', 'blizzard', 'lances', 'charge'] : ['lances', 'blizzard', 'charge'],
      lances(e) { const a = def(e.mmBoss).attacks.lances; lines(e, e.mmPhase >= 1 ? 5 : 3, .36, 7.5, .7, a.windup, a.dmg); return a.windup; },
      blizzard(e) {
        const a = def(e.mmBoss).attacks.blizzard, w = 1.4, spots = [freeSpot(game.x, game.y), around(player(), 1.8, 3)];
        for (const s of spots) kit.telegraph({ shape: 'circle', x: s.x, y: s.y, r: 1.1, dur: w, kind: 'frost', onEnd: tg => {
          kit.zone({ kind: 'blizzard', x: tg.x, y: tg.y, r: 1.1, dur: a.dur, every: .8, onTick: z => { if (kit.inZone(z, game)) { const warm = MM.campaign?.hasBuff?.('hearthfire'); kit.hurt(warm ? a.dmg / 2 : a.dmg, { kind: 'cold', source: e }); if (!warm) MM.campaign?.slowPlayer?.(.6, .9, 'blizzard'); } } });
        } });
        return w;
      },
      charge(e) {
        const a = def(e.mmBoss).attacks.charge, ang = aim(e), d = Math.min(9, dist(e, game) + 1.5);
        const tx = clampMap(e.x + Math.cos(ang) * d), ty = clampMap(e.y + Math.sin(ang) * d);
        kit.telegraph({ shape: 'line', x: e.x, y: e.y, x2: tx, y2: ty, w: 1.1, dur: a.windup, kind: 'danger', onEnd: () => { e.mmDash = { tx, ty, speed: 10, hit: false }; e.mmState = 'dash'; } });
        return 99;   // state handled by dash
      },
      phase(e, i) { if (i === 1) toast('Cracks race across the Husk\'s ice! It lashes out faster.'); }
    },
    hollow_moon: {
      speed: 0, cooldown: e => e.mmPhase >= 2 ? 2.0 : e.mmPhase === 1 ? 2.1 : 2.4,
      attacks: e => e.mmPhase >= 2 ? ['collapse'] : e.mmPhase === 1 ? ['pulse', 'orbs', 'pulse', 'orbs'] : ['orbs', 'orbs', 'shards'],
      orbs(e) {
        const a = def(e.mmBoss).attacks.orbs, n = e.mmPhase >= 1 ? 6 : 5, base = aim(e), len = 9;
        for (let i = 0; i < n; i++) {
          const ang = base + i * Math.PI * 2 / n;
          kit.telegraph({ shape: 'line', x: e.x, y: e.y, x2: e.x + Math.cos(ang) * len, y2: e.y + Math.sin(ang) * len, w: .6, dur: a.windup, kind: 'danger', onEnd: () => kit.shot({ x: e.x, y: e.y, vx: Math.cos(ang) * 7, vy: Math.sin(ang) * 7, life: len / 7, r: .3, dmg: a.dmg, kind: 'shard' }) });
        }
        return a.windup;
      },
      shards(e) {
        if (adds(e, 'shard_wisp').length >= 2) return brains.hollow_moon.orbs(e);
        const w = .9, spots = [around(e, 1.5, 2.5), around(e, 1.5, 2.5)];
        for (const s of spots) kit.telegraph({ shape: 'circle', x: s.x, y: s.y, r: .5, dur: w, kind: 'danger', onEnd: tg => spawnAdd(e, 'shard_wisp', tg.x, tg.y) });
        return w;
      },
      pulse(e) {
        const a = def(e.mmBoss).attacks.pulse, w = a.windup, safe = [];
        const ang0 = Math.random() * Math.PI * 2;
        safe.push(freeSpot(game.x + Math.cos(ang0) * 1.3, game.y + Math.sin(ang0) * 1.3));
        for (let k = 1; k <= 2; k++) safe.push(freeSpot(e.x + Math.cos(ang0 + k * 2.1) * 3.4, e.y + Math.sin(ang0 + k * 2.1) * 3.4));
        kit.telegraph({ shape: 'ring', x: e.x, y: e.y, r: 9.5, dur: w, kind: 'darkness', onEnd: () => {
          const ok = safe.some(s => Math.hypot(game.x - s.x, game.y - s.y) <= 1.15);
          if (!ok) kit.hurt(nightvision() ? a.dmg / 2 : a.dmg, { kind: 'darkness', source: e });
          try { MM.fx?.flash?.('#1a1030', 160); } catch (_) { }
          shake(3, .3);
        } });
        for (const s of safe) kit.telegraph({ shape: 'circle', x: s.x, y: s.y, r: 1.15, dur: w, kind: 'safe' });
        if (!e.mmPulseTold) { e.mmPulseTold = true; toast('Darkness gathers — stand inside a pool of light!'); }
        return w;
      },
      collapse(e) {
        const a = def(e.mmBoss).attacks.collapse, w = 1.15, spots = [freeSpot(game.x, game.y), around(player(), 1.4, 2.8), around(player(), 1.4, 2.8)];
        circles(e, spots, .85, w, () => kit.hurt(a.dmg, { kind: 'collapse', source: e }));
        return w;
      },
      phase(e, i) {
        if (i === 1) toast('The Hollow Moon dims the whole grove. Find the light!');
        if (i === 2) {
          e.mmInvuln = true; e.mmHidden = .55;
          const mw = MM.campaign?.moonwellPos?.() || { x: 12.6, y: 4.4 };
          const well = MM.campaign?.spawnArch?.('shard_wisp', mw.x, mw.y) || null;
          if (well) {
            const hp = (def(e.mmBoss).well || {}).hp || 520;
            Object.assign(well, { mmWell: true, mmFriendly: true, mmAnchor: { x: mw.x, y: mw.y }, mmOwner: e.id, hp, maxHP: hp, name: 'The Moonwell', type: 'wisp' });
            e.mmWellId = well.id; world.targetId = well.id;
          }
          toast('The Hollow Moon collapses toward the Moonwell — pour your spells into the well to restore it!');
          focus({ x: mw.x, y: mw.y, hold: 1.4 });
        }
      },
      onAddKilled(e, a) { if (a.mmWell && a.mmOwner === e.id) defeat(e, 'restored'); },
      manualPhases: []
    }
  };

  function setPhase(e, i) {
    if (e.mmPhase >= i) return;
    e.mmPhase = i; const d = def(e.mmBoss), name = d.phases?.[i]?.name || ('Phase ' + (i + 1));
    e.mmState = 'stagger'; e.mmT = 0; e.mmStagger = 1.2; e.mmCd = 1.6;
    focus({ x: e.x, y: e.y, hold: 1.2 }); shake(4, .5);
    try { MM.audio?.sfx?.('boss_roar'); } catch (_) { }
    try { addParticles(e, '#d49bce', '#ffe3bf', 22, 1.3); } catch (_) { }
    emit('boss', { phase: 'phase', id: e.mmBoss, name: d.name, index: i, phaseName: name, hp: e.hp, maxHP: e.maxHP, enemy: e });
    try { brains[e.mmBoss].phase?.(e, i); } catch (err) { console.error('[bosses] phase', err); }
    setTimeout(() => focus(null), 1300);
  }

  function defeat(e, how) {
    if (e.mmDefeated) return; e.mmDefeated = true;
    for (const a of enemies) if (a.mmOwner === e.id && a.hp > 0) { a.hp = 0; a.dead = true; }
    if (e.hp > 0) { e.hp = 0; e.dead = true; }
    kit.clear(); focus(null); shake(5, .6);
    try { addParticles(e, '#f5e6ff', '#ffffff', 30, 1.6); } catch (_) { }
    emit('boss', { phase: 'defeated', id: e.mmBoss, name: def(e.mmBoss).name, how: how || 'defeated', enemy: e });
    try { MM.campaign?.onBossDefeated?.(e.mmBoss, e); } catch (err) { console.error('[bosses] onBossDefeated', err); }
  }

  B.spawn = function (id, x, y, opts) {
    const d = def(id); if (!d) return null;
    const s = freeSpot(x, y), lvl = Math.max(0, (world.level || 1) - ((D().regions || {})[d.region]?.recommended || 1));
    const hp = Math.round(d.hp * (1 + .05 * Math.min(6, lvl)));
    const e = { id: worldId++, type: d.kind, x: s.x, y: s.y, hp, maxHP: hp, boss: true, name: d.name, status: {}, flash: 0, attack: 9, special: 9, dead: false, age: 0,
      mmBoss: id, mmPhase: 0, mmState: 'intro', mmT: 0, mmCd: 1.4, mmIdx: 0, mmSpeed: brains[id].speed, mmDmg: d.attacks.contact.dmg, mmRate: d.attacks.contact.rate, mmAtk: 1.5 };
    if (id === 'hollow_moon') e.mmAnchor = { x: e.x, y: e.y };
    enemies.push(e);
    focus({ x: e.x, y: e.y, hold: 1.5 }); setTimeout(() => focus(null), 1600); shake(3, .4);
    emit('boss', { phase: 'spawn', id, name: d.name, epithet: d.epithet, hp: e.hp, maxHP: e.maxHP, enemy: e });
    if (!opts?.quiet) toast(d.name + ' — ' + d.epithet + '.');
    return e;
  };

  B.update = function (dt) {
    for (const e of alive()) {
      const br = brains[e.mmBoss]; if (!br) continue;
      e.mmT += dt;
      // hp-driven phases
      const phases = def(e.mmBoss).phases || [];
      for (let i = 1; i < phases.length; i++) if (!(br.manualPhases || []).includes(i) && e.mmPhase < i && e.hp / e.maxHP <= phases[i].at) setPhase(e, i);
      if (e.mmBoss === 'hollow_moon' && e.mmPhase >= 2 && e.hp < e.maxHP * .33) e.hp = Math.round(e.maxHP * .33);
      // state machine
      if (e.mmState === 'intro') { e.mmAnchorTmp = true; if (e.mmT > 1.4) { e.mmState = 'chase'; e.mmT = 0; } }
      else if (e.mmState === 'stagger') { e.mmAnchorTmp = true; if (e.mmT > e.mmStagger) { e.mmState = 'chase'; e.mmT = 0; } }
      else if (e.mmState === 'chase') {
        e.mmAnchorTmp = false; e.mmCd -= dt;
        if (e.mmCd <= 0) {
          const list = br.attacks(e), name = list[e.mmIdx++ % list.length];
          const w = br[name](e); e.mmAttack = name; e.mmState = name === 'charge' ? 'charge_windup' : 'windup'; e.mmT = 0; e.mmWind = w; e.mmCd = br.cooldown(e);
        }
      } else if (e.mmState === 'windup') { e.mmAnchorTmp = true; if (e.mmT >= e.mmWind) { e.mmState = 'recover'; e.mmT = 0; } }
      else if (e.mmState === 'charge_windup') { e.mmAnchorTmp = true; }
      else if (e.mmState === 'dash') {
        e.mmAnchorTmp = true; const d = e.mmDash, dx = d.tx - e.x, dy = d.ty - e.y, L = Math.hypot(dx, dy), step = d.speed * dt;
        if (L <= step) { e.x = d.tx; e.y = d.ty; e.mmState = 'exposed'; e.mmT = 0; e.mmExposed = true; shake(4, .35);
          if (!e.mmExposeTold) { e.mmExposeTold = true; toast('The Husk\'s shell cracked open — strike the glowing weak point now! (Frostbell shatters it.)'); }
          try { addParticles(e, '#bfe6f6', '#ffffff', 20, 1.2); } catch (_) { } }
        else { e.x += dx / L * step; e.y += dy / L * step; try { noteCastMotion(e, dx / L * step, dy / L * step); } catch (_) { } }
        if (!d.hit && Math.hypot(game.x - e.x, game.y - e.y) < .9) { d.hit = true; kit.hurt(def(e.mmBoss).attacks.charge.dmg, { kind: 'charge', source: e }); }
      } else if (e.mmState === 'exposed') {
        e.mmAnchorTmp = true; if (e.mmT >= def(e.mmBoss).attacks.charge.exposed) { e.mmExposed = false; e.mmState = 'recover'; e.mmT = 0; }
      } else if (e.mmState === 'recover') { e.mmAnchorTmp = true; if (e.mmT >= .6) { e.mmState = 'chase'; e.mmT = 0; } }
      // anchoring is applied by MM.campaign after baseline movement (mmAnchor permanent, mmAnchorTmp per state)
      if (e.mmHidden && e.mmBoss === 'mire_heart') e.mmAnchorTmp = true;
    }
  };

  B.onKill = function (a) {
    if (a.mmBoss) { defeat(a, 'defeated'); return; }
    if (a.mmOwner) { const o = enemies.find(e => e.id === a.mmOwner && e.mmBoss); if (o) try { brains[o.mmBoss].onAddKilled?.(o, a); } catch (err) { console.error('[bosses] onAddKilled', err); } }
  };

  // Multiplier applied to player spell damage against `target` (campaign wraps spellMultiplier with it).
  B.damageFactor = function (target, spell) {
    if (!target || !target.mmBoss) return 1;
    let f = 1; const d = def(target.mmBoss);
    if (target.mmBoss === 'bramble_warden' && adds(target, 'thorn_sprout').length >= 2) f *= .5;
    if (target.mmExposed) f *= 2;
    if (d.weakness && spell && d.weakness[spell.school]) f *= 1 + d.weakness[spell.school];
    return f;
  };
  B.isArmored = t => !!(t?.mmBoss === 'bramble_warden' && adds(t, 'thorn_sprout').length >= 2);
  B.active = () => alive().map(e => ({ id: e.mmBoss, name: e.name, epithet: def(e.mmBoss).epithet, hp: Math.ceil(e.hp), maxHP: e.maxHP, phase: e.mmPhase, phaseName: def(e.mmBoss).phases?.[e.mmPhase]?.name || '', state: e.mmState, invulnerable: !!e.mmInvuln, exposed: !!e.mmExposed, armored: B.isArmored(e), x: e.x, y: e.y,
    well: e.mmWellId ? (() => { const w = enemies.find(x => x.id === e.mmWellId); return w ? { hp: Math.ceil(w.hp), maxHP: w.maxHP } : null; })() : null }));
  B.clear = function () { kit.clear(); };
  B.defs = () => D().bosses;
  B.brains = brains; B.setPhase = setPhase; B.defeat = defeat; B.kit = kit;

  // ---------------------------------------------------------------- boss drawing
  const ART_KEYS = { bramble_warden: ['bramble', 'warden'], mire_heart: ['mire', 'murk', 'swamp'], frost_wyrm: ['wyrm', 'frost', 'rime', 'colossus'], hollow_moon: ['hollow', 'moon'] };
  const artCache = {};
  function artName(id, state) {
    if (!MM.art?.has || !MM.art.ready) return null;
    const key = id + ':' + state; if (key in artCache) return artCache[key];
    let base = null;
    if (MM.art.has('boss_' + id)) base = 'boss_' + id;
    else { const all = (MM.art.names?.('boss_') || []); base = all.find(n => ART_KEYS[id].some(k => n.includes(k)) && !/_(windup|hurt|attack|exposed|hidden)$/.test(n)) || null; }
    let name = base && MM.art.has(base + '_' + state) ? base + '_' + state : base;
    artCache[key] = name; return name;
  }
  function hpBar(ctx, x, y, w, frac, color) { fill('#2b3a33', x - w / 2 - 1, y - 1, w + 2, 4); fill('#4a3b3b', x - w / 2, y, w, 2); fill(color, x - w / 2, y, Math.max(0, Math.round(w * frac)), 2); }
  B.drawEnemy = function (e, p) {
    if (e.mmBoss) { drawBoss(e, p); return true; }
    if (e.mmWell) { drawWell(e, p); return true; }
    if (e.mmArch === 'thorn_sprout') { drawSprout(e, p); return true; }
    return false;
  };
  function drawBoss(e, p) {
    const d = def(e.mmBoss), t = game.elapsed, hidden = e.mmHidden ? (typeof e.mmHidden === 'number' ? e.mmHidden : .28) : 1;
    const float = e.mmBoss === 'hollow_moon' ? Math.round(10 + Math.sin(t * 1.6) * 3) : 0;
    ellipse(p.x, p.y, 20, 5, 'rgba(30,40,34,' + (.3 * hidden) + ')');
    const state = e.mmExposed ? 'exposed' : (e.mmState === 'windup' || e.mmState === 'charge_windup') ? 'windup' : 'idle';
    ctx.save(); ctx.globalAlpha = hidden;
    const art = artName(e.mmBoss, state);
    if (e.flash > 0) ctx.filter = 'brightness(1.6)';
    let drawn = false;
    if (art) { const flip = (e.artFacing || 'S').includes('W'); drawn = MM.art.draw(ctx, art, p.x, p.y - float, { t, flip }); }
    if (!drawn) {
      ctx.filter = (d.tint || 'none') + (e.flash > 0 ? ' brightness(1.6)' : '') + (state === 'windup' ? ' brightness(1.15)' : '');
      ctx.translate(p.x, p.y - float); ctx.scale(2, 2);
      try { drawCastSprite(d.kind, { x: 0, y: 0 }, e); } catch (_) { }
    }
    ctx.restore();
    // signature overlays (procedural, no text)
    const top = p.y - float - 78;
    if (e.mmBoss === 'hollow_moon') {
      const r = 15 + Math.sin(t * 2) * 1.5; ctx.globalAlpha = hidden;
      ctx.fillStyle = 'rgba(220,214,255,.9)'; ctx.beginPath(); ctx.arc(p.x, top + 8, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(28,18,48,.92)'; ctx.beginPath(); ctx.arc(p.x + 6 + Math.sin(t) * 2, top + 6, r * .86, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 6; i++) { const a = t * 1.3 + i * Math.PI / 3; sparkle(p.x + Math.cos(a) * 26, top + 10 + Math.sin(a) * 9, i % 2 ? '#c9b8ff' : '#ffffff', 2); }
      ctx.globalAlpha = 1;
    }
    if (e.mmExposed) { const s = Math.floor(t * 8) % 2; sparkle(p.x, p.y - 40, s ? '#ffffff' : '#9fe8ff', 5); magicRing(p.x, p.y - 40, 9, 5, '#e9ffff'); }
    if (B.isArmored(e)) { magicRing(p.x, p.y - 34, 26, 14, '#8a6b45'); magicRing(p.x, p.y - 34, 24, 12, '#c8a46d'); }
    if (e.mmInvuln && e.mmBoss === 'mire_heart') { for (let i = 0; i < 5; i++) fill('rgba(170,220,190,.7)', p.x - 12 + i * 6, p.y - 4 - ((t * 20 + i * 7) % 14), 2, 2); }
    if (state === 'windup') { const k = Math.floor(t * 10) % 2; fill(k ? '#ffd27a' : '#ff8a6a', p.x - 1, top - 6, 3, 3); }
    hpBar(ctx, p.x, top - 2, 44, e.hp / e.maxHP, e.mmInvuln ? '#9aa6c4' : '#e38f67');
  }
  function drawWell(e, p) {
    const t = game.elapsed, q = 1 - e.hp / e.maxHP, h = 24 + Math.round(q * 40);
    ctx.save(); ctx.globalAlpha = .35 + .5 * q; ctx.fillStyle = '#e6f0ff'; ctx.fillRect(p.x - 3, p.y - h, 6, h); ctx.fillStyle = '#ffffff'; ctx.fillRect(p.x - 1, p.y - h, 2, h); ctx.restore();
    magicRing(p.x, p.y - 2, 14 + Math.sin(t * 3) * 2, 6, '#cfe2ff'); magicRing(p.x, p.y - 2, 9, 4, '#ffffff');
    for (let i = 0; i < 6; i++) { const a = t * 2 + i; sparkle(p.x + Math.cos(a) * 12, p.y - 10 - ((t * 18 + i * 9) % 30), i % 2 ? '#cfe2ff' : '#fff7d0', 1); }
    hpBar(ctx, p.x, p.y - h - 8, 30, q, '#bfe0ff');
  }
  function drawSprout(e, p) {
    const t = game.elapsed, sway = Math.round(Math.sin(t * 3 + e.id) * 1);
    ellipse(p.x, p.y, 7, 2, 'rgba(41,56,40,.3)');
    ctx.save(); if (e.flash > 0) ctx.filter = 'brightness(1.5)';
    fill('#4a3a2a', p.x - 1, p.y - 14, 3, 14); fill('#5f9a55', p.x - 5 + sway, p.y - 16, 4, 3); fill('#5f9a55', p.x + 2 + sway, p.y - 12, 4, 3);
    fill('#d9d0a8', p.x - 3 + sway, p.y - 19, 1, 3); fill('#d9d0a8', p.x + 4 + sway, p.y - 15, 1, 3); fill('#9fd17d', p.x + sway, p.y - 18, 2, 2);
    ctx.restore();
    hpBar(ctx, p.x, p.y - 23, 14, e.hp / e.maxHP, '#bedb97');
  }

  MM.bosses = B;
})();
