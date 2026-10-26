// Ruido determinista y utilidades numéricas para el terreno y la colocación de objetos.

export function rng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const suave = (t) => t * t * (3 - 2 * t);

export function ruido(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = suave(x - xi), v = suave(y - yi);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, octavas = 4) {
  let s = 0, amp = 0.5, f = 1, norma = 0;
  for (let i = 0; i < octavas; i++) {
    s += amp * ruido(x * f, y * f);
    norma += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / norma;
}

export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Distancia de un punto a una polilínea en el plano XZ.
export function distPolilinea(x, z, pts) {
  let mejor = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const px = ax + dx * t - x, pz = az + dz * t - z;
    mejor = Math.min(mejor, Math.hypot(px, pz));
  }
  return mejor;
}
