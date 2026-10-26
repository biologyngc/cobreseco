// Efectos breves: polvo de impactos, sangre, cristales y estelas de bala.
import * as THREE from 'three';
import { G } from './state.js';

export function crearEfectos(escena) {
  const MAX = 400;
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3);
  const vel = [], vida = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) { vel.push(new THREE.Vector3()); pos[i * 3 + 1] = -9999; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const puntos = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
  puntos.frustumCulled = false;
  escena.add(puntos);
  let siguiente = 0;
  const c = new THREE.Color();

  function chispas(p, n, color, fuerza = 2.5, arriba = 1.5) {
    c.set(color);
    for (let k = 0; k < n; k++) {
      const i = siguiente;
      siguiente = (siguiente + 1) % MAX;
      pos.set([p.x, p.y, p.z], i * 3);
      col.set([c.r * (0.8 + Math.random() * 0.4), c.g * (0.8 + Math.random() * 0.4), c.b * (0.8 + Math.random() * 0.4)], i * 3);
      vel[i].set((Math.random() - 0.5) * fuerza, Math.random() * arriba + 0.3, (Math.random() - 0.5) * fuerza);
      vida[i] = 0.5 + Math.random() * 0.6;
    }
  }

  const estelas = [];
  const estelaMat = new THREE.LineBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.8 });

  const ef = {
    polvo: (p) => chispas(p, 10, '#c9a77e', 2.2, 1.6),
    // Chispa de la mecha encendida
    chispa: (p) => chispas(p, 1, '#ffc36a', 0.8, 0.6),
    // Explosión: tierra, fuego y piedras
    explosion: (p) => {
      chispas(p, 70, '#b08a62', 9, 7);
      chispas(p, 40, '#ff9a3a', 6, 5);
      chispas(p, 25, '#4a3a2e', 11, 9);
    },
    // Sangre en el suelo tras un golpe de pico
    golpe: (p) => chispas(p, 8, '#6a1410', 1.6, 1.2),
    sangre: (p) => chispas(p, 12, '#7a1712', 2.4, 1.2),
    cristal: (p) => chispas(p, 18, '#9fe0b0', 3, 2.4),
    estela: (a, b) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), estelaMat.clone());
      escena.add(l);
      estelas.push({ l, t: 0.07 });
    },
    zumbido: (origen) => {
      G.audio?.zumbido();
      const J = G.jugador;
      const p = J.centro();
      p.x += (Math.random() - 0.5) * 1.6;
      p.y += Math.random() * 0.8;
      p.z += (Math.random() - 0.5) * 1.6;
      ef.estela(origen.clone().setY(origen.y + 1.4), p);
    },
    actualizar(dt) {
      for (let i = 0; i < MAX; i++) {
        if (vida[i] <= 0) continue;
        vida[i] -= dt;
        vel[i].y -= 9 * dt;
        pos[i * 3] += vel[i].x * dt;
        pos[i * 3 + 1] += vel[i].y * dt;
        pos[i * 3 + 2] += vel[i].z * dt;
        if (vida[i] <= 0) pos[i * 3 + 1] = -9999;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      for (let k = estelas.length - 1; k >= 0; k--) {
        const e = estelas[k];
        e.t -= dt;
        e.l.material.opacity = Math.max(0, e.t / 0.07) * 0.8;
        if (e.t <= 0) {
          escena.remove(e.l);
          e.l.geometry.dispose();
          estelas.splice(k, 1);
        }
      }
    },
  };
  return ef;
}
