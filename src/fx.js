import * as THREE from 'three';
import { blks } from './blocks.js';
import { camera, scene } from './gfx.js';
import { key, solid_k } from './world.js';

const particles = [];
export const chip_cnt = 18, chip_life = 0.9, chip_grav = 20;
const chip_geo = new THREE.PlaneGeometry(0.14, 0.14);

const blade_px = 0.04, blade_rows = [3, 6];
function blade_geo(op) {
  const rows = blade_rows[0] + Math.floor(Math.random() * (blade_rows[1] - blade_rows[0] + 1));
  const roll = Math.random(), dir = Math.random() < 0.5 ? -1 : 1;
  const step_at = roll < 0.35 ? [] : roll < 0.75 ? [Math.ceil(rows * 0.6)] : [Math.ceil(rows * 0.4), Math.ceil(rows * 0.75)];
  const [bx, by] = op.px[Math.floor(Math.random() * op.px.length)];
  const pos = [], uv = [], idx = [];
  let offset = 0, ty = by;
  for (let r = 0; r < rows; r++) {
    if (step_at.includes(r)) offset += dir;
    if (r > 0 && op.has.has(bx + ',' + (ty - 1))) ty--;
    const x0 = offset * blade_px - blade_px / 2, y0 = (r - rows / 2) * blade_px, base = pos.length / 3;
    pos.push(x0, y0, 0, x0 + blade_px, y0, 0, x0, y0 + blade_px, 0, x0 + blade_px, y0 + blade_px, 0);
    const u0 = bx / op.w, u1 = (bx + 1) / op.w, vt = 1 - ty / op.h, vb = vt - 1 / op.h;
    uv.push(u0, vb, u1, vb, u0, vt, u1, vt);
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
const opq_cache = new Map();
function opq_px(type) {
  if (opq_cache.has(type)) return opq_cache.get(type);
  const img = blks[type].icon, c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data, px = [];
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 128) px.push([x, y]);
  const out = { w: c.width, h: c.height, px, has: new Set(px.map(([x, y]) => x + ',' + y)) };
  opq_cache.set(type, out);
  return out;
}
const slow_fall = 0.28, slow_life = 1.6;

export function chips(x, y, z, type, count = chip_cnt, spread = 0.8, normal = null) {
  const def = blks[type], blades = !!def.plant, slow = blades || def.name === 'leaf';

  const mat = def.mats[normal && !blades ? (normal[0] > 0 ? 0 : normal[0] < 0 ? 1 : normal[1] > 0 ? 2 : normal[1] < 0 ? 3 : normal[2] > 0 ? 4 : 5) : 0];
  const op = blades ? opq_px(type) : null;
  for (let i = 0; i < count; i++) {
    const px_blade = blades && op.px.length > 0;
    const geom = px_blade ? blade_geo(op) : chip_geo.clone();
    if (!px_blade) {
      const uv = geom.attributes.uv;
      const u0 = Math.floor(Math.random() * 4) / 4, v0 = Math.floor(Math.random() * 4) / 4;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * 0.25, v0 + uv.getY(k) * 0.25);
    }
    geom.setAttribute('color', new THREE.Float32BufferAttribute(new Array(geom.attributes.position.count * 3).fill(1), 3));
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread);
    if (normal && !blades) mesh.position.addScaledVector(new THREE.Vector3(...normal), 0.08);
    scene.add(mesh);
    let vel;
    if (blades) {
      vel = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(1.3 + Math.random() * 1.7);
      vel.y += 0.8;
    } else {
      vel = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
      if (normal) vel.addScaledVector(new THREE.Vector3(...normal), 1.5 + Math.random() * 1.5);
    }
    particles.push({
      mesh,
      vel,
      age: 0,
      life: chip_life * (0.7 + Math.random() * 0.6) * (slow ? slow_life : 1),
      g: slow ? slow_fall : 1,
      spin: blades ? (Math.random() - 0.5) * 6 : 0, angle: Math.random() * Math.PI,
    });
  }
}

export function tick_chips(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      particles.splice(i, 1);
      continue;
    }
    p.vel.y -= chip_grav * p.g * dt;
    if (p.g < 1) p.vel.multiplyScalar(Math.max(0, 1 - dt * 1.5));
    const next = p.mesh.position.clone().addScaledVector(p.vel, dt);
    if (solid_k(key(Math.round(next.x), Math.round(next.y), Math.round(next.z)))) {
      p.vel.set(0, 0, 0);
    } else p.mesh.position.copy(next);
    p.mesh.quaternion.copy(camera.quaternion);
    if (p.spin) p.mesh.rotateZ(p.angle + p.age * p.spin);
    p.mesh.scale.setScalar(1 - (p.age / p.life) ** 2);
  }
}

const blood = [];
const blood_cap = 400, blood_grav = 18;
const blood_geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const blood_mats = [0xc01212, 0x8e0c0c, 0xe02424].map(c => new THREE.MeshBasicMaterial({ color: c }));
export function spurt(at, count, speed, dir = null) {
  for (let i = 0; i < count && blood.length < blood_cap; i++) {
    const mesh = new THREE.Mesh(blood_geo, blood_mats[Math.floor(Math.random() * blood_mats.length)]);
    mesh.position.copy(at);
    scene.add(mesh);
    const v = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 2);
    if (dir) v.addScaledVector(dir, 2.5).normalize().multiplyScalar(0.4 + Math.random() * 0.6);
    else v.normalize();
    blood.push({ mesh, vel: v.multiplyScalar(speed * (0.5 + Math.random())), age: 0, life: 0.9 + Math.random() * 0.9, stuck: false });
  }
}
export function tick_blood(dt) {
  for (let i = blood.length - 1; i >= 0; i--) {
    const b = blood[i];
    b.age += dt;
    if (!b.stuck) {
      b.vel.y -= blood_grav * dt;
      const next = b.mesh.position.clone().addScaledVector(b.vel, dt);
      if (solid_k(key(Math.round(next.x), Math.round(next.y), Math.round(next.z)))) { b.stuck = true; b.vel.set(0, 0, 0); }
      else b.mesh.position.copy(next);
    }
    const left = b.life - b.age;
    if (left <= 0) { scene.remove(b.mesh); blood.splice(i, 1); continue; }
    b.mesh.scale.setScalar(Math.min(1, left / 0.35));
  }
}
