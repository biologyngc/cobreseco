// Sistemas de Fallout que no son misiones: karma y fama, crímenes (con multa, calabozo o rendición
// ante el sheriff), ventajas, modo extremo (sed y cansancio), dormir y esperar, contenedores con
// dueño (robar), fabricación en hoguera y banco, reparación de armas y viaje rápido.
import * as THREE from 'three';
import { G, guardar, cuenta, dar, quitar } from './state.js';
import { OBJETOS, VENTAJAS, RECETAS, CONTENEDORES, KARMA, FAMA, LUGARES } from './data.js';
import { nombreTramo, tramo, TRAMOS_SED, TRAMOS_SUENO, vidaMaxima, estadoMaximoReparando, pesoInventario, cargaMaxima } from './rules.js';

const S = () => G.s;
const nota = (t) => G.juego.nota(t);

// ---------- karma y fama ----------
function karma(delta, motivo) {
  const s = S();
  const antes = nombreTramo(KARMA, s.karma);
  s.karma = Math.max(-1000, Math.min(1000, s.karma + delta));
  const despues = nombreTramo(KARMA, s.karma);
  if (motivo && Math.abs(delta) >= 20) G.ui.toast(`${delta > 0 ? 'Karma +' : 'Karma −'}${Math.abs(delta)} · ${motivo}`, delta > 0 ? 'xp' : 'critico');
  if (antes !== despues) { G.ui.toast(`Ahora te ven como: ${despues}`, 'nivel'); nota(`Tu karma cambió: ahora eres «${despues}».`); }
}
function fama(faccion, delta) { S().fama[faccion].fama += delta; }
function infamia(faccion, delta) { S().fama[faccion].infamia += delta; }
const tituloKarma = () => nombreTramo(KARMA, S().karma);
const estadoFama = (faccion) => nombreTramo(FAMA, S().fama[faccion].fama - S().fama[faccion].infamia);

// ---------- crímenes ----------
const MULTAS = { agresion: 40, robo: 25, asesinato: 300 };
// Vecinos que te ven ahora mismo
function testigos(excepto) {
  const J = G.jugador;
  return G.actores.filter((a) => a.vecino && !a.companero && a !== excepto && a.vivo && a.estado !== 'inconsciente' && !a.dentro &&
    a.pos.distanceTo(J.pos) < 40 && a.ve(J.centro()));
}
function crimen(tipo, victima) {
  const s = S();
  const vistos = testigos(victima);
  if (tipo === 'asesinato') karma(victima.enfadado ? -25 : -100, `Has matado a ${victima.nombre}`);
  else if (tipo === 'agresion' && !victima.enfadado) karma(-20, `Has atacado a ${victima.nombre}`);
  else if (tipo === 'robo') karma(-5);
  if (victima && victima.vivo) victima.enfadado = true;
  // Un asesinato sin testigos no lo denuncia nadie; un robo solo llega aquí si alguien lo vio (también la dueña)
  const denunciado = vistos.length || tipo === 'agresion' || tipo === 'robo';
  if (!denunciado) return;
  const nuevo = !s.crimen?.activo;
  s.crimen = s.crimen?.activo ? s.crimen : { activo: true, multa: 0, cargos: [] };
  s.crimen.cargos ??= [];
  s.crimen.tregua = false;
  // Una agresión se cobra una vez por víctima, no por cada disparo
  const cargo = `${tipo}:${victima?.id}`;
  if (tipo !== 'agresion' || !s.crimen.cargos.includes(cargo)) {
    s.crimen.cargos.push(cargo);
    s.crimen.multa += MULTAS[tipo];
    infamia('pueblo', tipo === 'asesinato' ? 6 : tipo === 'agresion' ? 2 : 1);
  }
  if (nuevo) {
    const que = { agresion: `atacar a ${victima.nombre}`, robo: `robar a ${victima.nombre}`, asesinato: `matar a ${victima.nombre}` }[tipo];
    G.ui.toast(`Cobreseco te busca por ${que}. Para entregarte, enfunda el arma (Z) a la vista del sheriff.`, 'peligro');
    nota(`Cobreseco te busca por ${que}. El sheriff Ocaña acepta la rendición si te ve con el arma enfundada.`);
  }
  // Los armados vienen a por ti; los demás huyen
  for (const a of G.actores) {
    if (!a.vecino || a.companero || !a.vivo || a.estado === 'inconsciente' || a.dentro) continue;
    if (a.pos.distanceTo(G.jugador.pos) > 60 && a !== victima) continue;
    if (a.armado) a.entrarCombate();
    else a.huir();
  }
  guardar();
}
// El sheriff te ha alcanzado con el arma enfundada
function arresto(ocana) {
  G.ui.abrirDialogo(ocana);
}
function perdonar() {
  const s = S();
  s.crimen = null;
  for (const a of G.actores) {
    if (!a.vecino) continue;
    a.enfadado = false;
    a.rutaHuida = null;
    if (['combate', 'huida', 'arresto', 'alerta'].includes(a.estado)) { a.estado = 'quieto'; a.tiempoEstado = 0; }
    const noche = s.hora >= 21.5 || s.hora < 6.5;
    if (!noche) a.dentro = false;
  }
  guardar();
}
function pagarMulta() {
  const s = S(), m = s.crimen.multa;
  s.cobres -= m;
  infamia('pueblo', -1);
  nota(`Pagaste ${m} cobres de multa al sheriff Ocaña.`);
  perdonar();
}
function calabozo() {
  const s = S();
  G.ui.toast('Pasas la noche en el calabozo. Al amanecer, Ocaña abre la celda.');
  nota('Pasaste una noche en el calabozo del sheriff. La deuda con Cobreseco queda saldada.');
  perdonar();
  pasarTiempo(Math.max(6, (24 - s.hora + 6.5) % 24), true, true);
  // Sales de la celda junto a la mesa del sheriff
  G.jugador.colocar(21.4, 0, 16.6, -Math.PI / 2);
}
function resistirse() {
  const s = S();
  if (s.crimen) s.crimen.tregua = false;
  for (const a of G.actores) if (a.vecino && a.armado && a.vivo && a.estado !== 'inconsciente') { a.estado = 'combate'; a.tiempoEstado = 0; }
}

