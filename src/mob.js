import * as THREE from 'three';
import { chips, spurt } from './fx.js';
import { spawn_drop } from './drops.js';
import { world_sz, spawn_pt } from './gen.js';
import { scene } from './gfx.js';
import { mpx, rot_end, stump_red, scab, rot, build_mob, pop_off, hex, paint_face, swing_limbs, mob_skin } from './mob_model.js';
import { eugh_vol, eye_h, plr_h, jump_v, plr_hop, ouch_cd, ouch_vol, invuln_t, plr_kb, max_hp, box_hits, player } from './player.js';
import { blks, drop_of } from './blocks.js';
import { settle } from './support.js';
import { has_snd, play_snd, stop_voice } from './sound.js';
import { grav, col_top, key, set_blk, world } from './world.js';

const mob_half = 0.5, mob_spd = 1.6;
export const mobs = [];
const limb_hp = 6;
const part_hp = { head: 10, body: limb_hp * 2.5, arm_l: limb_hp, arm_r: limb_hp, leg_l: limb_hp, leg_r: limb_hp };

const kinds = {
  mob: { name: 'mob', ...mob_skin, size: 1, hp: 1, spd: 1, kb: 1, pitch: 1, humanoid: true },
  giant: { name: 'giant', skin: 0x2b0f3d, face: 'giant', size: 2, hp: 3, spd: 0.7, kb: 0.15, pitch: 0.6, humanoid: true, smash: true },
};

function top_under(x, z, size) {
  const r = Math.ceil(mob_half * size);
  let top = -Infinity;
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) top = Math.max(top, col_top.get(`${x + dx},${z + dz}`) ?? 0);
  return top;
}
function spawn_mob(x, z, kind = kinds.mob) {
  const m = build_mob(kind);
  m.root.scale.setScalar(kind.size);
  Object.assign(m, {
    kind, size: kind.size, skin_c: new THREE.Color(kind.skin),
    pos: new THREE.Vector3(x, top_under(x, z, kind.size) + 2, z),
    vel: new THREE.Vector3(), on_ground: false,
    yaw: Math.random() * Math.PI * 2,
    head_yaw: 0, head_pitch: 0,
    state: 'idle', timer: 1 + Math.random() * 2, glance_len: 0,
    dir: [0, 1], blocked_t: 0, phase: 0, swing: 0,
    kb: new THREE.Vector3(), hurt_t: 0,
    parts: Object.fromEntries(Object.entries(part_hp).map(([k, hp]) => [k, { hp: hp * kind.hp, alive: true }])),
    aggro: 0,
    atk_cd: 0, atk_t: 1,
    atk_kind: 'punch', atk_rate: 1, strike_at: 0.5, struck: true, punch_arm: 'arm_l', atk_dmg: 0,
    hop_t: 0,
    bleed: {},
    last_hit: null,
    fate: null, fate_t: 0,
    noise: 0, noise_t: 0, spaz_t: 0,
    lie: 0,
    roll_t: 0, roll_spd: 0, roll_sign: 1, roll_a: 0, scream_t: 0,
    dead: false, dead_t: 0,
  });
  mobs.push(m);
}
function respawn_mob(kind = kinds.mob) {
  const lim = world_sz / 2 - 6, away = kind.size > 1 ? 30 : 12;
  for (let tries = 0; tries < 20; tries++) {
    const x = Math.round((Math.random() * 2 - 1) * lim), z = Math.round((Math.random() * 2 - 1) * lim);
    if (Math.hypot(x - player.pos.x, z - player.pos.z) < away) continue;
    return spawn_mob(x, z, kind);
  }
  spawn_mob(6, 6, kind);
}
spawn_mob(6, 6);
respawn_mob(kinds.giant);

