// Estado compartido entre módulos y datos de la partida que se guardan.
import { vidaMaxima, pamMaximos } from './rules.js';

export const G = {
  escena: null, camara: null, render: null, mundo: null, jugador: null, ui: null, audio: null,
  actores: [],
  modal: null, // nombre del panel abierto; el mundo se congela mientras haya uno
  jugando: false,
  escalaTiempo: 1,
  deteccion: -100,
  s: null, // partida guardable
};

const CLAVE = 'cobreseco-partida-v1';

export function partidaNueva() {
  const special = { FUE: 5, PER: 6, RES: 5, CAR: 5, INT: 6, AGI: 6, SUE: 5 };
  return completarPartida({
    special,
    hab: { armas: 30, cuerpo: 25, explosivos: 20, sigilo: 25, ganzua: 25, ciencia: 20, habla: 25, trueque: 20, reparar: 20, medicina: 20, supervivencia: 20 },
    xp: 0, nivel: 1, puntos: 0,
    vida: vidaMaxima(special.RES, 1), pa: pamMaximos(special.AGI),
    cobres: 25,
    inv: { ropa_viaje: 1, agua: 2 },
    equipo: { arma: null, ropa: 'ropa_viaje' },
    cargadores: {},
    pos: [-18.9, 0, -7.4], yaw: -2.42,
    hora: 17.1, dia: 1,
    misiones: {}, activa: null,
    flags: {},
    lugares: { cobreseco: true },
    muertos: {}, saqueados: {},
    bajas: 0,
  });
}

// Campos que fueron llegando con las versiones: una partida guardada antes los recibe al cargarse
export function completarPartida(s) {
  s.hab = { cuerpo: 25, explosivos: 20, supervivencia: 20, ...s.hab };
  s.karma ??= 0;
  s.fama ??= { pueblo: { fama: 0, infamia: 0 }, cuervos: { fama: 0, infamia: 0 } };
  s.ventajas ??= [];
  s.ventajasPendientes ??= 0;
  // Estado de cada arma (0–100): el baúl guarda armas usadas, no nuevas
  s.cnd = { pistola9: 72, rifle308: 85, escopeta: 68, pico: 90, ...s.cnd };
  s.sed ??= 120;
  s.cansancio ??= 80;
  s.extremo ??= true;
  s.miembros ??= { cabeza: 100, brazos: 100, piernas: 100 };
  s.crimen ??= null;
  s.contenedores ??= {};
  s.notas ??= [];
  s.marcas ??= [];
  return s;
}

export function guardar() {
  if (!G.s) return;
  try {
    if (G.jugador) {
      const p = G.jugador.pos;
      G.s.pos = [p.x, p.y, p.z];
      G.s.yaw = G.jugador.yaw;
    }
    localStorage.setItem(CLAVE, JSON.stringify(G.s));
  } catch { /* sin almacenamiento: la partida sigue en memoria */ }
}

export function cargarGuardada() {
  try {
    const t = localStorage.getItem(CLAVE);
    return t ? completarPartida(JSON.parse(t)) : null;
  } catch {
    return null;
  }
}

export const cuenta = (id) => G.s.inv[id] || 0;

export function dar(id, n = 1) {
  G.s.inv[id] = (G.s.inv[id] || 0) + n;
}

export function quitar(id, n = 1) {
  const q = Math.min(n, G.s.inv[id] || 0);
  G.s.inv[id] -= q;
  if (G.s.inv[id] <= 0) delete G.s.inv[id];
  return q;
}
