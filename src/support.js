import * as THREE from 'three';
import { blks, break_def, break_t, drop_of, cube_geo, dirt_id, grass_id, sand_id } from './blocks.js';
import { spawn_drop } from './drops.js';
import { chips } from './fx.js';
import { scene } from './gfx.js';
import { pop_plant } from './mining.js';
import { wreck_part, hurt_part, hurt_plr, mobs } from './mob.js';
import { plr_half, plr_h, player } from './player.js';
import { play_snd } from './sound.js';
import { grav, world_bot, col_top, key, set_blk, solid_k, world } from './world.js';

const budget = 3.5, min_wt = 0.5;
const beam_wt = { log: 0.8 };
const blk_cost = type => {
  const name = blks[type].name;
  return Math.round(Math.max(min_wt, beam_wt[name] ?? break_t[name] ?? break_def) * 10);
};
const budget_u = Math.round(budget * 10), max_reach = Math.floor(budget_u / Math.round(min_wt * 10));
function find_loose(cx, cz) {
  const R = max_reach * 2 + 1, W = R * 2 + 1;
  let max_y = world_bot;
  for (let x = cx - R; x <= cx + R; x++) for (let z = cz - R; z <= cz + R; z++) max_y = Math.max(max_y, col_top.get(`${x},${z}`) ?? world_bot);
  const H = max_y - world_bot + 1;
  const at = (xi, yi, zi) => (yi * W + zi) * W + xi;
  const cost = new Uint8Array(W * W * H), ty = new Uint8Array(W * W * H);
  for (let yi = 0; yi < H; yi++) for (let zi = 0; zi < W; zi++) for (let xi = 0; xi < W; xi++) {
    const b = world.get(key(cx - R + xi, world_bot + yi, cz - R + zi));
    if (b && !blks[b.type].plant) { cost[at(xi, yi, zi)] = blk_cost(b.type); ty[at(xi, yi, zi)] = b.type; }
  }

  const loose = new Uint8Array(W * W * H);
  for (let zi = 0; zi < W; zi++) for (let xi = 0; xi < W; xi++) {
    let capped = null;
    for (let yi = H - 1; yi >= 0; yi--) {
      const i = at(xi, yi, zi);
      if (!cost[i]) { capped = null; continue; }
      if (capped === null) capped = ty[i] === grass_id;
      if (ty[i] === sand_id || (ty[i] === dirt_id && !capped)) loose[i] = 1;
    }
  }
  const dist = new Int16Array(W * W * H).fill(-1);
  const buckets = Array.from({ length: budget_u + 1 }, () => []);
  const relax = (xi, yi, zi, d) => {
    if (xi < 0 || zi < 0 || xi >= W || zi >= W || yi < 0 || yi >= H) return;
    const i = at(xi, yi, zi);
    if (!cost[i] || (dist[i] !== -1 && dist[i] <= d)) return;
    dist[i] = d;
    buckets[d].push(i);
  };
  for (let zi = 0; zi < W; zi++) for (let xi = 0; xi < W; xi++) {
    relax(xi, 0, zi, 0);
    if (xi === 0 || zi === 0 || xi === W - 1 || zi === W - 1) for (let yi = 0; yi < H; yi++) relax(xi, yi, zi, 0);
  }
  for (let d = 0; d <= budget_u; d++) {
    const bucket = buckets[d];
    while (bucket.length) {
      const i = bucket.pop();
      if (dist[i] !== d) continue;
      const xi = i % W, zi = Math.floor(i / W) % W, yi = Math.floor(i / (W * W));
      relax(xi, yi + 1, zi, d);
      if (loose[i]) continue;
      for (const [dx, dz] of nbrs4) {
        const nx = xi + dx, nz = zi + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= W) continue;
        const ni = at(nx, yi, nz), c = cost[ni];
        if (c && !loose[ni] && d + c <= budget_u) relax(nx, yi, nz, d + c);
      }
    }
  }
  const lost = [];
  for (let yi = 0; yi < H; yi++) for (let zi = 0; zi < W; zi++) for (let xi = 0; xi < W; xi++) {
    const i = at(xi, yi, zi);
    if (cost[i] && dist[i] === -1) lost.push([cx - R + xi, world_bot + yi, cz - R + zi]);
  }
  return lost;
}
const nbrs4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const is_tree_leaf = b => b?.tree && blks[b.type].name === 'leaf';
export function settle(x, z) {
  const lost = find_loose(x, z);
  const taken = new Set();
  const columns = new Map();
  for (const [bx, by, bz] of lost) {
    const b = world.get(key(bx, by, bz));
    if (b && blks[b.type].name === 'log') {
      const c = bx + ',' + bz;
      if (!columns.has(c)) columns.set(c, []);
      columns.get(c).push(by);
    }
  }
  for (const [c, ys] of columns) {
    const [lx, lz] = c.split(',').map(Number);
    const top_lost = Math.max(...ys);
    const members = ys.map(y => ({ x: lx, y, z: lz, type: world.get(key(lx, y, lz)).type, entry: world.get(key(lx, y, lz)) }));
    if (blks[world.get(key(lx, top_lost + 1, lz))?.type]?.name !== 'log') members.push(...grab_crown(lx, lz, top_lost - 4, top_lost + 6));
    for (const m of members) { taken.add(key(m.x, m.y, m.z)); set_blk(m.x, m.y, m.z, 0); }
    drop_group(members);
  }
  for (const [bx, by, bz] of lost) {
    if (taken.has(key(bx, by, bz))) continue;
    const b = world.get(key(bx, by, bz));
    if (!b || is_tree_leaf(b)) continue;
    set_blk(bx, by, bz, 0);
    drop_group([{ x: bx, y: by, z: bz, type: b.type, entry: b }]);
  }
  for (const [bx, by, bz] of lost) pop_plant(bx, by, bz);
  decay_leaves(x, z);
  roll(x, z);
}

