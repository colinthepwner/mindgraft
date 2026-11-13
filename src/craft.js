import { blks, blk_ids } from './blocks.js';
import { spawn_drop } from './drops.js';
import { lock_mouse } from './gfx.js';
import { icon_px, stack_max, throw_delay, throw_spd, add_item, draw_cnt, draw_cube, inventory, redraw_bar } from './hud.js';
import { overlay } from './input.js';
import { stop_mining } from './mining.js';
import { eye_pos, look_dir } from './player.js';

let has_pack = false;
const bag = Array(27).fill(null);
const craft_grid = Array(16).fill(null);
const grids = [];
let craft_out = null;
let held_stack = null;
export let ui_open = false;
let inv_sig = '';
let mx = 0, my = 0;

const recipe_defs = [
  { any: { sand: 4 }, out: 'glass', n: 1 },
  { any: { glass: 1 }, out: 'water', n: 1 },
  { any: { log: 1 }, out: 'leaf', n: 2 },
  { any: { leaf: 1 }, out: 'gp-grass', n: 2 },
  { any: { leaf: 2 }, out: 'gp-lilgrass', n: 2 },
  { any: { dirt: 1, 'gp-grass': 1 }, out: 'grass', n: 1 },
];
const recipes = recipe_defs.map(r => ({ ...r, out_id: blk_ids.find(i => blks[i].name === r.out) })).filter(r => r.out_id);

