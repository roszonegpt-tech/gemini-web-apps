# Changelog

## Unreleased
- See `TODO.md`.

## 0.3.0 — 2026-11-02
- Real application states: animated logo, JS intro cinematic, main menu with its own backdrop, character creation, interactive tutorial sandbox, play, interiors, pause — nothing from the world renders or simulates behind logo/intro/menu/creation. One `requestAnimationFrame` loop (`MM.loop`); explicit enter/exit/cleanup per screen.
- Analog on-screen joystick (floating/fixed, size/side/haptics) replaces the d-pad buttons; gamepad stick feeds the same axis.
- Shared building scale (`MM.BUILDINGS`), aligned/anchored exteriors with collision and door cues; five enterable buildings with real interiors, furniture interactions, persistence; locked buildings explain themselves.
- Richer world: per-region terrain/props, connected paths, homestead restoration arc, village with NPCs, foreground foliage, obstruction fading.
- 25 Sprite Fusion pixel VFX (MIT) vendored and bridged into spells, hits, farming, ambient weather; five signature spells with anticipation→impact→aftermath; lighting palettes, adjustable soft filter, reduced motion/flash handling.
- New pixel art via claude-pxl (interiors, furniture, NPCs, building parts); 262+ sprites total.
- Compact campaign (3 regions, 4 bosses, ending, free play), economy, recipes, requests; audio engine; cinematics with video-drop-in + in-engine fallback.
- Fixed baseline bugs (night raid timing, co-op mana, boss respawn on load, unvalidated saves).

## 0.2.0 — 2026-10-29 (internal)
- Multi-file split of the original demo, `MM` runtime, versioned save, page shell, build tool.

## 0.1.0 — baseline
- Original single-file isometric witch demo (`builds/baseline/`).