// ---------- ventajas ----------
const ATRIBUTO = { FUE: 'Fuerza', PER: 'Percepción', RES: 'Resistencia', CAR: 'Carisma', INT: 'Inteligencia', AGI: 'Agilidad', SUE: 'Suerte' };
function ventajasDisponibles() {
  const s = S();
  return Object.entries(VENTAJAS).map(([id, v]) => {
    let razon = null;
    if (s.ventajas.includes(id)) razon = 'Ya la tienes';
    else if (s.nivel < v.req.nivel) razon = `Nivel ${v.req.nivel}`;
    else for (const [k, n] of Object.entries(v.req)) if (k !== 'nivel' && s.special[k] < n) { razon = `${ATRIBUTO[k]} ${n}`; break; }
    return { id, ...v, razon };
  });
}
function elegirVentaja(id) {
  const s = S();
  const v = ventajasDisponibles().find((x) => x.id === id);
  if (!v || v.razon || s.ventajasPendientes <= 0) return false;
  s.ventajas.push(id);
  s.ventajasPendientes--;
  G.audio?.nivel();
  G.ui.toast(`Ventaja: ${v.nombre}`, 'nivel');
  nota(`Nueva ventaja: ${v.nombre}. ${v.texto}`);
  guardar();
  return true;
}

