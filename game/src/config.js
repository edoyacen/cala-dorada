/**
 * config.js — every tuned number and colour the rest of Cala Dorada reads.
 * Distances are metres, speeds metres per second and times seconds, so the
 * city is laid out on the same grid as the physics.
 */

// ---------------------------------------------------------------- the city
export const TILE = 96;           // distance between two street centrelines
export const ROAD = 16;           // asphalt width of every street
export const SIDEWALK = 5.5;      // walkable strip on each side of the asphalt
export const BLOCKS = 18;         // blocks per side of the city grid
export const CITY = BLOCKS * TILE; // 1800 m of city, node (i,j) at (i*TILE, j*TILE)
export const BEACH = 62;          // sand east of the last street
export const OCEAN = 1500;        // open water beyond the sand
export const WORLD_W = CITY + BEACH + OCEAN;
export const WORLD_H = CITY + BEACH;   // a second beach runs along the south
export const LANE = ROAD * 0.24;  // centre of a driving lane, off the street's axis

export const STEP = 1 / 60;       // fixed simulation step the game loop is driven at
export const MAX_SPEED = 64;      // hard ceiling on any wheeled thing, m/s

// --------------------------------------------------------------- characters
export const PLAYER = {
  radius: 0.42,
  walk: 4.1,
  run: 7.4,
  swim: 2.4,
  turn: 11,
  maxHealth: 100,
  maxArmour: 100,
  respawnFee: 250,
};

export const PED = { radius: 0.34, walk: 1.25, flee: 4.6, sight: 26 };

// ------------------------------------------------------------------ vehicles
// A small, invented showroom. `handling` scales grip, `power` the engine.
export const CAR_TYPES = {
  sedan:  { name: 'Coral 4D',    len: 4.5, wid: 1.95, power: 15, top: 42, grip: 6.6, mass: 1.0, hp: 130 },
  sport:  { name: 'Vulcano GT',  len: 4.4, wid: 1.98, power: 26, top: 62, grip: 8.2, mass: 0.95, hp: 110 },
  muscle: { name: 'Bravura 71',  len: 4.8, wid: 2.05, power: 23, top: 55, grip: 5.6, mass: 1.2, hp: 150 },
  taxi:   { name: 'Sol Taxi',    len: 4.6, wid: 1.96, power: 14, top: 38, grip: 6.0, mass: 1.05, hp: 130 },
  van:    { name: 'Muelle Van',  len: 5.4, wid: 2.15, power: 13, top: 34, grip: 5.2, mass: 1.5, hp: 190 },
  police: { name: 'Guardia P-9', len: 4.7, wid: 2.00, power: 25, top: 56, grip: 7.8, mass: 1.15, hp: 170 },
};

export const VEHICLE_COLOURS = [
  '#e8433f', '#f4f1e8', '#2f6f8f', '#d8a02a', '#3c3f47', '#8f2f43',
  '#5aa07a', '#c96a2c', '#7d5ba6', '#e2e6ea', '#1d6f6a', '#b8b2a4',
];

export const POLICE_COLOUR = '#f2f4f7';

// -------------------------------------------------------------- the wanted
// Heat is a continuous 0..5; whole stars are what the HUD shows.
export const WANTED = {
  star: 1.0,
  decayDelay: 14,       // seconds out of sight before the city calms down
  decayRate: 0.055,     // stars lost per second after that
  maxPolice: [0, 2, 3, 5, 7, 9],
  spawnEvery: [99, 3.2, 2.4, 1.8, 1.3, 0.9],
  shootAt: [9, 9, 3, 2, 1, 1],    // star level at which patrols open fire
  roadblocks: [99, 99, 4, 3, 2, 2], // star level that starts blocking streets
};

export const HEAT = {
  carjack: 0.55,
  hitPed: 0.7,
  killPed: 1.5,
  hitCop: 0.9,
  shootCop: 1.3,
  killCop: 2.4,
  hitCopCar: 0.5,
  explosion: 1.1,
};

// ----------------------------------------------------------------- weapons
export const WEAPONS = {
  fist:   { name: 'Fists',     damage: 9,  rate: 2.6, range: 2.2, ammo: Infinity, spread: 0, sound: 'punch' },
  pistol: { name: 'P-13',      damage: 24, rate: 4.2, range: 46,  ammo: 90, spread: 0.022, speed: 220, sound: 'pistol' },
  smg:    { name: 'Sierra SMG', damage: 16, rate: 11,  range: 52,  ammo: 240, spread: 0.05, speed: 240, sound: 'smg' },
  shotgun:{ name: 'Costa 12',  damage: 15, rate: 1.2, range: 26,  ammo: 40, spread: 0.11, speed: 190, sound: 'shotgun', pellets: 7 },
};

export const LOOT = { pistolAmmo: 40, smgAmmo: 120, shotgunAmmo: 24, health: 35, armour: 50, cash: 120 };

// ------------------------------------------------------------------ palette
// A warm, bleached coast: coral stucco, mint glass, hot asphalt, cold neon HUD.
export const C = {
  asphalt: '#45434d',
  asphaltWarm: '#45434a',
  line: '#d9cfae',
  crosswalk: '#cfc7ad',
  sidewalk: '#a9a49a',
  sidewalkEdge: '#96918a',
  sand: '#e6cf9f',
  sandDark: '#d4b986',
  grass: '#6d9057',
  grassDark: '#597a46',
  water: '#2f8f9c',
  waterDeep: '#1d6a7d',
  waterFoam: '#cfeee6',
  roofHot: '#e8dcc6',
  neon: '#ff3f81',
  cyan: '#3ee0d0',
  amber: '#ffc14d',
  ink: '#12131a',
  hud: 'rgba(12,13,18,0.72)',
  hudEdge: 'rgba(255,255,255,0.14)',
  white: '#f7f2e7',
  danger: '#ff4d5e',
  good: '#66e08a',
};

export const FONT = {
  ui: '600 {size}px ui-sans-serif, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  display: '800 {size}px ui-sans-serif, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: '600 {size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

/** The display font at `size` pixels. */
export const display = (size) => FONT.display.replace('{size}', String(size));
/** The interface font at `size` pixels. */
export const ui = (size) => FONT.ui.replace('{size}', String(size));
/** The numeric/tabular font at `size` pixels. */
export const mono = (size) => FONT.mono.replace('{size}', String(size));

// ---------------------------------------------------------------- districts
export const DISTRICTS = [
  { id: 'downtown', name: 'Aurora Centro', tint: '#ffd9a8' },
  { id: 'beach',    name: 'Playa Lume',    tint: '#ffd0b0' },
  { id: 'docks',    name: 'Muelle Nueve',  tint: '#b9d7e6' },
  { id: 'residential', name: 'Jardines',   tint: '#cfe4b4' },
  { id: 'industrial',  name: 'Cerro Seco', tint: '#d8cfc0' },
];

// -------------------------------------------------------------- radio dial
export const RADIO_STATIONS = [
  { name: 'SOL 98.4 — Brisa', colour: '#ff6fa5', bpm: 104, scale: [0, 3, 5, 7, 10], root: 0 },
  { name: 'MUELLE FM — Marea', colour: '#48d6c4', bpm: 88, scale: [0, 2, 4, 7, 9], root: 3 },
  { name: 'CERRO 101 — Brasa', colour: '#ffb347', bpm: 126, scale: [0, 3, 5, 6, 10], root: 5 },
  { name: 'Radio Silencio',    colour: '#9d8cff', bpm: 72, scale: [0, 2, 3, 7, 8], root: -2 },
];
