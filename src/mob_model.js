import * as THREE from 'three';
import { scene } from './gfx.js';
import { grav, key, solid_k } from './world.js';

export const mpx = 1.8 / 32;
const mob_mat = new THREE.MeshBasicMaterial({ color: 0x050505 });
const face_px = [[1, 5], [6, 5], [2, 6], [3, 6], [4, 6], [5, 6],
                     [1, 3],
                     [5, 1], [6, 1], [5, 2], [6, 2]];

function make_face() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = { canvas, tex, key: '' };
  paint_face(face, '#050505', '#ffffff');
  return face;
}
export function paint_face(face, bg, fg) {
  const key = bg + fg;
  if (face.key === key) return;
  face.key = key;
  const g = face.canvas.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 8, 8);
  g.fillStyle = fg;
  for (const [x, y] of face_px) g.fillRect(x, y, 1, 1);
  face.tex.needsUpdate = true;
}
export const hex = c => '#' + c.getHexString();

function limb(w, h, d, x, pivot_y, centre_off, mat = mob_mat) {
  const pivot = new THREE.Group();
  pivot.position.set(x * mpx, pivot_y * mpx, 0);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * mpx, h * mpx, d * mpx), mat);
  mesh.position.y = centre_off * mpx;
  pivot.add(mesh);
  return pivot;
}

export const stump_red = 0xd01818, scab = 0x5a2f16;
const stump_spots = {
  arm_l: [-4.12, 22, 0, 0.25, 4, 4], arm_r: [4.12, 22, 0, 0.25, 4, 4],
  leg_l: [-2, 11.88, 0, 4, 0.25, 4], leg_r: [2, 11.88, 0, 4, 0.25, 4],
  head: [0, 24.12, 0, 4, 0.25, 4],
};

export function build_mob() {
  const root = new THREE.Group();
  const mats = Object.fromEntries(['head', 'body', 'arm_l', 'arm_r', 'leg_l', 'leg_r'].map(k => [k, mob_mat.clone()]));
  const face = make_face();
  const face_mat = new THREE.MeshBasicMaterial({ map: face.tex });
  const head = limb(8, 8, 8, 0, 24, 4, [mats.head, mats.head, mats.head, mats.head, face_mat, mats.head]);
  const body = limb(8, 12, 4, 0, 24, -6, mats.body);
  const arm_l = limb(4, 12, 4, -6, 24, -6, mats.arm_l);
  const arm_r = limb(4, 12, 4, 6, 24, -6, mats.arm_r);
  const leg_l = limb(4, 12, 4, -2, 12, -6, mats.leg_l);
  const leg_r = limb(4, 12, 4, 2, 12, -6, mats.leg_r);
  const rig = new THREE.Group();
  const stump_mats = {};
  const stumps = {};
  for (const [name, [x, y, z, w, h, d]] of Object.entries(stump_spots)) {
    const stump_mat = new THREE.MeshBasicMaterial({ color: stump_red });
    stump_mat.userData.keep_col = true;
    stump_mats[name] = stump_mat;
    const st = new THREE.Mesh(new THREE.BoxGeometry(w * mpx, h * mpx, d * mpx), stump_mat);
    st.position.set(x * mpx, y * mpx, z * mpx);
    st.visible = false;
    rig.add(st);
    stumps[name] = st;
  }
  rig.add(head, body, arm_l, arm_r, leg_l, leg_r);
  root.add(rig);
  scene.add(root);
  return { root, rig, body, arm_l, arm_r, leg_l, leg_r, head, mats, face, face_mat, stump_mats, stumps };
}

export const rot_grey = 3, rot_brown = 8, rot_end = 12;

