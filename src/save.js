import { SAVE_KEY } from './config.js';
import { serialize, restoreState } from './sim.js';

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return restoreState(raw);
  } catch {
    return null;
  }
}

export function hasSave() {
  try {
    return Boolean(localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* armazenamento indisponível */
  }
}
