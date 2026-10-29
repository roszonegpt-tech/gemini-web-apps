'use strict';
// Moss & Moon — campaign data (owner: CAMPAIGN). Pure data: loads BEFORE baseline.js, so it must not
// touch baseline globals. src/systems/campaign.js and src/entities/bosses.js read MM.CAMPAIGN_DATA.
// Coordinates are baseline tile coords (map 0..20; player spawn 9.7,10). The WORLD agent may override
// interaction positions through MM.world.layout(region); these are the defaults/fallbacks.
window.MM = window.MM || {};
(function (MM) {
  const D = {};
  D.version = 1;

  // ------------------------------------------------------------------ new game
  D.start = {
    gold: 85, potions: 2, bombs: 0, runes: 1,
    seeds: { wheat: 4, ember: 2, frost: 0, moon: 2, glowcap: 0, starmint: 0 },
    harvest: { wheat: 1, ember: 0, frost: 0, moon: 0, glowcap: 0, starmint: 0 },  // grandmother's pantry: 1 wheat
    items: {},
    equipment: { wand: 'wand_birch', robe: 'robe_patched', charm: 'charm_silver_moon' },
    spells: ['moonbolt'],
    cls: 'grove'   // baseline class: Nature +25% (Thornbind), crops +25% growth
  };

  // ------------------------------------------------------------------ regions
  // level = enemy level; recommended = suggested player level; floors = dungeon floor names (3 each).
  D.regions = {
    grove: {
      name: 'Moonflower Grove', short: 'Homestead', level: 1, recommended: 1, mob: 'slime',
      desc: "Grandmother's homestead: six garden plots, a sleepy cottage and the Moonwell, gone quiet and grey.",
      roster: [], raidRoster: ['blightling'], boss: null, dungeon: null, resources: ['wheat', 'ember', 'frost', 'moon', 'glowcap', 'starmint'],
      props: ['cottage', 'moonwell', 'garden', 'fence', 'seed_barrel', 'cauldron', 'lantern'], hazards: [],
      requires: null
    },
    village: {
      name: 'Hollowbrook Village', short: 'Village', level: 1, recommended: 1, mob: null,
      desc: 'A little market village down the lane: Pip\'s stall, Wren\'s herb garden and Elder Marrow\'s porch.',
      roster: [], boss: null, dungeon: null, resources: ['shop', 'requests', 'recipes'],
      props: ['shop_stall', 'houses', 'notice_board', 'travel_board', 'well', 'lantern'], hazards: [],
      requires: { chapterStep: 'brew' }, lockReason: 'Finish your first brew — Grandmother\'s notes say the village is just down the lane.'
    },
    forest: {
      name: 'Blighted Forest', short: 'Forest', level: 2, recommended: 2, mob: 'blight',
      desc: 'Old oaks gone black at the roots. Something below the Rootways is drinking a piece of the moon.',
      roster: [['blightling', 3], ['moss_slime', 2]], boss: 'bramble_warden', fragment: 'forest',
      dungeon: { name: 'The Rootways', floors: ['Tangled Rootways', 'Hollow Heartwood', "Warden's Throne"] },
      resources: ['blight_bark', 'ember', 'glowcap'], props: ['tree_blighted', 'bush_blight', 'stump', 'log', 'mushroom_red'],
      hazards: ['brambles'], requires: { tutorial: true }, lockReason: 'Help someone in the village first — Marrow will point you toward the forest.'
    },
    swamp: {
      name: 'Whispering Swamp', short: 'Swamp', level: 3, recommended: 4, mob: 'ghost',
      desc: 'Lanterns that no one lit, water that hums. The paths are drowned; only a steady broom skims across.',
      roster: [['bog_ghost', 3], ['mire_slime', 2], ['marsh_wisp', 2]], boss: 'mire_heart', fragment: 'swamp',
      dungeon: { name: 'The Sunken Lanterns', floors: ['Reedwater Steps', 'Drowned Chapel', 'The Mire Heart'] },
      resources: ['bog_pearl', 'glowcap', 'frost'], props: ['tree_willow', 'reeds', 'lilypad', 'mushroom_glow', 'bush_swamp'],
      hazards: ['bog'], requires: { broom: 1 }, lockReason: 'The swamp paths are under water. A level 1 broom (Pip can tune it) will skim across.'
    },
    mountain: {
      name: 'Frostpeak', short: 'Frostpeak', level: 4, recommended: 6, mob: 'ice',
      desc: 'Wind-scoured slopes where the snow glitters wrong. The cold here bites — bring something warm.',
      roster: [['rime_imp', 3], ['stone_golem', 1], ['frost_spirit', 2]], boss: 'frost_wyrm', fragment: 'mountain',
      dungeon: { name: 'The Rime Halls', floors: ['Icefall Stair', 'Frozen Gallery', "Wyrm's Rest"] },
      resources: ['rime_shard', 'frost', 'starmint'], props: ['tree_pine_snow', 'rock_snow', 'ice_crystal', 'snow_mound'],
      hazards: ['frost'], requires: { broomOr: 2, restoredOr: 'swamp' },
      lockReason: 'The high pass is iced shut. A level 2 broom can climb it — or restore the swamp to open the Moonlit Path.'
    },
    crypt: {
      name: 'Old Crypt', short: 'Crypt', level: 6, recommended: 8, mob: 'skeleton', optional: true,
      desc: 'Postgame: an old crypt beneath the hill, its seal loosened when the Moonwell woke. Endless floors, rare loot.',
      roster: [['crypt_skeleton', 3], ['crypt_ghost', 2]], boss: null,
      dungeon: { name: 'The Long Dark', floors: ['Ossuary', 'Candle Vault', 'Bone Throne'], endless: true },
      resources: ['moon_dust', 'rune'], props: ['tombstone', 'grave_mound', 'tree_crypt', 'rock_crypt'],
      hazards: ['gloom'], requires: { postgame: true }, lockReason: 'The crypt seal holds fast until the Moonwell shines again.'
    },
    sky: {
      name: 'Starfall Island', short: 'Starfall', level: 7, recommended: 9, mob: 'spirit', optional: true, hidden: true,
      desc: 'Postgame: a drifting island where fallen stars sleep. Needs a level 2 broom.',
      roster: [['frost_spirit', 2], ['marsh_wisp', 2]], boss: null, dungeon: null,
      resources: ['moon_dust', 'starmint'], props: [], hazards: [], requires: { postgame: true, broom: 2 },
      lockReason: 'Starfall Island only drifts close once the Moonwell is whole (and needs a level 2 broom).'
    }
  };
  D.regionOrder = ['grove', 'village', 'forest', 'swamp', 'mountain', 'crypt', 'sky'];

  // Default interaction points (WORLD may override positions via MM.world.layout()).
  D.interactions = {
    grove: [
      { id: 'moonwell', x: 12.6, y: 4.4, r: 1.6, prompt: 'Visit the Moonwell' },
      { id: 'seed_barrel', x: 6.3, y: 12.7, r: 1.1, prompt: 'Check the seed barrel' },
      { id: 'cauldron', x: 11.3, y: 12.3, r: 1.1, prompt: 'Brew at the cauldron' },
      { id: 'travel_board', x: 9.7, y: 15.6, r: 1.2, prompt: 'Travel' }
    ],
    village: [
      { id: 'marrow', x: 7.0, y: 8.2, r: 1.2, prompt: 'Talk to Elder Marrow' },
      { id: 'pip', x: 12.6, y: 8.4, r: 1.2, prompt: 'Talk to Pip' },
      { id: 'wren', x: 8.2, y: 12.8, r: 1.2, prompt: 'Talk to Wren' },
      { id: 'notice_board', x: 10.2, y: 6.4, r: 1.1, prompt: 'Read the notice board' },
      { id: 'cauldron', x: 6.6, y: 12.0, r: 1.0, prompt: "Use Wren's brewing table" },
      { id: 'travel_board', x: 11.6, y: 13.4, r: 1.2, prompt: 'Travel' }
    ],
    dungeon: { x: 15.6, y: 15.4, r: 1.3, prompt: 'Enter the dungeon' }   // outside in forest/swamp/mountain/crypt
  };
  D.home = { x: 9.7, y: 10 };

  // ------------------------------------------------------------------ chapters
  D.chapters = [
    { id: 0, key: 'arrival', name: 'Arrival', desc: 'Wake the old garden and find your feet at the homestead.' },
    { id: 1, key: 'forest', name: 'The Blighted Forest', desc: 'Pull the first piece of the moon from the Bramble Warden\'s roots.', region: 'forest' },
    { id: 2, key: 'swamp', name: 'The Whispering Swamp', desc: 'Tune your broom, cross the drowned paths and quiet the Mire Heart.', region: 'swamp' },
    { id: 3, key: 'mountain', name: 'Frostpeak', desc: 'Climb into the cold and free the last fragment from the Frost Wyrm Husk.', region: 'mountain' },
    { id: 4, key: 'moonwell', name: 'The Moonwell', desc: 'All three fragments are home. Something hollow waits in the water.' },
    { id: 5, key: 'postgame', name: 'Moonlit Days', desc: 'The Moonwell shines. Tend the grove, help your neighbours, explore the Old Crypt.' }
  ];
  D.fragments = {
    forest: { item: 'fragment_1', name: 'Lunar Fragment I', boss: 'bramble_warden', numeral: 'I' },
    swamp: { item: 'fragment_2', name: 'Lunar Fragment II', boss: 'mire_heart', numeral: 'II' },
    mountain: { item: 'fragment_3', name: 'Lunar Fragment III', boss: 'frost_wyrm', numeral: 'III' }
  };

  // Objective texts. {n},{need},{floor},{region},{boss},{fragment},{cost} are filled in by the system.
  D.objectives = {
    tut_plant: { title: 'Plant a seed in the garden', why: "Grandmother always said the Moonwell's light starts with living things. Every witch begins with a garden.", hint: 'Walk to one of the six garden plots and press E (or click it).' },
    tut_water: { title: 'Water your seedling', why: 'Seeds only grow while their soil is damp — rain does it for free, but today it\'s up to you.', hint: 'Stand by the planted plot and press E again.' },
    tut_harvest: { title: 'Harvest your first crop', why: 'Fresh crops become potions, gifts and coin. This first one goes straight into the cauldron.', hint: 'Crops grow while watered (about twenty seconds for wheat). Press E on the plot when it sparkles.' },
    tut_brew: { title: 'Brew a Healing Draught', why: 'A witch never leaves home without a potion. Two wheat makes one draught.', hint: 'Open Crafting (or use the cauldron by the garden) and brew a Healing Draught.' },
    tut_request: { title: 'Visit the village and accept a request', why: 'The neighbours have been waiting for the keeper\'s granddaughter. Helping them is how the grove learns to trust you again.', hint: 'Travel to Hollowbrook Village and talk to Wren, the herbalist.' },
    goto_region: { title: 'Travel to {region}', why: '{why}', hint: 'Use the travel board (or the Map) to fly there.' },
    need_broom: { title: 'Upgrade your broom to level {need}', why: '{why}', hint: 'Pip can tune your broom: {cost}. Sell crops and loot for coin.' },
    enter_dungeon: { title: 'Enter {dungeon}', why: 'The fragment\'s glow is coming from underground.', hint: 'Find the dungeon entrance in {region} and step inside.' },
    descend: { title: 'Descend: floor {floor} of 3', why: 'The guardian is waiting at the bottom. Clear each floor to open the way down.', hint: '{left} enemies remain on this floor.' },
    descend_go: { title: 'Take the stairs down', why: 'The floor is quiet. The fragment is close now.', hint: 'Use "Next floor" to go deeper.' },
    boss: { title: 'Defeat {boss}', why: 'It is holding a piece of the moon. Watch the ground — every big attack is shown before it lands.', hint: 'Step out of glowing danger zones, then strike while it recovers.' },
    place_fragment: { title: 'Bring {fragment} home to the Moonwell', why: 'Each fragment set back in the Moonwell wakes a little more of the land.', hint: 'Travel to the homestead and walk up to the Moonwell.' },
    final: { title: 'Face what waits in the Moonwell', why: 'All three fragments are home, but the Moonwell is still hollow. Something is drinking the light.', hint: 'Go to the Moonwell at the homestead. Bring potions.' },
    final_fight: { title: 'Restore the Moonwell', why: 'The Hollow Moon is made of the light it stole. Break it, then pour your magic back into the well.', hint: 'Stand in the light when the darkness pulses. In the last phase, cast at the Moonwell itself.' },
    postgame: { title: 'Moonlit days', why: 'The grove is whole. There is always another seed to plant and a neighbour to help.', hint: 'Finish requests, upgrade the homestead, or brave the Old Crypt.' }
  };

  // ------------------------------------------------------------------ tutorial
  D.tutorial = [
    { id: 'plant', objective: 'tut_plant', toast: 'The first seed is in. Grandmother would be proud.' },
    { id: 'water', objective: 'tut_water', toast: 'Damp soil, happy roots.' },
    { id: 'harvest', objective: 'tut_harvest', toast: 'Your first harvest! It smells like summer.' },
    { id: 'brew', objective: 'tut_brew', toast: 'Bubbles, steam, and a Healing Draught. The village lane is open.' },
    { id: 'request', objective: 'tut_request', toast: 'A neighbour trusts you. The grove feels a little warmer.' }
  ];

  // ------------------------------------------------------------------ crops (added to baseline SEED_TYPES)
  D.crops = {
    wheat: { name: 'Wheat', seedPrice: 6, sell: 6, uses: 'Healing Draught, Mana Tonic, Growth Tonic, requests' },
    ember: { name: 'Ember pepper', seedPrice: 9, sell: 9, uses: 'Ember Bomb, Hearthfire Salve' },
    frost: { name: 'Frost berry', seedPrice: 10, sell: 10, uses: 'Mire Ward Balm, requests' },
    moon: { name: 'Moonflower', seedPrice: 12, sell: 12, uses: 'Mana Tonic, Night-vision Draught, Starlight Elixir' },
    glowcap: {
      name: 'Glowcap', color: '#8ff0d0', season: 'Autumn', time: 34, seedPrice: 14, sell: 14, rainBonus: 1.3, nightBonus: 1.2,
      desc: 'A soft blue swamp mushroom. Grows faster in rain and at night.', uses: 'Growth Tonic, Greater Healing, Mire Ward Balm'
    },
    starmint: {
      name: 'Starmint', color: '#d8f0ff', season: 'Spring', time: 36, seedPrice: 16, sell: 17, nightBonus: 1.6, dayPenalty: 0.6,
      desc: 'A night herb with silver leaves. Grows quickly under the moon, sulks by day.', uses: 'Night-vision Draught, Starlight Elixir'
    }
  };
  D.cropUnlock = { wheat: 0, ember: 0, frost: 0, moon: 0, glowcap: 'flag:glowcap_seeds', starmint: 'flag:starmint_seeds' };

  // ------------------------------------------------------------------ items
  // store: 'harvest' → world.harvest[crop], 'seed' → world.seeds[crop], 'world:<field>' → world[field], 'items' → campaign.state.items
  const I = (name, kind, store, sell, desc, extra) => Object.assign({ name, kind, store, sell, desc }, extra || {});
  D.items = {
    wheat: I('Wheat', 'crop', 'harvest', 6, 'Golden and dependable. The base of most remedies.', { icon: 'crop_wheat', color: '#dfc77c' }),
    ember: I('Ember Pepper', 'crop', 'harvest', 9, 'Warm to hold and very hot to eat. Fire magic loves it.', { icon: 'crop_ember', color: '#e17f56' }),
    frost: I('Frost Berry', 'crop', 'harvest', 10, 'Cold, tart and faintly glowing. Frost magic loves it.', { icon: 'crop_frost', color: '#a6d9ed' }),
    moon: I('Moonflower', 'crop', 'harvest', 12, 'Opens only after dusk. Moon magic loves it.', { icon: 'crop_moon', color: '#c6aedb' }),
    glowcap: I('Glowcap', 'crop', 'harvest', 14, 'A soft blue mushroom that hums when you shake it.', { icon: 'crop_glowcap', color: '#8ff0d0' }),
    starmint: I('Starmint', 'crop', 'harvest', 17, 'Silver leaves that smell like a clear night.', { icon: 'crop_starmint', color: '#d8f0ff' }),
    seed_wheat: I('Wheat Seeds', 'seed', 'seed:wheat', 1, 'Grows in about 20 seconds. Loves summer.', { icon: 'seed_wheat', crop: 'wheat' }),
    seed_ember: I('Ember Pepper Seeds', 'seed', 'seed:ember', 2, 'Grows in about 22 seconds. Loves summer.', { icon: 'seed_ember', crop: 'ember' }),
    seed_frost: I('Frost Berry Seeds', 'seed', 'seed:frost', 2, 'Grows in about 24 seconds. Loves winter.', { icon: 'seed_frost', crop: 'frost' }),
    seed_moon: I('Moonflower Seeds', 'seed', 'seed:moon', 3, 'Grows in about 24 seconds. Loves autumn.', { icon: 'seed_moon', crop: 'moon' }),
    seed_glowcap: I('Glowcap Spores', 'seed', 'seed:glowcap', 3, 'Grows best in rain and darkness. Loves autumn.', { icon: 'seed_glowcap', crop: 'glowcap' }),
    seed_starmint: I('Starmint Seeds', 'seed', 'seed:starmint', 4, 'Grows quickly at night, slowly by day. Loves spring.', { icon: 'seed_starmint', crop: 'starmint' }),
    potion: I('Healing Draught', 'potion', 'world:potions', 8, 'Restores 40 health and 25 mana. Press H to drink.', { icon: 'potion_heal', usable: true }),
    greater_potion: I('Greater Healing', 'potion', 'items', 14, 'Restores 80 health. Glowcap makes it thick and sweet.', { icon: 'potion_greater', usable: true }),
    mana_tonic: I('Mana Tonic', 'potion', 'items', 10, 'Restores 60 mana. Tastes faintly of moonflower.', { icon: 'potion_mana', usable: true }),
    nightvision: I('Night-vision Draught', 'potion', 'items', 14, 'For 90 s: +25% Moonbolt damage at night and darkness pulses hurt half as much.', { icon: 'potion_night', usable: true }),
    growth_tonic: I('Growth Tonic', 'potion', 'items', 12, 'Pour on the garden: every planted crop grows +50% at once and gets watered.', { icon: 'potion_growth', usable: true }),
    hearthfire: I('Hearthfire Salve', 'potion', 'items', 12, 'For 150 s: Frostpeak\'s cold can\'t reach you.', { icon: 'potion_hearth', usable: true }),
    mireward: I('Mire Ward Balm', 'potion', 'items', 12, 'For 150 s: bog mud can\'t slow you and poison pools hurt half as much.', { icon: 'potion_mire', usable: true }),
    starlight: I('Starlight Elixir', 'potion', 'items', 26, 'Fully restores health and mana and grants a 30-point ward.', { icon: 'potion_star', usable: true }),
    bomb: I('Ember Bomb', 'bomb', 'world:bombs', 7, 'Throw at the nearest enemy (48 fire damage, splash, burn). No mana needed.', { icon: 'bomb_ember', usable: true }),
    rune: I('Rune', 'rune', 'world:runes', 12, 'Empowers a farm ward or sockets into found gear (+4 power).', { icon: 'rune' }),
    blight_bark: I('Blight Bark', 'material', 'items', 8, 'Bark from blighted oaks. Pip wants it for broom bristle-binding.', { icon: 'mat_bark' }),
    bog_pearl: I('Bog Pearl', 'material', 'items', 12, 'A dim pearl from the swamp. Strong broom-glue, oddly.', { icon: 'mat_pearl' }),
    rime_shard: I('Rime Shard', 'material', 'items', 15, 'Ice that never melts. Used in fine wands.', { icon: 'mat_rime' }),
    moon_dust: I('Moon Dust', 'material', 'items', 20, 'Silver dust that falls from guardians and night creatures. Strengthens spells.', { icon: 'mat_moondust' }),
    fragment_1: I('Lunar Fragment I', 'fragment', 'items', 0, 'A piece of the moon from the Blighted Forest. It is warm, like a hand.', { icon: 'fragment_1', story: true }),
    fragment_2: I('Lunar Fragment II', 'fragment', 'items', 0, 'A piece of the moon from the Whispering Swamp. It hums a lullaby.', { icon: 'fragment_2', story: true }),
    fragment_3: I('Lunar Fragment III', 'fragment', 'items', 0, 'A piece of the moon from Frostpeak. Cold, bright, and very old.', { icon: 'fragment_3', story: true }),
    moon_charm: I("Grandmother's Moon Charm", 'key', 'items', 0, 'A small silver moon on a ribbon. It glows when the Moonwell is near.', { icon: 'charm_moon', story: true })
  };

  // ------------------------------------------------------------------ recipes (each uses crops)
  D.recipes = [
    { id: 'healing', name: 'Healing Draught', ingredients: { wheat: 2 }, makes: { potion: 1 }, icon: 'potion_heal', unlock: 'start', desc: 'Two wheat, simmered gently. Restores 40 health and 25 mana.' },
    { id: 'mana', name: 'Mana Tonic', ingredients: { moon: 1, wheat: 1 }, makes: { mana_tonic: 1 }, icon: 'potion_mana', unlock: 'request:wren_seeds', desc: 'Restores 60 mana. Taught by Wren.' },
    { id: 'bomb', name: 'Ember Bomb', ingredients: { ember: 1 }, makes: { bomb: 2 }, icon: 'bomb_ember', unlock: 'chapter:1', desc: 'One pepper, two bombs. Thrown at the nearest foe.' },
    { id: 'growth', name: 'Growth Tonic', ingredients: { glowcap: 1, wheat: 1 }, makes: { growth_tonic: 1 }, icon: 'potion_growth', unlock: 'request:wren_mushrooms', desc: 'Every planted crop grows +50% at once.' },
    { id: 'greater', name: 'Greater Healing', ingredients: { wheat: 2, glowcap: 1 }, makes: { greater_potion: 1 }, icon: 'potion_greater', unlock: 'request:wren_mushrooms', desc: 'Restores 80 health.' },
    { id: 'nightvision', name: 'Night-vision Draught', ingredients: { starmint: 1, moon: 1 }, makes: { nightvision: 1 }, icon: 'potion_night', unlock: 'request:marrow_lanterns', desc: 'See clearly in the dark: stronger Moonbolts at night, softer darkness pulses.' },
    { id: 'mireward', name: 'Mire Ward Balm', ingredients: { glowcap: 1, frost: 1 }, makes: { mireward: 1 }, icon: 'potion_mire', unlock: 'chapter:2', desc: 'Bog mud slides right off. Halves poison-pool damage.' },
    { id: 'hearthfire', name: 'Hearthfire Salve', ingredients: { ember: 2, wheat: 1 }, makes: { hearthfire: 2 }, icon: 'potion_hearth', unlock: 'chapter:3', desc: 'Rub on your hands and the mountain cold can\'t touch you.' },
    { id: 'starlight', name: 'Starlight Elixir', ingredients: { starmint: 1, moon: 1, glowcap: 1 }, makes: { starlight: 1 }, icon: 'potion_star', unlock: 'request:wren_starmint', desc: 'Full health and mana, plus a 30-point ward.' }
  ];

  // ------------------------------------------------------------------ shops
  // Seed packs give 3 seeds. Prices drop 25% after Pip's "Open for Business" request (flag pip_discount).
  D.shops = {
    pip: {
      name: "Pip's Peddler Stall", greeting: 'Seeds, salves and broom-tuning! Coin or crops, both welcome.',
      stock: [
        { id: 'seed_wheat', price: 6, qty: 3, kind: 'seed' },
        { id: 'seed_ember', price: 9, qty: 3, kind: 'seed' },
        { id: 'seed_frost', price: 10, qty: 3, kind: 'seed' },
        { id: 'seed_moon', price: 12, qty: 3, kind: 'seed' },
        { id: 'seed_glowcap', price: 15, qty: 3, kind: 'seed', unlock: 'flag:glowcap_seeds' },
        { id: 'seed_starmint', price: 18, qty: 3, kind: 'seed', unlock: 'flag:starmint_seeds' },
        { id: 'potion', price: 22, qty: 1, kind: 'supply' },
        { id: 'mana_tonic', price: 26, qty: 1, kind: 'supply', unlock: 'chapter:1' },
        { id: 'bomb', price: 14, qty: 1, kind: 'supply', unlock: 'chapter:1' },
        { id: 'hearthfire', price: 30, qty: 1, kind: 'supply', unlock: 'chapter:3' },
        { id: 'mireward', price: 30, qty: 1, kind: 'supply', unlock: 'chapter:2' },
        { id: 'rune', price: 30, qty: 1, kind: 'supply', unlock: 'chapter:1' },
        { id: 'equip:wand_rowan', kind: 'equipment' }, { id: 'equip:wand_starwood', kind: 'equipment' }, { id: 'equip:wand_moonsilver', kind: 'equipment' },
        { id: 'equip:robe_mossweave', kind: 'equipment' }, { id: 'equip:robe_barkweave', kind: 'equipment' }, { id: 'equip:robe_moonthread', kind: 'equipment' },
        { id: 'equip:charm_glow', kind: 'equipment' }, { id: 'equip:charm_star', kind: 'equipment' },
        { id: 'upgrade:broom', kind: 'upgrade' }
      ]
    },
    wren: {
      name: "Wren's Herb Garden", greeting: 'Everything here was grown with patience. Mind the nettles.',
      stock: [
        { id: 'seed_moon', price: 11, qty: 3, kind: 'seed' },
        { id: 'seed_glowcap', price: 14, qty: 3, kind: 'seed', unlock: 'flag:glowcap_seeds' },
        { id: 'seed_starmint', price: 17, qty: 3, kind: 'seed', unlock: 'flag:starmint_seeds' },
        { id: 'potion', price: 20, qty: 1, kind: 'supply' },
        { id: 'greater_potion', price: 36, qty: 1, kind: 'supply', unlock: 'request:wren_mushrooms' },
        { id: 'upgrade:homestead', kind: 'upgrade' }
      ]
    }
  };
  D.sellBonus = { pip: 1, wren: 1 };           // Wren also pays +20% for glowcap & starmint (see systems)
  D.dailySeeds = { base: { wheat: 3 }, extraPerHomestead: 1, note: 'The seed barrel refills every morning: 3 wheat seeds plus one more seed for each homestead level.' };

  // ------------------------------------------------------------------ equipment
  // wand: +damage %, robe: +max HP, charm: +mana per second. Tier 0 items are owned from the start.
  D.equipment = {
    slots: ['wand', 'robe', 'charm'],
    items: {
      wand_birch: { slot: 'wand', tier: 0, name: 'Birch Wand', bonus: 0, desc: "Grandmother's practice wand. Reliable, if a little bendy.", cost: { gold: 0 } },
      wand_rowan: { slot: 'wand', tier: 1, name: 'Rowan Wand', bonus: .10, desc: '+10% spell damage.', cost: { gold: 70 }, unlock: 'chapter:1' },
      wand_starwood: { slot: 'wand', tier: 2, name: 'Starwood Wand', bonus: .22, desc: '+22% spell damage.', cost: { gold: 150, items: { bog_pearl: 2 } }, unlock: 'chapter:2' },
      wand_moonsilver: { slot: 'wand', tier: 3, name: 'Moonsilver Wand', bonus: .36, desc: '+36% spell damage.', cost: { gold: 280, items: { rime_shard: 2, moon_dust: 1 } }, unlock: 'chapter:3' },
      robe_patched: { slot: 'robe', tier: 0, name: 'Patched Robe', bonus: 0, desc: 'Comfortable. Mostly patches now.', cost: { gold: 0 } },
      robe_mossweave: { slot: 'robe', tier: 1, name: 'Mossweave Robe', bonus: 20, desc: '+20 max health.', cost: { gold: 60 }, unlock: 'chapter:1' },
      robe_barkweave: { slot: 'robe', tier: 2, name: 'Barkweave Robe', bonus: 40, desc: '+40 max health.', cost: { gold: 130, items: { blight_bark: 3 } }, unlock: 'chapter:2' },
      robe_moonthread: { slot: 'robe', tier: 3, name: 'Moonthread Robe', bonus: 65, desc: '+65 max health.', cost: { gold: 240, items: { bog_pearl: 3 } }, unlock: 'chapter:3' },
      charm_silver_moon: { slot: 'charm', tier: 0, name: "Grandmother's Moon Charm", bonus: 1, desc: '+1 mana per second. It hums near moonlight.', cost: { gold: 0 } },
      charm_glow: { slot: 'charm', tier: 1, name: 'Glowcap Charm', bonus: 2.5, desc: '+2.5 mana per second.', cost: { gold: 90, items: { glowcap: 2 } }, unlock: 'chapter:2' },
      charm_star: { slot: 'charm', tier: 2, name: 'Starmint Charm', bonus: 4, desc: '+4 mana per second.', cost: { gold: 180, items: { starmint: 2, moon_dust: 1 } }, unlock: 'chapter:3' }
    }
  };

  // ------------------------------------------------------------------ upgrades
  D.upgrades = {
    broom: {
      name: 'Broom', desc: 'Faster flight and access to farther places.', max: 3,
      levels: [
        null,
        { cost: { gold: 60, items: { blight_bark: 2 } }, desc: 'Level 1 — skims water: opens the Whispering Swamp. +15% flight speed.' },
        { cost: { gold: 140, items: { bog_pearl: 3 } }, desc: 'Level 2 — climbs the high pass to Frostpeak early. +30% flight speed.' },
        { cost: { gold: 240, items: { rime_shard: 2, moon_dust: 2 } }, desc: 'Level 3 — Starlight bristles. +45% flight speed.' }
      ]
    },
    homestead: {
      name: 'Homestead', desc: 'Restore the cottage and garden. Each fragment set in the Moonwell also restores a level for free.', max: 4,
      levels: [
        null,
        { cost: { gold: 30, items: { wheat: 3 } }, name: 'Swept & Mended', desc: 'The seed barrel gives +1 seed each morning; resting at home restores health.' },
        { cost: { gold: 80, items: { blight_bark: 2, glowcap: 2 } }, name: 'Cold-frame Garden', desc: 'Glass cold-frames: crops grow 15% faster.' },
        { cost: { gold: 150, items: { bog_pearl: 2, starmint: 2 } }, name: 'Moon Garden', desc: 'Moonlit beds: +15% chance of a double harvest.' },
        { cost: { gold: 250, items: { rime_shard: 2, moon_dust: 3 } }, name: 'Moonlit Homestead', desc: 'A lunar ward ring: night raids are smaller and you gain +20 max health.' }
      ]
    },
    spells: {
      name: 'Spell mastery', desc: 'Each rank: +15% damage (Starfall also recharges 1.5 s faster).', max: 2,
      levels: [null, { cost: { gold: 45, items: { moon_dust: 1 } } }, { cost: { gold: 110, items: { moon_dust: 2 } } }]
    }
  };

  // ------------------------------------------------------------------ signature spells
  // Added to baseline SPELLS at indices 0..4 so keys 1-5 select them. `kind` reuses baseline effect renderers.
  D.spells = [
    { id: 'moonbolt', key: '1', name: 'Moonbolt', school: 'Moon', kind: 'star', color: '#bcd4ff', core: '#f4f8ff', damage: 30, hit: [.24], duration: .62,
      cooldown: 0, extraCost: 0, unlock: 'start', icon: 'spell_moonbolt',
      description: 'A quick crescent of moonlight. Cheap and fast; +20% at night.', mmNight: .2 },
    { id: 'emberbloom', key: '2', name: 'Ember Bloom', school: 'Fire', kind: 'fireball', color: '#f47c46', core: '#ffe3a1', damage: 44, hit: [.5], duration: 1.1, status: 'burn',
      cooldown: 2.5, extraCost: 2, unlock: 'chapter:1', icon: 'spell_emberbloom', mmBloom: { r: 1.6, dur: 3, every: .6, dmg: 4 },
      description: 'A seed of fire that bursts into a burning bloom, scorching everything nearby. Clears brambles.' },
    { id: 'thornbind', key: '3', name: 'Thornbind', school: 'Nature', kind: 'vines', color: '#71ad68', core: '#c7e990', damage: 22, hit: [.4], duration: 1.35, status: 'root',
      cooldown: 4, extraCost: 0, unlock: 'tutorial', icon: 'spell_thornbind', mmZone: { r: 1.5, dur: 4.5, every: .75, dmg: 4 },
      description: 'Roots erupt in a ring: enemies inside are held, pricked, and can\'t make melee attacks.' },
    { id: 'frostbell', key: '4', name: 'Frostbell', school: 'Frost', kind: 'nova', color: '#a9e4f5', core: '#f0ffff', damage: 34, hit: [.36], duration: 1.05, status: 'chill',
      cooldown: 3, extraCost: 1, unlock: 'fragment:swamp|chapter:3', icon: 'spell_frostbell', mmPulse: { r: 2.2, shatter: 30, splash: .35 },
      description: 'A ringing pulse that chills and slows all nearby foes. Shatters already-chilled or rooted targets for bonus damage.' },
    { id: 'starfall', key: '5', name: 'Starfall', school: 'Astral', kind: 'meteor', color: '#f5d58c', core: '#fff9db', damage: 92, hit: [1.05], duration: 1.6,
      cooldown: 9, extraCost: 12, unlock: 'fragment:forest', icon: 'spell_starfall', mmStrike: { r: 2.2, splash: .7 },
      description: 'Mark the ground, then a falling star lands a moment later. Huge damage in an area; long recharge.' }
  ];

  // ------------------------------------------------------------------ enemy archetypes
  // kind = baseline cast sprite. hp/dmg are at enemy level 1; scaled by region level & floor in systems.
  D.archetypes = {
    blightling: { kind: 'blight', name: 'Blightling', hp: 52, dmg: 5, rate: 1.7, speed: 1, drops: { blight_bark: .55 } },
    moss_slime: { kind: 'slime', tint: 'hue-rotate(35deg) saturate(1.2)', name: 'Moss Slime', hp: 44, dmg: 4, rate: 1.5, speed: .8, drops: { blight_bark: .25, glowcap: .1 } },
    thorn_sprout: { kind: 'blight', name: 'Thorn Sprout', hp: 34, dmg: 3, rate: 1.2, speed: 0, anchored: true, small: true, drops: {} },
    bog_ghost: { kind: 'ghost', name: 'Bog Ghost', hp: 62, dmg: 6, rate: 1.7, speed: 1.15, drops: { bog_pearl: .45 } },
    mire_slime: { kind: 'slime', tint: 'hue-rotate(110deg) saturate(.8) brightness(.9)', name: 'Mire Slime', hp: 72, dmg: 5, rate: 1.6, speed: .8, slowOnHit: .55, drops: { bog_pearl: .3, glowcap: .15 } },
    marsh_wisp: { kind: 'wisp', tint: 'hue-rotate(70deg)', name: 'Marsh Wisp', hp: 40, dmg: 6, rate: 1.3, speed: 1.4, drops: { moon_dust: .08 } },
    mire_wisp: { kind: 'wisp', tint: 'hue-rotate(110deg) saturate(1.3)', name: 'Mire Wisp', hp: 70, dmg: 6, rate: 1.2, speed: 1.3, drops: {} },
    rime_imp: { kind: 'ice', name: 'Rime Imp', hp: 80, dmg: 7, rate: 1.6, speed: 1, slowOnHit: .65, drops: { rime_shard: .4 } },
    stone_golem: { kind: 'golem', tint: 'saturate(.4) brightness(1.15)', name: 'Frost-bitten Golem', hp: 150, dmg: 11, rate: 2.3, speed: .6, drops: { rime_shard: .6 } },
    frost_spirit: { kind: 'spirit', name: 'Frost Spirit', hp: 70, dmg: 8, rate: 1.5, speed: 1.25, drops: { moon_dust: .1, rime_shard: .2 } },
    crypt_skeleton: { kind: 'skeleton', name: 'Crypt Skeleton', hp: 120, dmg: 10, rate: 1.6, speed: 1, drops: { moon_dust: .15 } },
    crypt_ghost: { kind: 'ghost', tint: 'grayscale(.6) brightness(.85)', name: 'Crypt Shade', hp: 100, dmg: 9, rate: 1.5, speed: 1.2, drops: { moon_dust: .15 } },
    shard_wisp: { kind: 'wisp', tint: 'grayscale(.5) brightness(1.2)', name: 'Moon Shard', hp: 60, dmg: 7, rate: 1.2, speed: 1.2, drops: {} }
  };
  D.scaling = { hpPerLevel: .16, dmgPerLevel: .14, hpPerFloor: .12, postgame: 1.35, restoredDmg: .6, restoredCount: 2, nightDust: .06 };

  // ------------------------------------------------------------------ bosses (tuning; behaviour in src/entities/bosses.js)
  D.bosses = {
    bramble_warden: {
      name: 'The Bramble Warden', epithet: 'Blight-bound heart of the forest', region: 'forest', hp: 1300, kind: 'blight', tint: 'hue-rotate(-25deg) saturate(1.3) brightness(.9)',
      cine: 'boss_forest_intro', reward: { gold: 60, items: { blight_bark: 3, moon_dust: 2 } },
      phases: [{ at: 1, name: 'Rooted' }, { at: .4, name: 'Enraged' }],
      attacks: { slam: { windup: 1.1, dmg: 16 }, sprouts: { windup: .9, count: 3 }, contact: { dmg: 7, rate: 1.5 } }
    },
    mire_heart: {
      name: 'The Mire Heart', epithet: 'Drowned voice of the Whispering Swamp', region: 'swamp', hp: 1650, kind: 'slime', tint: 'hue-rotate(80deg) saturate(1.4) brightness(.85)',
      cine: 'boss_swamp_intro', reward: { gold: 90, items: { bog_pearl: 3, moon_dust: 2 } },
      phases: [{ at: 1, name: 'Bubbling' }, { at: .5, name: 'Split' }, { at: .25, name: 'Resurfaced' }],
      attacks: { pools: { windup: 1.0, dmg: 4, dur: 6 }, hands: { windup: .95, dmg: 14 }, contact: { dmg: 8, rate: 1.5 } }
    },
    frost_wyrm: {
      name: 'The Frost Wyrm Husk', epithet: 'Frozen sentinel of Frostpeak', region: 'mountain', hp: 2100, kind: 'ice', tint: 'saturate(.6) brightness(1.15)',
      cine: 'boss_frost_intro', reward: { gold: 120, items: { rime_shard: 3, moon_dust: 3 } },
      phases: [{ at: 1, name: 'Frozen' }, { at: .5, name: 'Cracked' }],
      attacks: { lances: { windup: 1.0, dmg: 18 }, blizzard: { windup: 1.2, dmg: 3, dur: 5 }, charge: { windup: 1.1, dmg: 20, exposed: 2.6 }, contact: { dmg: 9, rate: 1.5 } },
      weakness: { Fire: .25 }
    },
    hollow_moon: {
      name: 'The Hollow Moon', epithet: 'The light that forgot its way home', region: 'grove', hp: 2400, kind: 'spirit', tint: 'grayscale(.6) brightness(.7) contrast(1.2)',
      cine: null, reward: { gold: 150, items: { moon_dust: 5 } },
      phases: [{ at: 1, name: 'Shards' }, { at: .66, name: 'Darkness' }, { at: .33, name: 'Collapse' }],
      attacks: { orbs: { windup: 1.0, dmg: 12 }, pulse: { windup: 1.6, dmg: 22 }, collapse: { windup: 1.1, dmg: 14 }, contact: { dmg: 8, rate: 1.6 } },
      well: { hp: 520 }
    }
  };

  // ------------------------------------------------------------------ hazards
  D.hazards = {
    brambles: { name: 'Thorn brambles', slow: .7, dmg: 2, every: 1, burnable: true, color: '#5a4a3a', hint: 'Brambles slow and scratch. Ember Bloom burns them away.' },
    bog: { name: 'Sucking bog', slow: .55, dmg: 0, every: 1, wardItem: 'mireward', color: '#3f5a4c', hint: 'Bog mud slows you down. A Mire Ward Balm keeps your boots clean.' },
    frost: { name: 'Biting cold', chillRate: 7, chillNight: 1.8, slowAtFull: .75, dmg: 3, every: 2, wardItem: 'hearthfire', warmR: 1.8, color: '#cfe8f5', hint: 'The cold builds up. Stand by a brazier or use Hearthfire Salve.' },
    gloom: { name: 'Crypt gloom', manaMul: .5, wardItem: 'nightvision', hint: 'The gloom drinks your mana. Night-vision Draught clears it.' }
  };
  // Hazard placements per region (outside & dungeon). Kept clear of the spawn point (9.7,10) and the central cross.
  D.hazardSpots = {
    forest: [[4, 5, 1.3], [14.5, 5.5, 1.2], [5, 15, 1.4], [15, 14.5, 1.2], [3.5, 10.5, 1]],
    swamp: [[5, 5, 1.6], [14, 4.5, 1.4], [4.5, 14.5, 1.5], [14.8, 15.2, 1.5], [12.8, 12.6, 1.1], [6.5, 9, 1]],
    mountain: { warm: [[6, 6], [14, 14]] }
  };

  // ------------------------------------------------------------------ villagers
  D.npcs = {
    marrow: { name: 'Elder Marrow', title: 'Keeper of old stories', portrait: 'portrait_marrow', likes: 'moonflower', home: 'village' },
    pip: { name: 'Pip', title: 'Fletcher & peddler', portrait: 'portrait_pip', likes: 'ember', home: 'village' },
    wren: { name: 'Wren', title: 'Herbalist', portrait: 'portrait_wren', likes: 'glowcap', home: 'village' }
  };

  // ------------------------------------------------------------------ requests
  // type: deliver {items} (consumed on turn-in) | harvest {crop|'any', n} | kill {region|'any', n} | sell {n} | boss {id}
  // offer: when it becomes available. reward: {gold, xp, recipe, flag, relation, items, spell, text}
  D.requests = [
    { id: 'wren_seeds', giver: 'wren', title: 'Seeds of Kindness', tutorial: true,
      desc: 'Wren\'s herb beds failed when the Moonwell dimmed. Two sheaves of wheat would let her start a sourdough for the sick.',
      type: 'deliver', items: { wheat: 2 }, offer: 'tutorial:request',
      reward: { gold: 15, xp: 25, recipe: 'mana', relation: 1, text: 'Mana Tonic recipe, 15 gold' } },
    { id: 'marrow_path', giver: 'marrow', title: 'The Forest Path', desc: 'Marrow wants the old forest path safe for the woodcutters again. Thin out the blight.',
      type: 'kill', region: 'forest', n: 5, offer: 'chapter:1',
      reward: { gold: 35, xp: 40, relation: 1, items: { potion: 2 }, text: '2 Healing Draughts, 35 gold' } },
    { id: 'pip_business', giver: 'pip', title: 'Open for Business', desc: 'Pip\'s stall has been empty for weeks. Sell any five crops to get the coins moving again.',
      type: 'sell', n: 5, offer: 'chapter:1',
      reward: { gold: 20, xp: 30, flag: 'pip_discount', relation: 1, text: 'All seeds 25% cheaper, 20 gold' } },
    { id: 'pip_peppers', giver: 'pip', title: 'Peppers, Please', desc: 'Pip is fletching fire-arrows for the night watch and needs ember peppers for the tips.',
      type: 'deliver', items: { ember: 3 }, offer: 'chapter:1',
      reward: { gold: 30, xp: 30, flag: 'broom_discount', relation: 1, text: 'Broom upgrades 20% cheaper, 30 gold' } },
    { id: 'wren_mushrooms', giver: 'wren', title: 'Mushroom Lore', desc: 'Wren found glowcap spores in her grandmother\'s tin. Grow two and she\'ll share what they\'re good for.',
      type: 'harvest', crop: 'glowcap', n: 2, offer: 'chapter:1', onAccept: { flag: 'glowcap_seeds', items: { seed_glowcap: 3 } },
      reward: { gold: 25, xp: 40, recipe: ['growth', 'greater'], relation: 1, text: 'Growth Tonic & Greater Healing recipes' } },
    { id: 'marrow_lanterns', giver: 'marrow', title: 'Lanterns in the Dark', desc: 'The village lanterns keep guttering out. Blight bark burns slow and steady — Marrow needs three.',
      type: 'deliver', items: { blight_bark: 3 }, offer: 'chapter:2', onAccept: { flag: 'starmint_seeds', items: { seed_starmint: 2 } },
      reward: { gold: 40, xp: 45, recipe: 'nightvision', relation: 1, text: 'Night-vision Draught recipe, 40 gold' } },
    { id: 'wren_swamp', giver: 'wren', title: 'Whispers in the Reeds', desc: 'The swamp ghosts are frightening the herons. Calm six of them so Wren can gather reeds.',
      type: 'kill', region: 'swamp', n: 6, offer: 'chapter:2',
      reward: { gold: 50, xp: 55, relation: 1, items: { mireward: 2, bog_pearl: 1 }, text: '2 Mire Ward Balms, a bog pearl, 50 gold' } },
    { id: 'marrow_warmth', giver: 'marrow', title: 'Warmth for the Peaks', desc: 'Marrow remembers the old climbers\' trick: peppers and starmint tucked in your mittens.',
      type: 'deliver', items: { ember: 2, starmint: 1 }, offer: 'chapter:3',
      reward: { gold: 60, xp: 60, items: { hearthfire: 2 }, relation: 1, text: '2 Hearthfire Salves, 60 gold' } },
    { id: 'pip_wyrm', giver: 'pip', title: 'A Wyrm\'s Tooth', desc: 'Pip wants a proper keepsake from Frostpeak. Clear six of its creatures and bring back their shards.',
      type: 'kill', region: 'mountain', n: 6, offer: 'chapter:3',
      reward: { gold: 80, xp: 70, relation: 1, items: { rime_shard: 2, moon_dust: 1 }, text: '2 rime shards, moon dust, 80 gold' } },
    { id: 'wren_starmint', giver: 'wren', title: 'A Starlit Garden', desc: 'Wren dreams of a starmint bed under her window. Grow three and she\'ll teach you her best recipe.',
      type: 'harvest', crop: 'starmint', n: 3, offer: 'request:marrow_lanterns',
      reward: { gold: 45, xp: 60, recipe: 'starlight', relation: 1, text: 'Starlight Elixir recipe' } },
    { id: 'marrow_festival', giver: 'marrow', title: 'The Moon Festival', desc: 'Postgame: the village wants a proper Moon Festival. Bring flowers, bread and something sparkly.',
      type: 'deliver', items: { moon: 3, wheat: 3, starmint: 1 }, offer: 'chapter:5',
      reward: { gold: 120, xp: 80, relation: 1, items: { moon_dust: 3 }, text: 'Festival gifts, 120 gold' } }
  ];

  // ------------------------------------------------------------------ dialogue
  // Pages are chosen by the system from chapter/progress; {name} = player name.
  D.dialogue = {
    marrow: {
      first: ["Well now. You've got her eyes, {name} — your grandmother's. I'm Marrow. I sat by that Moonwell with her more evenings than I can count.",
        'When the light broke, it scattered like dandelion fluff. One piece fell in the forest, one in the swamp, one up on Frostpeak. I could feel each one go.'],
      ch0: ['Settle in first. A witch who can\'t grow a turnip can\'t mend a moon, your grandmother used to say. She was usually right.'],
      ch1: ['The Blighted Forest is drinking that first fragment. You can see it in the bark — gone black from the roots up.',
        'Go down through the Rootways. Whatever\'s holding the light will be at the bottom. Mind your footing — big things always wind up before they swing.'],
      ch2: ['One piece home, and already the grove smells green again. Bless you.',
        'The second fell in the Whispering Swamp. The paths are drowned — you\'ll want Pip to tune that broom of yours.'],
      ch3: ['Two pieces! I heard the Moonwell hum last night. First time in a year.',
        'The last is up on Frostpeak. It\'s cold enough to stop your heart up there. Peppers in your mittens — that\'s the old climbers\' trick.'],
      ch4: ['All three are home… and still the well is dark. I\'m afraid something has been living in the light, {name}.',
        'Whatever it is, it\'s waiting at the Moonwell. Take every potion you own. And take her charm — it\'s brave even when we aren\'t.'],
      ch5: ['Look at it shine. She\'d have cried, you know. Then pretended she hadn\'t.', 'The grove is yours to keep now. Come sit with an old man sometimes.'],
      lore: ['The Moonwell isn\'t really a well. It\'s more like a promise — the moon looks after the grove, and the keeper looks after the moon.',
        'Your grandmother kept it fifty years. She said it only ever asked one thing: that someone remember to come home.']
    },
    pip: {
      first: ['A customer! A real live witch-customer! Pip — fletcher, peddler, part-time broom mechanic. Mostly peddler lately.',
        'Bring me crops and I\'ll pay fair. Bring me bark and pearls and I\'ll make that broom of yours sing.'],
      ch0: ['Go on, grow something! I\'ll buy it. I\'ll buy almost anything.'],
      ch1: ['Blight bark from the forest — that\'s good bristle-binding. Two pieces and some coin, and your broom skims water like a heron.'],
      ch2: ['Swamp folk say the pearls down there glow when you\'re sad. I say they make excellent broom glue.'],
      ch3: ['Frostpeak! Bring me a rime shard and I\'ll make you a wand that sings in the cold.'],
      ch4: ['I\'m not scared. I\'m just… standing behind the stall. For balance.'],
      ch5: ['Business is booming! Everyone wants moonlit seeds now. You\'re good for trade, witch.'],
      lore: ['My da said the moon used to bounce off the Moonwell and land in everyone\'s soup. Probably made that up. Probably.']
    },
    wren: {
      first: ['Oh — hello. Sorry, I was talking to the mint. I\'m Wren. I grow things, mostly, and mend people when I can.',
        'The herbs have been sulking since the light went. If you\'ve got a little wheat to spare, I could start a proper bread for the sick folk.'],
      ch0: ['Two wheat is all I need. Grow, harvest, bring it by — no rush. Plants don\'t like being rushed either.'],
      ch1: ['If you find glowcap spores in the forest, grow them. They\'re good for nearly everything.'],
      ch2: ['Bog mud gets everywhere. Glowcap and frost berry make a balm that keeps your boots clean.'],
      ch3: ['Starmint grows best when no one\'s watching. Plant it at dusk and leave it be.'],
      ch4: ['I\'ve packed you a satchel. Remedies, mostly. And a biscuit. Come back, all right?'],
      ch5: ['The herb beds are singing again. I swear they are. Listen.'],
      lore: ['Every plant in the grove leans toward the Moonwell, even at noon. They remember where the light comes from.']
    },
    board: ['HOLLOWBROOK NOTICES', 'Lost: one goat, answers to "Biscuit". — Wanted: anyone brave. Ask Elder Marrow. — Pip\'s stall OPEN (mostly).'],
    moonwell: {
      dark: 'The Moonwell is still and grey. Three little hollows in the stone rim are waiting for something.',
      placed: 'The fragment slides into its hollow with a soft chime. Silver light spills over the rim.',
      waiting: '{n} of 3 fragments rest in the Moonwell. Its water glows a little brighter each time.',
      ready: 'All three hollows glow. But deep in the water, something dark is moving.',
      done: 'The Moonwell shines, steady and kind. You can almost hear Grandmother humming.'
    }
  };

  // ------------------------------------------------------------------ defeat / recovery
  D.defeat = {
    title: 'Moonlit Recovery', goldPct: .15, goldMax: 25,
    text: "Grandmother's charm glowed and carried you home. You rest by the cottage door until your strength returns.",
    penaltyText: 'You dropped {gold} gold on the way home. Everything else — items, fragments, progress — is safe.',
    tips: ['Big attacks always glow on the ground first — step out of the light shape.', 'Potions (H) heal 40 health. Brew them from two wheat.', 'Thornbind stops enemies from making melee attacks while they stand in the roots.', 'A better robe from Pip adds max health.']
  };

  // ------------------------------------------------------------------ ending
  D.ending = {
    title: 'The Moonwell Shines', text: 'The grove is whole again. Free play continues: tend your garden, finish requests, upgrade the homestead, or explore the Old Crypt.',
    unlocks: ['Old Crypt (endless dungeon)', 'Rifts', 'All baseline spells in the spellbook', 'Moon Festival request']
  };

  D.toasts = {
    fragment: '{fragment} is yours! Bring it home to the Moonwell.',
    restored: '{region} is restored. The land breathes easier.',
    chapter: 'Chapter {n}: {name}',
    spell: 'New spell: {spell}!', recipe: 'New recipe: {recipe}', seedBarrel: 'The seed barrel had {text} for you this morning.'
  };

  MM.CAMPAIGN_DATA = D;
})(window.MM);
