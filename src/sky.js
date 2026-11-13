import * as THREE from 'three';
import { blks, blk_ids, anim_texs } from './blocks.js';
import { col_top } from './world.js';
import { hash, world_sz } from './gen.js';
import { camera, scene } from './gfx.js';

export const water_id = blk_ids.find(id => blks[id].name === 'water');
export const sea_blk = -1, sea_top = sea_blk + 0.5, ocean_sz = 400;

if (water_id) {
  const src = blks[water_id].mats[2];
  const anim = anim_texs.find(a => a.tex === src.map);
  const tile_tex = anim ? new THREE.CanvasTexture(anim.ctx.canvas) : new THREE.Texture(src.map.image);
  (anim ? (anim.extra ??= []) : []).push(tile_tex);
  tile_tex.magFilter = THREE.NearestFilter; tile_tex.minFilter = THREE.NearestFilter;
  tile_tex.colorSpace = THREE.SRGBColorSpace;
  tile_tex.wrapS = tile_tex.wrapT = THREE.RepeatWrapping;
  tile_tex.needsUpdate = true;
  const pos = [], uv = [], idx = [];
  const quad = (x0, z0, x1, z1) => {
    const b = pos.length / 3;
    pos.push(x0, sea_top, z0, x1, sea_top, z0, x0, sea_top, z1, x1, sea_top, z1);
    uv.push(x0, z0, x1, z0, x0, z1, x1, z1);
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  };
  const lo = -world_sz / 2 - 0.5, hi = world_sz / 2 - 0.5, far = ocean_sz;
  quad(-far, -far, far, lo); quad(-far, hi, far, far); quad(-far, lo, lo, hi); quad(hi, lo, far, hi);
  for (let x = -world_sz / 2; x < world_sz / 2; x++) {
    let run = null;
    for (let z = -world_sz / 2; z <= world_sz / 2; z++) {
      const wet = z < world_sz / 2 && col_top.get(`${x},${z}`) < sea_blk;
      if (wet && run === null) run = z;
      if (!wet && run !== null) { quad(x - 0.5, run - 0.5, x + 0.5, z - 0.5); run = null; }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tile_tex, transparent: src.transparent, opacity: src.opacity, alphaTest: src.alphaTest, side: THREE.DoubleSide })));
}

const sun_dir = new THREE.Vector3(0.45, 0.8, -0.4).normalize();
const sun_dist = 150, sun_sz = 34;
const sun_cv = document.createElement('canvas');
sun_cv.width = sun_cv.height = 16;
{
  const g = sun_cv.getContext('2d');
  g.fillStyle = '#ffc928'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#ffdc3c'; g.fillRect(1, 1, 14, 14);
  g.fillStyle = '#ffef7a'; g.fillRect(3, 3, 10, 10);
  g.fillStyle = '#fffbd0'; g.fillRect(5, 5, 6, 6);
}
const sun_tex = new THREE.CanvasTexture(sun_cv);
sun_tex.magFilter = THREE.NearestFilter; sun_tex.minFilter = THREE.NearestFilter;
sun_tex.colorSpace = THREE.SRGBColorSpace;
const sun = new THREE.Mesh(
  new THREE.PlaneGeometry(sun_sz, sun_sz),
  new THREE.MeshBasicMaterial({ map: sun_tex, fog: false, depthWrite: false })
);
sun.renderOrder = -5;
scene.add(sun);

const cloud_y = 80, cloud_cell = 6, cloud_px = 128, cloud_plane = 1200, cloud_drift = 0.45;
const cloud_cut = 0.655;
const cloud_tile = cloud_px * cloud_cell;
function wrap_noise(u, v, period) {
  const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
  const h = (a, b) => hash(((a % period) + period) % period + 700, ((b % period) + period) % period - 700);
  const sx = fu * fu * (3 - 2 * fu), sy = fv * fv * (3 - 2 * fv);
  const top = h(iu, iv) + (h(iu + 1, iv) - h(iu, iv)) * sx, bottom = h(iu, iv + 1) + (h(iu + 1, iv + 1) - h(iu, iv + 1)) * sx;
  return top + (bottom - top) * sy;
}
const cloud_cv = document.createElement('canvas');
cloud_cv.width = cloud_cv.height = cloud_px;
{
  const g = cloud_cv.getContext('2d');
  const img = g.createImageData(cloud_px, cloud_px);
  for (let y = 0; y < cloud_px; y++) for (let x = 0; x < cloud_px; x++) {
    const n = wrap_noise(x / cloud_px * 10, y / cloud_px * 10, 10) * 0.65 + wrap_noise(x / cloud_px * 24, y / cloud_px * 24, 24) * 0.35;
    const i = (y * cloud_px + x) * 4, cloud = n > cloud_cut;
    const shade = n > cloud_cut + 0.07 ? 255 : 247;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = shade;
    img.data[i + 3] = !cloud ? 0 : n > cloud_cut + 0.07 ? 215 : 130;
  }
  g.putImageData(img, 0, 0);
}
const cloud_tex = new THREE.CanvasTexture(cloud_cv);
cloud_tex.magFilter = THREE.NearestFilter; cloud_tex.minFilter = THREE.NearestFilter;
cloud_tex.colorSpace = THREE.SRGBColorSpace;
cloud_tex.wrapS = cloud_tex.wrapT = THREE.RepeatWrapping;
const cloud_rep = cloud_plane / cloud_tile;
cloud_tex.repeat.set(cloud_rep, cloud_rep);
const cloud_fade = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, '#fff'); grad.addColorStop(0.45, '#fff'); grad.addColorStop(1, '#000');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const clouds = new THREE.Mesh(
  new THREE.PlaneGeometry(cloud_plane, cloud_plane),
  new THREE.MeshBasicMaterial({ map: cloud_tex, transparent: true, opacity: 0.9, alphaMap: cloud_fade, fog: false, depthWrite: false, side: THREE.DoubleSide })
);
clouds.rotation.x = -Math.PI / 2;
clouds.renderOrder = -4;
scene.add(clouds);
export function tick_sky(seconds) {
  sun.position.copy(camera.position).addScaledVector(sun_dir, sun_dist);
  sun.lookAt(camera.position);
  const px = camera.position.x, pz = camera.position.z, drift = seconds * cloud_drift;
  clouds.position.set(px, cloud_y, pz);
  cloud_tex.offset.x = (px - drift) / cloud_tile - 0.5 * cloud_rep;
  cloud_tex.offset.y = -pz / cloud_tile - 0.5 * cloud_rep;
}
