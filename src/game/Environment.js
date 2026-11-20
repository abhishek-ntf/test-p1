import * as THREE from 'three';
import { ROAD_HALF, WORLD_SPAN, RECYCLE_Z } from '../utils/Constants.js';

const rand = (a, b) => a + Math.random() * (b - a);

function noiseTexture(renderer, base, repeatX, repeatY) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

function windowTextures() {
  const mk = () => { const c = document.createElement('canvas'); c.width = 128; c.height = 256; return c; };
  const a = mk(), b = mk(), A = a.getContext('2d'), B = b.getContext('2d');
  A.fillStyle = '#8a93a6'; A.fillRect(0, 0, 128, 256);
  B.fillStyle = '#000'; B.fillRect(0, 0, 128, 256);
  for (let r = 0; r < 16; r++) for (let col = 0; col < 8; col++) {
    const lit = Math.random() < 0.38, x = col * 16 + 3, y = r * 16 + 3;
    A.fillStyle = lit ? '#ffe9a8' : '#2a3347'; A.fillRect(x, y, 10, 10);
    if (lit) { B.fillStyle = '#ffcf70'; B.fillRect(x, y, 10, 10); }
  }
  const ta = new THREE.CanvasTexture(a), tb = new THREE.CanvasTexture(b);
  ta.colorSpace = tb.colorSpace = THREE.SRGBColorSpace;
  return [ta, tb];
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.props = [];
    this.disposables = [];
    const track = (o) => { this.disposables.push(o); return o; };

    // Ground (scrolling grass)
    this.grassTex = track(noiseTexture(renderer, '#d8d8d8', 40, 50));
    this.grassMat = track(new THREE.MeshStandardMaterial({ map: this.grassTex, roughness: 1 }));
    const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(400, 500).rotateX(-Math.PI / 2)), this.grassMat);
    ground.position.set(0, -0.06, -200);
    ground.receiveShadow = true;
    this.group.add(ground);

    // Shared materials / geometries
    const trunkMat = track(new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 1 }));
    const leafMat = track(new THREE.MeshStandardMaterial({ color: 0x2f9a4a, roughness: 0.9 }));
    const trunkGeo = track(new THREE.CylinderGeometry(0.18, 0.26, 1.6, 6));
    const leafGeo = track(new THREE.ConeGeometry(1.5, 4, 7));
    const poleMat = track(new THREE.MeshStandardMaterial({ color: 0x70757e, metalness: 0.7, roughness: 0.4 }));
    this.bulbMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd58a, emissiveIntensity: 0.2 }));
    const poleGeo = track(new THREE.CylinderGeometry(0.08, 0.12, 7.2, 8));
    const armGeo = track(new THREE.BoxGeometry(2.4, 0.12, 0.12));
    const bulbGeo = track(new THREE.BoxGeometry(0.7, 0.1, 0.3));
    this.glowTex = track(glowTexture());
    this.glowMat = track(new THREE.MeshBasicMaterial({
      map: this.glowTex, color: 0xffcf80, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const glowGeo = track(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2));
    const [winMap, winEmit] = windowTextures(); track(winMap); track(winEmit);
    this.buildingMat = track(new THREE.MeshStandardMaterial({
      map: winMap, emissive: 0xffffff, emissiveMap: winEmit, emissiveIntensity: 0, roughness: 0.8, metalness: 0.1,
    }));
    const boxGeo = track(new THREE.BoxGeometry(1, 1, 1));

    // Trees: 14 per side
    const treeN = 14, treeStep = WORLD_SPAN / treeN;
    for (const side of [-1, 1]) for (let i = 0; i < treeN; i++) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 0.8;
      const leaves = new THREE.Mesh(leafGeo, leafMat); leaves.position.y = 3.4;
      g.add(trunk, leaves);
      const respawn = (o) => { o.position.x = side * (ROAD_HALF + 3.5 + rand(0, 9)); o.scale.setScalar(rand(0.8, 1.5)); };
      g.position.z = 20 - i * treeStep - rand(0, 6); respawn(g);
      this.add(g, respawn);
    }

    // Street lights: 8 per side, staggered
    const lampN = 8, lampStep = WORLD_SPAN / lampN;
    for (const side of [-1, 1]) for (let i = 0; i < lampN; i++) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.y = 3.6;
      const arm = new THREE.Mesh(armGeo, poleMat); arm.position.set(1.2, 7.1, 0);
      const bulb = new THREE.Mesh(bulbGeo, this.bulbMat); bulb.position.set(2.1, 7.0, 0);
      const glow = new THREE.Mesh(glowGeo, this.glowMat); glow.position.set(2.1, 0.04, 0);
      g.add(pole, arm, bulb, glow);
      g.rotation.y = side < 0 ? 0 : Math.PI;
      g.position.set(side * (ROAD_HALF + 1.1), 0, 10 - i * lampStep - (side > 0 ? lampStep / 2 : 0));
      this.add(g, null);
    }

    // Buildings: 10 per side
    const bN = 10, bStep = WORLD_SPAN / bN;
    for (const side of [-1, 1]) for (let i = 0; i < bN; i++) {
      const m = new THREE.Mesh(boxGeo, this.buildingMat);
      const respawn = (o) => {
        const w = rand(8, 16), d = rand(8, 18), h = rand(10, 38);
        o.scale.set(w, h, d);
        o.position.set(side * (ROAD_HALF + 18 + w / 2 + rand(0, 6)), h / 2, o.position.z);
      };
      m.position.z = 10 - i * bStep - rand(0, 8); respawn(m);
      this.add(m, respawn);
    }

    this.glowMesh = null;
    scene.add(this.group);
  }

  add(obj, respawn) { this.group.add(obj); this.props.push({ obj, respawn }); }

  setTheme(t) {
    this.grassMat.color.set(t.grass);
    this.bulbMat.emissiveIntensity = t.lamp;
    this.buildingMat.emissiveIntensity = t.windows;
    this.glowMat.opacity = t.glow;
  }

  update(dt, speed) {
    const dz = speed * dt;
    this.grassTex.offset.y += dz / 10; // moves texture toward the camera
    for (const p of this.props) {
      p.obj.position.z += dz;
      if (p.obj.position.z > RECYCLE_Z) {
        p.obj.position.z -= WORLD_SPAN;
        if (p.respawn) p.respawn(p.obj);
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.disposables.forEach((d) => d.dispose());
  }
}
