// Build metadata injected by scripts/build.mjs (esbuild `define`).
declare const __BUILD_VERSION__: string;
declare const __BUILD_DATE__: string;

export const VERSION: string = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev';
export const BUILD_DATE: string = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '';
export const GAME_TITLE = 'Riftbound: Spellfire & Steel';