// ---------- modo extremo: sed y cansancio ----------
let avisoSed = null, avisoSueno = null;
function actualizarSupervivencia(dt) {
  const s = S();
  if (!s.extremo) return;
  const horas = (dt * 30) / 3600;
  s.sed = Math.min(1000, s.sed + 50 * horas * (s.ventajas.includes('zahori') ? 0.6 : 1));
  s.cansancio = Math.min(1000, s.cansancio + 20 * horas);
  // Deshidratación grave: quita vida poco a poco
  if (s.sed >= 800) {
    s.vida -= (s.sed >= 1000 ? 14 : 6) * horas;
    if (s.vida <= 0) { s.vida = 0; G.juego.muerte(); }
  }
  const ts = tramo(TRAMOS_SED, s.sed)?.[1] || null, tc = tramo(TRAMOS_SUENO, s.cansancio)?.[1] || null;
  if (ts !== avisoSed) { if (ts && avisoSed !== null) G.ui.toast(`${ts}: bebe agua (brazal, Objetos) o del pozo si funciona la bomba.`, 'peligro'); avisoSed = ts; }
  if (tc !== avisoSueno) { if (tc && avisoSueno !== null) G.ui.toast(`${tc}: duerme en tu catre de la clínica.`, 'peligro'); avisoSueno = tc; }
}
function beberPozo() {
  const s = S();
  if (!s.flags.bombaReparada) { G.audio?.error(); G.ui.toast('La bomba está seca. Lupe necesita una válvula nueva.'); return; }
  s.sed = Math.max(0, s.sed - 320);
  s.vida = Math.min(vidaMaxima(s.special.RES, s.nivel), s.vida + 5);
  G.audio?.recoger();
  G.ui.toast('Bebes del pozo. Agua fría, con sabor a cobre.');
}
// Pasar horas esperando o durmiendo
function hayPeligro() {
  return G.actores.some((a) => a.vivo && a.hostil && a.estado === 'combate' && a.pos.distanceTo(G.jugador.pos) < 70);
}
function pasarTiempo(horas, dormir, forzado = false) {
  const s = S();
  if (!forzado && hayPeligro()) { G.audio?.error(); G.ui.toast('No puedes esperar con enemigos cerca.'); return false; }
  s.hora += horas;
  while (s.hora >= 24) { s.hora -= 24; s.dia++; }
  if (s.extremo) {
    s.sed = Math.min(1000, s.sed + 50 * horas * (s.ventajas.includes('zahori') ? 0.6 : 1) * (dormir ? 0.7 : 1));
    s.cansancio = dormir ? Math.max(0, s.cansancio - 140 * horas) : Math.min(1000, s.cansancio + 20 * horas);
  }
  const max = vidaMaxima(s.special.RES, s.nivel);
  if (dormir) s.vida = Math.min(max, s.vida + max * 0.12 * horas);
  // Viajar y el calabozo ya dan su propio aviso
  if (!forzado) G.ui.toast(dormir ? `Duermes ${horas} h. Día ${s.dia}, ${String(Math.floor(s.hora)).padStart(2, '0')}:${String(Math.floor((s.hora % 1) * 60)).padStart(2, '0')}.` : `Esperas ${horas} h.`);
  guardar();
  return true;
}

// ---------- contenedores ----------
function contenido(id) {
  const s = S();
  if (!s.contenedores[id]) s.contenedores[id] = { objetos: { ...CONTENEDORES[id].objetos }, abierto: !CONTENEDORES[id].cerradura };
  return s.contenedores[id];
}
// ¿Coger de aquí es robar? (tiene dueño, el dueño vive y no se lo has comprado)
function esRobo(id) {
  const def = CONTENEDORES[id];
  if (!def?.dueno) return false;
  if (S().muertos[def.dueno]) return false;
  return true;
}
function tomar(id, obj, n = 1) {
  const c = contenido(id);
  n = Math.min(n, c.objetos[obj] || 0);
  if (n <= 0) return false;
  c.objetos[obj] -= n;
  if (!c.objetos[obj]) delete c.objetos[obj];
  if (obj === 'cobres') S().cobres += n; else dar(obj, n);
  G.audio?.recoger();
  if (esRobo(id)) {
    const dueno = G.actores.find((a) => a.id === CONTENEDORES[id].dueno);
    const vistos = testigos(null).filter((a) => !G.jugador.agachado || a.puntos > -20 || a.pos.distanceTo(G.jugador.pos) < 6);
    if (vistos.length && dueno) { crimen('robo', dueno); G.ui.cerrarModal(); return true; }
    karma(-3);
  }
  return true;
}
function dejar(id, obj, n = 1) {
  const c = contenido(id);
  n = Math.min(n, cuenta(obj));
  if (n <= 0 || OBJETOS[obj]?.tipo === 'clave') return false;
  if (S().equipo.arma === obj && cuenta(obj) <= n) { G.ui.toast('No puedes dejar el arma que llevas'); return false; }
  quitar(obj, n);
  c.objetos[obj] = (c.objetos[obj] || 0) + n;
  G.audio?.tecla();
  return true;
}

