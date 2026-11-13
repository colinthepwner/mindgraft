import * as THREE from 'three';
import { base_id, blks, cube_geo, card_geo } from './blocks.js';
import { camera, scene } from './gfx.js';
import { held_blk } from './hud.js';
import { pitch, view, yaw } from './input.js';
import { head_yaw_max, wrap_a } from './mob.js';
import { mpx, build_mob, swing_limbs } from './mob_model.js';
import { arm, player } from './player.js';

const skin_img = await new Promise(resolve => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => { console.warn('could not load skin'); resolve(null); };
  img.src = 'skins/player.png';
});
const skin_w = skin_img?.width ?? 64, skin_h = skin_img?.height ?? 64;
const new_skin = skin_h >= 64;
let skin_mat = null, skin_over = null;
if (skin_img) {
  const tex = new THREE.Texture(skin_img);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  skin_mat = new THREE.MeshBasicMaterial({ map: tex });
  skin_over = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1 });
}
function box_uv(geom, u, v, w, h, d, mirror = false) {
  const rect = (x, y, rw, rh) => [x / skin_w, 1 - y / skin_h, (x + rw) / skin_w, 1 - (y + rh) / skin_h];
  const f = {
    px: rect(u + d + w, v + d, d, h), nx: rect(u, v + d, d, h),
    py: rect(u + d, v, w, d), ny: rect(u + d + w, v, w, d),
    pz: rect(u + d, v + d, w, h), nz: rect(u + 2 * d + w, v + d, w, h),
  };
  if (mirror) {
    [f.px, f.nx] = [f.nx, f.px];
    for (const k in f) [f[k][0], f[k][2]] = [f[k][2], f[k][0]];
  }
  const uv = geom.attributes.uv;
  ['px', 'nx', 'py', 'ny', 'pz', 'nz'].forEach((k, face) => {
    const [u0, vt, u1, vb] = f[k], a = face * 4;
    uv.setXY(a, u0, vt); uv.setXY(a + 1, u1, vt); uv.setXY(a + 2, u0, vb); uv.setXY(a + 3, u1, vb);
  });
  uv.needsUpdate = true;
}
function skin_limb(w, h, d, x, pivot_y, centre_off, base, over, mirror = false) {
  const pivot = new THREE.Group();
  pivot.position.set(x * mpx, pivot_y * mpx, 0);
  const g = new THREE.BoxGeometry(w * mpx, h * mpx, d * mpx);
  box_uv(g, base[0], base[1], w, h, d, mirror);
  const mesh = new THREE.Mesh(g, skin_mat);
  mesh.position.y = centre_off * mpx;
  pivot.add(mesh);
  if (over) {
    const og = new THREE.BoxGeometry((w + 1) * mpx, (h + 1) * mpx, (d + 1) * mpx);
    box_uv(og, over[0], over[1], w, h, d, mirror);
    const om = new THREE.Mesh(og, skin_over);
    om.position.y = centre_off * mpx;
    pivot.add(om);
  }
  return pivot;
}
function build_me() {
  const root = new THREE.Group(), rig = new THREE.Group();
  const head = skin_limb(8, 8, 8, 0, 24, 4, [0, 0], [32, 0]);
  const body = skin_limb(8, 12, 4, 0, 24, -6, [16, 16], new_skin ? [16, 32] : null);
  const arm_l = skin_limb(4, 12, 4, -6, 24, -6, [40, 16], new_skin ? [40, 32] : null);
  const arm_r = skin_limb(4, 12, 4, 6, 24, -6, new_skin ? [32, 48] : [40, 16], new_skin ? [48, 48] : null, !new_skin);
  const leg_l = skin_limb(4, 12, 4, -2, 12, -6, [0, 16], new_skin ? [0, 32] : null);
  const leg_r = skin_limb(4, 12, 4, 2, 12, -6, new_skin ? [16, 48] : [0, 16], new_skin ? [0, 48] : null, !new_skin);
  rig.add(head, body, arm_l, arm_r, leg_l, leg_r);
  root.add(rig);
  scene.add(root);
  return { root, rig, body, arm_l, arm_r, leg_l, leg_r, head };
}

export const me = skin_mat ? build_me() : build_mob();
Object.assign(me, { yaw: 0, head_yaw: 0, head_pitch: 0, phase: 0, swing: 0 });
me.root.visible = false;
const last_pos = new THREE.Vector3();
last_pos.copy(player.pos);

