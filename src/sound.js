import { manifest } from './blocks.js';

export const audio = new (window.AudioContext || window.webkitAudioContext)();
const master_vol = 0.5;
const master = audio.createGain();
master.gain.value = master_vol;
master.connect(audio.destination);
const snds = {};
const norm_rms = 0.1;
function norm_gain(buf) {
  let sum = 0, n = 0, peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; const a = Math.abs(d[i]); if (a > peak) peak = a; }
    n += d.length;
  }
  const rms = Math.sqrt(sum / n);
  return rms > 1e-5 ? Math.min(norm_rms / rms, 0.95 / peak) : 1;
}
await Promise.all(manifest.sounds.map(async file => {
  const name = file.replace(/\.(mp3|ogg|wav)$/i, '').replace(/[-_]\d+$/, '');
  try {
    const buf = await audio.decodeAudioData(await (await fetch(`sounds/${file}`)).arrayBuffer());
    buf.norm = norm_gain(buf);
    (snds[name] ??= []).push(buf);
  } catch (err) { console.warn('could not load sound', file, err); }
}));

export const step_vol = 0.4;
export const step_hp = 600;
export const step_pitch = 1.45;
const last_var = {};

export function spatial(at) {
  if (!at) return master;
  const p = audio.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 2;
  p.rolloffFactor = 0.5;
  if (p.positionX) { p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z; }
  else p.setPosition(at.x, at.y, at.z);
  p.connect(master);
  return p;
}
export function move_ears(pos, forward) {
  const l = audio.listener;
  if (l.positionX) {
    l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
    l.forwardX.value = forward.x; l.forwardY.value = forward.y; l.forwardZ.value = forward.z;
    l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
  } else { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0); }
}
const last_played = {}, voices = {};
export function stop_voice(voice) {
  try { voices[voice]?.stop(); } catch {}
  delete voices[voice];
}
export function play_snd(name, rate = 1, volume = 1, bright = false, opts = {}) {
  const list = snds[name];
  if (!list) return;
  const now_ms = performance.now(), voice = opts.voice ?? name;
  if (opts.cooldown && now_ms - (last_played[voice] ?? -Infinity) < opts.cooldown) return;
  last_played[voice] = now_ms;
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === last_var[name]) i = (i + 1) % list.length;
  last_var[name] = i;
  const src = audio.createBufferSource();
  src.buffer = list[i];
  src.playbackRate.value = rate * (0.88 + Math.random() * 0.24);
  if (opts.bend) {

    const lfo = audio.createOscillator(), amt = audio.createGain();
    lfo.frequency.value = 1 + Math.random() * 1.3;
    amt.gain.value = src.playbackRate.value * opts.bend;
    lfo.connect(amt).connect(src.playbackRate);
    lfo.start();
    lfo.stop(audio.currentTime + list[i].duration / (src.playbackRate.value * 0.5) + 0.2);
  }
  const gain = audio.createGain();
  gain.gain.value = volume * (list[i].norm ?? 1);
  if (bright) {
    const hp = audio.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = step_hp;
    src.connect(hp).connect(gain);
  } else src.connect(gain);
  gain.connect(spatial(opts.at));
  if (opts.exclusive) {
    try { voices[voice]?.stop(); } catch {}
    voices[voice] = src;
    src.onended = () => { if (voices[voice] === src) delete voices[voice]; };
  }
  src.start();
}

export const takeoff_pitch = 1.2, land_pitch = 0.7;

export const land_lead = 0.09, land_fade = 0.3;
const takeoff_hold = 0.75;
export const jump_vol = 0.22;
export function pick_snd(name) {
  const list = snds[name];
  if (!list) return null;
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === last_var[name]) i = (i + 1) % list.length;
  last_var[name] = i;
  return list[i];
}

const takeoff_half = 'second', land_half = 'first';
function pumpitup(buf, half) {
  const cache = buf.pumpitup ??= {};
  if (cache[half] !== undefined) return cache[half];
  const mid = Math.floor(buf.length / 2), from = half === 'first' ? 0 : mid, to = half === 'first' ? mid : buf.length;
  let sum_all = 0, sum_half = 0, peak_half = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const sq = d[i] * d[i];
      sum_all += sq;
      if (i >= from && i < to) { sum_half += sq; const a = Math.abs(d[i]); if (a > peak_half) peak_half = a; }
    }
  }
  const rms_all = Math.sqrt(sum_all / (buf.length * buf.numberOfChannels)), rms_half = Math.sqrt(sum_half / ((to - from) * buf.numberOfChannels));
  let g = rms_half > 1e-6 ? Math.max(1, rms_all / rms_half) : 1;
  if (peak_half > 0) g = Math.min(g, 0.95 / (peak_half * (buf.norm ?? 1)));
  return cache[half] = Math.max(1, Math.min(4, g));
}
export function play_half(buf, rate, volume, bright, phase, at = null, opts = {}) {
  const half = phase === 'takeoff' ? takeoff_half : land_half;
  const src = audio.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const mid = buf.duration / 2;
  let offset = half === 'first' ? 0 : mid, length = half === 'first' ? mid : buf.duration - mid;
  if (opts.full) { offset = 0; length = buf.duration; }
  const real = length / rate;
  const v = volume * (buf.norm ?? 1) * (opts.full ? 1 : pumpitup(buf, half)), t0 = audio.currentTime;
  const gain = audio.createGain();
  if (phase === 'takeoff') {
    gain.gain.setValueAtTime(v, t0);
    gain.gain.setValueAtTime(v, t0 + real * takeoff_hold);
    gain.gain.linearRampToValueAtTime(0, t0 + real);
  } else {
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(v, t0 + real * (opts.fade_in ?? land_fade));
  }
  if (bright) {
    const hp = audio.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = step_hp;
    src.connect(hp).connect(gain);
  } else src.connect(gain);
  gain.connect(spatial(at));
  src.start(t0, offset, length);
}

const hit_min = 5, hit_max = 24;
const hit_vol_max = 0.9, hit_deep = 0.35;
export const fall_min = 9;
export function land_hit(buf, rate, speed, at) {
  const t = Math.max(0, Math.min(1, (speed - hit_min) / (hit_max - hit_min)));
  const vol = jump_vol + (hit_vol_max - jump_vol) * t;
  play_half(buf, rate * (1 - hit_deep * t), vol, t < 0.4, 'landing', at, { fade_in: land_fade * (1 - t) + 0.02 * t, full: t > 0.5 });
}
