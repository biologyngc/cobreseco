// Lo que pasa sin que nadie lo mande: encargos del tablón del sheriff (se renuevan cada día),
// el asalto de los Cuervos si el jugador deja pasar el tiempo, y encuentros en los caminos
// (emboscadas, un buhonero, una viajera herida que pide ayuda por radio).
import * as THREE from 'three';
import { G, guardar, cuenta, dar, quitar } from './state.js';
import { LUGARES, TIENDA_BUHONERO } from './data.js';
import { Actor } from './actors.js';

const S = () => G.s;
const horaAbs = () => S().dia * 24 + S().hora;

// Generador pseudoaleatorio con semilla: los encargos de un día son siempre los mismos
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RUMBOS = ['al sur', 'al sureste', 'al este', 'al noreste', 'al norte', 'al noroeste', 'al oeste', 'al suroeste'];
const rumbo = (x, z) => RUMBOS[((Math.round(Math.atan2(x, z) / (Math.PI / 4)) % 8) + 8) % 8];

// Un sitio abierto del desierto a cierta distancia del pueblo, lejos de edificios y lugares
function sitioLibre(r, dMin, dMax, centro = { x: 0, z: 0 }) {
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2, d = dMin + r() * (dMax - dMin);
    const x = centro.x + Math.cos(a) * d, z = centro.z + Math.sin(a) * d;
    if (Math.hypot(x, z) > 230 || Math.hypot(x, z) < 70) continue;
    if (Object.values(LUGARES).some((l) => Math.hypot(x - l.x, z - l.z) < l.r + 12)) continue;
    return { x, z };
  }
  return { x: centro.x + 120, z: centro.z };
}

// ---------- actores que aparecen durante la partida ----------
function aparecer(def) {
  if (G.actores.some((a) => a.id === def.id)) return null;
  const a = new Actor(def);
  G.escena.add(a.g);
  G.actores.push(a);
  return a;
}
function retirar(id) {
  const i = G.actores.findIndex((a) => a.id === id);
  if (i < 0) return;
  G.escena.remove(G.actores[i].g);
  G.actores.splice(i, 1);
}

// ---------- tablón de recompensas ----------
const NOMBRES_CARAVANA = ['los Ibarra', 'la vieja Remedios', 'los hermanos Soto', 'Fermín el arriero'];

function ofertasDelDia() {
  const r = azar(S().dia * 7919 + 13);
  const ofertas = [];
  const tipos = ['plaga', 'caravana', 'agua'];
  if (!S().flags.cuervosFuera && !S().flags.asaltoHecho) tipos.push('desertor');
  for (let i = 0; i < 3; i++) {
    const tipo = tipos.splice(Math.floor(r() * tipos.length), 1)[0];
    if (!tipo) break;
    const sitio = sitioLibre(r, 90, 190);
    if (tipo === 'plaga') {
      const perros = r() < 0.4;
      const n = 3 + Math.floor(r() * 2);
      ofertas.push({
        tipo, sitio, n, bicho: perros ? 'perro' : 'lagarto',
        titulo: perros ? 'Perros salvajes' : 'Nido de lagartos',
        texto: `${perros ? 'Una jauría' : 'Un nido de lagartos de ceniza'} ${rumbo(sitio.x, sitio.z)}, a unos ${Math.round(Math.hypot(sitio.x, sitio.z) / 10) * 10} m. Acaba con ${n} y cobra en este tablón.`,
        premio: { cobres: 50 + n * 10, xp: 60 + n * 15 },
      });
    } else if (tipo === 'caravana') {
      const quien = NOMBRES_CARAVANA[Math.floor(r() * NOMBRES_CARAVANA.length)];
      ofertas.push({
        tipo, sitio, titulo: 'Carga perdida',
        texto: `La caravana de ${quien} perdió una caja de suministros ${rumbo(sitio.x, sitio.z)} del pueblo. Lo que encuentres es tuyo; el sheriff paga además por el aviso.`,
        premio: { cobres: 40, xp: 70 },
      });
    } else if (tipo === 'agua') {
      ofertas.push({
        tipo, titulo: 'Agua para Nieves', texto: 'Nieves no puede cargar con los cántaros. Llévale 3 botellas de agua (Paz las vende) y te lo agradecerá.',
        premio: { cobres: 35, xp: 50 },
      });
    } else {
      ofertas.push({
        tipo, sitio, titulo: 'Se busca: Cuervo desertor',
        texto: `Un Cuervo que dejó la banda asalta a quien pasa ${rumbo(sitio.x, sitio.z)}. Va armado. Vivo o muerto, pero mejor muerto.`,
        premio: { cobres: 110, xp: 120 },
      });
    }
  }
  return ofertas;
}