export function tick_me(dt) {
  const m = me;
  const moved = Math.hypot(player.pos.x - last_pos.x, player.pos.z - last_pos.z);
  last_pos.copy(player.pos);

  const look = yaw + Math.PI;
  const off = wrap_a(look - m.yaw);
  if (moved > 0.0001) m.yaw += off * Math.min(1, dt * 10);
  else if (Math.abs(off) > 1.0) m.yaw += (off - Math.sign(off) * 1.0) * Math.min(1, dt * 10);
  m.head_yaw = THREE.MathUtils.clamp(wrap_a(look - m.yaw), -head_yaw_max, head_yaw_max);
  m.head_pitch = -pitch;
  m.head.rotation.set(m.head_pitch, m.head_yaw, 0, 'YXZ');
  swing_limbs(m, moved, dt, 2);
  m.root.position.copy(player.pos);
  m.root.rotation.y = m.yaw;
}

const held_fp = new THREE.Mesh(cube_geo, blks[base_id].mats);
held_fp.scale.setScalar(0.44);
held_fp.renderOrder = 999;
camera.add(held_fp);

const hand_mat = new THREE.MeshBasicMaterial({ color: 0x050505, depthTest: false, transparent: true });
const hand_fp = new THREE.Group();
const hand_skin = !!skin_mat;
let hand_arm;
if (hand_skin) {
  const hg = new THREE.BoxGeometry(1, 1, 1);
  box_uv(hg, 40, 16, 4, 12, 4);
  const hm = skin_mat.clone(); hm.depthTest = false; hm.transparent = true;
  hand_arm = new THREE.Mesh(hg, hm);
  hand_arm.rotation.x = Math.PI / 2;
} else hand_arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1), hand_mat);
hand_arm.position.z = -0.5;
hand_arm.renderOrder = 999;
hand_fp.add(hand_arm);
camera.add(hand_fp);
const hand_def = { sx: 0.52, sy: -0.62, sz: -0.5, fx: 0.18, fy: 0.24, fz: -0.1, w: 0.22 };

const hand_editor = false;
const hand = { ...hand_def };
if (hand_editor) { try { Object.assign(hand, JSON.parse(localStorage.getItem('mindgraft.hand') ?? '{}')); } catch {} }
const shoulder = new THREE.Vector3(), fist = new THREE.Vector3(), hand_dir = new THREE.Vector3(), fwd = new THREE.Vector3(0, 0, -1);

const held_tp = new THREE.Mesh(cube_geo, blks[base_id].mats);
held_tp.scale.setScalar(0.3);
held_tp.position.set(0, -12 * mpx - 0.02, 0.2);
me.arm_l.add(held_tp);

const fp_mats = {};
let held_id;
function sync_held() {
  if (held_id === held_blk) return;
  held_id = held_blk;
  if (held_blk === null) return;
  const def = blks[held_blk], plant = def.plant;
  held_fp.geometry = held_tp.geometry = plant ? card_geo : cube_geo;
  held_fp.scale.setScalar(plant ? 0.75 : 0.44);
  held_tp.scale.setScalar(plant ? 0.5 : 0.3);
  held_tp.material = plant ? def.mats[0] : def.mats;
  const fp = fp_mats[held_blk] ??= def.mats.map(m => { const c = m.clone(); c.depthTest = false;

    c.transparent = true; return c; });
  held_fp.material = plant ? fp[0] : fp;
}
export const bob_pace = 0.7;
let prev_yaw = 0, prev_pitch = 0, lag_x = 0, lag_y = 0;
const lag_turn = 0.015, lag_fall = 0.003, lag_max = 0.05;
export let dip = 0, dip_v = 0, cam_roll = 0;
const land_kick = 0.15, land_max = 3.0, jump_kick = 0.5, lean = 0.003;
export function cam_land(impact) { if (impact > 3) dip_v = -Math.min(land_max, impact * land_kick); }
export function cam_hop() { dip_v = jump_kick; }
export function tick_cam_feel(dt) {
  const acc = -120 * dip - 16 * dip_v;
  dip_v += acc * dt;
  dip += dip_v * dt;
  const right = player.vel.x * Math.cos(yaw) - player.vel.z * Math.sin(yaw);
  cam_roll += (-right * lean - cam_roll) * Math.min(1, dt * 8);
}
export function tick_held(dt) {
  sync_held();
  if (dt > 0) {
    const yaw_rate = wrap_a(yaw - prev_yaw) / dt, pitch_rate = (pitch - prev_pitch) / dt;
    prev_yaw = yaw; prev_pitch = pitch;
    const clamp = v => Math.max(-lag_max, Math.min(lag_max, v));
    const tx = clamp(yaw_rate * lag_turn), ty = clamp(-pitch_rate * lag_turn - player.vel.y * lag_fall);
    lag_x += (tx - lag_x) * Math.min(1, dt * 8);
    lag_y += (ty - lag_y) * Math.min(1, dt * 8);
  }
  arm.t = Math.min(1, arm.t + dt * 3.5);
  const t = arm.t, sq = Math.sqrt(t);
  const act = Math.sin(sq * Math.PI);
  const scoop_y = Math.sin(sq * Math.PI * 2);
  const push = Math.sin(t * Math.PI);
  const twist = Math.sin(t * t * Math.PI);
  const bob = Math.sin(me.phase) * 0.3;
  held_fp.visible = view === 0 && held_blk !== null;
  hand_fp.visible = view === 0 && held_blk === null;
  held_tp.visible = held_blk !== null;
  const k = me.swing / 0.6, ph = me.phase * bob_pace;
  const sway_x = Math.sin(ph) * 0.045 * k, sway_y = -(Math.cos(ph) ** 2) * 0.045 * k;
  held_fp.position.set(0.46 + sway_x + lag_x - act * 0.4, -0.5 + sway_y + lag_y + scoop_y * 0.22, -0.72 - push * 0.3);
  held_fp.rotation.set(0.25 - act * 1.3, -0.55 + twist * 0.5, -act * 0.35);
  shoulder.set(hand.sx + sway_x + lag_x, hand.sy + sway_y + lag_y, hand.sz);
  fist.set(held_fp.position.x + hand.fx, held_fp.position.y + hand.fy, held_fp.position.z + hand.fz);
  if (hand_skin) hand_arm.scale.set(hand.w, 1, hand.w); else hand_arm.scale.set(hand.w / 0.15, hand.w / 0.15, 1);
  hand_dir.copy(fist).sub(shoulder);
  const hand_len = hand_dir.length();
  hand_fp.position.copy(shoulder);
  hand_fp.quaternion.setFromUnitVectors(fwd, hand_dir.normalize());
  hand_fp.scale.set(1, 1, hand_len);
  me.arm_l.rotation.x -= act * 2.6;
}

