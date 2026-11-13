import * as THREE from 'three';
import { blks, blk_ids, dirt_id } from './blocks.js';
import { scene } from './gfx.js';

export const world = new Map();
export const key = (x, y, z) => `${x},${y},${z}`;
export const solid_k = k => { const b = world.get(k); return !!b && !blks[b.type].plant; };
export const solid_at = (x, y, z) => solid_k(key(x, y, z));
export const dirt_keys = new Set();
export const world_bot = -16;

for (const id of blk_ids) blks[id].see_thru = blks[id].mats.some(m => m.transparent);
const nbrs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

const face_defs = [
  { dir: [-1, 0, 0], mat: 1, corners: [{ p: [0, 1, 0], uv: [0, 1] }, { p: [0, 0, 0], uv: [0, 0] }, { p: [0, 1, 1], uv: [1, 1] }, { p: [0, 0, 1], uv: [1, 0] }] },
  { dir: [1, 0, 0],  mat: 0, corners: [{ p: [1, 1, 1], uv: [0, 1] }, { p: [1, 0, 1], uv: [0, 0] }, { p: [1, 1, 0], uv: [1, 1] }, { p: [1, 0, 0], uv: [1, 0] }] },
  { dir: [0, -1, 0], mat: 3, corners: [{ p: [1, 0, 1], uv: [1, 0] }, { p: [0, 0, 1], uv: [0, 0] }, { p: [1, 0, 0], uv: [1, 1] }, { p: [0, 0, 0], uv: [0, 1] }] },
  { dir: [0, 1, 0],  mat: 2, corners: [{ p: [0, 1, 1], uv: [1, 1] }, { p: [1, 1, 1], uv: [0, 1] }, { p: [0, 1, 0], uv: [1, 0] }, { p: [1, 1, 0], uv: [0, 0] }] },
  { dir: [0, 0, -1], mat: 5, corners: [{ p: [1, 0, 0], uv: [0, 0] }, { p: [0, 0, 0], uv: [1, 0] }, { p: [1, 1, 0], uv: [0, 1] }, { p: [0, 1, 0], uv: [1, 1] }] },
  { dir: [0, 0, 1],  mat: 4, corners: [{ p: [0, 0, 1], uv: [0, 0] }, { p: [1, 0, 1], uv: [1, 0] }, { p: [0, 1, 1], uv: [0, 1] }, { p: [1, 1, 1], uv: [1, 1] }] },
];
export const chunk_sz = 16;
const chunk_meshes = new Map();
export const dirty = new Set();

const light_step = 0.16, min_light = 0.2;
export const col_top = new Map();

function shade_at(x, y, z) {
  const top = col_top.get(`${x},${z}`) ?? world_bot - 1;
  let depth = 0;
  for (let yy = y + 1; yy <= top; yy++) {
    const b = world.get(key(x, yy, z));
    if (b) depth += blks[b.type].see_thru ? 0.5 : 1;
  }
  return Math.max(min_light, 1 - depth * light_step);
}

export const min_cy = Math.floor(world_bot / chunk_sz);

function mark_dirty(x, y, z) {
  const top_cy = Math.floor(Math.max(y, col_top.get(`${x},${z}`) ?? y) / chunk_sz);
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]])
    for (let cy = min_cy; cy <= top_cy; cy++)
      dirty.add(key(Math.floor((x + dx) / chunk_sz), cy, Math.floor((z + dz) / chunk_sz)));
}