function etapasDe(o) {
  if (o.tipo === 'plaga') return [{ texto: `${o.titulo}: mata a los ${o.bicho === 'perro' ? 'perros' : 'lagartos'} (${o.n}).`, pos: [o.sitio.x, o.sitio.z], cuenta: o.n }, { texto: 'Cobra la recompensa en el tablón del sheriff.', obj: 'tablon' }];
  if (o.tipo === 'caravana') return [{ texto: 'Encuentra la caja perdida de la caravana.', pos: [o.sitio.x, o.sitio.z] }, { texto: 'Avisa en el tablón del sheriff.', obj: 'tablon' }];
  if (o.tipo === 'agua') return [{ texto: 'Consigue 3 botellas de agua y llévaselas a Nieves.', obj: 'nieves' }];
  return [{ texto: 'Encuentra al Cuervo desertor y acaba con él.', pos: [o.sitio.x, o.sitio.z] }, { texto: 'Cobra la recompensa en el tablón del sheriff.', obj: 'tablon' }];
}

function aceptar(o) {
  const s = S();
  s.nEncargos = (s.nEncargos || 0) + 1;
  const id = `enc${s.nEncargos}`;
  s.encargo = { id, tipo: o.tipo, oferta: o, dia: s.dia, actores: [] };
  s.misiones[id] = { etapa: 0, cuenta: 0, estado: 'activa', def: { titulo: o.titulo, etapas: etapasDe(o), premio: o.premio } };
  s.tablonUsado = s.dia;
  s.activa = id;
  prepararEncargo();
  G.ui.toast(`Encargo aceptado: ${o.titulo}`, 'mision');
  G.audio?.mision();
  G.juego.nota(`Encargo del tablón: ${o.texto}`);
  guardar();
}

// Crea en el mundo lo que el encargo necesita (también al cargar la partida)
function prepararEncargo() {
  const e = S().encargo;
  if (!e || S().misiones[e.id]?.estado !== 'activa') return;
  const o = e.oferta;
  if (o.tipo === 'plaga' && S().misiones[e.id].etapa === 0) {
    for (let i = 0; i < o.n; i++) {
      const id = `${e.id}_${i}`;
      if (S().muertos[id]) continue;
      const a = i / o.n * Math.PI * 2;
      aparecer({ id, tipo: o.bicho, x: o.sitio.x + Math.cos(a) * 3.5, z: o.sitio.z + Math.sin(a) * 3.5 });
    }
  }
  if (o.tipo === 'desertor' && S().misiones[e.id].etapa === 0 && !S().muertos[`${e.id}_d`]) {
    aparecer({ id: `${e.id}_d`, tipo: 'cuervo', x: o.sitio.x, z: o.sitio.z, nombre: 'Cuervo desertor', hostil: true });
  }
  if (o.tipo === 'caravana' && S().misiones[e.id].etapa === 0) G.mundo.cajaCaravana?.(o.sitio.x, o.sitio.z);
}

function cobrar() {
  const e = S().encargo;
  const m = S().misiones[e.id];
  m.estado = 'hecha';
  const p = m.def.premio;
  S().cobres += p.cobres;
  G.ui.toast(`Encargo cumplido: ${m.def.titulo}. +${p.cobres} cobres`, 'mision');
  G.audio?.mision();
  G.juego.ganarXP(p.xp, m.def.titulo);
  G.juego.nota(`Cobrada la recompensa de «${m.def.titulo}»: ${p.cobres} cobres.`);
  S().encargo = null;
  const otra = Object.entries(S().misiones).find(([, v]) => v.estado === 'activa');
  S().activa = otra ? otra[0] : null;
  guardar();
}

