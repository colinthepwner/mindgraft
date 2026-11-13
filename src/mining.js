import * as THREE from 'three';
import { blks, break_def, break_t, drop_of } from './blocks.js';
import { spawn_drop } from './drops.js';
import { chip_cnt, chips } from './fx.js';
import { scene } from './gfx.js';
import { arm, eye_pos, look_dir } from './player.js';
import { play_snd } from './sound.js';
import { settle } from './support.js';
import { key, set_blk, solid_at, world } from './world.js';

const dig_reach = 3.5;
const crack_max = 0.7;
const mine_tick = 0.28;
const break_pitch = 1.0, break_vol = 0.5;
const dig_pitch = 1.15, dig_vol = 0.3;
export const mining = { on: false, active: false, x: 0, y: 0, z: 0, progress: 0, tick: 0 };
const crack_box = new THREE.Mesh(
  new THREE.BoxGeometry(1.004, 1.004, 1.004),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false })
);
crack_box.visible = false;
crack_box.renderOrder = 2;
scene.add(crack_box);
export function stop_mining() {
  mining.on = false; mining.active = false; mining.progress = 0;
  crack_box.visible = false;
}
const plant_pitch = 1.3, plant_vol = 0.3;
export function rustle(at) {
  for (const name of ['grass', 'leaf']) play_snd(name, plant_pitch, plant_vol, false, { at, voice: 'plant-' + name, cooldown: 90 });
}
export function pop_plant(x, y, z) {
  const b = world.get(key(x, y + 1, z));
  if (b && blks[b.type].plant && !solid_at(x, y, z)) break_blk(x, y + 1, z);
}
function aim_pt(target) { return eye_pos.clone().addScaledVector(look_dir, target.dist); }
function break_blk(x, y, z, target = null) {
  const type = world.get(key(x, y, z))?.type;
  if (!type) return;
  const plant = blks[type].plant, at = new THREE.Vector3(x, y, z);
  if (plant) rustle(at);
  else play_snd(blks[type].name, break_pitch, break_vol, false, { at, voice: 'blockbreak', cooldown: 90 });
  if (plant) chips(x, y, z, type, chip_cnt, 0.5);
  else if (target) { const c = aim_pt(target); chips(c.x, c.y, c.z, type, chip_cnt, 0.3, target.normal); }
  else chips(x, y, z, type);
  set_blk(x, y, z, 0);
  const drop_id = drop_of(type);
  if (drop_id) spawn_drop(drop_id, x, y, z);
  if (!plant) settle(x, z);
  pop_plant(x, y, z);
}
export function tick_mining(dt, target) {
  if (!mining.on || !target || target.dist > dig_reach) { mining.active = false; mining.progress = 0; crack_box.visible = false; return; }
  if (!mining.active || mining.x !== target.x || mining.y !== target.y || mining.z !== target.z) {
    Object.assign(mining, { active: true, x: target.x, y: target.y, z: target.z, progress: 0, tick: 0 });
  }
  const type = world.get(key(target.x, target.y, target.z))?.type;
  if (!type) { stop_mining(); mining.on = true; return; }
  mining.progress += dt / (blks[type].plant ? 0.001 : (break_t[blks[type].name] ?? break_def));
  if (arm.t >= 1) arm.t = 0;
  mining.tick -= dt;
  if (mining.tick <= 0) {
    mining.tick = mine_tick;
    play_snd(blks[type].name, dig_pitch, dig_vol, false, { at: new THREE.Vector3(target.x, target.y, target.z), voice: 'minehit', cooldown: mine_tick * 900 });
    const c = aim_pt(target);
    chips(c.x, c.y, c.z, type, 4, 0.12, target.normal);
  }
  if (mining.progress >= 1) {
    break_blk(target.x, target.y, target.z, target);
    mining.active = false; mining.progress = 0; crack_box.visible = false;
    return;
  }
  crack_box.visible = true;
  crack_box.position.set(target.x, target.y, target.z);
  crack_box.material.opacity = crack_max * mining.progress;
}