export const punch_reach = 4, punch_kb = 7, punch_hop = 6, flash_len = 0.4;
const punch_dmg = 1;
const aggro_t = 12;
const chase_spd = 2.6, atk_range = 1.5, mob_dmg = 2;
const punch_rate = 2.4, punch_hit = 0.5, punch_cd = 1.1;
const butt_rate = 1.5, butt_hit = 0.62, butt_cd = 2.2, butt_dmg = 3;
const one_leg = 0.55, stump_hop = 8.5, stump_pause = 0.9, stump_air = 1.2;
const respawn_ms = 8000, topple_t = 0.5;
const stump_dir = { arm_l: [-1, 0, 0], arm_r: [1, 0, 0], leg_l: [0, -1, 0], leg_r: [0, -1, 0], head: [0, 1, 0] };
const bleed_t = 5, scab_t = 1.5;
const falloff_vol = 0.7, scream_pitch = 1.18, scream_gap = [1.5, 4.5];
const headless_scream = [0.25, 0.6];
const roll_r = 0.2, roll_seg = [0.5, 1.4];

const spaz_at = 6, brain_t = 9, stumble = 0.9;
const spaz_beat = [0.45, 1.1];
const twitch_beat = [0.25, 0.8];
function twitch(m, name, dt, [t_min, t_max], amps, rate) {
  const st = (m.tw ??= {})[name] ??= { t: 0, target: amps.map(() => 0), v: amps.map(() => 0) };
  st.t -= dt;
  if (st.t <= 0) {
    st.t = t_min + Math.random() * (t_max - t_min);
    st.target = amps.map(a => (Math.random() - 0.5) * 2 * a);
  }
  st.v = st.v.map((v, i) => v + (st.target[i] - v) * Math.min(1, dt * rate));
  return st.v;
}
const mouth = m => new THREE.Vector3(m.pos.x, m.pos.y + 1.4 * m.size, m.pos.z);

const brain_depth = m => m && m.fate === 'brain' ? Math.min(1, m.fate_t / brain_t) : 0;
const deep_pitch = 0.5;
const bend_max = 0.12;
const brain_bend = m => bend_max * brain_depth(m);

const fallback = { hurt: ['eugh'], falloff: ['falloff1', 'falloff2'] };
function say(m, what, rate, vol, opts) {
  const own = m.kind.name + '_' + what;
  if (has_snd(own)) return play_snd(own, rate, vol, false, opts);
  if (!m.kind.humanoid) return;
  const list = fallback[what];
  play_snd(list[Math.floor(Math.random() * list.length)], rate * m.kind.pitch, vol, false, opts);
}
function falloff(scream, m) {
  const rate = (scream ? scream_pitch : 1) * (1 - deep_pitch * brain_depth(m));
  say(m, 'falloff', rate, falloff_vol, { exclusive: true, voice: 'falloff', at: mouth(m), bend: brain_bend(m) });
}
const ouch = m => say(m, 'hurt', 1 - deep_pitch * brain_depth(m), eugh_vol, { exclusive: true, voice: 'hurt', at: mouth(m), bend: brain_bend(m) });
const part_boxes = {
  head: [-4, 24, -4, 4, 32, 4], body: [-4, 12, -2, 4, 24, 2],
  arm_l: [-8, 12, -2, -4, 24, 2], arm_r: [4, 12, -2, 8, 24, 2],
  leg_l: [-4, 0, -2, 0, 12, 2], leg_r: [0, 0, -2, 4, 12, 2],
};
export function ray_mobs(origin, dir, max_d) {
  let best = null;
  for (const m of mobs) {
    if (m.dead) continue;
    const c = Math.cos(m.yaw), sn = Math.sin(m.yaw);
    const to_local = (x, z) => [x * c - z * sn, x * sn + z * c];
    const [ox, oz] = to_local(origin.x - m.pos.x, origin.z - m.pos.z);
    const [dx, dz] = to_local(dir.x, dir.z);
    let o = [ox, origin.y - m.pos.y - m.rig.position.y * m.size, oz], d = [dx, dir.y, dz];
    if (m.lie > 0.5) {
      o = [ox, -oz - m.rig.position.y * m.size, origin.y - m.pos.y - 0.2 * m.lie * m.size];
      d = [dx, -dz, dir.y];
    }
    o = o.map(v => v / m.size); d = d.map(v => v / m.size);
    for (const [name, b] of Object.entries(part_boxes)) {
      if (!m.parts[name].alive) continue;
      const lo = [b[0] * mpx, b[1] * mpx, b[2] * mpx], hi = [b[3] * mpx, b[4] * mpx, b[5] * mpx];
      let t0 = 0, t1 = max_d;
      for (let i = 0; i < 3 && t0 <= t1; i++) {
        if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) t1 = -1; continue; }
        let a = (lo[i] - o[i]) / d[i], e = (hi[i] - o[i]) / d[i];
        if (a > e) [a, e] = [e, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, e);
      }
      if (t0 <= t1 && (!best || t0 < best.dist)) best = { m, dist: t0, part: name };
    }
  }
  return best;
}
export function hurt_part(m, part, hearts_el) {
  const p = m.parts[part];
  if (!p.alive) return;
  m.hurt_t = flash_len; m.last_hit = part;
  ouch(m);
  p.hp -= hearts_el;
  if (p.hp <= 0) wreck_part(m, part);
}
export function punch_mob(m, part, at = null) {
  let dx = m.pos.x - player.pos.x, dz = m.pos.z - player.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  m.kb.set(dx * punch_kb * m.kind.kb, 0, dz * punch_kb * m.kind.kb);
  if (m.on_ground) { m.vel.y = punch_hop * Math.max(0.4, m.kind.kb); m.on_ground = false; }
  m.hurt_t = flash_len;
  m.last_hit = part;
  m.aggro = aggro_t;
  m.atk_cd = Math.max(m.atk_cd, 0.5);
  ouch(m);
  if (at) spurt(at, 5, 2.2, new THREE.Vector3(dx, 0.3, dz));
  const p = m.parts[part];
  p.hp -= punch_dmg;
  if (p.hp <= 0) wreck_part(m, part);
}

