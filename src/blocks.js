import * as THREE from 'three';

export const manifest = await (await fetch('manifest.json')).json();

const groups = {};

for (const file of manifest.textures) {
  const base = file.replace(/\.png$/i, '');
  const fr = base.match(/^(.+?)(?:-(side|top|bottom))?-(\d+)$/);
  const m = fr ? null : base.match(/^(.+)-(side|top|bottom)$/);
  const name = fr ? fr[1] : m ? m[1] : base;
  const part = fr ? (fr[2] ?? 'all') : m ? m[2] : 'all';
  ((groups[name] ??= {})[part] ??= []).push({ n: fr ? +fr[3] : 0, file });
}
for (const g of Object.values(groups)) for (const part in g) g[part].sort((a, b) => a.n - b.n);

function load_img(file) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { console.warn('could not load texture', file); resolve(null); };
    img.src = `textures/${file}`;
  });
}

export const anim_texs = [];
const anim_spf = 1.0;
export function tick_anims(seconds) {
  for (const a of anim_texs) {
    const n = a.frames.length, phase = (seconds / anim_spf) % n;
    const i = Math.floor(phase), j = (i + 1) % n;
    const f = phase - i, blend = f * f * (3 - 2 * f);
    const q = i + ':' + Math.round(blend * 128);
    if (q === a.last) continue;
    a.last = q;
    const { width, height } = a.ctx.canvas;
    a.ctx.globalAlpha = 1;
    a.ctx.clearRect(0, 0, width, height);
    a.ctx.drawImage(a.frames[i], 0, 0);
    a.ctx.globalAlpha = blend;
    a.ctx.drawImage(a.frames[j], 0, 0);
    a.ctx.globalAlpha = 1;
    a.tex.needsUpdate = true;
    for (const t of a.extra ?? []) t.needsUpdate = true;
  }
}

function make_mat(images) {
  const img = images[0];
  let tex;
  if (images.length > 1) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    tex = new THREE.CanvasTexture(canvas);
    anim_texs.push({ frames: images, ctx, tex, last: '' });
  } else tex = new THREE.Texture(img);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  let has_a = false;
  for (const frame of images) {
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(frame, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    for (let p = 3; p < px.length; p += 4) if (px[p] < 255) { has_a = true; break; }
    if (has_a) break;
  }
  return new THREE.MeshBasicMaterial({
    map: tex,
    vertexColors: true,
    transparent: has_a,
    alphaTest: has_a ? 0.01 : 0,
    side: has_a ? THREE.DoubleSide : THREE.FrontSide,
  });
}

export const blks = {};
const blk_names = Object.keys(groups).sort();
await Promise.all(blk_names.map(async (name, i) => {
  const p = groups[name];
  const pick = (...parts) => parts.map(k => p[k]).find(Boolean);
  const faces = {
    side: pick('side', 'all', 'top', 'bottom'),
    top: pick('top', 'all', 'side', 'bottom'),
    bottom: pick('bottom', 'all', 'top', 'side'),
  };
  const id = frames => frames.map(f => f.file).join('|');
  const imgs = {};
  for (const frames of Object.values(faces)) imgs[id(frames)] ??= await Promise.all(frames.map(f => load_img(f.file)));
  if (Object.values(imgs).some(list => list.some(v => !v))) return;
  const mat = {};
  for (const k in imgs) mat[k] = make_mat(imgs[k]);
  const s = mat[id(faces.side)], t = mat[id(faces.top)], b = mat[id(faces.bottom)];
  blks[i + 1] = { name, icon: imgs[id(faces.top)][0], side_img: imgs[id(faces.side)][0], mats: [s, s, t, b, s, s], plant: name.startsWith('gp-') };
}));
export const blk_ids = Object.keys(blks).map(Number);
export const base_id = blk_ids.find(id => blks[id].name === 'grass') ?? blk_ids[0];
export const id_of = name => blk_ids.find(id => blks[id].name === name) ?? base_id;
export const grass_id = id_of('grass'), dirt_id = id_of('dirt'), stone_id = id_of('stone'), sand_id = id_of('sand');
export const break_t = { dirt: 0.7, grass: 0.8, leaf: 0.3, log: 1.4, stone: 2.0, glass: 0.4, sand: 0.6 }, break_def = 1.0;
const drop_map = new Map([[grass_id, dirt_id]]);
const no_drop = new Set(['leaf']);
export const drop_of = type => (no_drop.has(blks[type].name) || blks[type].plant) ? null : (drop_map.get(type) ?? type);
export const card_geo = new THREE.PlaneGeometry(1, 1);
card_geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3));

export const cube_geo = new THREE.BoxGeometry(1, 1, 1);
cube_geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(24 * 3).fill(1), 3));
