/**
 * save.js — the game remembers: position, money, weapons, the mission the
 * story has reached and the clock, kept in localStorage as one small JSON
 * object so Continue on the title screen puts you back on the same corner.
 */
const KEY = 'cala-dorada.save.v1';

export function hasSave() {
  try {
    return Boolean(window.localStorage.getItem(KEY));
  } catch {
    return false;
  }
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    // v1 saves still load: the fields they carry are the ones the game reads.
    if (data.v !== 1 && data.v !== 2) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(game) {
  try {
    const data = {
      v: 2,
      t: Date.now(),
      x: Math.round(game.player.x),
      y: Math.round(game.player.y),
      money: game.player.money,
      health: Math.round(game.player.health),
      armour: Math.round(game.player.armour),
      weapons: game.player.weapons,
      ammo: game.player.ammo,
      weapon: game.player.weapon,
      mission: game.missions.index,
      completed: game.missions.completed,
      hour: Math.round(game.clock.hour * 100) / 100,
      kills: game.player.kills,
      story: Boolean(game.storyComplete),
      district: game.city.districtAt(game.player.x, game.player.y),
      // v2: what the radio was playing, how long the coast has been running,
      // and the weather, so Continue feels like the same evening.
      radio: game.audio?.station ?? 0,
      elapsed: Math.round(game.time),
      rain: game.weather?.rain ?? 0,
      version: game.version ?? '',
    };
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* storage may be denied; the game still plays */
  }
}

/** "Saved 2 minutes ago", for the pause screen. */
export function saveAge() {
  const data = readSave();
  if (!data) return '';
  const minutes = Math.max(0, Math.round((Date.now() - data.t) / 60000));
  if (minutes < 1) return 'saved just now';
  if (minutes === 1) return 'saved a minute ago';
  if (minutes < 60) return `saved ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return `saved ${hours} hour${hours === 1 ? '' : 's'} ago`;
}