function build_chunk(cx, cy, cz) {
  const ck = key(cx, cy, cz);
  for (const m of chunk_meshes.get(ck) ?? []) { scene.remove(m); m.geometry.dispose(); }
  chunk_meshes.delete(ck);

  const buffers = new Map();
  for (let x = cx * chunk_sz; x < (cx + 1) * chunk_sz; x++)
    for (let y = cy * chunk_sz; y < (cy + 1) * chunk_sz; y++)
      for (let z = cz * chunk_sz; z < (cz + 1) * chunk_sz; z++) {
        const b = world.get(key(x, y, z));
        if (!b) continue;
        if (blks[b.type].plant) {
          const mat = blks[b.type].mats[0];
          let buf = buffers.get(mat);
          if (!buf) buffers.set(mat, buf = { pos: [], nor: [], uv: [], col: [], idx: [] });
          const shade = shade_at(x, y, z);
          for (const [x0, z0, x1, z1] of [[-0.5, -0.5, 0.5, 0.5], [0.5, -0.5, -0.5, 0.5]]) {
            const base = buf.pos.length / 3;
            buf.pos.push(x + x0, y - 0.5, z + z0, x + x1, y - 0.5, z + z1, x + x0, y + 0.5, z + z0, x + x1, y + 0.5, z + z1);
            for (let k = 0; k < 4; k++) { buf.nor.push(0, 1, 0); buf.col.push(shade, shade, shade); }
            buf.uv.push(0, 0, 1, 0, 0, 1, 1, 1);
            buf.idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
          }
          continue;
        }
        for (const f of face_defs) {
          const [dx, dy, dz] = f.dir;
          if (y + dy < world_bot) continue;
          const n = world.get(key(x + dx, y + dy, z + dz));
          if (n && (!blks[n.type].see_thru || n.type === b.type)) continue;
          const mat = blks[b.type].mats[f.mat];
          let buf = buffers.get(mat);
          if (!buf) buffers.set(mat, buf = { pos: [], nor: [], uv: [], col: [], idx: [] });
          const base = buf.pos.length / 3;
          const shade = shade_at(x + dx, y + dy, z + dz);
          for (const c of f.corners) {
            buf.pos.push(x - 0.5 + c.p[0], y - 0.5 + c.p[1], z - 0.5 + c.p[2]);
            buf.nor.push(dx, dy, dz);
            buf.uv.push(c.uv[0], c.uv[1]);
            buf.col.push(shade, shade, shade);
          }
          buf.idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
        }
      }

  const out = [];
  for (const [mat, buf] of buffers) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
    g.setIndex(buf.idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    scene.add(mesh);
    out.push(mesh);
  }
  chunk_meshes.set(ck, out);
}

export function remesh() {
  for (const ck of dirty) build_chunk(...ck.split(',').map(Number));
  dirty.clear();
}

export function set_blk(x, y, z, type) {
  const k = key(x, y, z);
  world.delete(k);
  dirt_keys.delete(k);
  const ck = `${x},${z}`, top = col_top.get(ck) ?? world_bot - 1;
  if (type) {
    world.set(k, { type });
    if (type === dirt_id) dirt_keys.add(k);
    if (y > top) col_top.set(ck, y);
  } else if (y === top) {
    let t = y - 1;
    while (t >= world_bot && !world.has(key(x, t, z))) t--;
    col_top.set(ck, t);
  }
  mark_dirty(x, y, z);
}

export function ray_blocks(origin, dir, max_d) {
  let x = Math.round(origin.x), y = Math.round(origin.y), z = Math.round(origin.z);
  const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
  const dX = sx ? 1 / Math.abs(dir.x) : Infinity;
  const dY = sy ? 1 / Math.abs(dir.y) : Infinity;
  const dZ = sz ? 1 / Math.abs(dir.z) : Infinity;
  let tX = sx ? (x + sx * 0.5 - origin.x) / dir.x : Infinity;
  let tY = sy ? (y + sy * 0.5 - origin.y) / dir.y : Infinity;
  let tZ = sz ? (z + sz * 0.5 - origin.z) / dir.z : Infinity;
  let normal = [0, 0, 0], t = 0;
  while (t <= max_d) {
    if (world.has(key(x, y, z))) return { x, y, z, normal, dist: t };
    if (tX < tY && tX < tZ) { t = tX; x += sx; tX += dX; normal = [-sx, 0, 0]; }
    else if (tY < tZ)       { t = tY; y += sy; tY += dY; normal = [0, -sy, 0]; }
    else                    { t = tZ; z += sz; tZ += dZ; normal = [0, 0, -sz]; }
  }
  return null;
}

export const grav = 28;
