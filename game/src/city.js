/**
 * city.js — builds Cala Dorada: twelve by twelve blocks of coral stucco, mint
 * glass and cracked asphalt between the hills and the sea, with parks, parking
 * lots, piers, palms, lamps and the small landmarks the story visits.
 *
 * The city is generated once from a seed, so the streets, the buildings and
 * every parked car are the same on every load, and collision is answered from a
 * per-block bucket of building rectangles.
 */
import {
  TILE, ROAD, SIDEWALK, BLOCKS, CITY, BEACH, WORLD_W, WORLD_H, CAR_TYPES, VEHICLE_COLOURS,
} from './config.js';
import { makeRng, clamp } from './random.js';

const LOT_PALETTES = {
  downtown: ['#e8b9a6', '#d9c6ae', '#b8d3cb', '#e6cf9c', '#c8cfdc', '#f0dfc4', '#d6a9b8'],
  beach: ['#f2cbb0', '#e9b4a4', '#c9e0d2', '#f0d9a8', '#dbe4cc', '#f4c2c8'],
  docks: ['#b8c6ca', '#a9b6bb', '#cdbfa8', '#9fb0b6', '#c2b9a4'],
  residential: ['#e3cbb0', '#cbbd9c', '#d8c9ad', '#b9c8ab', '#e0cfae', '#c9b48f'],
  industrial: ['#b9b3a6', '#a6a79f', '#c3baa8', '#9aa39c', '#b0a898'],
};

const ROOF_PALETTES = {
  downtown: ['#cba184', '#d9b894', '#b6c8c0', '#c9a9a4', '#a8b0a6', '#e0cdae', '#bfae9c'],
  beach: ['#c98f72', '#e4b48f', '#a9cbc0', '#d8b0a4', '#c4b58f', '#e0c3a2'],
  docks: ['#8f9a9c', '#7d888b', '#a39a86', '#6f7c80', '#93a09b'],
  residential: ['#c9a98b', '#b0946f', '#a8b393', '#d3b795', '#bda98c', '#9fae94'],
  industrial: ['#8b8d88', '#7a7d78', '#9c968a', '#726f68', '#86837b'],
};

/** The district a grid cell belongs to. */
export function districtOf(i, j) {
  if (i >= BLOCKS - 3) return 'beach';
  if (j >= BLOCKS - 3 && i <= 5) return 'docks';
  if (i <= 3 && j <= 2) return 'industrial';
  if (i >= 3 && i <= 8 && j >= 3 && j <= 8) return 'downtown';
  return 'residential';
}

/** Centre of the street intersection (i,j). */
export const nodeX = (i) => i * TILE;
export const nodeY = (j) => j * TILE;

/** True when the point lies on asphalt. */
export function onRoad(x, y) {
  const rx = Math.abs(x - Math.round(x / TILE) * TILE);
  const ry = Math.abs(y - Math.round(y / TILE) * TILE);
  return rx <= ROAD / 2 || ry <= ROAD / 2;
}

export class City {
  constructor(seed = 'cala-dorada') {
    this.seed = seed;
    const rng = makeRng(seed);
    this.rng = rng;
    this.blocks = [];
    this.buildings = [];
    this.parking = [];
    this.props = [];
    this.signs = [];
    this.landmarks = [];
    this.buckets = new Map();
    this._build(rng);
    this._index();
  }

  // ------------------------------------------------------------- generation
  _build(rng) {
    for (let i = 0; i < BLOCKS; i += 1) {
      for (let j = 0; j < BLOCKS; j += 1) {
        const district = districtOf(i, j);
        const x0 = i * TILE + ROAD / 2 + SIDEWALK * 0.5;
        const y0 = j * TILE + ROAD / 2 + SIDEWALK * 0.5;
        const size = TILE - ROAD - SIDEWALK;
        const block = { i, j, x0, y0, w: size, h: size, district, kind: 'lots' };
        this._fillBlock(block, rng);
        this.blocks.push(block);
      }
    }
    this._landmarks(rng);
    this._streetProps(rng);
    this._parkingSpots(rng);
  }