let hand_edit = false;
const hand_panel = document.createElement('pre');
Object.assign(hand_panel.style, {
  position: 'fixed', left: '8px', top: '8px', margin: '0', padding: '6px 8px', display: 'none', zIndex: 20,
  font: '12px/1.35 monospace', color: '#fff', background: 'rgba(0,0,0,.6)', pointerEvents: 'none', whiteSpace: 'pre',
});
document.body.appendChild(hand_panel);
function hand_readout() {
  const f = v => (v >= 0 ? ' ' : '') + v.toFixed(2);
  hand_panel.textContent = [
    'HAND EDITOR  (F8 closes)',
    `fist     x ${f(hand.fx)}  y ${f(hand.fy)}  z ${f(hand.fz)}`,
    `shoulder x ${f(hand.sx)}  y ${f(hand.sy)}  z ${f(hand.sz)}`,
    `thickness  ${hand.w.toFixed(2)}`,
    'arrows: fist x/y   , . : fist z   Shift: shoulder',
    '[ ] thickness   P copy   0 reset',
  ].join(String.fromCharCode(10));
}
addEventListener('keydown', e => {
  if (hand_editor && e.code === 'F8' && document.pointerLockElement) {
    e.preventDefault();
    hand_edit = !hand_edit;
    hand_panel.style.display = hand_edit ? 'block' : 'none';
    if (hand_edit) hand_readout();
    return;
  }
  if (!hand_edit) return;
  const k = e.shiftKey ? 's' : 'f', step = 0.02;
  let used = true;
  switch (e.code) {
    case 'ArrowLeft':  hand[k + 'x'] -= step; break;
    case 'ArrowRight': hand[k + 'x'] += step; break;
    case 'ArrowUp':    hand[k + 'y'] += step; break;
    case 'ArrowDown':  hand[k + 'y'] -= step; break;
    case 'Comma':      hand[k + 'z'] += step; break;
    case 'Period':     hand[k + 'z'] -= step; break;
    case 'BracketLeft':  hand.w = Math.max(0.04, hand.w - 0.01); break;
    case 'BracketRight': hand.w += 0.01; break;
    case 'Digit0': Object.assign(hand, hand_def); break;
    case 'KeyP': {
      const text = JSON.stringify(Object.fromEntries(Object.entries(hand).map(([n, v]) => [n, +v.toFixed(3)])));
      navigator.clipboard?.writeText(text).catch(() => {});
      console.log('hand', text);
      break;
    }
    default: used = false;
  }
  if (!used) return;
  e.preventDefault(); e.stopImmediatePropagation();
  try { localStorage.setItem('mindgraft.hand', JSON.stringify(hand)); } catch {}
  hand_readout();
}, true);
