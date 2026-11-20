import * as THREE from 'three';

/** Pooled spark particles (one Points object, zero allocations while playing). */
export class Effects {
  constructor(scene, count = 80) {
    this.scene = scene; this.n = count; this.next = 0;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -100;
    this.geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.geo.setAttribute('position', this.attr);
    this.mat = new THREE.PointsMaterial({
      color: 0xffb347, size: 0.35, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** dirX: preferred horizontal direction of the sparks (-1 / 0 / 1). */
  burst(x, y, z, count = 18, dirX = 0, speed = 9) {
    for (let k = 0; k < count; k++) {
      const i = this.next++ % this.n, j = i * 3;
      this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
      this.vel[j] = dirX * speed * (0.3 + Math.random()) + (Math.random() - 0.5) * speed * 0.8;
      this.vel[j + 1] = Math.random() * speed * 0.7;
      this.vel[j + 2] = (Math.random() - 0.5) * speed;
      this.life[i] = 0.35 + Math.random() * 0.45;
    }
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      const j = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[j + 1] = -100; continue; }
      this.vel[j + 1] -= 20 * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] = Math.max(0.05, this.pos[j + 1] + this.vel[j + 1] * dt);
      this.pos[j + 2] += this.vel[j + 2] * dt;
    }
    if (any) this.attr.needsUpdate = true;
  }

  dispose() { this.scene.remove(this.points); this.geo.dispose(); this.mat.dispose(); }
}