export function wreck_part(m, name, opts = {}) {
  const p = m.parts[name];
  if (!p.alive) return;
  if (name === 'head') {
    if (m.fate) { p.hp = 0; return; }
    if (opts.brain || Math.random() < 0.5) {
      m.fate = 'brain'; m.fate_t = 0; p.hp = 0;
      m.scream_t = 0.8;
      falloff(true, m);
      return;
    }
    m.fate = 'headless'; m.fate_t = 0; m.scream_t = 0;
  }
  p.alive = false; p.hp = 0;
  if (m.stumps[name]) { m.stumps[name].visible = true; m.bleed[name] = { t: 0, acc: 0 }; }
  if (name !== 'body') pop_off(m, name);
  falloff(false, m);
  if (!['arm_l', 'arm_r', 'leg_l', 'leg_r'].some(k => m.parts[k].alive)) m.scream_t = 1.5;
  if (name === 'body') kill_mob(m);
}

const _bp = new THREE.Vector3(), _bd = new THREE.Vector3();
function drip(m, dt) {
  for (const [name, b] of Object.entries(m.bleed)) {
    b.t += dt;
    if (b.t < bleed_t) {
      const k = b.t / bleed_t;
      b.acc += (45 * (1 - k) + 6) * dt;
      const n = Math.floor(b.acc);
      if (n > 0) {
        b.acc -= n;
        m.stumps[name].getWorldPosition(_bp);
        _bd.set(...stump_dir[name]).applyQuaternion(m.root.quaternion);
        spurt(_bp, n, 3.2 * (1 - k) + 0.8, _bd);
      }
    } else {
      m.stump_mats[name].color.setHex(stump_red).lerp(new THREE.Color(scab), Math.min(1, (b.t - bleed_t) / scab_t));
    }
  }
}

