'use strict';
// Moss & Moon — cinematic scene manifest (data only; the player lives in src/systems/cinematics.js).
// Schema (see notes/CINEMATICS.md):
//   id, title, trigger            — what gameplay moment should call MM.cine.play(id)
//   playback 'video'|'engine'|'auto'
//                                 — 'auto': use a listed video file if one exists, else the engine scene
//   video {webm?, mp4?}           — paths under assets/video/. ONLY list files that really exist.
//   fallback                      — 'engine' (engine scene with the same id) or another scene id
//   subtitles [{t0,t1,text,speaker?}] — seconds from scene start; rendered as DOM text
//   duration                      — seconds (engine scenes run exactly this long)
//   music                         — MM.audio track id started at t=0 (cine_intro|cine_sorrow|cine_triumph|ending)
//   cues [{t, music?|sfx?}]       — optional timed audio cues (sfx: cine_whoosh|cine_sting|moonwell_pulse|boss_roar|region_restored)
//   replay {unlockMemory, allowed}— may appear in a "memories" replay menu once seen
//   rewardKey                     — id the CALLER uses to grant first-time rewards exactly once, watched or skipped.
//                                   The cinematic system never grants anything itself.
window.MM = window.MM || {};
(function (MM) {
  const S = (t0, t1, text, speaker) => speaker ? { t0, t1, text, speaker } : { t0, t1, text };
  const replay = { unlockMemory: true, allowed: true };
  MM.CINE_MANIFEST = {
    intro: {
      id: 'intro', title: 'The Moonwell Fades',
      trigger: 'New game started (before the player first gains control at the homestead).',
      playback: 'auto', video: {}, fallback: 'engine', duration: 42, music: 'cine_intro',
      cues: [
        { t: 8.6, sfx: 'moonwell_pulse' }, { t: 11.4, sfx: 'cine_sting' }, { t: 11.6, music: 'cine_sorrow' },
        { t: 11.8, sfx: 'cine_whoosh' }, { t: 24.2, sfx: 'cine_whoosh' }, { t: 25.0, music: 'cine_intro' }
      ],
      subtitles: [
        S(1.2, 4.6, 'Moonflower Grove has always slept beneath a kind moon.'),
        S(4.8, 8.4, 'Its light was kept by the Moonwell — and by the keeper who tended it.'),
        S(9.0, 11.3, 'Then, one quiet night, the Moonwell faltered.'),
        S(12.0, 15.0, 'Its light broke apart and scattered across the land.'),
        S(15.6, 19.2, 'Without it, the grove grew dim. Crops withered, and the paths ran wild.'),
        S(19.6, 23.4, 'Beyond the hills, the forest, the swamp and the high peaks turned strange and cold.'),
        S(24.0, 27.6, 'Until, at last, a young witch came home on her broom…'),
        S(28.0, 31.2, '…with a case of seeds, and her grandmother\'s little silver moon.'),
        S(31.8, 34.6, 'The old homestead was quiet and overgrown. But it was still home.'),
        S(34.8, 37.6, 'If the Moonwell can be woken, it will begin right here.')
      ],
      replay, rewardKey: 'cine.intro.seen'
    },
    first_restoration: {
      id: 'first_restoration', title: 'The First Light Returns',
      trigger: 'First lunar fragment placed in the Moonwell.',
      playback: 'auto', video: {}, fallback: 'engine', duration: 10, music: 'cine_triumph',
      cues: [{ t: 3.0, sfx: 'moonwell_pulse' }, { t: 5.4, sfx: 'region_restored' }],
      subtitles: [
        S(0.6, 3.6, 'The first fragment settles into the water, and the Moonwell stirs.'),
        S(4.2, 7.0, 'The grove remembers. Only a little — but it\'s a start.'),
        S(7.2, 9.6, 'Each piece you bring home will wake a little more.')
      ],
      replay, rewardKey: 'cine.first_restoration.seen'
    },
    boss_forest_intro: {
      id: 'boss_forest_intro', title: 'The Bramble Warden',
      trigger: 'Player enters the boss arena of the Blighted Forest.',
      playback: 'auto', video: {}, fallback: 'engine', duration: 8.5, music: 'cine_sorrow',
      cues: [{ t: 0.4, sfx: 'cine_sting' }, { t: 3.1, sfx: 'boss_roar' }],
      subtitles: [
        S(0.6, 3.0, 'Something in the dead wood is holding a piece of the moon.'),
        S(5.6, 8.2, 'Its roots drink the light. Pull it free.')
      ],
      boss: { name: 'The Bramble Warden', epithet: 'Blight-bound heart of the forest' },
      replay, rewardKey: 'cine.boss_forest_intro.seen'
    },
    boss_swamp_intro: {
      id: 'boss_swamp_intro', title: 'Mire Heart',
      trigger: 'Player enters the boss arena of the Whispering Swamp.',
      playback: 'auto', video: {}, fallback: 'engine', duration: 8.5, music: 'cine_sorrow',
      cues: [{ t: 0.4, sfx: 'cine_sting' }, { t: 3.1, sfx: 'boss_roar' }],
      subtitles: [
        S(0.6, 3.0, 'The whispers fall silent. Out on the black water, a lantern opens its eye.'),
        S(5.6, 8.2, 'That light isn\'t hers. It belongs to the Moonwell.')
      ],
      boss: { name: 'Mire Heart', epithet: 'Drowned heart of the Whispering Swamp' },
      replay, rewardKey: 'cine.boss_swamp_intro.seen'
    },
    boss_frost_intro: {
      id: 'boss_frost_intro', title: 'Frost Wyrm Husk',
      trigger: 'Player enters the boss arena on Frostpeak.',
      playback: 'auto', video: {}, fallback: 'engine', duration: 8.5, music: 'cine_sorrow',
      cues: [{ t: 0.4, sfx: 'cine_sting' }, { t: 3.1, sfx: 'boss_roar' }],
      subtitles: [
        S(0.6, 3.0, 'The wind stops. Somewhere in the ice, a stolen moonbeam glows.'),
        S(5.6, 8.2, 'Old bones, cold heart. Bring warmth — and bring the light home.')
      ],
      boss: { name: 'Frost Wyrm Husk', epithet: 'Old bones of the Frostpeak storm' },
      replay, rewardKey: 'cine.boss_frost_intro.seen'
    },
    final_fragment: {
      id: 'final_fragment', title: 'The Last Piece of the Moon',
      trigger: 'Final lunar fragment collected (after the last boss falls).',
      playback: 'auto', video: {}, fallback: 'engine', duration: 11, music: 'cine_triumph',
      cues: [{ t: 2.4, sfx: 'moonwell_pulse' }, { t: 6.6, sfx: 'cine_whoosh' }],
      subtitles: [
        S(0.8, 3.8, 'The last piece of the moon, cold and bright in your hands.'),
        S(4.2, 6.8, 'Grandmother\'s charm answers it with a glow of its own.'),
        S(7.6, 10.6, 'Every fragment is found. The Moonwell is waiting.')
      ],
      replay, rewardKey: 'cine.final_fragment.seen'
    },
    ending: {
      id: 'ending', title: 'Moonlight Restored',
      trigger: 'All fragments returned to the Moonwell (final restoration).',
      playback: 'auto', video: {}, fallback: 'engine', duration: 46, music: 'ending',
      cues: [
        { t: 8.2, sfx: 'moonwell_pulse' }, { t: 10.6, sfx: 'cine_sting' }, { t: 14.2, sfx: 'region_restored' },
        { t: 19.0, sfx: 'region_restored' }
      ],
      subtitles: [
        S(1.0, 4.4, 'One by one, the pieces of the moon found their way home.'),
        S(4.8, 7.8, 'The keeper\'s charm glowed, as if it had been waiting all along.'),
        S(8.6, 12.4, 'And the Moonwell remembered how to shine.'),
        S(13.6, 17.4, 'Light ran through the roots, over the fields, and out to the farthest hills.'),
        S(17.8, 21.8, 'The forest breathed. The swamp grew still. The snow on the peaks began to sparkle.'),
        S(23.0, 26.6, 'Down in the village, lanterns were lit, one window at a time.'),
        S(27.0, 30.0, 'Neighbours came up the path to see the light for themselves.'),
        S(31.0, 34.2, 'Grandmother… the Moonwell is bright again.', 'Witch'),
        S(34.6, 37.6, 'I\'ll keep it. Just like you did.', 'Witch')
      ],
      replay, rewardKey: 'cine.ending.seen'
    },
    defeat_recover: {
      id: 'defeat_recover', title: 'Carried Home',
      trigger: 'Optional: player is knocked out and wakes at the homestead.',
      playback: 'auto', video: {}, fallback: 'engine', duration: 6.5, music: 'cine_sorrow',
      cues: [{ t: 1.2, sfx: 'moonwell_pulse' }],
      subtitles: [
        S(0.8, 3.2, 'Grandmother\'s charm glowed softly, and carried you home.'),
        S(3.6, 6.2, 'Rest a moment. The grove will wait for you.')
      ],
      replay: { unlockMemory: false, allowed: true }, rewardKey: 'cine.defeat_recover.seen'
    }
  };
  // Base path that relative video paths resolve against ('' = relative to the page; test pages override).
  if (MM.CINE_VIDEO_BASE == null) MM.CINE_VIDEO_BASE = '';
})(window.MM);
