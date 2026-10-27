// Bootstrap: create the game once the DOM is ready and report fatal start-up errors.
import { Game } from './game';

declare global {
  interface Window {
    riftbound?: Game;
  }
}

function boot(): void {
  const msg = document.getElementById('boot-msg');
  try {
    const game = new Game();
    window.riftbound = game;
    game.start();
    const bootEl = document.getElementById('boot');
    if (bootEl) bootEl.remove();
  } catch (err) {
    console.error('Riftbound failed to start', err);
    if (msg) msg.textContent = `Could not start: ${err instanceof Error ? err.message : String(err)}. WebGL may be disabled in this browser.`;
  }
}

window.addEventListener('error', (e) => {
  console.error('[riftbound] uncaught', e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[riftbound] unhandled promise rejection', e.reason);
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