// Árbol de diálogo del tablón (se abre con E delante de él)
function dialogoTablon() {
  const s = S(), e = s.encargo;
  const adios = { texto: 'Dejar el tablón.', ir: null };
  if (e && s.misiones[e.id]?.estado === 'activa') {
    const m = s.misiones[e.id];
    const listo = m.def.etapas[m.etapa]?.obj === 'tablon';
    return {
      inicio: {
        texto: listo ? `Tu nombre ya está escrito bajo «${m.def.titulo}». Ocaña deja la paga en un sobre clavado al corcho.` : `Tu encargo sigue clavado: «${m.def.titulo}». ${m.def.etapas[m.etapa].texto}`,
        opciones: [
          { texto: 'Coger el sobre con la paga.', si: () => listo, ir: null, hacer: cobrar },
          { texto: 'Arrancar el papel y renunciar al encargo.', si: () => !listo, ir: null, hacer: renunciar },
          adios,
        ],
      },
    };
  }
  if (s.tablonUsado === s.dia) return { inicio: { texto: 'Ya cogiste el encargo de hoy. Mañana Ocaña clavará papeles nuevos.', opciones: [adios] } };
  const ofertas = ofertasDelDia();
  return {
    inicio: {
      texto: 'Papeles clavados con chinchetas oxidadas. Encargos de hoy:',
      opciones: [...ofertas.map((o) => ({ texto: `${o.titulo} · ${o.premio.cobres} cobres. ${o.texto}`, ir: null, hacer: () => aceptar(o) })), adios],
    },
  };
}

function renunciar() {
  const e = S().encargo;
  for (const id of e.actores || []) retirar(id);
  G.actores.filter((a) => a.id.startsWith(`${e.id}_`)).forEach((a) => retirar(a.id));
  delete S().misiones[e.id];
  S().encargo = null;
  G.mundo.quitarCajaCaravana?.();
  S().activa = Object.keys(S().misiones).find((k) => S().misiones[k].estado === 'activa') || null;
  G.ui.toast('Arrancas el papel del tablón.');
  guardar();
}

// ---------- asalto de los Cuervos ----------
// Si Ocaña te manda a por Garza y pasan casi dos días sin resolverlo, bajan al pueblo al amanecer.
function revisarAsalto() {
  const s = S(), f = s.flags;
  const q5 = s.misiones.q5;
  if (!q5 || q5.estado !== 'activa' || q5.etapa !== 0 || f.cuervosFuera || f.asalto) return;
  if (!f.q5Inicio) f.q5Inicio = horaAbs();
  if (horaAbs() - f.q5Inicio < 30) return;
  if (s.hora < 5.5 || s.hora > 8) return;
  f.asalto = 'en curso';
  f.cuervosHostiles = true;
  for (let i = 0; i < 3; i++) {
    const a = aparecer({ id: `asalto${i}`, tipo: 'cuervo', x: 6 + i * 3, z: 70 + i * 2, nombre: 'Cuervo asaltante' });
    if (a) { a.estado = 'alerta'; a.destino = new THREE.Vector3(2 - i * 2, 0, 6); a.hogar.copy(a.destino); a.tiempoEstado = -40; }
  }
  for (const a of G.actores) if (a.equipo === 'cuervos' && a.vivo && !a.id.startsWith('asalto')) a.estado = 'quieto';
  G.ui.toast('¡Los Cuervos bajan por el camino del sur! Vienen a por el pozo.', 'peligro');
  G.ui.emision(['Campana del pozo', '«¡Que vienen! ¡Los Cuervos por el camino del sur! ¡Todos dentro!»']);
  G.audio?.alerta?.(new THREE.Vector3(0, 2, 0), false);
  G.juego.nota('Al amanecer, tres Cuervos bajaron al pueblo a por el pozo. Garza no esperó más.');
  guardar();
}
function finAsalto(actor) {
  const f = S().flags;
  if (f.asalto !== 'en curso' || !actor.id.startsWith('asalto')) return;
  if (G.actores.some((a) => a.id.startsWith('asalto') && a.vivo)) return;
  f.asalto = 'rechazado';
  f.asaltoHecho = true;
  G.ui.toast('Asalto rechazado. El pozo sigue siendo de Cobreseco.', 'mision');
  G.juego.ganarXP(150, 'Asalto rechazado');
  G.juego.nota('Rechazaste el asalto de los Cuervos en la plaza. Garza sigue en su campamento.');
  guardar();
}