const pieces = [];
const c_skin = new THREE.Color(0x050505), c_grey = new THREE.Color(0x1b1908), c_brown = new THREE.Color(0x2c2409);
const c_feat = new THREE.Color(0xffffff), c_feat_rot = new THREE.Color(0x77702f);
export function rot(age, mats, face = null) {
  const c = age < rot_grey
    ? c_skin.clone().lerp(c_grey, age / rot_grey)
    : c_grey.clone().lerp(c_brown, Math.min(1, (age - rot_grey) / (rot_brown - rot_grey)));
  const fade = age < rot_brown ? 1 : Math.max(0, 1 - (age - rot_brown) / (rot_end - rot_brown));
  if (face) paint_face(face, hex(c), hex(c_feat.clone().lerp(c_feat_rot, Math.min(1, age / rot_brown))));
  for (const mt of mats) {
    if (!mt.map && !mt.userData.keep_col) mt.color.copy(c);
    mt.opacity = fade;
    mt.transparent = fade < 1;
  }
}

export function pop_off(m, name) {
  const pivot = m[name];
  const mesh = pivot.children[0];
  if (!mesh) return;
  scene.updateMatrixWorld(true);
  const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
  mesh.getWorldPosition(wp); mesh.getWorldQuaternion(wq);
  const holder = new THREE.Group();
  holder.position.copy(wp); holder.quaternion.copy(wq);
  mesh.position.set(0, 0, 0);
  holder.add(mesh);
  scene.add(holder);
  const cache = new Map();
  const piece_face = name === 'head' ? make_face() : null;
  if (piece_face) paint_face(piece_face, hex(m.mats.head.color), '#ffffff');
  const dup = mt => {
    if (!cache.has(mt)) { const c = mt.clone(); if (c.map) c.map = piece_face.tex; cache.set(mt, c); }
    return cache.get(mt);
  };
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(dup) : dup(mesh.material);
  const out = new THREE.Vector3(wp.x - m.pos.x, 0, wp.z - m.pos.z);
  if (out.lengthSq() < 1e-4) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
  out.normalize();
  const is_head = name === 'head', fling = 1.5 + Math.random() * 1.5;
  pieces.push({
    holder, mats: [...cache.values()], face: piece_face, age: 0, landed: false, rest_q: null,
    vel: new THREE.Vector3(out.x * fling + m.kb.x * 0.3, 3.5 + Math.random() * 2.5, out.z * fling + m.kb.z * 0.3),
    spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
    long: !is_head,
    air: is_head ? 0.225 : 0.15,
    rest: is_head ? 0.225 : 0.1125,
  });
}

export function tick_pieces(dt) {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const p = pieces[i], h = p.holder;
    p.age += dt;
    if (!p.landed) {
      p.vel.y -= grav * dt;
      if (solid_k(key(Math.round(h.position.x + p.vel.x * dt), Math.round(h.position.y), Math.round(h.position.z)))) p.vel.x = 0;
      if (solid_k(key(Math.round(h.position.x), Math.round(h.position.y), Math.round(h.position.z + p.vel.z * dt)))) p.vel.z = 0;
      h.position.addScaledVector(p.vel, dt);
      h.rotateX(p.spin.x * dt); h.rotateY(p.spin.y * dt); h.rotateZ(p.spin.z * dt);
      const by = Math.round(h.position.y - p.air);
      if (p.vel.y <= 0 && solid_k(key(Math.round(h.position.x), by, Math.round(h.position.z)))) {
        p.landed = true;
        p.vel.set(0, 0, 0);
        h.position.y = by + 0.5 + p.rest;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
        if (p.long) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
        p.rest_q = q;
      }
    } else {
      h.quaternion.slerp(p.rest_q, Math.min(1, dt * 12));
    }
    rot(p.age, p.mats, p.face);
    if (p.age >= rot_end || h.position.y < -40) {
      scene.remove(h);
      for (const mt of p.mats) mt.dispose();
      pieces.splice(i, 1);
    }
  }
}

export function swing_limbs(m, moved, dt, stride = 6) {
  m.phase += moved * stride;
  m.swing += ((moved > 0.0001 ? 0.6 : 0) - m.swing) * Math.min(1, dt * 10);
  const s = Math.sin(m.phase) * m.swing;
  m.leg_l.rotation.x = s;  m.leg_r.rotation.x = -s;
  m.arm_l.rotation.x = -s; m.arm_r.rotation.x = s;
}