function top_solid(x, z) {
  let y = col_top.get(`${x},${z}`);
  if (y === undefined) return undefined;
  while (y >= world_bot && !solid_k(key(x, y, z))) y--;
  return y;
}
function roll(cx, cz) {
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const x = cx + dx, z = cz + dz, y = top_solid(x, z);
    if (y === undefined) continue;
    const b = world.get(key(x, y, z));
    if (!b || (b.type !== sand_id && b.type !== dirt_id)) continue;
    const low = [];
    for (const [ox, oz] of nbrs4) {
      const t = top_solid(x + ox, z + oz);
      if (t !== undefined && t <= y - 2) low.push([x + ox, z + oz]);
    }
    if (!low.length) continue;
    const [nx, nz] = low[Math.floor(Math.random() * low.length)];
    set_blk(x, y, z, 0);
    pop_plant(x, y, z);
    drop_group([{ x: nx, y, z: nz, type: b.type, entry: b }]);
  }
}
function grab_crown(tx, tz, y_min, y_max) {
  const out = [];
  for (let x = tx - 3; x <= tx + 3; x++) for (let z = tz - 3; z <= tz + 3; z++) for (let y = y_min; y <= y_max; y++) {
    const b = world.get(key(x, y, z));
    if (b && is_tree_leaf(b) && b.tx === tx && b.tz === tz) out.push({ x, y, z, type: b.type, entry: b });
  }
  return out;
}

const leaf_r = 2, leaf_below = 12, decay_vol = 0.45;
function slide_crowns(leaves, top) {
  const seen = new Set();
  for (const [lx, ly, lz] of leaves) {
    const e = world.get(key(lx, ly, lz));
    if (!e || e.tx === undefined) continue;
    const c = e.tx + ',' + e.tz;
    if (seen.has(c)) continue;
    seen.add(c);
    let top_log = null;
    for (let y = top; y >= world_bot; y--) if (blks[world.get(key(e.tx, y, e.tz))?.type]?.name === 'log') { top_log = y; break; }
    if (top_log === null) continue;
    const shift = ly - (top_log + e.rel);
    if (shift < 1) continue;
    const members = grab_crown(e.tx, e.tz, top_log - 6, ly + 8);
    if (!members.length) continue;
    for (const m of members) set_blk(m.x, m.y, m.z, 0);
    drop_group(members, { drop: shift });
  }
}
function decay_leaves(cx, cz) {
  const R = 5;
  let top = world_bot;
  for (let x = cx - R; x <= cx + R; x++) for (let z = cz - R; z <= cz + R; z++) top = Math.max(top, col_top.get(`${x},${z}`) ?? world_bot);
  const logs = [], leaves = [];
  for (let x = cx - R; x <= cx + R; x++) for (let z = cz - R; z <= cz + R; z++)
    for (let y = Math.max(world_bot, top - 26); y <= top; y++) {
      const b = world.get(key(x, y, z));
      if (!b) continue;
      const name = blks[b.type].name;
      if (name === 'log') logs.push([x, y, z]);
      else if (name === 'leaf' && b.tree && Math.abs(x - cx) <= 3 && Math.abs(z - cz) <= 3) leaves.push([x, y, z]);
    }
  slide_crowns(leaves, top);
  const present = leaves.filter(([x, y, z]) => world.has(key(x, y, z)));
  const orphans = present.filter(([lx, ly, lz]) =>
    !logs.some(([gx, gy, gz]) => Math.abs(gx - lx) <= leaf_r && Math.abs(gz - lz) <= leaf_r && gy <= ly + 1 && gy >= ly - leaf_below));
  if (!orphans.length) return;
  const centre = new THREE.Vector3();
  for (const [x, y, z] of orphans) {
    const type = world.get(key(x, y, z)).type;
    centre.x += x; centre.y += y; centre.z += z;
    set_blk(x, y, z, 0);
    chips(x, y, z, type, 2, 0.7);
  }
  centre.multiplyScalar(1 / orphans.length);
  play_snd('leaf', 1, decay_vol, false, { at: centre, voice: 'leafdecay' });
}

