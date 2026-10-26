// Reglas del juego. Las fórmulas salen del análisis de Fallout: New Vegas (carpeta analisis-rea),
// con otros nombres y valores ajustados a una zona pequeña.
import { clamp } from './noise.js';

// experiencia-y-niveles.md: XP total para llegar al nivel N.
export const xpParaNivel = (n) => (n < 2 ? 0 : 25 * (n - 1) * (3 * n + 2));

export function nivelPorXP(xp) {
  let n = 1;
  while (xp >= xpParaNivel(n + 1)) n++;
  return n;
}

export const puntosPorNivel = (int) => 10 + Math.floor(int / 2);
export const vidaMaxima = (res, nivel) => 100 + res * 20 + (nivel - 1) * 5;
export const pamMaximos = (agi) => 65 + 3 * agi;

// XP por matar: depende del nivel de la víctima, no del tuyo (tabla de 5 tramos).
export function xpPorMuerte(nivel, criatura) {
  if (nivel <= 0) return 0;
  if (criatura) return nivel === 1 ? 1 : nivel <= 3 ? 5 : nivel <= 6 ? 10 : nivel <= 9 ? 25 : 50;
  return nivel === 1 ? 10 : nivel <= 7 ? 20 : nivel <= 10 ? 30 : 50;
}

// trueque-y-conversacion.md: precios según la habilidad de Trueque.
export const precioCompra = (valor, trueque) => Math.max(1, Math.round(valor * (1.55 - 0.45 * trueque / 100)));
export const precioVenta = (valor, trueque) => Math.max(1, Math.floor(valor * (0.45 + 0.45 * trueque / 100)));

// formula-de-dano.md: la habilidad escala el daño y el umbral de daño (DT) nunca quita más del 80 %.
export const multHabilidad = (habilidad) => 0.5 + 0.5 * habilidad / 100;
export const danoTrasDT = (dano, dt) => Math.max(dano - dt, dano * 0.2);

// Dispersión del arma en radianes según la habilidad y la postura.
export function dispersion(arma, armas, { moviendo, corriendo, agachado, apuntando }) {
  let d = arma.dispersion * (1 + (100 - armas) / 100);
  if (moviendo) d *= corriendo ? 2.4 : 1.4;
  if (agachado) d *= 0.75;
  if (apuntando) d *= arma.mira ? 0.25 : 0.55;
  return d;
}

// vats-probabilidad.md: la probabilidad compara el área de la parte con el área del cono
// de dispersión a esa distancia y nunca pasa del 95 %.
export const PARTES = {
  cabeza: { nombre: 'Cabeza', radio: 0.16, mult: 2 },
  torso: { nombre: 'Torso', radio: 0.34, mult: 1 },
  brazos: { nombre: 'Brazos', radio: 0.13, mult: 0.75 },
  piernas: { nombre: 'Piernas', radio: 0.2, mult: 0.75 },
};

export function probMira(arma, armas, distancia, parte, escala = 1) {
  const radioCono = Math.max(0.02, distancia * arma.dispersion * (1 + (100 - armas) / 100) * 1.4);
  const radioParte = PARTES[parte].radio * escala;
  const area = Math.min(1, (radioParte / radioCono) ** 2);
  const habilidad = 0.6 + 0.4 * armas / 100;
  return Math.round(clamp(100 * area * habilidad, 1, 95));
}

// sigilo-y-deteccion.md: base −35; oído, vista y Percepción bajan con la distancia;
// por debajo de −20 no pasa nada, entre −20 y 0 hay alerta, por encima de 0 te ven.
export function puntuacionDeteccion({ distancia, enCono, visible, luz, agachado, ruido, sigilo, percepcion }) {
  const atenuacion = clamp(1 - distancia / 70, 0, 1) ** 2;
  const vista = enCono && visible ? 60 * luz * (agachado ? 0.45 : 1) : 0;
  const oido = ruido;
  const per = 10 + 8 * percepcion;
  const castigoSigilo = agachado ? 15 + sigilo * 0.5 : 0;
  return -35 + atenuacion * (per * (enCono && visible ? 1 : 0.35) + vista * 1.4 + oido) - castigoSigilo;
}

export function estadoDeteccion(puntos) {
  if (puntos < -20) return 'oculto';
  if (puntos < 0) return 'alerta';
  return 'detectado';
}

// ---------- modo extremo: sed y cansancio (escala 0–1000, como el H2O y el SLP de New Vegas) ----------
// Cada tramo resta atributos; en el último la sed además quita vida.
export const TRAMOS_SED = [[800, 'Deshidratación grave', { AGI: -2, PER: -2, FUE: -2, RES: -1 }], [500, 'Mucha sed', { AGI: -1, PER: -1, FUE: -1 }], [250, 'Sed', { AGI: -1 }]];
export const TRAMOS_SUENO = [[850, 'Agotamiento', { AGI: -2, PER: -1, INT: -2 }], [600, 'Mucho cansancio', { AGI: -1, INT: -1 }], [300, 'Cansancio', { INT: -1 }]];
export const tramo = (tabla, valor) => tabla.find(([min]) => valor >= min) || null;

// Atributos con lo que restan la sed y el cansancio (nunca por debajo de 1)
export function specialEfectivo(S) {
  const r = { ...S.special };
  if (!S.extremo) return r;
  for (const t of [tramo(TRAMOS_SED, S.sed), tramo(TRAMOS_SUENO, S.cansancio)]) {
    if (!t) continue;
    for (const [k, v] of Object.entries(t[2])) r[k] = Math.max(1, r[k] + v);
  }
  return r;
}

// ---------- carga ----------
export const cargaMaxima = (S) => 150 + specialEfectivo(S).FUE * 10 + (S.ventajas.includes('bolsillos') ? 40 : 0);
export function pesoInventario(S, objetos) {
  let p = 0;
  for (const [id, n] of Object.entries(S.inv)) p += (objetos[id]?.peso || 0) * n;
  return Math.round(p * 10) / 10;
}

// ---------- estado de las armas ----------
// A menos estado, menos daño, más dispersión y, por debajo de la mitad, encasquillamientos.
export const multEstadoDano = (cnd) => 0.55 + 0.45 * cnd / 100;
export const multEstadoDispersion = (cnd) => 1 + (100 - cnd) / 100;
export const probAtasco = (cnd) => (cnd < 50 ? (50 - cnd) / 350 : 0);
// Hasta dónde puedes arreglar un arma tú mismo: depende de Reparar
export const estadoMaximoReparando = (reparar) => Math.min(100, 50 + reparar / 2);

// ---------- karma y fama ----------
export const nombreTramo = (tabla, valor) => tabla.find(([min]) => valor >= min)[1];
