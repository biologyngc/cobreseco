// Colisiones de los edificios descargados. Sus triángulos se pasan a una rejilla de celdas de 20 cm:
// en cada celda se guarda la altura del suelo (la superficie horizontal más baja que mira hacia arriba)
// y si algo corta el paso entre 0.4 y 1.8 m por encima de ese suelo (paredes, mostradores, mesas,
// escaleras). Así se puede entrar por las puertas y andar por dentro sin cajas hechas a mano.
import * as THREE from 'three';

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();

// obj: el edificio ya colocado en la escena. base: altura del terreno en su sitio.
export function crearRejilla(obj, base, { celda = 0.2, margen = 0.6, bajo = 0.4, alto = 1.8 } = {}) {
  obj.updateMatrixWorld(true);
  const tris = [];
  const caja = new THREE.Box3();
  obj.traverseVisible((m) => {
    if (!m.isMesh || m.userData.sinColision) return;
    const pos = m.geometry.attributes.position, idx = m.geometry.index;
    const total = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < total; i += 3) {
      a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(m.matrixWorld);
      // Lo que queda muy por encima de una persona (tejados, segundo piso) no hace falta
      if (Math.min(a.y, b.y, c.y) > base + 3.2) continue;
      tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      caja.expandByPoint(a).expandByPoint(b).expandByPoint(c);
    }
  });
  const x0 = caja.min.x - margen, z0 = caja.min.z - margen;
  const nx = Math.ceil((caja.max.x + margen - x0) / celda), nz = Math.ceil((caja.max.z + margen - z0) / celda);
  const suelo = new Float32Array(nx * nz).fill(Infinity);
  const bloq = new Uint8Array(nx * nz);
  // Altura de lo que hay en cada celda sobre su suelo: un mostrador tapa hasta 1,1 m, una pared hasta el techo
  const altura = new Float32Array(nx * nz);
  const indice = (x, z) => {
    const i = Math.floor((x - x0) / celda), k = Math.floor((z - z0) / celda);
    return i < 0 || k < 0 || i >= nx || k >= nz ? -1 : k * nx + i;
  };
  // Recorre puntos repartidos por el triángulo, a menos de una celda entre sí
  const muestrear = (t, fn) => {
    a.fromArray(tris, t); b.fromArray(tris, t + 3); c.fromArray(tris, t + 6);
    const lado = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const pasos = Math.max(1, Math.ceil(lado / (celda * 0.7)));
    for (let i = 0; i <= pasos; i++) {
      for (let j = 0; j <= pasos - i; j++) {
        const u = i / pasos, v = j / pasos;
        fn(a.x + (b.x - a.x) * u + (c.x - a.x) * v, a.y + (b.y - a.y) * u + (c.y - a.y) * v, a.z + (b.z - a.z) * u + (c.z - a.z) * v);
      }
    }
  };
  // 1) Suelo: superficies que miran hacia arriba cerca de la base
  for (let t = 0; t < tris.length; t += 9) {
    a.fromArray(tris, t); b.fromArray(tris, t + 3); c.fromArray(tris, t + 6);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const l = n.length();
    if (l < 1e-9 || n.y / l < 0.7) continue;
    muestrear(t, (x, y, z) => {
      if (y - base > 0.9 || y - base < -0.8) return;
      const i = indice(x, z);
      if (i >= 0 && y < suelo[i]) suelo[i] = y;
    });
  }
  // 2) Bloqueo: cualquier cosa a altura de persona sobre el suelo de su celda
  for (let t = 0; t < tris.length; t += 9) {
    muestrear(t, (x, y, z) => {
      const i = indice(x, z);
      if (i < 0) return;
      const s = suelo[i] === Infinity ? base : suelo[i];
      const ry = y - s;
      if (ry > bajo && ry < alto) bloq[i] = 1;
      if (ry > bajo && ry > altura[i]) altura[i] = ry;
    });
  }
  return { x0, z0, x1: x0 + nx * celda, z1: z0 + nz * celda, nx, nz, celda, base, suelo, bloq, altura, indice };
}

// Altura del suelo de la rejilla en (x, z), o null si ahí no hay suelo del edificio
export function sueloRejilla(r, x, z) {
  const i = r.indice(x, z);
  if (i < 0) return null;
  const s = r.suelo[i];
  return s === Infinity ? null : s;
}

// Saca un círculo de las celdas bloqueadas. Devuelve true si chocó.
export function empujarRejilla(r, p, radio) {
  if (p.x < r.x0 - radio || p.x > r.x1 + radio || p.z < r.z0 - radio || p.z > r.z1 + radio) return false;
  if (p.y > r.base + 2.4 || p.y < r.base - 1.5) return false;
  const C = r.celda;
  let choco = false;
  // Dos pasadas: al salir de una celda se puede entrar en la de al lado
  for (let pasada = 0; pasada < 2; pasada++) {
    const i0 = Math.max(0, Math.floor((p.x - radio - r.x0) / C)), i1 = Math.min(r.nx - 1, Math.floor((p.x + radio - r.x0) / C));
    const k0 = Math.max(0, Math.floor((p.z - radio - r.z0) / C)), k1 = Math.min(r.nz - 1, Math.floor((p.z + radio - r.z0) / C));
    let mx = 0, mz = 0, nmax = 0;
    for (let k = k0; k <= k1; k++) {
      for (let i = i0; i <= i1; i++) {
        if (!r.bloq[k * r.nx + i]) continue;
        const cx0 = r.x0 + i * C, cz0 = r.z0 + k * C;
        const qx = Math.min(Math.max(p.x, cx0), cx0 + C), qz = Math.min(Math.max(p.z, cz0), cz0 + C);
        const dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz);
        if (d >= radio) continue;
        // Empuje acumulado: la suma de todas las celdas que tocan, para no rebotar entre ellas
        const fuerza = radio - d;
        if (d > 1e-5) { mx += (dx / d) * fuerza; mz += (dz / d) * fuerza; } else { mx += (p.x - (cx0 + C / 2)) || 0.01; mz += (p.z - (cz0 + C / 2)); }
        nmax = Math.max(nmax, fuerza);
      }
    }
    const l = Math.hypot(mx, mz);
    if (l < 1e-6) break;
    choco = true;
    p.x += (mx / l) * nmax;
    p.z += (mz / l) * nmax;
  }
  return choco;
}

// ¿El segmento a→b atraviesa una pared de la rejilla a altura de persona?
export function cortaRejilla(r, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y;
  // Tramo del segmento dentro de la caja de la rejilla
  let t0 = 0, t1 = 1;
  for (const [o, d, mn, mx] of [[a.x, dx, r.x0, r.x1], [a.z, dz, r.z0, r.z1]]) {
    if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return false; continue; }
    let ta = (mn - o) / d, tb = (mx - o) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  const largo = Math.hypot(dx, dz) * (t1 - t0);
  const pasos = Math.ceil(largo / (r.celda * 0.8));
  for (let s = 0; s <= pasos; s++) {
    const t = t0 + (t1 - t0) * (pasos ? s / pasos : 0);
    const y = a.y + dy * t;
    if (y < r.base + 0.3 || y > r.base + 2.2) continue;
    const i = r.indice(a.x + dx * t, a.z + dz * t);
    if (i < 0 || !r.bloq[i]) continue;
    // Solo corta si la línea pasa por debajo de lo alto que es el obstáculo
    const piso = r.suelo[i] === Infinity ? r.base : r.suelo[i];
    if (y < piso + r.altura[i] + 0.05) return true;
  }
  return false;
}