function kill_mob(m, shut_up = false) {
  if (shut_up) stop_voice('falloff');
  m.dead = true;
  m.dead_t = 0;
  m.aggro = 0;
  const r = (a, b) => a + Math.random() * (b - a);
  m.death_pose = {
    arm_l: [m.arm_l.rotation.x, m.arm_l.rotation.z], arm_r: [m.arm_r.rotation.x, m.arm_r.rotation.z],
    leg_l: [m.leg_l.rotation.x, m.leg_l.rotation.z], leg_r: [m.leg_r.rotation.x, m.leg_r.rotation.z],
    head: [m.head.rotation.x, m.head.rotation.y, m.head.rotation.z],
  };
  m.sprawl = {
    arm_l: [r(-0.3, 0.3), -r(1.0, 1.5)], arm_r: [r(-0.3, 0.3), r(1.0, 1.5)],
    leg_l: [r(-0.35, 0.35), -r(0.2, 0.55)], leg_r: [r(-0.35, 0.35), r(0.2, 0.55)],
    head: [r(0, 0.3), r(-0.5, 0.5), r(-0.5, 0.5)],
  };
  m.death_lie0 = m.lie;
  m.death_roll0 = m.rig.rotation.y;
  setTimeout(() => respawn_mob(m.kind), respawn_ms);
}

export function hurt_plr(amount, from) {
  if (player.invuln > 0) return;
  player.hp = Math.max(0, player.hp - amount);
  player.invuln = invuln_t;
  player.flash_t = 1;
  play_snd('uhh', 1, ouch_vol, false, { exclusive: true, cooldown: ouch_cd });
  if (from) {
    let dx = player.pos.x - from.x, dz = player.pos.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    player.kb.set(dx / len * plr_kb, 0, dz / len * plr_kb);
    if (player.on_ground) { player.vel.y = plr_hop; player.on_ground = false; }
  }
  if (player.hp <= 0) {
    player.hp = max_hp;
    player.pos.copy(spawn_pt); player.vel.set(0, 0, 0); player.kb.set(0, 0, 0);
    player.invuln = 2;
    for (const m of mobs) m.aggro = 0;
  }
}

const sight = 12;
export const head_yaw_max = 1.2, head_pitch_max = 0.7;
export const wrap_a = a => Math.atan2(Math.sin(a), Math.cos(a));

function nearest(m) {
  let best = null, best_d = sight;
  const consider = (p, eye_y) => {
    const d = Math.hypot(p.x - m.pos.x, p.y - m.pos.y, p.z - m.pos.z);
    if (d < best_d) { best_d = d; best = new THREE.Vector3(p.x, p.y + eye_y, p.z); }
  };
  consider(player.pos, eye_h);
  for (const o of mobs) if (o !== m && !o.dead) consider(o.pos, 28 * mpx);
  return best;
}

function tick_corpse(m, dt) {
  m.dead_t += dt;
  m.kb.multiplyScalar(Math.max(0, 1 - dt * 6));
  m.vel.x = m.kb.x; m.vel.z = m.kb.z; m.vel.y -= grav * dt;
  for (const axis of ['x', 'y', 'z']) {
    const next = m.pos.clone();
    next[axis] += m.vel[axis] * dt;
    if (box_hits(next, mob_half * m.size, plr_h * m.size)) m.vel[axis] = 0;
    else m.pos[axis] = next[axis];
  }
  drip(m, dt);
  const fall = Math.min(1, m.dead_t / topple_t);

  const tilt = m.death_lie0 + (1 - m.death_lie0) * fall * fall;
  m.root.rotation.order = 'YXZ';
  m.root.rotation.x = -tilt * Math.PI / 2;
  m.root.position.set(m.pos.x, m.pos.y + tilt * 0.2 * m.size, m.pos.z);
  const tt = Math.max(0, m.dead_t - 0.05);
  const go = 1 - Math.exp(-5 * tt) * Math.cos(14 * tt);
  const mix = (a, b) => a + (b - a) * go;
  for (const k of ['arm_l', 'arm_r', 'leg_l', 'leg_r']) {
    m[k].rotation.x = mix(m.death_pose[k][0], m.sprawl[k][0]);
    m[k].rotation.z = mix(m.death_pose[k][1], m.sprawl[k][1]);
  }
  m.head.rotation.set(mix(m.death_pose.head[0], m.sprawl.head[0]), mix(m.death_pose.head[1], m.sprawl.head[1]), mix(m.death_pose.head[2], m.sprawl.head[2]), 'YXZ');
  const face_up = Math.round(m.death_roll0 / (Math.PI * 2)) * Math.PI * 2;
  m.rig.rotation.y = m.death_roll0 + (face_up - m.death_roll0) * Math.min(1, m.dead_t / 0.5);
  const mats = [...Object.values(m.mats), m.face_mat, ...Object.values(m.stump_mats)];
  if (m.dead_t < 0.35) {
    for (const k in m.mats) m.mats[k].color.setHex(k === m.last_hit ? 0xcc2222 : m.kind.skin);
    paint_face(m.face, m.last_hit === 'head' ? '#cc2222' : hex(m.skin_c), '#ffffff');
  } else {
    rot(m.dead_t - 0.35, mats, m.face, m.skin_c);
  }
  if (m.dead_t >= rot_end) {
    scene.remove(m.root);
    mobs.splice(mobs.indexOf(m), 1);
  }
}

