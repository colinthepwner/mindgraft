import * as THREE from 'three';
import { blks, blk_ids, dirt_id, grass_id, sand_id, stone_id } from './blocks.js';
import { chunk_sz, min_cy, world_bot, col_top, dirt_keys, dirty, key, remesh, set_blk, solid_k, world } from './world.js';

export const world_sz = 192, dirt_layers = 3;

const seed = 1337, hill_h = 4, hill_w = 22;

export function hash(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7 + seed) * 43758.5453;
  return n - Math.floor(n);
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const top = hash(ix, iz) + (hash(ix + 1, iz) - hash(ix, iz)) * sx;
  const bot = hash(ix, iz + 1) + (hash(ix + 1, iz + 1) - hash(ix, iz + 1)) * sx;
  return top + (bot - top) * sz;
}

const shore_w = 16, sand_w = 13, shore_lo = -4;
function edge_dist(x, z) {
  const d = Math.min(x + world_sz / 2, world_sz / 2 - 1 - x, z + world_sz / 2, world_sz / 2 - 1 - z);
  return d + (vnoise(x / 7 + 50, z / 7 + 50) - 0.5) * 6;
}
const is_beach = (x, z) => edge_dist(x, z) < sand_w;
function height_at(x, z) {
  const n = vnoise(x / hill_w, z / hill_w) * 0.75 + vnoise(x / (hill_w / 3), z / (hill_w / 3)) * 0.25;
  const stretched = Math.min(1, Math.max(0, (n - 0.25) / 0.5));
  const h0 = Math.min(chunk_sz - 1, Math.round(stretched * hill_h));
  const d = edge_dist(x, z);
  if (d >= shore_w) return h0;
  const t = Math.max(0, d / shore_w), s = t * t * (3 - 2 * t);
  return Math.round(shore_lo + (h0 - shore_lo) * s);
}

for (let x = -world_sz / 2; x < world_sz / 2; x++)
  for (let z = -world_sz / 2; z < world_sz / 2; z++) {
    const h = height_at(x, z), beach = is_beach(x, z);
    col_top.set(`${x},${z}`, h);
    for (let y = h; y >= world_bot; y--) {
      const type = y === h ? (beach ? sand_id : grass_id) : y >= h - dirt_layers ? (beach ? sand_id : dirt_id) : stone_id;
      world.set(key(x, y, z), { type });
      if (type === dirt_id) dirt_keys.add(key(x, y, z));
    }
  }
const log_id = blk_ids.find(id => blks[id].name === 'log');
const leaf_id = blk_ids.find(id => blks[id].name === 'leaf');
const tree_chance = 0.004, tree_gap = 6;

if (log_id && leaf_id) {
  const trunks = [];
  const put = (x, y, z, type, overwrite = false, extra = null) => {
    if (!overwrite && world.has(key(x, y, z))) return;
    world.set(key(x, y, z), { type, tree: true, ...extra });
    if (y > (col_top.get(`${x},${z}`) ?? world_bot - 1)) col_top.set(`${x},${z}`, y);
  };
  for (let x = -world_sz / 2 + 3; x < world_sz / 2 - 3; x++)
    for (let z = -world_sz / 2 + 3; z < world_sz / 2 - 3; z++) {
      if (hash(x + 1000, z - 1000) > tree_chance) continue;
      if (Math.abs(x) < 4 && Math.abs(z) < 4) continue;
      if (world.get(key(x, col_top.get(`${x},${z}`), z))?.type !== grass_id) continue;
      if (trunks.some(([tx, tz]) => Math.abs(tx - x) < tree_gap && Math.abs(tz - z) < tree_gap)) continue;
      trunks.push([x, z]);
      const h = col_top.get(`${x},${z}`);
      const T = hash(x - 500, z + 500) > 0.5 ? 5 : 4;
      for (let y = h + 1; y <= h + T; y++) put(x, y, z, log_id, true);
      for (let dy = T - 1; dy <= T + 2; dy++) {
        const r = dy <= T ? 2 : 1;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          const corner = Math.abs(dx) === r && Math.abs(dz) === r;
          if (r === 2 && corner) continue;
          if (dy === T + 2 && dx && dz) continue;
          put(x + dx, h + dy, z + dz, leaf_id, false, { tx: x, tz: z, rel: dy - T });
        }
      }
    }
}

const plant_ids = blk_ids.filter(id => blks[id].plant);

const plant_pool = plant_ids.flatMap(id => blks[id].name.startsWith('gp-flower-') ? [id] : [id, id, id, id]);
const plant_chance = 0.14;
if (plant_ids.length) {
  for (let x = -world_sz / 2; x < world_sz / 2; x++) for (let z = -world_sz / 2; z < world_sz / 2; z++) {
    const h = col_top.get(`${x},${z}`);
    if (h === undefined || world.get(key(x, h, z))?.type !== grass_id || world.has(key(x, h + 1, z))) continue;
    if (hash(x + 3000, z - 3000) > plant_chance) continue;
    const id = plant_pool[Math.floor(hash(x - 4000, z + 4000) * plant_pool.length)];
    world.set(key(x, h + 1, z), { type: id });
    col_top.set(`${x},${z}`, h + 1);
  }
}
const min_c = Math.floor(-world_sz / 2 / chunk_sz), max_c = Math.floor((world_sz / 2 - 1) / chunk_sz);
const max_cy = Math.floor(Math.max(...col_top.values()) / chunk_sz);
for (let cx = min_c; cx <= max_c; cx++) for (let cy = min_cy; cy <= max_cy; cy++) for (let cz = min_c; cz <= max_c; cz++)
  dirty.add(key(cx, cy, cz));
remesh();
export const spawn_pt = new THREE.Vector3(0, height_at(0, 0) + 2, 0);

const spread_ms = 500, spread_chance = 0.08;
function spread_grass() {
  if (grass_id === dirt_id) return;
  const to_grass = [];
  for (const k of dirt_keys) {
    if (Math.random() > spread_chance) continue;
    const [x, y, z] = k.split(',').map(Number);
    if (solid_k(key(x, y + 1, z))) continue;
    let touching = false;
    for (let dx = -1; dx <= 1 && !touching; dx++)
      for (let dy = -1; dy <= 1 && !touching; dy++)
        for (let dz = -1; dz <= 1; dz++)
          if (world.get(key(x + dx, y + dy, z + dz))?.type === grass_id) { touching = true; break; }
    if (touching) to_grass.push([x, y, z]);
  }
  for (const [x, y, z] of to_grass) {
    set_blk(x, y, z, grass_id);
    if (plant_ids.length && Math.random() < sprout_chance && !world.has(key(x, y + 1, z)))
      set_blk(x, y + 1, z, plant_pool[Math.floor(Math.random() * plant_pool.length)]);
  }
}
const sprout_chance = 0.2;
setInterval(spread_grass, spread_ms);
