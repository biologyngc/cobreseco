// Texturas generadas en un lienzo: estuco de adobe, tablas de madera, chapa ondulada, arena y piedra.
// Se generan una vez al arrancar y se repiten sobre las superficies.
import * as THREE from 'three';
import { fbm, rng } from './noise.js';

const cache = new Map();

function lienzo(tam, dibujar) {
  const c = document.createElement('canvas');
  c.width = c.height = tam;
  const x = c.getContext('2d');
  dibujar(x, tam);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Ruido periódico para que la textura se repita sin costuras
function ruidoPeriodico(x, y, tam, escala, oct = 4) {
  const u = x / tam, v = y / tam;
  const a = fbm(u * escala, v * escala, oct), b = fbm((u - 1) * escala, v * escala, oct);
  const c = fbm(u * escala, (v - 1) * escala, oct), d = fbm((u - 1) * escala, (v - 1) * escala, oct);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function rellenarRuido(x, tam, fn) {
  const img = x.createImageData(tam, tam);
  for (let j = 0; j < tam; j++) {
    for (let i = 0; i < tam; i++) {
      const [r, g, b] = fn(i, j);
      const p = (j * tam + i) * 4;
      img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; img.data[p + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
}

// Estuco claro y neutro: el color lo pone el material (se multiplica)
export function estuco() {
  if (cache.has('estuco')) return cache.get('estuco');
  const R = rng(11);
  const t = lienzo(256, (x, tam) => {
    rellenarRuido(x, tam, (i, j) => {
      const n = ruidoPeriodico(i, j, tam, 6, 4), f = ruidoPeriodico(i, j, tam, 40, 2);
      const v = 205 + (n - 0.5) * 70 + (f - 0.5) * 30 + (R() - 0.5) * 14;
      return [v, v * 0.97, v * 0.93];
    });
    // Grietas finas
    x.strokeStyle = 'rgba(70,45,30,0.35)';
    x.lineWidth = 1;
    for (let k = 0; k < 7; k++) {
      let px = R() * tam, py = R() * tam;
      x.beginPath();
      x.moveTo(px, py);
      for (let s = 0; s < 6; s++) { px += (R() - 0.5) * 26; py += R() * 16; x.lineTo(px, py); }
      x.stroke();
    }
  });
  cache.set('estuco', t);
  return t;
}

export function madera() {
  if (cache.has('madera')) return cache.get('madera');
  const R = rng(23);
  const t = lienzo(256, (x, tam) => {
    const tablas = 6, alto = tam / tablas;
    const tonos = Array.from({ length: tablas }, () => 175 + (R() - 0.5) * 50);
    rellenarRuido(x, tam, (i, j) => {
      const k = Math.floor(j / alto);
      const veta = Math.sin((i / tam) * Math.PI * 2 * (3 + k) + fbm(i * 0.05, j * 0.3, 2) * 6) * 0.5 + 0.5;
      const v = tonos[k] * (0.82 + veta * 0.18);
      return [v, v * 0.9, v * 0.78];
    });
    for (let k = 0; k < tablas; k++) {
      x.fillStyle = 'rgba(40,25,15,0.55)';
      x.fillRect(0, k * alto, tam, 2);
      // Clavos
      x.fillStyle = 'rgba(30,25,20,0.7)';
      x.fillRect(12, k * alto + alto / 2 - 2, 3, 3);
      x.fillRect(tam - 15, k * alto + alto / 2 - 2, 3, 3);
    }
  });
  cache.set('madera', t);
  return t;
}

export function chapa() {
  if (cache.has('chapa')) return cache.get('chapa');
  const R = rng(37);
  const t = lienzo(256, (x, tam) => {
    rellenarRuido(x, tam, (i, j) => {
      const onda = Math.sin((i / tam) * Math.PI * 2 * 12) * 0.5 + 0.5;
      const oxido = Math.max(0, ruidoPeriodico(i, j, tam, 5, 4) - 0.45) * 2.2 + Math.max(0, Math.sin(j * 0.05 + i * 0.002) - 0.8);
      const base = 150 + onda * 60 + (R() - 0.5) * 10;
      return [base * (1 - oxido * 0.2) + oxido * 90, base * (1 - oxido * 0.45), base * (1 - oxido * 0.65)];
    });
  });
  cache.set('chapa', t);
  return t;
}

export function arena() {
  if (cache.has('arena')) return cache.get('arena');
  const R = rng(51);
  const t = lienzo(256, (x, tam) => {
    rellenarRuido(x, tam, (i, j) => {
      const ondas = Math.sin((i + ruidoPeriodico(i, j, tam, 3, 2) * 120) / tam * Math.PI * 2 * 9) * 0.5 + 0.5;
      const g = ruidoPeriodico(i, j, tam, 30, 2);
      const v = 200 + (ondas - 0.5) * 22 + (g - 0.5) * 40 + (R() - 0.5) * 26;
      return [v, v, v];
    });
  });
  cache.set('arena', t);
  return t;
}

export function piedra() {
  if (cache.has('piedra')) return cache.get('piedra');
  const R = rng(67);
  const t = lienzo(256, (x, tam) => {
    rellenarRuido(x, tam, (i, j) => {
      const n = ruidoPeriodico(i, j, tam, 8, 5);
      const v = 150 + (n - 0.5) * 120 + (R() - 0.5) * 20;
      return [v, v * 0.96, v * 0.9];
    });
  });
  cache.set('piedra', t);
  return t;
}

// Copia con otra repetición (cada superficie tiene su tamaño)
export function repetida(base, rx, ry) {
  const t = base.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}