// ---------- encuentros en los caminos ----------
function revisarEncuentro() {
  const s = S(), J = G.jugador;
  if (s.encuentro) return;
  const r = Math.hypot(J.pos.x, J.pos.z);
  if (r < 80 || r > 225) return;
  if (horaAbs() - (s.ultimoEncuentro || 0) < 2.5) return;
  s.ultimoEncuentro = horaAbs();
  const dado = Math.random();
  if (dado > 0.6) return;
  // Delante del jugador, a unos 45 m
  const fx = Math.sin(J.yaw), fz = Math.cos(J.yaw);
  const x = J.pos.x + fx * 45 + (Math.random() - 0.5) * 20, z = J.pos.z + fz * 45 + (Math.random() - 0.5) * 20;
  if (dado < 0.25) {
    s.encuentro = { tipo: 'emboscada', x, z, ids: [] };
    for (let i = 0; i < 3; i++) {
      const id = `emb${Math.floor(horaAbs())}_${i}`;
      s.encuentro.ids.push(id);
      const a = aparecer({ id, tipo: 'lagarto', x: x + (i - 1) * 3, z: z + (i % 2) * 3 });
      if (a) { a.estado = 'alerta'; a.destino = J.pos.clone(); }
    }
    G.ui.toast('Algo silba entre los matorrales…', 'peligro');
  } else if (dado < 0.42) {
    s.encuentro = { tipo: 'buhonero', x, z, hasta: horaAbs() + 3 };
    aparecer({ id: 'buhonero', x, z, nombre: 'Tobías, buhonero', vida: 100, arma: 'escopeta', valentia: 'normal', botin: { cobres: 60, cartucho: 8, dinamita: 1 }, yaw: Math.atan2(J.pos.x - x, J.pos.z - z), ropa: '#6a5a3a', piel: '#c08a62', sombrero: 'ala', acento: '#a35a2a' });
    if (!s.tiendaBuhonero) s.tiendaBuhonero = { ...TIENDA_BUHONERO };
    G.ui.toast('Un buhonero con su mula te hace señas desde el camino.');
  } else {
    // La viajera herida pide ayuda por radio: aparece más lejos y deja una marca en el brazal
    const lejos = sitioLibre(Math.random, 60, 110, J.pos);
    s.encuentro = { tipo: 'herida', x: lejos.x, z: lejos.z, socorro: true };
    G.mundo.asiento?.(lejos.x, lejos.z);
    aparecer({ id: 'viajera', x: lejos.x, z: lejos.z, nombre: 'Marta, viajera', vida: 50, valentia: 'cobarde', botin: { agua: 2, cobres: 20 }, yaw: 0, sentado: true, ropa: '#5a6a7a', piel: '#d2a07c', pelo: '#3a2618', sombrero: 'ninguno', acento: '#b0452a' });
    s.marcas = s.marcas || [];
    if (s.marcas.length < 5) {
      const usados = new Set(s.marcas.map((m) => m.n));
      let n = 1;
      while (usados.has(n)) n++;
      s.marcas.push({ x: lejos.x, z: lejos.z, n, socorro: true });
      G.brazal.marcasCambiaron();
    }
    G.audio?.radio();
    G.juego.mensajeRadio('socorro', `«…aquí Marta, viajera. Me he roto el tobillo ${rumbo(lejos.x - J.pos.x, lejos.z - J.pos.z)} de donde estés. Tengo agua y cobres para quien me ayude…»`);
    G.ui.toast('Tu brazal capta una señal de socorro. La has marcado en el mapa.', 'mision');
  }
  guardar();
}

function cerrarEncuentro() {
  const s = S(), e = s.encuentro;
  if (!e) return;
  const J = G.jugador;
  const d = Math.hypot(J.pos.x - e.x, J.pos.z - e.z);
  if (e.tipo === 'emboscada') {
    const vivos = e.ids.filter((id) => G.actores.some((a) => a.id === id && a.vivo));
    if (!vivos.length || d > 220) {
      if (d > 220) e.ids.forEach(retirar);
      s.encuentro = null;
    }
  } else if (e.tipo === 'buhonero') {
    if (horaAbs() > e.hasta && d > 60) { retirar('buhonero'); s.encuentro = null; }
  } else if (e.tipo === 'herida') {
    if (e.resuelta && d > 50) {
      retirar('viajera');
      G.mundo.quitarAsiento?.();
      s.marcas = (s.marcas || []).filter((m) => !m.socorro);
      G.brazal.marcasCambiaron();
      s.encuentro = null;
      if (s.radio === 'socorro') G.juego.sintonizar('musica');
    }
  }
}