const falling = [];
function drop_group(members, opts = {}) {
  for (const m of members) {
    m.mesh = new THREE.Mesh(cube_geo, blks[m.type].mats);
    m.mesh.position.set(m.x, m.y, m.z);
    scene.add(m.mesh);
  }
  falling.push({ members, oy: 0, vy: 0, drop: opts.drop ?? null });
}
function howfardown(g) {
  let limit = -Infinity;
  for (const m of g.members) {
    let c = Math.floor(m.y + g.oy - 0.001);
    while (c >= world_bot && !solid_k(key(m.x, c, m.z))) c--;
    limit = Math.max(limit, (c < world_bot ? world_bot : c + 1) - m.y);
  }
  return limit;
}
const fall_dmg = 0.5;
const wt_of = type => blks[type].name === 'leaf' ? 0 : (break_t[blks[type].name] ?? break_def);
const overlaps = (cx, cy, cz, px, py, pz, half, height) =>
  Math.abs(cx - px) < 0.5 + half && Math.abs(cz - pz) < 0.5 + half && cy + 0.5 > py && cy - 0.5 < py + height;
function squish(type, cx, cy, cz, speed) {
  const hit_plr = overlaps(cx, cy, cz, player.pos.x, player.pos.y, player.pos.z, plr_half, plr_h);
  const hit_mobs = mobs.filter(m => !m.dead && !m.fate && m.parts.head.alive && overlaps(cx, cy, cz, m.pos.x, m.pos.y + m.rig.position.y * m.size, m.pos.z, 0.4 * m.size, plr_h * m.size));
  if (!hit_plr && !hit_mobs.length) return 'none';
  const w = wt_of(type);
  if (w === 0) return 'broken';
  const damage = Math.max(1, Math.round(w * speed * fall_dmg));
  let killed = false;
  if (hit_plr) {
    killed = damage >= player.hp;
    player.invuln = 0;
    hurt_plr(killed ? player.hp : damage);
  }
  for (const m of hit_mobs) {
    if (damage >= m.parts.head.hp * 2) { wreck_part(m, 'head', { brain: true }); killed = true; }
    else hurt_part(m, 'head', damage / 2);
  }
  return killed ? 'killed' : 'broken';
}
function drop_member(m, y) {
  const drop_id = drop_of(m.type);
  if (drop_id) spawn_drop(drop_id, m.x, y, m.z);
}

export function tick_falling(dt) {
  for (let i = falling.length - 1; i >= 0; i--) {
    const g = falling[i];
    g.vy -= grav * dt;
    const next = g.oy + g.vy * dt;
    const stop = g.drop !== null ? -g.drop : howfardown(g);
    if (next > stop) {
      g.oy = next;
      for (let k = g.members.length - 1; k >= 0; k--) {
        const m = g.members[k], cy = m.y + g.oy;
        m.mesh.position.y = cy;
        if (squish(m.type, m.x, cy, m.z, Math.abs(g.vy)) === 'broken') {
          scene.remove(m.mesh);
          g.members.splice(k, 1);
          chips(m.x, cy, m.z, m.type, 6, 0.6);
          drop_member(m, Math.round(cy));
        }
      }
      if (!g.members.length) falling.splice(i, 1);
      continue;
    }
    falling.splice(i, 1);
    const dy = Math.min(0, Math.round(stop));
    const centre = new THREE.Vector3();
    for (const m of g.members) {
      scene.remove(m.mesh);
      const y = m.y + dy;
      centre.x += m.x; centre.y += y; centre.z += m.z;
      if (squish(m.type, m.x, y, m.z, Math.abs(g.vy)) === 'broken') { drop_member(m, y); continue; }
      const there = world.get(key(m.x, y, m.z));
      if (there && !blks[there.type].plant) { drop_member(m, y); continue; }
      if (there) set_blk(m.x, y, m.z, 0);
      set_blk(m.x, y, m.z, m.type);
      const e = world.get(key(m.x, y, m.z));
      if (m.entry) for (const f of ['tree', 'tx', 'tz', 'rel']) if (m.entry[f] !== undefined) e[f] = m.entry[f];
    }
    centre.multiplyScalar(1 / g.members.length);
    play_snd(blks[g.members[0].type].name, 0.9, 0.4, false, { at: centre, voice: 'blockland', cooldown: 70 });
    settle(Math.round(centre.x), Math.round(centre.z));
  }
}
