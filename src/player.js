import * as THREE from 'three';
import { spawn_pt } from './gen.js';
import { key, solid_k } from './world.js';

export const max_hp = 20;
export const player = { pos: spawn_pt.clone(), vel: new THREE.Vector3(), on_ground: false, kb: new THREE.Vector3(), hp: max_hp, invuln: 0, flash_t: 0, shake: 0 };
export const plr_half = 0.3, plr_h = 1.8, eye_h = 1.62;

export function box_hits(p, half, height) {
  for (let x = Math.floor(p.x - half + 0.5); x <= Math.floor(p.x + half + 0.5); x++)
    for (let y = Math.floor(p.y + 0.5); y <= Math.floor(p.y + height + 0.5); y++)
      for (let z = Math.floor(p.z - half + 0.5); z <= Math.floor(p.z + half + 0.5); z++)
        if (solid_k(key(x, y, z))) return true;
  return false;
}
export const collides = p => box_hits(p, plr_half, plr_h);

export const eye_pos = new THREE.Vector3(), look_dir = new THREE.Vector3();
export const invuln_t = 0.6, plr_kb = 7, plr_hop = 5;
export const ouch_vol = 0.5, eugh_vol = 0.55, ouch_cd = 1000;
export const arm = { t: 1 };

export const walk_spd = 5, jump_v = 8.5;