function dialogoViajera() {
  const s = S(), e = s.encuentro;
  if (!e || e.resuelta) return { inicio: { texto: 'Gracias otra vez. Con este tobillo llegaré a Cobreseco aunque sea a la pata coja.', opciones: [{ texto: 'Buen viaje.', ir: null }] } };
  const ayudar = () => {
    e.resuelta = true;
    s.cobres += 45;
    dar('agua', 2);
    G.juego.ganarXP(80, 'Viajera socorrida');
    G.juego.nota('Socorriste a Marta, una viajera con el tobillo roto. Te dio 45 cobres y dos botellas de agua.');
    G.ui.toast('+45 cobres, Agua turbia ×2');
    guardar();
  };
  return {
    inicio: {
      texto: '¡Has oído la radio! Me caí del carro hace dos días y no puedo apoyar el pie. Si tienes algo para el dolor…',
      opciones: [
        { texto: 'Toma una jeringa de suero.', si: () => cuenta('suero') > 0, ir: 'gracias', hacer: () => { quitar('suero'); ayudar(); } },
        { texto: '[Medicina 35] Déjame entablillarte el tobillo.', prueba: { hab: 'medicina', valor: 35 }, ir: 'gracias', fallo: 'noSabes', hacer: ayudar },
        { texto: 'Lo siento, no puedo hacer nada.', ir: null },
      ],
    },
    gracias: { texto: 'Mucho mejor… Toma, es lo que llevaba encima. Y si pasas por Cobreseco, di que Marta llega en un par de días.', opciones: [{ texto: 'Cuídate.', ir: null }] },
    noSabes: { texto: '¡Ay! Mejor no lo toques, que lo empeoras.', opciones: [{ texto: 'Perdona.', ir: 'inicio' }] },
  };
}

// ---------- bucle ----------
let reloj = 0;
export const encargos = {
  dialogoTablon,
  dialogoViajera,
  prepararEncargo,
  // Al cargar: vuelve a poner a los que estaban por el mundo
  recrear() {
    prepararEncargo();
    const s = S(), e = s.encuentro;
    if (e?.tipo === 'buhonero') aparecer({ id: 'buhonero', x: e.x, z: e.z, nombre: 'Tobías, buhonero', vida: 100, arma: 'escopeta', valentia: 'normal', botin: { cobres: 60, cartucho: 8, dinamita: 1 }, ropa: '#6a5a3a', piel: '#c08a62', sombrero: 'ala', acento: '#a35a2a' });
    if (e?.tipo === 'herida') {
      G.mundo.asiento?.(e.x, e.z);
      aparecer({ id: 'viajera', x: e.x, z: e.z, nombre: 'Marta, viajera', vida: 50, valentia: 'cobarde', botin: { agua: 2, cobres: 20 }, sentado: true, ropa: '#5a6a7a', piel: '#d2a07c', pelo: '#3a2618', sombrero: 'ninguno', acento: '#b0452a' });
    }
    if (e?.tipo === 'emboscada') s.encuentro = null;
    if (s.flags.asalto === 'en curso') {
      for (let i = 0; i < 3; i++) if (!s.muertos[`asalto${i}`]) aparecer({ id: `asalto${i}`, tipo: 'cuervo', x: 2 - i * 2, z: 8 + i, nombre: 'Cuervo asaltante' });
    }
  },
  muerte(actor) {
    const s = S(), e = s.encargo;
    finAsalto(actor);
    if (!e || !actor.id.startsWith(`${e.id}_`)) return;
    const m = s.misiones[e.id];
    if (m.etapa !== 0) return;
    m.cuenta++;
    const etapa = m.def.etapas[0];
    if (etapa.cuenta) G.ui.toast(`${m.def.titulo}: ${Math.min(m.cuenta, etapa.cuenta)}/${etapa.cuenta}`);
    if (!etapa.cuenta || m.cuenta >= etapa.cuenta) G.juego.avanzar(e.id, 1);
  },
  // La caja de la caravana se abrió
  cajaEncontrada() {
    const e = S().encargo;
    if (!e || e.tipo !== 'caravana') return;
    dar('suero', 1); dar('m9mm', 18); dar('cecina', 2);
    S().cobres += 30;
    G.ui.toast('En la caja: una jeringa de suero, 18 balas de 9 mm, 2 de cecina y 30 cobres');
    G.audio?.recoger();
    G.juego.avanzar(e.id, 1);
  },
  // Entregar el agua a Nieves
  puedeEntregarAgua: () => S().encargo?.tipo === 'agua' && S().misiones[S().encargo.id]?.estado === 'activa' && cuenta('agua') >= 3,
  entregarAgua() {
    quitar('agua', 3);
    dar('cecina', 2);
    cobrar();
  },
  actualizar(dt) {
    reloj -= dt;
    if (reloj > 0) return;
    reloj = 1;
    revisarAsalto();
    revisarEncuentro();
    cerrarEncuentro();
  },
};
