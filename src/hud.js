import { blks } from './blocks.js';
import { spawn_drop } from './drops.js';
import { max_hp, arm, eye_pos, look_dir, player } from './player.js';

export const icon_px = 32;
export function draw_cube(ctx, top_img, side_img) {
  const A = icon_px / 2, B = icon_px / 4, C = icon_px / 2;
  const k = A / 16;
  ctx.imageSmoothingEnabled = false;
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = icon_px;
  const t = tmp.getContext('2d');
  t.imageSmoothingEnabled = false;
  const face = (img, m, shade) => {
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.clearRect(0, 0, icon_px, icon_px);
    t.setTransform(...m);
    t.drawImage(img, 0, 0, 16, 16);
    if (shade) {
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.globalCompositeOperation = 'source-atop';
      t.fillStyle = `rgba(0,0,0,${shade})`;
      t.fillRect(0, 0, icon_px, icon_px);
      t.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(tmp, 0, 0);
  };
  const cx = icon_px / 2, top = 0;
  face(side_img, [k, B / 16, 0, C / 16, cx - A, top + B], 0.25);
  face(side_img, [k, -B / 16, 0, C / 16, cx, top + 2 * B], 0.45);
  face(top_img, [k, B / 16, -k, B / 16, cx, top], 0);
}
export const slots_n = 9, stack_max = 25;
export const inventory = Array(slots_n).fill(null);
let sel_slot = 0;
export let held_blk = null;
const hotbar = document.getElementById('hotbar');
const slot_els = [], icon_cvs = [], cnt_cvs = [];
for (let i = 0; i < slots_n; i++) {
  const el = document.createElement('div');
  el.className = 'slot';
  const icon = document.createElement('canvas');
  icon.width = icon.height = icon_px;
  const count = document.createElement('canvas');
  count.width = count.height = 20;
  count.className = 'count';
  el.append(icon, count);
  hotbar.appendChild(el);
  slot_els.push(el); icon_cvs.push(icon); cnt_cvs.push(count);
}
const digits = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111',
};
export function draw_cnt(canvas, n) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 20, 20);
  if (n <= 1) return;
  const text = String(n), w = text.length * 4 - 1, x0 = 18 - w, y0 = 13;
  for (const [dx, dy, colour] of [[1, 1, '#3f3f3f'], [0, 0, '#ffffff']]) {
    g.fillStyle = colour;
    [...text].forEach((ch, ci) => {
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++)
        if (digits[ch][r * 3 + c] === '1') g.fillRect(x0 + ci * 4 + c + dx, y0 + r + dy, 1, 1);
    });
  }
}
export function redraw_bar() {
  for (let i = 0; i < slots_n; i++) {
    const item = inventory[i], icon = icon_cvs[i];
    if (item) {
      if (icon.dataset.id !== String(item.id)) {
        const g = icon.getContext('2d');
        g.clearRect(0, 0, icon_px, icon_px);
        if (blks[item.id].plant) { g.imageSmoothingEnabled = false; g.drawImage(blks[item.id].icon, 0, 0, icon_px, icon_px); }
        else draw_cube(g, blks[item.id].icon, blks[item.id].side_img);
        icon.dataset.id = item.id;
      }
      icon.style.visibility = 'visible';
      slot_els[i].title = blks[item.id].name;
    } else {
      icon.style.visibility = 'hidden';
      delete icon.dataset.id;
      slot_els[i].title = '';
    }
    draw_cnt(cnt_cvs[i], item ? item.count : 0);
    slot_els[i].classList.toggle('sel', i === sel_slot);
  }
  held_blk = inventory[sel_slot]?.id ?? null;
}
export function pick_slot(i) {
  if (i < 0 || i >= slots_n) return;
  sel_slot = i;
  redraw_bar();
}
export function can_add(id) {
  return inventory.some(it => it && it.id === id && it.count < stack_max) || inventory.some(it => !it);
}
export function add_item(id) {
  let slot = inventory.findIndex(it => it && it.id === id && it.count < stack_max);
  if (slot < 0) slot = inventory.findIndex(it => !it);
  if (slot < 0) return false;
  if (inventory[slot]) inventory[slot].count++; else inventory[slot] = { id, count: 1 };
  redraw_bar();
  return true;
}
export const throw_spd = 6, throw_delay = 1.6;
export function throw_one() {
  const item = inventory[sel_slot];
  if (!item) return;
  const id = item.id;
  use_one();
  arm.t = 0;
  const vel = look_dir.clone().multiplyScalar(throw_spd);
  vel.y += 1.5;
  spawn_drop(id, eye_pos.x + look_dir.x * 0.5, eye_pos.y - 0.25 + look_dir.y * 0.5, eye_pos.z + look_dir.z * 0.5, { vel, delay: throw_delay });
}
export function use_one() {
  const item = inventory[sel_slot];
  if (!item) return;
  if (--item.count <= 0) inventory[sel_slot] = null;
  redraw_bar();
}

function place_bar() {
  const dpr = window.devicePixelRatio || 1, u = window.guiUnit || 3;
  const width = (slots_n * 19 + 1) * u;
  const left = Math.round((innerWidth - width) / 2 * dpr) / dpr + 'px';
  hotbar.style.left = left;
  hearts_el.style.left = left;
}

const hearts_el = document.getElementById('hearts');
const hurt_el = document.getElementById('hurt');
const hearts_cv = document.createElement('canvas');
hearts_cv.width = 81; hearts_cv.height = 9;
hearts_el.appendChild(hearts_cv);
const heart_px = [
  '.XX...XX.',
  'XXXX.XXXX',
  'XXXXXXXXX',
  'XXXXXXXXX',
  'XXXXXXXXX',
  '.XXXXXXX.',
  '..XXXXX..',
  '...XXX...',
  '....X....',
];
const in_heart = (x, y) => heart_px[y]?.[x] === 'X';
function draw_hearts() {
  const g = hearts_cv.getContext('2d');
  g.clearRect(0, 0, 81, 9);
  for (let i = 0; i < max_hp / 2; i++) {
    const hp = player.hp - i * 2;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      if (!in_heart(x, y)) continue;
      const edge = !in_heart(x - 1, y) || !in_heart(x + 1, y) || !in_heart(x, y - 1) || !in_heart(x, y + 1);
      const lit = hp >= 2 || (hp === 1 && x <= 4);
      g.fillStyle = edge ? '#000' : lit ? ((x === 2 && y === 2) ? '#ff9a9a' : '#e8141c') : '#3a1a1a';
      g.fillRect(i * 8 + x, y, 1, 1);
    }
  }
}
let drawn_hp = -1;
export function hud_tick() {
  hurt_el.style.opacity = player.flash_t;
  if (player.hp !== drawn_hp) { drawn_hp = player.hp; draw_hearts(); }
}
addEventListener('guiscale', place_bar);
place_bar();
redraw_bar();

let last_scroll = 0;

document.addEventListener('wheel', e => {
  if (!document.pointerLockElement || !e.deltaY) return;
  const now = performance.now();
  if (now - last_scroll < 60) return;
  last_scroll = now;
  pick_slot((sel_slot + (e.deltaY > 0 ? 1 : -1) + slots_n) % slots_n);
});
