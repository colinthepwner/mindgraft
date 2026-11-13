import { blks } from './blocks.js';
import { world_sz, spawn_pt } from './gen.js';
import { keys, yaw } from './input.js';
import { jump_v, walk_spd, collides, player } from './player.js';
import { sea_top, water_id } from './sky.js';
import { jump_vol, land_lead, land_pitch, step_hp, step_pitch, step_vol, takeoff_pitch, audio, fall_min, land_hit, pick_snd, play_half, play_snd, spatial } from './sound.js';
import { grav, world_bot, key, solid_at, world } from './world.js';
import { cam_land, cam_hop } from './you.js';

const step_len = 2.2;
let step_acc = 0;

let air_t = 0;
function under_feet() {
  const by = Math.round(player.pos.y - 0.6);
  for (const [ox, oz] of [[0, 0], [0.25, 0.25], [-0.25, 0.25], [0.25, -0.25], [-0.25, -0.25]]) {
    const b = world.get(key(Math.round(player.pos.x + ox), by, Math.round(player.pos.z + oz)));
    if (b) return b;
  }
  return null;
}

function block_below(pos) {
  const by = Math.round(pos.y - 0.6);
  for (const [ox, oz] of [[0, 0], [0.25, 0.25], [-0.25, 0.25], [0.25, -0.25], [-0.25, -0.25]]) {
    const b = world.get(key(Math.round(pos.x + ox), by, Math.round(pos.z + oz)));
    if (b && !blks[b.type].plant) return b;
  }
  return null;
}

function land_buf(pos, old) {
  const b = block_below(pos);
  return (b && pick_snd(blks[b.type].name)) || old;
}
let jump_snd = null;
let was_grounded = false;

const shuffle_snd = 'grass';
const scuff_pitch = 1.4, scuff_win = 220;
const flip_dot = 0.2;
const scuff_hold = 260, grind_gap = 70;
const start_idle = 180, start_hold = 200;
const grain_len = 0.14, grain_vol = 0.7;
const scuff_jit = 0.2, scuff_min_diff = 0.07;
let last_dir = null, scuff_t = 0, step_t = 0, last_j = 1, grind_until = 0, last_in = 0, grind_start = false;
function scuff(f, s) {

  const il = Math.hypot(f, s);
  if (il < 0.01) return;
  const now = performance.now(), dx = s / il, dz = f / il;
  const starting = player.on_ground && now - last_in > start_idle;
  last_in = now;
  if (starting) { grind_until = now + start_hold; grind_start = true; }
  if (last_dir && player.on_ground && now - last_dir.t < scuff_win && dx * last_dir.x + dz * last_dir.z < flip_dot) { grind_until = now + scuff_hold; grind_start = false; }
  last_dir = { x: dx, z: dz, t: now };
  if (!player.on_ground || now > grind_until || now - scuff_t < grind_gap || now - step_t < grind_gap) return;
  const buf = pick_snd(shuffle_snd);
  if (!buf) return;
  scuff_t = now;
  step_acc = grind_start ? step_len * 0.55 : 0;
  let j;
  do j = 1 + (Math.random() * 2 - 1) * scuff_jit; while (Math.abs(j - last_j) < scuff_min_diff);
  last_j = j;
  grain(buf, step_pitch * takeoff_pitch * scuff_pitch * j, step_vol * grain_vol, player.pos.clone());
}
function grain(buf, rate, vol, at) {
  const src = audio.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.loop = true;
  const t0 = audio.currentTime, v = vol * (buf.norm ?? 1), g = audio.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(v, t0 + grain_len * 0.35);
  g.gain.linearRampToValueAtTime(0, t0 + grain_len);
  const hp = audio.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = step_hp;
  src.connect(hp).connect(g);
  g.connect(spatial(at));
  src.start(t0, Math.random() * buf.duration * 0.5);
  src.stop(t0 + grain_len);
}
export function step(dt) {
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const len = Math.hypot(f, s) || 1;
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  player.kb.multiplyScalar(Math.max(0, 1 - dt * 8));
  player.vel.x = ((-sin) * f + cos * s) / len * walk_spd + player.kb.x;
  player.vel.z = ((-cos) * f + (-sin) * s) / len * walk_spd + player.kb.z;
  player.vel.y -= grav * dt;
  if (keys.Space && player.on_ground) {
    player.vel.y = jump_v; player.on_ground = false;
    const under = under_feet(), buf = under && pick_snd(blks[under.type].name);
    if (buf) {
      const detune = 0.88 + Math.random() * 0.24;
      play_half(buf, step_pitch * takeoff_pitch * detune, jump_vol, true, 'takeoff', player.pos.clone());
      jump_snd = { buf, rate: step_pitch * land_pitch * detune, t: performance.now() };
    }
  }

  const vy0 = player.vel.y;
  const before = player.pos.clone();
  for (const axis of ['x', 'y', 'z']) {
    const next = player.pos.clone();
    next[axis] += player.vel[axis] * dt;
    if (collides(next)) {
      if (axis === 'y') { player.on_ground = player.vel.y < 0; player.vel.y = 0; }
    } else {
      player.pos[axis] = next[axis];
      if (axis === 'y') player.on_ground = false;
    }
  }

  if (!jump_snd && !player.on_ground && player.vel.y < -fall_min) {
    let by = Math.round(player.pos.y) - 1, under = null;
    while (by >= world_bot && !(under = solid_at(Math.round(player.pos.x), by, Math.round(player.pos.z)) && world.get(key(Math.round(player.pos.x), by, Math.round(player.pos.z))))) by--;
    const buf = under && pick_snd(blks[under.type].name);
    if (buf) jump_snd = { buf, rate: step_pitch * land_pitch * (0.88 + Math.random() * 0.24), t: performance.now() };
  }

  if (jump_snd && !jump_snd.played && !player.on_ground && player.vel.y < 0 && performance.now() - jump_snd.t < 8000) {
    const ahead = player.pos.clone();
    ahead.y += player.vel.y * land_lead - 0.5 * grav * land_lead * land_lead;
    if (collides(ahead)) { land_hit(land_buf(ahead, jump_snd.buf), jump_snd.rate, -player.vel.y, player.pos.clone()); jump_snd.played = true; }
  }
  if (player.on_ground && !was_grounded && jump_snd) {
    if (!jump_snd.played && performance.now() - jump_snd.t < 8000) land_hit(land_buf(player.pos, jump_snd.buf), jump_snd.rate, -vy0, player.pos.clone());
    jump_snd = null;
    step_acc = 0;
  }
  if (player.on_ground && !was_grounded) cam_land(-vy0);
  else if (!player.on_ground && was_grounded && player.vel.y > 0) cam_hop();
  was_grounded = player.on_ground;

  scuff(f, s);

  if (player.on_ground) {
    step_acc += Math.hypot(player.pos.x - before.x, player.pos.z - before.z);
    if (step_acc >= step_len) {
      step_acc = 0;
      const under = under_feet();
      if (under) { play_snd(blks[under.type].name, step_pitch, step_vol, true, { at: player.pos.clone() }); step_t = performance.now(); }
    }
  } else if ((air_t += dt) > 0.15) step_acc = step_len * 0.6;
  if (player.on_ground) air_t = 0;

  const outside = Math.abs(player.pos.x) > world_sz / 2 || Math.abs(player.pos.z) > world_sz / 2;
  if (player.pos.y < -30 || (water_id && outside && player.pos.y < sea_top - 2)) { player.pos.copy(spawn_pt); player.vel.set(0, 0, 0); jump_snd = null; }
}
