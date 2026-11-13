import * as THREE from 'three';
import { blks } from './blocks.js';
import { ui_open } from './craft.js';
import { lock_mouse, scene } from './gfx.js';
import { pick_slot, held_blk, throw_one, use_one } from './hud.js';
import { mining, rustle, stop_mining } from './mining.js';
import { punch_reach, punch_mob, ray_mobs } from './mob.js';
import { arm, collides, eye_pos, look_dir, player } from './player.js';
import { audio, play_snd } from './sound.js';
import { settle } from './support.js';
import { ray_blocks, set_blk, solid_at } from './world.js';

export let yaw = 0, pitch = 0;
export const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (/^Digit[1-9]$/.test(e.code)) pick_slot(+e.code.slice(5) - 1);
  if (e.code === 'KeyQ' && document.pointerLockElement && !e.repeat) throw_one();
  if (e.code === 'F5' && document.pointerLockElement) { e.preventDefault(); view = (view + 1) % 3; }
});
addEventListener('keyup', e => keys[e.code] = false);

export const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => {
  audio.resume();
  lock_mouse();
});
document.addEventListener('pointerlockchange', () => {
  stop_mining();
  overlay.style.display = (document.pointerLockElement || ui_open) ? 'none' : 'block';
});
document.addEventListener('mousemove', e => {
  if (!document.pointerLockElement) return;

  if (Math.abs(e.movementX) > 200 || Math.abs(e.movementY) > 200) return;
  yaw -= e.movementX * 0.0025;
  pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch - e.movementY * 0.0025));
});

export let view = 0;

export const sel_box = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0x000000, fog: false })
);
sel_box.visible = false;
scene.add(sel_box);
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('mouseup', e => { if (e.button === 0) stop_mining(); });
document.addEventListener('mousedown', e => {
  if (!document.pointerLockElement) return;
  arm.t = 0;
  const hit = ray_blocks(eye_pos, look_dir, 6);
  if (e.button === 0) {
    const mob = ray_mobs(eye_pos, look_dir, punch_reach);
    if (mob && (!hit || mob.dist < hit.dist)) {
      const now = performance.now();
      if (now - last_punch >= punch_cd_ms) { last_punch = now; punch_mob(mob.m, mob.part, eye_pos.clone().addScaledVector(look_dir, mob.dist)); }
      return;
    }
    mining.on = true;
    return;
  }
  if (!hit) return;
  const { x, y, z, normal } = hit;
  if (e.button === 2) {
    if (!normal.some(Boolean)) return;
    if (held_blk === null) return;
    const nx = x + normal[0], ny = y + normal[1], nz = z + normal[2];
    if (blks[held_blk].plant && !solid_at(nx, ny - 1, nz)) return;
    set_blk(nx, ny, nz, held_blk);
    if (collides(player.pos)) set_blk(nx, ny, nz, 0);
    else {
      if (blks[held_blk].plant) rustle(new THREE.Vector3(nx, ny, nz));
      else play_snd(blks[held_blk].name, 1, 1, false, { at: new THREE.Vector3(nx, ny, nz) });
      use_one();
      settle(nx, nz);
    }
  }
});

const punch_cd_ms = 500;
let last_punch = -Infinity;
