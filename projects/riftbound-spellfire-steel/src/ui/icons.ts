// Inline SVG icons for spells, abilities and the mage portrait (no image files needed).

const svg = (body: string, vb = '0 0 32 32') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

export const ICONS: Record<string, string> = {
  arcaneBolt: svg('<circle cx="16" cy="16" r="7" fill="#b36bff"/><circle cx="16" cy="16" r="3" fill="#fff"/><path d="M3 16h6M23 16h6M16 3v6M16 23v6" stroke="#d9b8ff" stroke-width="2"/>'),
  flameBurst: svg('<path d="M16 3c3 6 9 8 9 15a9 9 0 0 1-18 0c0-5 4-7 4-11 2 2 3 4 3 6 2-3 2-6 2-10z" fill="#ff8a2a"/><path d="M16 14c2 3 4 4 4 8a4 4 0 0 1-8 0c0-2 2-3 2-5 1 1 2 1 2-3z" fill="#ffd84a"/>'),
  inferno: svg('<path d="M16 2c4 7 11 9 11 17a11 11 0 0 1-22 0c0-6 5-8 5-13 2 2 4 5 4 7 2-3 2-7 2-11z" fill="#ff4a1a"/><path d="M16 12c3 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 3 2 3-4z" fill="#ffd84a"/>'),
  chainLightning: svg('<path d="M19 2 8 18h7l-3 12 12-17h-7z" fill="#7fd8ff" stroke="#fff" stroke-width="1"/>'),
  vortexSurge: svg('<path d="M16 5c8 0 11 6 8 10s-10 3-10-1 6-4 6 0" fill="none" stroke="#9cffd8" stroke-width="2.6" stroke-linecap="round"/><path d="M6 22c4 4 14 5 20 0" fill="none" stroke="#9cffd8" stroke-width="2.4" stroke-linecap="round"/>'),
  meteorStrike: svg('<circle cx="20" cy="20" r="7" fill="#ff5a3a"/><path d="M4 4 15 15M8 3l9 9M3 8l9 9" stroke="#ffd84a" stroke-width="2.2" stroke-linecap="round"/>'),
  blink: svg('<path d="M6 26 26 6" stroke="#b36bff" stroke-width="3" stroke-dasharray="3 3"/><circle cx="26" cy="6" r="4" fill="#7fd8ff"/><circle cx="6" cy="26" r="3" fill="none" stroke="#b36bff" stroke-width="2"/>'),
  ward: svg('<path d="M16 3 27 8v8c0 7-5 11-11 13C10 27 5 23 5 16V8z" fill="none" stroke="#5fd8ff" stroke-width="2.6"/><path d="M16 9v14M10 15h12" stroke="#5fd8ff" stroke-width="2"/>'),
  hpPotion: svg('<path d="M12 3h8v5l5 8v10a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V16l5-8z" fill="#2fb85a" stroke="#fff" stroke-width="1.4"/>'),
  mpPotion: svg('<path d="M12 3h8v5l5 8v10a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V16l5-8z" fill="#8a3cff" stroke="#fff" stroke-width="1.4"/>'),
  bomb: svg('<circle cx="16" cy="18" r="9" fill="#7fd8ff" stroke="#fff" stroke-width="1.4"/><path d="M16 9V4M14 4h4" stroke="#fff" stroke-width="2"/><path d="M12 15l8 6M20 15l-8 6" stroke="#fff" stroke-width="1.2"/>'),
  lock: svg('<rect x="8" y="14" width="16" height="13" rx="2" fill="#555"/><path d="M11 14V10a5 5 0 0 1 10 0v4" fill="none" stroke="#777" stroke-width="2.4"/>'),
  portrait: svg('<rect width="64" height="64" fill="none"/><path d="M32 4 44 30H20z" fill="#d552c4"/><path d="M12 30h40l-4 4H16z" fill="#a83a9a"/><circle cx="32" cy="38" r="9" fill="#f0c49a"/><path d="M24 42c2 10 14 10 16 0l-8 14z" fill="#eee"/><path d="M14 64c2-12 8-16 18-16s16 4 18 16z" fill="#3557bd"/><circle cx="29" cy="37" r="1.4" fill="#222"/><circle cx="35" cy="37" r="1.4" fill="#222"/>', '0 0 64 64'),
};