// ---------- fabricación ----------
function recetas(donde) {
  const s = S();
  return RECETAS.filter((r) => r.donde === donde).map((r) => {
    let razon = null;
    for (const [h, n] of Object.entries(r.hab)) if ((s.hab[h] || 0) < n) razon = `Necesitas ${h === 'supervivencia' ? 'Supervivencia' : h === 'explosivos' ? 'Explosivos' : 'Reparar'} ${n}`;
    if (!razon) for (const [o, n] of Object.entries(r.usa)) if (cuenta(o) < n) { razon = `Te falta ${OBJETOS[o].nombre.toLowerCase()}`; break; }
    return { ...r, razon };
  });
}
function fabricar(id) {
  const r = RECETAS.find((x) => x.id === id);
  const estado = recetas(r.donde).find((x) => x.id === id);
  if (estado.razon) { G.audio?.error(); G.ui.toast(estado.razon); return false; }
  for (const [o, n] of Object.entries(r.usa)) quitar(o, n);
  for (const [o, n] of Object.entries(r.da)) dar(o, n);
  G.audio?.recoger();
  G.juego.ganarXP(5, `Fabricado: ${r.nombre}`);
  return true;
}

// ---------- reparación ----------
function repararConKit() {
  const s = S(), id = s.equipo.arma;
  if (!id) { G.ui.toast('Empuña el arma que quieres arreglar.'); return false; }
  const max = estadoMaximoReparando(s.hab.reparar);
  if ((s.cnd[id] ?? 100) >= max) { G.ui.toast(`Con Reparar ${s.hab.reparar} no puedes dejarla mejor (${Math.round(max)} %). Paz la arregla del todo.`); return false; }
  quitar('kit_reparacion');
  s.cnd[id] = Math.min(max, (s.cnd[id] ?? 100) + 25 + s.hab.reparar * 0.25);
  G.audio?.recarga();
  G.ui.toast(`${OBJETOS[id].nombre}: estado ${Math.round(s.cnd[id])} %`);
  return true;
}
const precioReparacion = (id) => Math.ceil((100 - (S().cnd[id] ?? 100)) * OBJETOS[id].valor / 100 * 0.6);
function repararEnTienda(id) {
  const s = S(), p = precioReparacion(id);
  if (s.cobres < p) { G.audio?.error(); G.ui.toast('No tienes cobres suficientes'); return false; }
  s.cobres -= p;
  s.cnd[id] = 100;
  G.audio?.recoger();
  return true;
}

// ---------- viaje rápido ----------
function motivoNoViajar() {
  const s = S();
  if (hayPeligro()) return 'Hay enemigos cerca';
  if (pesoInventario(s, OBJETOS) > cargaMaxima(s)) return 'Llevas demasiado peso';
  return null;
}
function viajar(id) {
  const l = LUGARES[id], J = G.jugador;
  const motivo = motivoNoViajar();
  if (motivo) { G.audio?.error(); G.ui.toast(`No puedes viajar: ${motivo.toLowerCase()}.`); return false; }
  // Llegas al borde del lugar, del lado del pueblo
  const hacia = new THREE.Vector3(-l.x, 0, -l.z);
  const borde = id === 'cobreseco' ? new THREE.Vector3(2, 0, 8) : new THREE.Vector3(l.x, 0, l.z).add(hacia.normalize().multiplyScalar(l.r * 0.7));
  const dist = Math.hypot(borde.x - J.pos.x, borde.z - J.pos.z);
  const horas = Math.max(0.25, Math.round(dist / 100 * 0.35 * 4) / 4);
  pasarTiempo(horas, false, true);
  J.colocar(borde.x, 0, borde.z, Math.atan2(l.x - borde.x, l.z - borde.z));
  G.ui.toast(`Viajas a ${l.nombre}: ${horas} h de camino.`);
  return true;
}

export const sistemas = {
  karma, fama, infamia, tituloKarma, estadoFama,
  crimen, arresto, perdonar, pagarMulta, calabozo, resistirse,
  ventajasDisponibles, elegirVentaja,
  actualizarSupervivencia, beberPozo, pasarTiempo, hayPeligro,
  contenido, esRobo, tomar, dejar,
  recetas, fabricar,
  repararConKit, precioReparacion, repararEnTienda,
  motivoNoViajar, viajar,
};
