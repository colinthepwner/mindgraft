import * as THREE from 'three';
import { blks, cube_geo, card_geo } from './blocks.js';
import { scene } from './gfx.js';
import { add_item, can_add } from './hud.js';
import { player } from './player.js';
import { play_snd } from './sound.js';
import { grav, key, solid_k } from './world.js';

const drops = [];
const blink_t = 0.7, blink_t_dying = 0.18, blink_glow = 0.55;
const push_spd = 3;
const pop_pitch = [0.85, 1.45];
const card_scale = 0.5;
const drop_scale = 0.28, hover = 0.4, drop_life = 60, pickup_delay = 0.6, pickup_r = 1.6, magnet_spd = 9;
export function spawn_drop(id, x, y, z, opts = {}) {
  const cache = new Map();
  const mats = blks[id].mats.map(m => { if (!cache.has(m)) cache.set(m, m.clone()); return cache.get(m); });
  const plant = blks[id].plant;
  const mesh = new THREE.Mesh(plant ? card_geo : cube_geo, plant ? mats[0] : mats);
  mesh.scale.setScalar(plant ? card_scale : drop_scale);
  scene.add(mesh);
  drops.push({
    id, mesh, mats: [...cache.values()], age: 0, grounded: false, magnet: false,
    pos: new THREE.Vector3(x, y, z),
    vel: opts.vel ?? new THREE.Vector3((Math.random() - 0.5) * 1.6, 2.5 + Math.random(), (Math.random() - 0.5) * 1.6),
    pick_delay: opts.delay ?? pickup_delay,
    phase: Math.random() * Math.PI * 2,
  });
}
function kill_drop(i) {
  scene.remove(drops[i].mesh);
  for (const m of drops[i].mats) m.dispose();
  drops.splice(i, 1);
}
export function tick_drops(dt) {
  const centre = new THREE.Vector3(player.pos.x, player.pos.y + 0.9, player.pos.z);
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.age += dt;
    if (d.age >= drop_life || d.pos.y < -40) { kill_drop(i); continue; }
    const dist = d.pos.distanceTo(centre);
    if (!d.magnet && d.age > d.pick_delay && dist < pickup_r && can_add(d.id)) d.magnet = true;
    if (d.magnet) {
      if (!can_add(d.id)) { d.magnet = false; d.grounded = false; d.vel.set(0, 1, 0); }
      else {
        const toward = centre.clone().sub(d.pos);
        if (dist < 0.45) { add_item(d.id); play_snd('pop', pop_pitch[0] + Math.random() * (pop_pitch[1] - pop_pitch[0]), 0.6, false, { at: d.pos.clone() }); kill_drop(i); continue; }
        d.pos.addScaledVector(toward.normalize(), Math.min(dist, magnet_spd * dt));
      }
    } else if (solid_k(key(Math.round(d.pos.x), Math.round(d.pos.y), Math.round(d.pos.z)))) {
      const ex = Math.round(d.pos.x), ey = Math.round(d.pos.y), ez = Math.round(d.pos.z);
      const tx = player.pos.x - d.pos.x, tz = player.pos.z - d.pos.z, tl = Math.hypot(tx, tz) || 1;
      const exits = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort((a, b) => (b[0] * tx + b[1] * tz) / tl - (a[0] * tx + a[1] * tz) / tl);
      const open = exits.find(([dx, dz]) => !solid_k(key(ex + dx, ey, ez + dz)));
      d.grounded = false; d.vel.set(0, 0, 0);
      if (open) { d.pos.x += open[0] * push_spd * dt; d.pos.z += open[1] * push_spd * dt; }
    } else {

      let rest_y = null;
      for (let yy = Math.round(d.pos.y - hover - 0.5), n = 0; n < 6; yy--, n++)
        if (solid_k(key(Math.round(d.pos.x), yy, Math.round(d.pos.z)))) { rest_y = yy + 0.5 + hover; break; }
      if (rest_y !== null && d.pos.y <= rest_y + 0.02 && d.vel.y <= 0) {
        d.grounded = true; d.vel.set(0, 0, 0); d.pos.y = rest_y;
      } else {
        d.grounded = false;
        d.vel.y -= grav * 0.6 * dt;
        d.vel.x *= Math.max(0, 1 - dt * 2); d.vel.z *= Math.max(0, 1 - dt * 2);
        if (solid_k(key(Math.round(d.pos.x + d.vel.x * dt), Math.round(d.pos.y), Math.round(d.pos.z)))) d.vel.x = 0;
        if (solid_k(key(Math.round(d.pos.x), Math.round(d.pos.y), Math.round(d.pos.z + d.vel.z * dt)))) d.vel.z = 0;
        d.pos.addScaledVector(d.vel, dt);
      }
    }
    const t = d.age + d.phase;
    d.mesh.position.set(d.pos.x, d.pos.y + (d.grounded ? Math.sin(t * 3) * 0.07 : 0), d.pos.z);
    d.mesh.rotation.y = t * 2.2;
    const period = drop_life - d.age < 5 ? blink_t_dying : blink_t;
    const flash = 0.5 - 0.5 * Math.cos(t * Math.PI * 2 / period);
    const bright = 1 + blink_glow * flash;
    for (const m of d.mats) m.color.setScalar(bright);
  }
}