function find_recipe() {
  const blk_names = craft_grid.map(c => c ? blks[c.id].name : null);
  let x0 = 4, y0 = 4, x1 = -1, y1 = -1;
  for (let i = 0; i < 16; i++) if (blk_names[i]) {
    const x = i % 4, y = i >> 2;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (x1 < 0) return null;

  const have = {};
  for (const n of blk_names) if (n) have[n] = (have[n] ?? 0) + 1;
  for (const r of recipes) if (r.any && Object.keys(r.any).length === Object.keys(have).length && Object.entries(r.any).every(([n, c]) => have[n] === c)) return r;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  for (const r of recipes) {
    if (r.any || r.pat[0].length !== w || r.pat.length !== h) continue;
    for (const flip of [false, true]) {
      let ok = true;
      for (let y = 0; y < h && ok; y++) for (let x = 0; x < w; x++) {
        const k = r.pat[y][flip ? w - 1 - x : x];
        if ((blk_names[(y0 + y) * 4 + x0 + x] ?? null) !== (k === '.' ? null : r.key[k])) { ok = false; break; }
      }
      if (ok) return r;
    }
  }
  return null;
}

function craft_refresh() {
  const r = find_recipe();
  craft_out = r ? { id: r.out_id, n: r.n, r } : null;
  paint_all();
}

function take_craft() {
  const o = craft_out;
  if (!o) return;
  if (held_stack && (held_stack.id !== o.id || held_stack.count + o.n > stack_max)) return;
  if (held_stack) held_stack.count += o.n; else held_stack = { id: o.id, count: o.n };
  for (let i = 0; i < 16; i++) if (craft_grid[i] && !--craft_grid[i].count) craft_grid[i] = null;
  craft_refresh();
}

function slot_click(arr, i, right) {
  const s = arr[i];
  if (!held_stack) {
    if (!s) return;
    if (right && s.count > 1) { const half = Math.ceil(s.count / 2); held_stack = { id: s.id, count: half }; s.count -= half; }
    else { held_stack = s; arr[i] = null; }
  } else if (!s) {
    if (right) { arr[i] = { id: held_stack.id, count: 1 }; if (!--held_stack.count) held_stack = null; }
    else { arr[i] = held_stack; held_stack = null; }
  } else if (s.id === held_stack.id) {
    const room = stack_max - s.count, mv = right ? Math.min(1, room) : Math.min(held_stack.count, room);
    s.count += mv; held_stack.count -= mv;
    if (!held_stack.count) held_stack = null;
  } else if (!right) { arr[i] = held_stack; held_stack = s; }
  if (arr === inventory) redraw_bar();
  craft_refresh();
}

const craft_el = document.createElement('div');
craft_el.id = 'craft';
document.body.appendChild(craft_el);
const held_el = document.createElement('div');
held_el.id = 'held_item';
held_el.className = 'slot';
document.body.appendChild(held_el);
const held_slot = { el: held_el, icon: document.createElement('canvas'), cnt: document.createElement('canvas') };
held_slot.icon.width = held_slot.icon.height = icon_px;
held_slot.cnt.width = held_slot.cnt.height = 20;
held_slot.cnt.className = 'count';
held_el.append(held_slot.icon, held_slot.cnt);
let out_slot = null;

const arrow_bits = ['.......X....', '.......XX...', '.......XXX..', 'XXXXXXXXXXX.', 'XXXXXXXXXXXX', 'XXXXXXXXXXX.', '.......XXX..', '.......XX...', '.......X....'];

function make_slot() {
  const el = document.createElement('div');
  el.className = 'slot';
  const icon = document.createElement('canvas');
  icon.width = icon.height = icon_px;
  const cnt = document.createElement('canvas');
  cnt.width = cnt.height = 20;
  cnt.className = 'count';
  el.append(icon, cnt);
  return { el, icon, cnt };
}

function make_grid(arr, cols) {
  const el = document.createElement('div');
  el.className = 'grid';
  el.style.gridTemplateColumns = `repeat(${cols}, calc(19 * var(--u)))`;
  el.style.gridAutoRows = 'calc(19 * var(--u))';
  const slots = arr.map((_, i) => {
    const sl = make_slot();
    sl.el.addEventListener('mousedown', e => { e.preventDefault(); slot_click(arr, i, e.button === 2); });
    el.appendChild(sl.el);
    return sl;
  });
  grids.push({ arr, slots });
  return el;
}

function paint_slot(sl, item) {
  const g = sl.icon.getContext('2d');
  g.clearRect(0, 0, icon_px, icon_px);
  if (item) {
    const b = blks[item.id];
    if (b.plant) { g.imageSmoothingEnabled = false; g.drawImage(b.icon, 0, 0, icon_px, icon_px); }
    else draw_cube(g, b.icon, b.side_img);
  }
  draw_cnt(sl.cnt, item ? item.count : 0);
}

function paint_all() {
  if (!ui_open) return;
  for (const g of grids) g.slots.forEach((sl, i) => paint_slot(sl, g.arr[i]));
  if (out_slot) paint_slot(out_slot, craft_out && { id: craft_out.id, count: craft_out.n });
  held_el.style.display = held_stack ? 'block' : 'none';
  if (held_stack) paint_slot(held_slot, held_stack);
}

function build_craft_ui() {
  craft_el.replaceChildren();
  grids.length = 0;
  const row = () => { const r = document.createElement('div'); r.className = 'row'; craft_el.appendChild(r); return r; };
  if (has_pack) row().appendChild(make_grid(bag, 9));
  const mid = row();
  mid.appendChild(make_grid(craft_grid, 4));
  const ar = document.createElement('canvas');
  ar.width = 12; ar.height = 9; ar.className = 'arrow';
  const g = ar.getContext('2d');
  g.fillStyle = '#8b8b8b';
  arrow_bits.forEach((line, y) => { for (let x = 0; x < 12; x++) if (line[x] === 'X') g.fillRect(x, y, 1, 1); });
  mid.appendChild(ar);
  out_slot = make_slot();
  out_slot.el.addEventListener('mousedown', e => { e.preventDefault(); take_craft(); });
  mid.appendChild(out_slot.el);
  row().appendChild(make_grid(inventory, 9));
}

function place_craft() {
  if (!ui_open) return;
  const dpr = window.devicePixelRatio || 1;
  craft_el.style.left = Math.round((innerWidth - craft_el.offsetWidth) / 2 * dpr) / dpr + 'px';
  craft_el.style.top = Math.round((innerHeight - craft_el.offsetHeight) / 2 * dpr) / dpr + 'px';
}
addEventListener('guiscale', place_craft);

function give_back(st) {
  for (let i = 0; i < st.count; i++) {
    if (add_item(st.id)) continue;
    const v = look_dir.clone().multiplyScalar(throw_spd);
    v.y += 1.5;
    spawn_drop(st.id, eye_pos.x + look_dir.x * 0.5, eye_pos.y - 0.25, eye_pos.z + look_dir.z * 0.5, { vel: v, delay: throw_delay });
  }
}

function open_craft() {
  if (ui_open) return;
  ui_open = true;
  stop_mining();
  build_craft_ui();
  craft_el.style.display = 'block';
  document.exitPointerLock();
  inv_sig = JSON.stringify(inventory);
  craft_refresh();
  place_craft();
}

function close_craft() {
  if (!ui_open) return;
  for (let i = 0; i < 16; i++) if (craft_grid[i]) { give_back(craft_grid[i]); craft_grid[i] = null; }
  if (held_stack) { give_back(held_stack); held_stack = null; }
  craft_out = null;
  ui_open = false;
  craft_el.style.display = 'none';
  held_el.style.display = 'none';
  redraw_bar();
  lock_mouse();
  if (!document.pointerLockElement) overlay.style.display = 'block';
}

export function craft_tick() {
  if (!ui_open) return;
  const sig = JSON.stringify(inventory);
  if (sig !== inv_sig) { inv_sig = sig; paint_all(); }
}

addEventListener('mousemove', e => {
  mx = e.clientX; my = e.clientY;
  if (!ui_open) return;
  const u = window.guiUnit || 3;
  held_el.style.left = mx - 10 * u + 'px';
  held_el.style.top = my - 10 * u + 'px';
});
addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'KeyE') { if (ui_open) close_craft(); else if (document.pointerLockElement) open_craft(); }
  else if (e.code === 'Escape' && ui_open) close_craft();
});
