import * as THREE from 'three';

export const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 30, 90);
export const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 700);
camera.rotation.order = 'YXZ';

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

scene.add(camera);

export function lock_mouse() {
  const el = renderer.domElement;
  try {
    const pr = el.requestPointerLock({ unadjustedMovement: true });
    if (pr && pr.catch) pr.catch(() => el.requestPointerLock());
  } catch { el.requestPointerLock(); }
}
