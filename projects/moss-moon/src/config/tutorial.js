'use strict';
// Moss & Moon — tutorial data (owner: TUTORIAL). Pure data, loaded right after baseline.js (see tools/build.js PLANNED).
// The only load-time side effect: it registers the sandbox region id 'tutorial' in the baseline REGIONS table (so
// drawGround()/sanitizeWorld() know it). Visuals: MM.REGION_VISUALS.tutorial (regions-visual.js); the practice hut:
// MM.BUILDINGS.placements.tutorial ('practice_hut', type 'tutorial_hut', interior 'tutorial_hut', persist:false).
// Behaviour: src/screens/tutorial.js. Docs: notes/TUTORIAL.md.
window.MM = window.MM || {};
(function (MM) {
  try { if (typeof REGIONS === 'object' && !REGIONS.tutorial) REGIONS.tutorial = { name: 'Practice Yard', tint: null, mob: 'slime', level: 1 }; } catch (e) { /* baseline missing */ } // eslint-disable-line no-undef

  // Lesson text uses {glyph:action} tokens, replaced with MM.input.glyph(action) for the current input method.
  // check: how the step completes (see tutorial.js CHECKS); target: what gets the highlight ring/arrow.
  // ui: data-attribute/class of a touch button to glow (touch method only).
  const steps = [
    { id: 'move', title: 'Find your feet', text: 'Walk a few steps around the yard.', hint: '{move} to walk' + ' · or {click} the ground', target: 'ring', ui: null, distance: 1.5 },
    { id: 'sign', title: 'Read the sign', text: 'Walk up to the signpost and read it.', hint: '{interact} near the sign', target: 'sign' },
    { id: 'enter', title: 'Visit the hut', text: 'Walk through the door of the practice hut.', hint: 'Walk into the door, or {interact} beside it', target: 'door' },
    { id: 'exit', title: 'Step back outside', text: 'Leave the hut through the doorway.', hint: 'Walk out of the open doorway', target: null },
    { id: 'plant', title: 'Plant a seed', text: 'Stand by the garden plot and plant a wheat seed.', hint: '{tend} next to the plot', target: 'plot', ui: 'interact' },
    { id: 'water', title: 'Water it', text: 'Give the seedling a drink.', hint: '{tend} next to the plot again', target: 'plot', ui: 'interact' },
    { id: 'harvest', title: 'Moon-quick harvest', text: 'Practice magic: the yard\'s moonlight makes your wheat ripen at once. Harvest it!', hint: '{tend} when the wheat is golden', target: 'plot', ui: 'interact', magic: true },
    { id: 'cast', title: 'Cast a spell', text: 'Get close to the practice dummy and cast a spell at it.', hint: '{cast} to cast', target: 'dummy', ui: 'cast' },
    { id: 'potion', title: 'Drink a potion', text: 'Practice is tiring. Drink the healing draught in your bag.', hint: '{potion} to drink', target: 'player', ui: 'potion' },
    { id: 'menu', title: 'Check your bag', text: 'Open the pause menu, look inside your Inventory, then return to the yard.', hint: '{pause} → Inventory ({inventory}) → close', target: null, ui: 'pause' },
    { id: 'broom', title: 'Take the broom', text: 'Hop on your broom, then land again.', hint: '{broom} to mount · {broom} again to land', target: 'player', ui: 'broom' },
  ];

  MM.TUTORIAL = {
    region: 'tutorial',
    spawn: { x: 9.7, y: 10, facing: 'S' },
    plot: { x: 8.2, y: 11.3 },
    dummy: { x: 12.6, y: 10.9 },       // the baseline dummy is moved here while the sandbox lives (restored after)
    sign: { x: 11.2, y: 9.0, id: 'tutorial_sign' },
    hut: 'practice_hut',
    give: { seeds: { wheat: 3 }, seed: 'wheat', potions: 1 },
    hpFrac: 0.55,                      // the potion lesson lowers HP to this fraction (no damage is ever dealt)
    signText: 'Practice Yard. Walk, read, visit the hut, grow a little wheat, try a spell on the dummy. Nothing here can hurt you.',
    steps,
    done: { title: 'Ready for the moonlit road', text: 'You walked, read, visited, grew, cast, drank and flew. Your real journey begins now.' },
  };
})(window.MM);