function punch_curve(t) {
  if (t < 0.35) return 0.9 * (t / 0.35);
  if (t < 0.5) return 0.9 - 2.5 * ((t - 0.35) / 0.15);
  if (t < 0.75) return -1.6;
  return -1.6 * (1 - (t - 0.75) / 0.25);
}
function butt_curve(t) {
  if (t < 0.5) return -0.7 * (t / 0.5);
  if (t < 0.62) return -0.7 + 1.8 * ((t - 0.5) / 0.12);
  if (t < 0.8) return 1.1;
  return 1.1 * (1 - (t - 0.8) / 0.2);
}

const smash_rate = 0.9, smash_hit = 0.62, smash_cd = 2, smash_dmg = 6;
const smash_fwd = 1.2, smash_r2 = 5;
function smash_curve(t) {
  if (t < 0.5) return -2.9 * (t / 0.5);
  if (t < 0.62) return -2.9 + 3.1 * ((t - 0.5) / 0.12);
  if (t < 0.8) return 0.2;
  return 0.2 * (1 - (t - 0.8) / 0.2);
}
function giant_smash(m) {
  const ix = Math.round(m.pos.x + Math.sin(m.yaw) * smash_fwd * m.size), iz = Math.round(m.pos.z + Math.cos(m.yaw) * smash_fwd * m.size);
  const gy = Math.round(m.pos.y - 0.6);
  const hit_at = new THREE.Vector3(ix, gy + 0.5, iz), ground = world.get(key(ix, gy, iz));
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (dx * dx + dz * dz > smash_r2) continue;
    for (let y = gy - 1; y <= gy + 3; y++) {
      const x = ix + dx, z = iz + dz, b = world.get(key(x, y, z));
      if (!b || blks[b.type].name === 'stone') continue;
      set_blk(x, y, z, 0);
      chips(x, y, z, b.type, 2, 0.7);
      const id = drop_of(b.type);
      if (id && Math.random() < 0.35) spawn_drop(id, x, y, z);
    }
  }
  settle(ix, iz);
  if (has_snd('giant_smash')) play_snd('giant_smash', 1, 1, false, { at: hit_at, voice: 'smash' });
  else play_snd(ground ? blks[ground.type].name : 'dirt', 0.5, 1, false, { at: hit_at, voice: 'smash' });
  const d = Math.hypot(player.pos.x - ix, player.pos.z - iz);
  player.shake = Math.max(player.shake, 14 * Math.max(0, 1 - d / 25));
  if (d <= 2.8 && Math.abs(player.pos.y - m.pos.y) < 3) hurt_plr(smash_dmg, m.pos);
}