  _fillBlock(block, rng) {
    const { i, j, district } = block;
    // A few blocks are not buildings at all.
    const roll = rng.next();
    if ((district === 'residential' && roll < 0.14) || roll < 0.04) {
      block.kind = 'park';
      this._park(block, rng);
      return;
    }
    if (district === 'docks' && roll < 0.3) {
      block.kind = 'lot';
      this._lot(block, rng);
      return;
    }
    if (district === 'downtown' && roll < 0.1) {
      block.kind = 'plaza';
      this._plaza(block, rng);
      return;
    }
    if (roll < 0.1 && (i + j) % 3 === 0) {
      block.kind = 'lot';
      this._lot(block, rng);
      return;
    }
    this._lots(block, rng);
  }

  _lots(block, rng) {
    const { district } = block;
    const palette = LOT_PALETTES[district];
    const roofs = ROOF_PALETTES[district];
    // Two to six lots around a courtyard alley, by district.
    const layouts = {
      downtown: [[3, 2], [2, 2], [3, 1]],
      beach: [[2, 1], [2, 2], [1, 2]],
      docks: [[1, 1], [2, 1], [1, 2]],
      residential: [[2, 1], [2, 2], [1, 2]],
      industrial: [[1, 1], [2, 1]],
    }[district];
    const [cols, rows] = rng.pick(layouts);
    const gap = district === 'downtown' ? 9 : 7;
    const lotW = (block.w - gap * (cols - 1)) / cols;
    const lotH = (block.h - gap * (rows - 1)) / rows;
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        const inset = rng.range(0.5, 3.4);
        const x = block.x0 + c * (lotW + gap) + inset;
        const y = block.y0 + r * (lotH + gap) + inset;
        const w = lotW - inset * 2;
        const h = lotH - inset * 2;
        if (w < 6 || h < 6) continue;
        this._building(x, y, w, h, district, rng, palette, roofs);
      }
    }
  }

  _building(x, y, w, h, district, rng, palette, roofs) {
    const floors = {
      downtown: rng.weighted([[rng.int(3, 6), 3], [rng.int(7, 12), 4], [rng.int(13, 22), 1.2]]),
      beach: rng.int(2, 6),
      docks: rng.int(2, 5),
      residential: rng.int(2, 5),
      industrial: rng.int(2, 6),
    }[district];
    const height = floors * rng.range(3.1, 3.6);
    const b = {
      x, y, w, h, height, floors,
      district,
      wall: rng.pick(palette),
      roof: rng.pick(roofs),
      shade: rng.range(0.82, 1.0),
      windows: rng.int(0, 3),
      style: rng.weighted([['flat', 5], ['step', 2], ['tower', district === 'downtown' ? 3 : 0.4]]),
      tank: rng.chance(0.22),
      ac: rng.chance(0.5),
      sign: rng.chance(district === 'downtown' || district === 'beach' ? 0.3 : 0.08),
      seed: rng.int(1, 9999),
      balcony: rng.chance(district === 'beach' ? 0.55 : 0.2),
    };
    this.buildings.push(b);
    return b;
  }

  _park(block, rng) {
    block.kind = 'park';
    block.grass = true;
    const cx = block.x0 + block.w / 2;
    const cy = block.y0 + block.h / 2;
    for (let n = 0; n < rng.int(6, 13); n += 1) {
      this.props.push({
        kind: rng.chance(0.72) ? 'palm' : 'tree',
        x: cx + rng.range(-block.w / 2 + 3, block.w / 2 - 3),
        y: cy + rng.range(-block.h / 2 + 3, block.h / 2 - 3),
        size: rng.range(0.8, 1.35),
        sway: rng.range(0, Math.PI * 2),
      });
    }
    this.props.push({ kind: 'bench', x: cx - 8, y: cy + 6, angle: 0 });
    this.props.push({ kind: 'bench', x: cx + 8, y: cy - 6, angle: Math.PI });
    this.props.push({ kind: 'fountain', x: cx, y: cy, size: rng.range(3.4, 5.2) });
  }

  _lot(block, rng) {
    block.kind = 'lot';
    block.asphalt = true;
    const rows = rng.int(2, 3);
    const cols = rng.int(3, 4);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (rng.chance(0.35)) continue;
        const x = block.x0 + 14 + c * ((block.w - 24) / cols);
        const y = block.y0 + 16 + r * ((block.h - 28) / rows);
        const type = rng.weighted([
          ['sedan', 6], ['van', 2], ['taxi', 1], ['muscle', 2], ['sport', 1],
        ]);
        this.parking.push({
          x, y,
          h: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2,
          type,
          colour: rng.pick(VEHICLE_COLOURS),
        });
      }
    }
    this.props.push({ kind: 'container', x: block.x0 + block.w - 14, y: block.y0 + 12, size: 1 });
  }

  _plaza(block, rng) {
    block.kind = 'plaza';
    const cx = block.x0 + block.w / 2;
    const cy = block.y0 + block.h / 2;
    this.props.push({ kind: 'fountain', x: cx, y: cy, size: 7 });
    for (let n = 0; n < 8; n += 1) {
      const a = (n / 8) * Math.PI * 2;
      this.props.push({
        kind: 'palm',
        x: cx + Math.cos(a) * 22,
        y: cy + Math.sin(a) * 22,
        size: rng.range(0.9, 1.2),
        sway: a,
      });
    }
  }

  _landmarks(rng) {
    // Aurora Centro: the tallest tower in the city, ringed by a plaza.
    const tower = this.buildings.find(
      (b) => b.district === 'downtown' && b.x > 6 * TILE && b.y > 6 * TILE,
    );
    if (tower) {
      tower.height = 96;
      tower.floors = 28;
      tower.style = 'tower';
      tower.sign = true;
      tower.wall = '#cfdde2';
      tower.roof = '#93a5aa';
      this.landmarks.push({ kind: 'tower', x: tower.x + tower.w / 2, y: tower.y + tower.h / 2, building: tower });
    }
    // A lighthouse on the sand, and the pier that runs out from the beach.
    this.landmarks.push({ kind: 'lighthouse', x: CITY + BEACH * 0.55, y: TILE * 3.5 });
    this.landmarks.push({ kind: 'pier', x: CITY + 34, y: TILE * 7.2, len: 120 });
    this.landmarks.push({ kind: 'pier', x: CITY + 34, y: TILE * 10.4, len: 96 });
    this.landmarks.push({ kind: 'stage', x: CITY + BEACH * 0.5, y: TILE * 8.4 });
    // A sign over the beach road, and a couple of rooftop boards.
    this.signs.push({ x: CITY + BEACH * 0.3, y: TILE * 1.4, text: 'CALA DORADA', colour: '#ff5f9e', size: 6 });
    this.signs.push({ x: TILE * 4.2, y: TILE * 9.6, text: 'MUELLE 9', colour: '#4be0cf', size: 5 });
    this.signs.push({ x: TILE * 7.4, y: TILE * 4.2, text: 'AURORA', colour: '#ffc14d', size: 5 });
  }

  _streetProps(rng) {
    // Lamps at every intersection corner and palms down the beach side.
    for (let i = 0; i <= BLOCKS; i += 1) {
      for (let j = 0; j <= BLOCKS; j += 1) {
        const x = nodeX(i);
        const y = nodeY(j);
        if (i < BLOCKS) {
          this.props.push({ kind: 'lamp', x: x + ROAD / 2 + 2, y: y + ROAD / 2 + 2, angle: Math.PI * 0.25 });
          this.props.push({ kind: 'lamp', x: x + ROAD / 2 + 2, y: y - ROAD / 2 - 2, angle: -Math.PI * 0.25 });
        }
        if (j < BLOCKS && i >= BLOCKS - 3) {
          this.props.push({ kind: 'palm', x: x + TILE / 2, y: y + ROAD / 2 + 4, size: rng.range(0.9, 1.3), sway: rng.range(0, 6) });
        }
      }
    }
    // Palms down both kerbs of every other avenue, so the city reads green
    // from the driver's seat and gives the frame a skyline of fronds.
    for (let avenue = 0; avenue <= BLOCKS; avenue += 1) {
      for (let j = 0; j < BLOCKS; j += 1) {
        for (let k = 0; k < 2; k += 1) {
          for (const side of [-1, 1]) {
            this.props.push({
              kind: 'palm',
              x: avenue * TILE + side * (ROAD / 2 + 3.6),
              y: j * TILE + 28 + k * 44 + (side > 0 ? 12 : 0),
              size: rng.range(0.85, 1.3),
              sway: rng.range(0, 6),
            });
          }
        }
      }
    }
    for (let i = 0; i < BLOCKS; i += 1) {
      for (let k = 0; k < 3; k += 1) {
        this.props.push({
          kind: 'palm',
          x: i * TILE + 38 + k * 40,
          y: 9 * TILE - ROAD / 2 - 3.2,
          size: rng.range(0.85, 1.2),
          sway: rng.range(0, 6),
        });
      }
    }
    // Beach clubs: umbrellas with a towel beside each, in rows along the sand.
    for (let y = 40; y < WORLD_H - 30; y += 26) {
      const rows = 2 + (Math.floor(y / 27) % 2);
      for (let k = 0; k < rows; k += 1) {
        const ux = CITY + 14 + k * 19 + rng.range(-3, 3);
        const uy = y + rng.range(-4, 4);
        const colour = rng.pick(['#e8574f', '#3fb3c4', '#f0cf62', '#e78ab0', '#f4f1e8', '#7fc98b']);
        this.props.push({ kind: 'umbrella', x: ux, y: uy, size: rng.range(0.8, 1.1) });
        if (rng.chance(0.7)) {
          this.props.push({
            kind: 'towel',
            x: ux + rng.range(2.4, 3.6),
            y: uy + rng.range(-2, 2),
            size: rng.range(0.8, 1.05),
            angle: rng.range(-0.5, 0.5),
            colour,
          });
        }
      }
    }
    // A couple of huts and boats among the umbrellas.
    for (let n = 0; n < 8; n += 1) {
      this.props.push({
        kind: 'hut',
        x: CITY + rng.range(16, BEACH - 26),
        y: rng.range(40, WORLD_H - 50),
        size: rng.range(0.85, 1.2),
      });
    }
    for (let n = 0; n < 9; n += 1) {
      this.props.push({
        kind: n % 3 === 0 ? 'boat' : 'buoy',
        x: CITY + BEACH + rng.range(8, 60),
        y: rng.range(40, WORLD_H - 40),
        size: rng.range(0.8, 1.5),
        angle: rng.range(-0.6, 0.6),
      });
    }
    for (let n = 0; n < 34; n += 1) {
      this.props.push({
        kind: 'palm',
        x: CITY + rng.range(18, BEACH - 18),
        y: rng.range(18, WORLD_H - 26),
        size: rng.range(0.9, 1.4),
        sway: rng.range(0, 6),
      });
    }
    // Hydrants and bins along the kerbs.
    for (let i = 0; i < BLOCKS; i += 1) {
      for (let j = 0; j < BLOCKS; j += 1) {
        if (rng.chance(0.4)) {
          this.props.push({
            kind: 'hydrant',
            x: i * TILE + ROAD / 2 + 2,
            y: j * TILE + rng.range(ROAD, TILE - ROAD),
          });
        }
      }
    }
  }

  _parkingSpots(rng) {
    // Cars left at the kerb of a street, nose to the sidewalk.
    for (let n = 0; n < 54; n += 1) {
      const onX = rng.chance(0.5);
      const line = rng.int(1, BLOCKS - 1);
      const along = rng.range(ROAD * 2, CITY - ROAD * 2);
      const side = rng.sign();
      const offset = ROAD / 2 - 1.6;
      const x = onX ? along : line * TILE + side * offset;
      const y = onX ? line * TILE + side * offset : along;
      if (this.buildingNear(x, y, 3.4)) continue;
      const type = rng.weighted([['sedan', 7], ['sport', 2], ['van', 2], ['muscle', 2], ['taxi', 1]]);
      this.parking.push({
        x, y,
        h: onX ? 0 : Math.PI / 2,
        type,
        colour: rng.chance(0.06) ? POLICE_WHITE : rng.pick(VEHICLE_COLOURS),
      });
    }
  }

  // ---------------------------------------------------------------- queries
  _index() {
    const cell = TILE;
    for (const b of this.buildings) {
      const i0 = Math.floor(b.x / cell);
      const i1 = Math.floor((b.x + b.w) / cell);
      const j0 = Math.floor(b.y / cell);
      const j1 = Math.floor((b.y + b.h) / cell);
      for (let i = i0; i <= i1; i += 1) {
        for (let j = j0; j <= j1; j += 1) {
          const key = `${i},${j}`;
          let list = this.buckets.get(key);
          if (!list) this.buckets.set(key, (list = []));
          list.push(b);
        }
      }
    }
  }

  /** Every building whose bucket overlaps the circle. */
  near(x, y, r = 0) {
    const cell = TILE;
    const i0 = Math.floor((x - r) / cell);
    const i1 = Math.floor((x + r) / cell);
    const j0 = Math.floor((y - r) / cell);
    const j1 = Math.floor((y + r) / cell);
    const out = [];
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) {
        const list = this.buckets.get(`${i},${j}`);
        if (list) for (const b of list) if (!out.includes(b)) out.push(b);
      }
    }
    return out;
  }

  buildingNear(x, y, r) {
    for (const b of this.near(x, y, r)) {
      const nx = clamp(x, b.x, b.x + b.w);
      const ny = clamp(y, b.y, b.y + b.h);
      if ((nx - x) ** 2 + (ny - y) ** 2 < r * r) return true;
    }
    return false;
  }

  /**
   * Push a circle out of the buildings it overlaps. Returns the normal of the
   * deepest contact, or null when it touched nothing.
   */
  resolveCircle(body, radius) {
    let hit = null;
    for (const b of this.near(body.x, body.y, radius)) {
      const nx = clamp(body.x, b.x, b.x + b.w);
      const ny = clamp(body.y, b.y, b.y + b.h);
      let dx = body.x - nx;
      let dy = body.y - ny;
      let d = Math.hypot(dx, dy);
      if (d > radius) continue;
      if (d < 1e-6) {
        // Centre inside the rectangle: push out along the shallowest axis.
        const left = body.x - b.x;
        const right = b.x + b.w - body.x;
        const top = body.y - b.y;
        const bottom = b.y + b.h - body.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) { dx = -1; dy = 0; d = 1; body.x = b.x - radius; }
        else if (m === right) { dx = 1; dy = 0; d = 1; body.x = b.x + b.w + radius; }
        else if (m === top) { dx = 0; dy = -1; d = 1; body.y = b.y - radius; }
        else { dx = 0; dy = 1; d = 1; body.y = b.y + b.h + radius; }
      } else {
        const push = radius - d;
        body.x += (dx / d) * push;
        body.y += (dy / d) * push;
      }
      hit = { nx: dx / d, ny: dy / d, building: b };
    }
    return hit;
  }

  inWater(x, y) {
    return x > CITY + BEACH;
  }

  onSand(x, y) {
    return x > CITY && x <= CITY + BEACH;
  }

  /** The ground surface under a point, for sound and for the renderer. */
  surface(x, y) {
    if (this.inWater(x, y)) return 'water';
    if (this.onSand(x, y) || y > WORLD_H - BEACH * 0.8) return 'sand';
    if (onRoad(x, y)) return 'road';
    return 'pavement';
  }

  /** The nearest patch of open street, used to place cars and police. */
  nearestStreetPoint(x, y) {
    let best = null;
    let bestD = Infinity;
    const i0 = Math.round(x / TILE);
    const j0 = Math.round(y / TILE);
    for (let di = -1; di <= 1; di += 1) {
      for (let dj = -1; dj <= 1; dj += 1) {
        const i = clamp(i0 + di, 0, BLOCKS);
        const j = clamp(j0 + dj, 0, BLOCKS);
        const px = i * TILE;
        const py = j * TILE;
        const d = (px - x) ** 2 + (py - y) ** 2;
        if (d < bestD && !this.buildingNear(px, py, 6)) {
          bestD = d;
          best = { x: px, y: py, i, j };
        }
      }
    }
    return best;
  }

  /** A short name for the district a point stands in. */
  districtAt(x, y) {
    if (x > CITY) return 'Playa Lume';
    const i = clamp(Math.floor(x / TILE), 0, BLOCKS - 1);
    const j = clamp(Math.floor(y / TILE), 0, BLOCKS - 1);
    const d = districtOf(i, j);
    const names = {
      downtown: 'Aurora Centro',
      beach: 'Playa Lume',
      docks: 'Muelle Nueve',
      residential: 'Jardines',
      industrial: 'Cerro Seco',
    };
    return names[d];
  }

  /** The vehicle a parked car would be, or null. */
  parkedVehicleAt(x, y) {
    for (const spot of this.parking) {
      if ((spot.x - x) ** 2 + (spot.y - y) ** 2 < 16) return spot;
    }
    return null;
  }
}

/** The white a patrol car is painted. */
const POLICE_WHITE = '#f3f5f8';

export { CAR_TYPES };