export function tick_mobs(dt) {
  for (const m of [...mobs]) {
    if (m.dead) { tick_corpse(m, dt); continue; }
    drip(m, dt);
    if (m.fate) {
      m.fate_t += dt;
      m.aggro = Math.max(m.aggro, 1);
      if ((m.fate === 'headless' && m.fate_t >= bleed_t) || (m.fate === 'brain' && m.fate_t >= brain_t)) { kill_mob(m, true); continue; }
    }
    const spazzing = m.fate === 'brain' && m.fate_t >= spaz_at;
    const noise_amp = m.fate === 'brain' ? Math.PI * Math.min(1, m.fate_t / spaz_at) : m.fate === 'headless' ? stumble : 0;
    m.noise_t -= dt;
    if (m.noise_t <= 0) { m.noise_t = 0.25 + Math.random() * 0.2; m.noise = (Math.random() * 2 - 1) * noise_amp; }
    const head_pos = new THREE.Vector3(m.pos.x, m.pos.y + (28 * mpx + m.rig.position.y) * m.size, m.pos.z);
    const interest = nearest(m);
    const goal = new THREE.Vector3(head_pos.x + m.dir[0] * 6, head_pos.y, head_pos.z + m.dir[1] * 6);
    let look = null;

    m.timer -= dt;
    m.aggro = Math.max(0, m.aggro - dt);
    m.atk_cd = Math.max(0, m.atk_cd - dt);
    const to_plr = new THREE.Vector3(player.pos.x - m.pos.x, 0, player.pos.z - m.pos.z);
    const plr_dist = to_plr.length();
    if (m.kind.smash && plr_dist < 30) m.aggro = Math.max(m.aggro, 1);
    const limbless = !['arm_l', 'arm_r', 'leg_l', 'leg_r'].some(k => m.parts[k].alive);
    const chasing = m.aggro > 0 && plr_dist > 0.01 && !limbless && !spazzing;
    const rolling = limbless && !spazzing;
    let walking = false;
    if (spazzing) {
      if (m.spaz_yaw === undefined) { m.spaz_yaw = m.yaw; m.spaz_roll = m.roll_a; }
      m.spaz_t -= dt;
      if (m.spaz_t <= 0) {
        m.spaz_t = spaz_beat[0] + Math.random() * (spaz_beat[1] - spaz_beat[0]);
        m.kb.set((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3);
        if (m.on_ground && Math.random() < 0.25) m.vel.y = 2 + Math.random() * 1.5;
        m.spaz_roll += (Math.random() - 0.5) * 2.4;
        m.spaz_yaw += (Math.random() - 0.5) * 0.9;
      }
      m.roll_a += (m.spaz_roll - m.roll_a) * Math.min(1, dt * 9);
      m.yaw += wrap_a(m.spaz_yaw - m.yaw) * Math.min(1, dt * 6);
    } else if (limbless) {
      m.roll_t -= dt;
      if (m.roll_t <= 0 || m.blocked_t > 0.4) {
        const a = Math.random() * Math.PI * 2;
        m.dir = [Math.sin(a), Math.cos(a)];
        m.roll_sign = Math.random() < 0.5 ? -1 : 1;
        m.roll_spd = Math.random() < 0.25 ? 0 : 0.7 + Math.random() * 0.9;
        m.roll_t = roll_seg[0] + Math.random() * (roll_seg[1] - roll_seg[0]);
        m.blocked_t = 0;
      }
      const roll_yaw = Math.atan2(-m.roll_sign * m.dir[1], m.roll_sign * m.dir[0]);
      m.yaw += wrap_a(roll_yaw - m.yaw) * Math.min(1, dt * 3);
      m.roll_a += m.roll_sign * (m.roll_spd / roll_r) * dt;
    } else if (chasing) {
      walking = true;
      const aim = Math.atan2(to_plr.x, to_plr.z) + m.noise;
      m.dir = [Math.sin(aim), Math.cos(aim)];
      look = new THREE.Vector3(player.pos.x, player.pos.y + eye_h, player.pos.z);
      m.state = 'idle'; m.timer = 0.3;
      if (plr_dist > atk_range * m.size) walking = true; else walking = false;
    } else if (m.state === 'idle') {
      look = interest;
      if (m.timer <= 0) {
        const a = Math.random() * Math.PI * 2;
        m.dir = [Math.sin(a), Math.cos(a)];
        m.state = 'glance';
        m.glance_len = m.timer = 1.2 + Math.random() * 0.8;
      }
    } else if (m.state === 'glance') {
      look = (interest && m.timer > m.glance_len / 2) ? interest : goal;
      if (m.timer <= 0) { m.state = 'walk'; m.timer = 2 + Math.random() * 2.5; m.blocked_t = 0; }
    } else {
      walking = true;
      look = goal;
      if (m.timer <= 0 || m.blocked_t > 0.6) { m.state = 'idle'; m.timer = 1.2 + Math.random() * 2.8; walking = false; }
    }

    if (limbless || m.fate === 'brain' || m.fate === 'headless') {
      m.scream_t -= dt;
      if (m.scream_t <= 0) {
        falloff(true, m);
        const gap = m.fate === 'headless' ? headless_scream : scream_gap;
        m.scream_t = gap[0] + Math.random() * (gap[1] - gap[0]);
      }
    }

    const lim = world_sz / 2 - 2;
    if (walking && ((m.pos.x > lim && m.dir[0] > 0) || (m.pos.x < -lim && m.dir[0] < 0))) m.dir[0] *= -1;
    if (walking && ((m.pos.z > lim && m.dir[1] > 0) || (m.pos.z < -lim && m.dir[1] < 0))) m.dir[1] *= -1;

    m.kb.multiplyScalar(Math.max(0, 1 - dt * 8));
    const legs = (m.parts.leg_l.alive ? 1 : 0) + (m.parts.leg_r.alive ? 1 : 0);
    const legless = legs === 0;
    m.hop_t = Math.max(0, m.hop_t - dt);
    if (legless && walking && m.on_ground && m.hop_t <= 0) { m.vel.y = stump_hop; m.on_ground = false; m.hop_t = stump_pause + 2 * stump_hop / grav; }
    const travelling = !legless || !m.on_ground;
    const speed = (chasing ? chase_spd : mob_spd) * m.kind.spd * (legs === 1 ? one_leg : legless ? stump_air : 1);
    m.vel.x = (rolling ? m.dir[0] * m.roll_spd : walking && travelling ? m.dir[0] * speed : 0) + m.kb.x;
    m.vel.z = (rolling ? m.dir[1] * m.roll_spd : walking && travelling ? m.dir[1] * speed : 0) + m.kb.z;
    m.hurt_t = Math.max(0, m.hurt_t - dt);
    for (const k in m.mats) m.mats[k].color.setHex(m.hurt_t > 0 && k === m.last_hit ? 0xcc2222 : m.kind.skin);
    paint_face(m.face, m.hurt_t > 0 && m.last_hit === 'head' ? '#cc2222' : hex(m.mats.head.color), '#ffffff');
    m.rig.position.y += (-(legless ? 12 * mpx : 0) - m.rig.position.y) * Math.min(1, dt * 10);
    m.vel.y -= grav * dt;

    const before = m.pos.clone();
    let blocked = false;
    for (const axis of ['x', 'y', 'z']) {
      const next = m.pos.clone();
      next[axis] += m.vel[axis] * dt;
      if (box_hits(next, mob_half * m.size, plr_h * m.size)) {
        if (axis === 'y') { m.on_ground = m.vel.y < 0; m.vel.y = 0; } else blocked = true;
      } else {
        m.pos[axis] = next[axis];
        if (axis === 'y') m.on_ground = false;
      }
    }
    if (blocked && m.on_ground && !legless) m.vel.y = jump_v;
    m.blocked_t = blocked ? m.blocked_t + dt : 0;
    if (m.pos.y < -30) m.pos.set(6, (col_top.get('6,6') ?? 0) + 2, 6);

    if (walking) {
      const target = Math.atan2(m.dir[0], m.dir[1]);
      m.yaw += wrap_a(target - m.yaw) * Math.min(1, dt * 8);
    }

    let want_yaw = 0, want_pitch = 0;
    if (look) {
      const dx = look.x - head_pos.x, dy = look.y - head_pos.y, dz = look.z - head_pos.z;
      want_yaw = THREE.MathUtils.clamp(wrap_a(Math.atan2(dx, dz) - m.yaw), -head_yaw_max, head_yaw_max);
      want_pitch = THREE.MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -head_pitch_max, head_pitch_max);
    }
    const ease = Math.min(1, dt * 7);
    m.head_yaw += (want_yaw - m.head_yaw) * ease;
    m.head_pitch += (want_pitch - m.head_pitch) * ease;
    m.head.rotation.set(m.head_pitch, m.head_yaw, 0, 'YXZ');
    if (m.fate === 'brain') {
      const sev = Math.min(1, m.fate_t / spaz_at) * 0.7 + 0.2;
      const [hx, hy, hz] = twitch(m, 'head', dt, [0.15, 0.5], [0.5 * sev, 0.8 * sev, 0.5 * sev], 12);
      m.head.rotation.x += hx; m.head.rotation.y += hy; m.head.rotation.z += hz;
    }

    swing_limbs(m, Math.hypot(m.pos.x - before.x, m.pos.z - before.z), dt);
    if (spazzing) for (const k of ['arm_l', 'arm_r', 'leg_l', 'leg_r']) {
      const [rx, rz] = twitch(m, k, dt, twitch_beat, [1.6, 1.0], 16);
      m[k].rotation.x = rx; m[k].rotation.z = rz;
    }

    const arms_left = ['arm_l', 'arm_r'].filter(a => m.parts[a].alive);
    const reach = plr_dist <= atk_range * m.size && Math.abs(player.pos.y - m.pos.y) < 1.2 * m.size;
    const walled = m.kind.smash && m.blocked_t > 0.3;
    if (chasing && (arms_left.length || m.parts.head.alive) && m.atk_t >= 1 && m.atk_cd <= 0 && (reach || walled)) {
      m.atk_t = 0; m.struck = false;
      if (m.kind.smash && arms_left.length) {
        m.atk_kind = 'smash'; m.atk_rate = smash_rate; m.strike_at = smash_hit; m.atk_cd = smash_cd;
      } else if (arms_left.length) {
        m.atk_kind = 'punch'; m.punch_arm = arms_left[Math.floor(Math.random() * arms_left.length)];
        m.atk_rate = punch_rate; m.strike_at = punch_hit; m.atk_dmg = mob_dmg; m.atk_cd = punch_cd;
      } else {
        m.atk_kind = 'headbutt';
        m.atk_rate = butt_rate; m.strike_at = butt_hit; m.atk_dmg = butt_dmg; m.atk_cd = butt_cd;
      }
    }
    if (m.atk_t < 1) {
      m.atk_t = Math.min(1, m.atk_t + dt * m.atk_rate);
      if (!m.struck && m.atk_t >= m.strike_at) {
        m.struck = true;
        if (m.atk_kind === 'smash') giant_smash(m);
        else {
          if (m.atk_kind === 'headbutt') m.kb.add(new THREE.Vector3(m.dir[0] * 3, 0, m.dir[1] * 3));
          if (plr_dist <= atk_range * 1.4 * m.size && Math.abs(player.pos.y - m.pos.y) < 1.4 * m.size) hurt_plr(m.atk_dmg, m.pos);
        }
      }
      if (m.atk_kind === 'punch') m[m.punch_arm].rotation.x = punch_curve(m.atk_t);
      else if (m.atk_kind === 'smash') { for (const a of arms_left) m[a].rotation.x = smash_curve(m.atk_t); }
      else m.head.rotation.x += butt_curve(m.atk_t);
    }

    m.root.position.copy(m.pos);
    m.root.rotation.y = m.yaw;
    m.lie += (((limbless || spazzing) ? 1 : 0) - m.lie) * Math.min(1, dt * 4);
    if (m.lie > 0.001) {
      m.root.rotation.order = 'YXZ';
      m.root.rotation.x = -m.lie * Math.PI / 2;
      m.root.position.y += m.lie * 0.2 * m.size;
      m.rig.rotation.y = m.roll_a;
    }
  }
}
