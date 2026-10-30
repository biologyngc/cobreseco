// Lógica del juego: misiones, diálogos, objetos interactivos, experiencia, inventario y comercio.
import * as THREE from 'three';
import { G, guardar, cuenta, dar, quitar } from './state.js';
import { MISIONES, OBJETOS, LUGARES, TIENDA_PAZ, TIENDA_CIRO, CONTENEDORES, COMPANEROS } from './data.js';
import { nivelPorXP, puntosPorNivel, vidaMaxima, precioCompra, precioVenta } from './rules.js';
import { encargos } from './encargos.js';
import { sistemas } from './sistemas.js';
import { Actor } from './actors.js';

const s = () => G.s;

// ---------- compañeros ----------
// Uno humano (Rafa) y uno perro (Canelo), como en New Vegas. Se les habla para que sigan, esperen o se vayan.
const siguiendo = (id) => !!(s().companeros?.[id]?.reclutado && s().companeros[id].siguiendo);
function reclutar(id) {
  const S = s();
  S.companeros[id] = { reclutado: true, siguiendo: true };
  const a = G.actores.find((x) => x.id === id);
  if (a) { a.colocadoComp = true; a.volviendo = false; a.estado = 'quieto'; }
  const c = COMPANEROS[id];
  G.ui.toast(`${c.nombre} viaja contigo · ${c.ventaja}`, 'mision');
  nota(`${c.nombre} viaja contigo. ${c.ventaja}: ${c.texto}`);
  G.audio?.ok();
  guardar();
}
function seguirComp(id) {
  const c = s().companeros[id];
  c.siguiendo = true;
  delete c.espera;
  guardar();
}
function esperarComp(id) {
  const a = G.actores.find((x) => x.id === id);
  const c = s().companeros[id];
  c.siguiendo = false;
  c.espera = a ? [a.pos.x, a.pos.z] : null;
  guardar();
}
function despedir(id) {
  s().companeros[id] = { reclutado: false };
  const a = G.actores.find((x) => x.id === id);
  if (a) { a.volviendo = true; a.estado = 'quieto'; a.objetivoComp = null; a.colocadoComp = false; a.rutaP = null; }
  G.ui.toast(`${COMPANEROS[id].nombre} vuelve a su sitio`);
  guardar();
}

// ---------- asalto a Vía Muerta (misión «El primer silbido») ----------
// Llegan por el oeste; si cargas la partida a medias, vuelven los que quedaban vivos
const PUNTOS_ASALTO = [[66, 112], [64, 104], [67, 120], [61, 108], [62, 117]];
function asaltoEstacion() {
  const S = s();
  let n = 0;
  PUNTOS_ASALTO.forEach(([x, z], i) => {
    const id = `asalto${i}`;
    if (S.muertos[id] || G.actores.some((a) => a.id === id)) return;
    const a = new Actor({ id, tipo: i === 0 ? 'cabecilla' : 'salteador', x, z, zona: 'asalto', yaw: Math.PI / 2, nombre: i === 0 ? 'Jefe del asalto' : undefined });
    G.escena.add(a.g);
    G.actores.push(a);
    a.entrarCombate();
    n++;
  });
  if (n) G.ui.toast('¡Los saqueadores atacan Vía Muerta!', 'peligro');
}

// ---------- experiencia ----------
function ganarXP(xp, motivo) {
  if (xp <= 0) return;
  const S = s();
  S.xp += xp;
  G.ui.toast(`+${xp} PE · ${motivo}`, 'xp');
  const nuevo = nivelPorXP(S.xp);
  while (S.nivel < nuevo) {
    S.nivel++;
    const pts = puntosPorNivel(S.special.INT);
    S.puntos += pts;
    S.vida = vidaMaxima(S.special.RES, S.nivel);
    if (S.nivel % 2 === 0) S.ventajasPendientes++;
    G.audio?.nivel();
    G.ui.subidaNivel(S.nivel, pts, S.nivel % 2 === 0);
  }
  G.ui.refrescar();
}

// ---------- notas y radio del brazal ----------
function nota(t) {
  const S = s();
  S.notas = S.notas || [];
  S.notas.push({ d: S.dia, h: S.hora, t });
  if (S.notas.length > 60) S.notas.shift();
  G.ui.refrescarBrazal?.();
}
const NOMBRE_EMISORA = { musica: 'Radio Cobreseco', cuervos: 'Frecuencia de los Cuervos', socorro: 'Señal de socorro', apagada: 'Radio apagada' };
function mensajeRadio(emisora, t) {
  const S = s();
  S.radioLog = S.radioLog || [];
  S.radioLog.push({ e: emisora, h: S.hora, t });
  if (S.radioLog.length > 24) S.radioLog.shift();
  if ((S.radio || 'musica') === emisora || emisora === 'socorro') G.ui.emision([NOMBRE_EMISORA[emisora], t]);
  G.ui.refrescarBrazal?.();
}
let relojRadio = 30;
function sintonizar(id) {
  const S = s();
  S.radio = id;
  G.audio?.ponerMusica(id === 'musica');
  if (id === 'cuervos' || id === 'socorro') { G.audio?.radio(); relojRadio = 3; }
  G.ui.toast(`Radio: ${NOMBRE_EMISORA[id]}`);
}
const CHARLA_CUERVOS = [
  '«…Garza dice que el agua de Cobreseco sabe a cobre. Que la disfruten mientras puedan.»',
  '«Guardia del cerro sin novedad. Ni un lagarto. Cambio.»',
  '«¿Quién se ha llevado mis botas de la hoguera? Lo digo en serio.»',
  '«Al amanecer, cuando Garza lo diga. Ni antes ni después.»',
  '«Ese zahorí anda por el yermo. Si lo veis, avisad antes de disparar.»',
  '«Quedan tres bidones de agua. Tres. Para once bocas.»',
];
const CHARLA_DERROTA = [
  '«…aquí nadie. El campamento está vacío. Cambio y cierro.»',
  '«…¿alguien me oye? Me he quedado solo en el cerro…»',
];

// ---------- misiones ----------
function mision(id) { return s().misiones[id]; }
// Las misiones fijas están en data.js; los encargos del tablón guardan su definición en la partida
const defMision = (id) => MISIONES[id] || s().misiones[id]?.def;
function etapa(id) { const m = mision(id); return m && m.estado === 'activa' ? m.etapa : -1; }
const hecha = (id) => mision(id)?.estado === 'hecha';

function empezar(id, etapaInicial = 0) {
  const S = s();
  if (S.misiones[id]) return;
  S.misiones[id] = { etapa: etapaInicial, cuenta: 0, estado: 'activa' };
  S.activa = id;
  if (id === 'q5') S.flags.q5Inicio = S.dia * 24 + S.hora;
  G.ui.toast(`Misión nueva: ${MISIONES[id].titulo}`, 'mision');
  nota(`Misión nueva: ${MISIONES[id].titulo}. ${MISIONES[id].etapas[etapaInicial].texto}`);
  G.audio?.mision();
  alEntrarEtapa(id);
  guardar();
}

function avanzar(id, a) {
  const m = mision(id);
  if (!m || m.estado !== 'activa') return;
  m.etapa = a ?? m.etapa + 1;
  m.cuenta = 0;
  s().activa = id;
  G.ui.toast(`${defMision(id).titulo}: ${defMision(id).etapas[m.etapa].texto}`, 'mision');
  G.audio?.ok();
  alEntrarEtapa(id);
  guardar();
}

function completar(id) {
  const m = mision(id);
  if (!m || m.estado === 'hecha') return;
  m.estado = 'hecha';
  const def = defMision(id);
  G.ui.toast(`Misión completada: ${def.titulo}`, 'mision');
  nota(`Misión completada: ${def.titulo}.`);
  G.audio?.mision();
  const p = def.premio;
  let extra = 0;
  if (id === 'q2' && s().flags.pagoExtra) extra = 20;
  if (p.cobres || extra) {
    s().cobres += (p.cobres || 0) + extra;
    G.ui.toast(`+${(p.cobres || 0) + extra} cobres`);
  }
  for (const [o, n] of Object.entries(p.objetos || {})) {
    dar(o, n);
    G.ui.toast(`Recibido: ${OBJETOS[o].nombre}${n > 1 ? ` ×${n}` : ''}`);
  }
  ganarXP(p.xp, def.titulo);
  // Cumplir con el pueblo (o con el Riel) da fama; devolverle el agua, además, karma
  if (MISIONES[id]) sistemas.fama(def.faccion || 'pueblo', def.faccion ? 6 : 4);
  if (id === 'q3') sistemas.karma(60, 'Has devuelto el agua a Cobreseco');
  if (id === 'q5' && s().flags.resolucion === 'habla') sistemas.karma(40, 'Has evitado una matanza');
  if (id === 'q9') nota('Ciro ha montado el regulador en la Dolores. Ahora le falta agua para la caldera.');
  if (id === 'q10') {
    s().flags.doloresEncendida = true;
    G.mundo.encenderDolores?.();
    if (s().flags.acuerdoAgua === 'nogales') sistemas.fama('riel', 4);
    nota('La Dolores vuelve a echar humo en Vía Muerta.');
  }
  if (id === 'q11') { s().flags.estacionDefendida = true; sistemas.karma(30, 'Has defendido Vía Muerta'); }
  const otra = Object.entries(s().misiones).find(([, v]) => v.estado === 'activa');
  s().activa = otra ? otra[0] : null;
  if (id === 'q3') { s().flags.bombaReparada = true; G.mundo.repararBomba(); }
  if (id === 'q5') setTimeout(() => G.ui.final(), 1800);
  guardar();
}

// Atajos al entrar en una etapa (por si el jugador ya hizo el paso antes)
function alEntrarEtapa(id) {
  const m = mision(id), S = s();
  if (id === 'q1' && m.etapa === 2) { G.mundo.reiniciarBotellas(); }
  if (id === 'q2' && m.etapa === 0) {
    m.cuenta = Math.min(6, S.flags.lagartos || 0);
    if (m.cuenta >= 6) avanzar('q2', 1);
  }
  if (id === 'q3' && m.etapa === 0 && cuenta('valvula') > 0) avanzar('q3', 1);
  if (id === 'q4' && m.etapa === 0 && cuenta('fusible') > 0) avanzar('q4', 1);
  if (id === 'q4' && m.etapa <= 1 && S.flags.repetidor) avanzar('q4', 2);
  if (id === 'q5' && m.etapa === 0 && S.flags.resolucion) avanzar('q5', 1);
  if (id === 'q6' && m.etapa === 0) { m.cuenta = Math.min(4, S.flags.salteadores || 0); if (m.cuenta >= 4) avanzar('q6', 1); }
  if (id === 'q8' && m.etapa === 0) { m.cuenta = Math.min(4, S.flags.perrosGranja || 0); if (m.cuenta >= 4) avanzar('q8', 1); }
  if (id === 'q9' && m.etapa === 0 && cuenta('regulador') > 0) avanzar('q9', 1);
  if (id === 'q11' && m.etapa === 0) { m.cuenta = Math.min(5, S.flags.asaltoBajas || 0); if (m.cuenta >= 5) avanzar('q11', 1); else asaltoEstacion(); }
}

function evento(tipo, d = {}) {
  const S = s();
  if (tipo === 'botella' && etapa('q1') === 2) {
    const m = mision('q1');
    m.cuenta++;
    G.ui.toast(`Botellas: ${m.cuenta}/3`);
    if (m.cuenta >= 3) avanzar('q1', 3);
  }
  if (tipo === 'muerte') {
    const a = d.actor;
    if (a.tipo && a.tipo.forma === 'lagarto') {
      S.flags.lagartos = (S.flags.lagartos || 0) + 1;
      if (etapa('q2') === 0) {
        const m = mision('q2');
        m.cuenta++;
        G.ui.toast(`Lagartos: ${Math.min(m.cuenta, 6)}/6`);
        if (m.cuenta >= 6) avanzar('q2', 1);
      }
    }
    // Saqueadores del asalto a Vía Muerta (q11)
    if (a.def?.zona === 'asalto') {
      S.flags.asaltoBajas = (S.flags.asaltoBajas || 0) + 1;
      if (etapa('q11') === 0) {
        const m = mision('q11');
        m.cuenta++;
        G.ui.toast(`Asaltantes: ${Math.min(m.cuenta, 5)}/5`);
        if (m.cuenta >= 5) avanzar('q11', 1);
      }
    }
    // Saqueadores de la mina (q6)
    if (a.equipo === 'saqueadores' && a.def?.zona === 'mina') {
      S.flags.salteadores = (S.flags.salteadores || 0) + 1;
      if (etapa('q6') === 0) {
        const m = mision('q6');
        m.cuenta++;
        G.ui.toast(`Saqueadores: ${Math.min(m.cuenta, 4)}/4`);
        if (m.cuenta >= 4) avanzar('q6', 1);
      }
    }
    // Manada de la granja (q8)
    if (a.def?.zona === 'granja' && a.tipo?.forma === 'perro') {
      S.flags.perrosGranja = (S.flags.perrosGranja || 0) + 1;
      if (etapa('q8') === 0) {
        const m = mision('q8');
        m.cuenta++;
        G.ui.toast(`Perros: ${Math.min(m.cuenta, 4)}/4`);
        if (m.cuenta >= 4) avanzar('q8', 1);
      }
    }
    encargos.muerte(a);
    if (a.equipo === 'cuervos' && d.actor.hostil) { sistemas.karma(5); sistemas.infamia('cuervos', 1); }
    if (a.id === 'garza') {
      S.flags.resolucion = S.flags.resolucion || 'muerte';
      if (etapa('q5') === 0) avanzar('q5', 1);
      guardar();
    }
  }
}

function objetivo() {
  const S = s();
  const id = S.activa;
  if (!id || etapa(id) < 0) return null;
  const def = defMision(id);
  if (!def) return null;
  const e = def.etapas[etapa(id)];
  const m = mision(id);
  let texto = e.texto;
  if (e.cuenta) texto += ` (${Math.min(m.cuenta, e.cuenta)}/${e.cuenta})`;
  let pos = null;
  const actor = G.actores.find((a) => a.id === e.obj && a.vivo);
  if (actor) pos = actor.pos.clone();
  else if (G.mundo.puntos[e.obj]) pos = G.mundo.puntos[e.obj].clone();
  else if (LUGARES[e.obj]) pos = new THREE.Vector3(LUGARES[e.obj].x, 0, LUGARES[e.obj].z);
  else if (e.pos) pos = new THREE.Vector3(e.pos[0], 0, e.pos[1]);
  else if (e.obj === 'garza') pos = new THREE.Vector3(LUGARES.cuervo.x, 0, LUGARES.cuervo.z);
  return { titulo: def.titulo, texto, pos };
}

// ---------- objetos interactivos ----------
function textoInteractivo(id) {
  const S = s(), f = S.flags;
  switch (id) {
    case 'baul': return mision('q1') && !f.baul ? 'Abrir el baúl de tus cosas' : null;
    case 'tablon': return 'Leer el tablón de recompensas';
    case 'banco': return 'Usar el banco de trabajo';
    case 'cama_clinica': return 'Dormir en tu catre';
    case 'bomba_pozo': return f.bombaReparada ? 'Beber del pozo' : null;
    case 'caja_caravana': return S.encargo?.tipo === 'caravana' && etapa(S.encargo.id) === 0 ? 'Registrar la caja de la caravana' : null;
    case 'puerta_ocaso':
      if (f.puertaAbierta) return null;
      return cuenta('llave_ocaso') ? 'Abrir la oficina con la llave' : 'Forzar la cerradura (Normal · Ganzúa 50)';
    case 'terminal':
      if (f.terminalBloqueada) return 'Terminal bloqueado';
      return f.cajaAbierta ? null : 'Usar el terminal (Fácil · Ciencia 25)';
    case 'caja_fuerte':
      if (!f.cajaAbierta) return 'Caja fuerte (se abre desde el terminal)';
      return f.cajaSaqueada ? null : 'Registrar la caja fuerte';
    case 'valvula': return f.valvula ? null : 'Coger la válvula roja';
    case 'caja_mina':
      if (f.cajaMina) return null;
      return mision('q6') && etapa('q6') === 0 ? 'Caja del capataz (despeja la mina primero)' : 'Registrar la caja del capataz';
    case 'restos_caravana': return f.restosCaravana ? null : 'Registrar la caravana calcinada';
    case 'regulador': return f.regulador ? null : 'Coger el regulador de vapor';
    case 'mesa_caravana': return 'Jugar a Caravana';
    case 'mesa_blackjack': return 'Jugar al blackjack';
    case 'alacena_granja':
      if (f.alacenaGranja) return null;
      return mision('q8') && etapa('q8') === 0 ? 'Alacena (echa a la manada primero)' : 'Registrar la alacena';
    case 'esqueleto': return f.llave ? null : 'Registrar el esqueleto';
    case 'repetidor':
      if (f.repetidor) return null;
      return cuenta('fusible') ? 'Cambiar el fusible del repetidor' : 'Repetidor de radio (le falta un fusible)';
    default:
      if (id.startsWith('hoguera')) return 'Cocinar en la hoguera';
      if (id.startsWith('coche:')) return f[id] ? null : 'Registrar el coche';
      if (id.startsWith('cont:')) {
        const c = id.slice(5), def = CONTENEDORES[c], estado = sistemas.contenido(c);
        if (!estado.abierto) return `${def.nombre} (cerradura, Ganzúa ${def.cerradura})`;
        return `${sistemas.esRobo(c) ? 'Robar de' : 'Registrar'}: ${def.nombre}`;
      }
      return null;
  }
}

// Coger de aquí es robar (el aviso del HUD sale en rojo)
const esRobo = (id) => id.startsWith('cont:') && sistemas.esRobo(id.slice(5));

function usarInteractivo(id) {
  const S = s(), f = S.flags;
  switch (id) {
    case 'tablon':
      G.ui.abrirDialogo({ id: 'tablon', nombre: 'Tablón de recompensas' });
      break;
    case 'banco': G.ui.abrirFabricar('banco'); break;
    case 'cama_clinica': G.ui.abrirEsperar(true); break;
    case 'bomba_pozo': sistemas.beberPozo(); break;
    case 'caja_caravana':
      encargos.cajaEncontrada();
      break;
    case 'baul':
      f.baul = true;
      G.mundo.tapaBaul.rotation.x = -1.2;
      G.mundo.tapaBaul.position.z -= 0.35;
      G.mundo.tapaBaul.position.y += 0.3;
      dar('pistola9');
      dar('m9mm', 39);
      dar('horquilla', 3);
      dar('pico');
      S.cargadores.pistola9 = 13;
      G.audio?.recoger();
      G.ui.toast('Recogido: Pistola de 9 mm, 39 balas, 3 horquillas y un pico de minero (4)');
      equiparArma('pistola9');
      if (etapa('q1') === 1) avanzar('q1', 2);
      break;
    case 'puerta_ocaso':
      if (cuenta('llave_ocaso')) { abrirPuerta(); break; }
      if (S.hab.ganzua < 50) { G.audio?.error(); G.ui.toast(`Necesitas Ganzúa 50. Tienes ${S.hab.ganzua}. Busca la llave por la zona.`); break; }
      if (!cuenta('horquilla')) { G.audio?.error(); G.ui.toast('No te quedan horquillas'); break; }
      G.ui.abrirGanzua(50, (ok) => { if (ok) { abrirPuerta(); ganarXP(30, 'Cerradura forzada'); } });
      break;
    case 'terminal':
      if (f.terminalBloqueada) { G.audio?.error(); G.ui.toast('Fallaste los 4 intentos: el terminal no volverá a abrirse.'); break; }
      if (S.hab.ciencia < 25) { G.audio?.error(); G.ui.toast(`Necesitas Ciencia 25. Tienes ${S.hab.ciencia}.`); break; }
      G.ui.abrirTerminal((r) => {
        if (r === 'bloqueado') { f.terminalBloqueada = true; guardar(); }
        if (r === 'ok') { ganarXP(30, 'Terminal pirateado'); }
        if (r === 'caja') { f.cajaAbierta = true; G.mundo.abrirCajaFuerte(); G.audio?.ok(); guardar(); }
      });
      break;
    case 'caja_fuerte':
      if (!f.cajaAbierta) { G.ui.toast('Está cerrada. Tiene un cable que va al terminal.'); break; }
      f.cajaSaqueada = true;
      dar('fusible');
      dar('horquilla', 2);
      S.cobres += 120;
      G.audio?.recoger();
      G.ui.toast('Recogido: Fusible cerámico, 2 horquillas y 120 cobres');
      if (etapa('q4') === 0) avanzar('q4', 1);
      guardar();
      break;
    case 'valvula':
      f.valvula = true;
      G.mundo.valvula.visible = false;
      dar('valvula');
      G.audio?.recoger();
      G.ui.toast('Recogido: Válvula de bomba');
      if (etapa('q3') === 0) avanzar('q3', 1);
      guardar();
      break;
    case 'esqueleto':
      f.llave = true;
      dar('llave_ocaso');
      G.audio?.recoger();
      G.ui.toast('Un mono de trabajo con el nombre «Benito». En el bolsillo: una llave con la etiqueta OFICINA.');
      guardar();
      break;
    case 'caja_mina':
      if (mision('q6') && etapa('q6') === 0) { G.audio?.error(); G.ui.toast('Aún hay saqueadores en la mina.'); break; }
      f.cajaMina = true;
      dar('m44', 12); dar('polvora', 1); S.cobres += 60;
      G.audio?.recoger();
      G.ui.toast('En la caja del capataz: 12 balas .44, pólvora y 60 cobres');
      nota('La caja del viejo capataz de la mina. Cobre ya no queda, pero algo es algo.');
      if (etapa('q6') >= 0) completar('q6');
      guardar();
      break;
    case 'restos_caravana':
      f.restosCaravana = true;
      dar('subfusil'); dar('m9mm', 20); dar('chatarra', 2); S.cobres += 40;
      G.audio?.recoger();
      G.ui.toast('Entre los restos: un subfusil, 20 balas de 9 mm, chatarra y 40 cobres');
      nota('La caravana ardió hace semanas. Por las marcas, no fue un accidente: la asaltaron.');
      if (etapa('q7') >= 0) completar('q7');
      guardar();
      break;
    case 'regulador':
      f.regulador = true;
      G.mundo.regulador.visible = false;
      dar('regulador');
      G.audio?.recoger();
      G.ui.toast('Recogido: Regulador de vapor');
      if (etapa('q9') === 0) avanzar('q9', 1);
      guardar();
      break;
    case 'mesa_caravana':
    case 'mesa_blackjack': {
      // Juega Sol; si no está en su sitio (herida, huyendo), no hay partida
      const sol = G.actores.find((a) => a.id === 'sol');
      if (!sol || !sol.vivo || sol.estado !== 'quieto') { G.audio?.error(); G.ui.toast('No hay nadie para repartir.'); break; }
      if (S.casino.vetado) { G.audio?.error(); G.ui.toast('Sol niega con la cabeza: la casa ya no acepta tus apuestas.'); break; }
      if (id === 'mesa_caravana') G.casino.abrirCaravana(sol);
      else G.casino.abrirBlackjack(sol);
      break;
    }
    case 'alacena_granja':
      if (mision('q8') && etapa('q8') === 0) { G.audio?.error(); G.ui.toast('La manada aún ronda la granja.'); break; }
      f.alacenaGranja = true;
      dar('agua_limpia'); dar('cecina', 2); dar('chatarra'); S.cobres += 25;
      G.audio?.recoger();
      G.ui.toast('En la alacena: agua limpia, cecina, chatarra y 25 cobres');
      if (etapa('q8') >= 0) completar('q8');
      guardar();
      break;
    case 'repetidor':
      if (!cuenta('fusible')) { G.ui.toast('El fusible está reventado. Paz vende repuestos en Cobreseco.'); break; }
      quitar('fusible');
      f.repetidor = true;
      G.mundo.activarBaliza();
      ganarXP(50, 'Repetidor reparado');
      G.ui.emision([
        'Zumbido. Estática. Luego, una voz ronca:',
        '«…aquí Garza. Ya lo sabéis: en Cobreseco vuelve a salir agua.»',
        '«Al amanecer bajamos todos. Quien tenga agua, que la guarde para nosotros.»',
        '«Y el que se ponga delante, a la arena con el zahorí.»',
      ]);
      S.radioLog = S.radioLog || [];
      S.radioLog.push({ e: 'cuervos', h: S.hora, t: '«…aquí Garza. En Cobreseco vuelve a salir agua. Al amanecer bajamos todos.»' });
      nota('El repetidor funciona. En la frecuencia de los Cuervos, Garza anuncia que bajarán a por el agua de Cobreseco. El brazal ya puede sintonizarla.');
      if (etapa('q4') >= 0) avanzar('q4', 2);
      guardar();
      break;
    default:
      if (id.startsWith('hoguera')) G.ui.abrirFabricar('hoguera');
      else if (id.startsWith('coche:')) {
        // Un coche abandonado siempre tiene algo de chatarra; algunos, pólvora de la mina
        f[id] = true;
        const n = 1 + (id.length % 2);
        dar('chatarra', n);
        const conPolvora = id.endsWith('3') || id.endsWith('5');
        if (conPolvora) dar('polvora', 1);
        G.audio?.recoger();
        G.ui.toast(`Encontrado: Chatarra ×${n}${conPolvora ? ', Pólvora de mina' : ''}`);
        guardar();
      } else if (id.startsWith('cont:')) {
        const c = id.slice(5), def = CONTENEDORES[c], estado = sistemas.contenido(c);
        if (estado.abierto) { G.ui.abrirContenedor(c); break; }
        if (S.hab.ganzua < def.cerradura) { G.audio?.error(); G.ui.toast(`Necesitas Ganzúa ${def.cerradura}. Tienes ${S.hab.ganzua}.`); break; }
        if (!cuenta('horquilla')) { G.audio?.error(); G.ui.toast('No te quedan horquillas'); break; }
        G.ui.abrirGanzua(def.cerradura, (ok) => {
          if (!ok) return;
          estado.abierto = true;
          ganarXP(10, 'Cerradura forzada');
          if (sistemas.esRobo(c)) sistemas.karma(-5);
          setTimeout(() => G.ui.abrirContenedor(c), 600);
        });
      }
      break;
  }
}

function abrirPuerta() {
  s().flags.puertaAbierta = true;
  G.mundo.abrirPuerta();
  G.audio?.ok();
  G.ui.toast('La oficina está abierta');
  guardar();
}

// ---------- comercio ----------
// Existencias del comerciante con el que hablas: Paz o el buhonero de los caminos
function tiendaDe(a) {
  const S = s();
  if (a && a.id === 'buhonero') return (S.tiendaBuhonero = S.tiendaBuhonero || {});
  if (a && a.id === 'ciro') return (S.tiendaCiro = S.tiendaCiro || { ...TIENDA_CIRO });
  return S.tienda;
}
function truequeEfectivo() { return Math.min(100, s().hab.trueque + (s().flags.descuentoPaz ? 15 : 0)); }
function precio(id, comprar) {
  const S = s();
  // Un arma gastada vale menos; Lengua de mercader mejora un 10 % en los dos sentidos
  const v = OBJETOS[id].valor * (OBJETOS[id].arma ? 0.4 + 0.6 * (S.cnd[id] ?? 100) / 100 : 1);
  const merc = S.ventajas.includes('regateo');
  return comprar ? Math.max(1, Math.round(precioCompra(v, truequeEfectivo()) * (merc ? 0.9 : 1))) : Math.max(1, Math.floor(precioVenta(v, truequeEfectivo()) * (merc ? 1.1 : 1)));
}
function comprar(id, n = 1, tienda = s().tienda) {
  const S = s();
  const stock = tienda[id] || 0;
  n = Math.min(n, stock);
  const total = precio(id, true) * n;
  if (n <= 0) return false;
  if (S.cobres < total) { G.audio?.error(); G.ui.toast('No tienes cobres suficientes'); return false; }
  S.cobres -= total;
  tienda[id] -= n;
  dar(id, n);
  G.audio?.recoger();
  if (id === 'fusible' && etapa('q4') === 0) avanzar('q4', 1);
  return true;
}
function vender(id, n = 1, tienda = s().tienda) {
  const S = s();
  if (OBJETOS[id].tipo === 'clave') return false;
  if (S.equipo.arma === id && cuenta(id) <= 1) { G.ui.toast('No puedes vender el arma que llevas'); return false; }
  if (S.equipo.ropa === id && cuenta(id) <= 1) { G.ui.toast('No puedes vender la ropa que llevas'); return false; }
  n = Math.min(n, cuenta(id));
  if (n <= 0) return false;
  S.cobres += precio(id, false) * n;
  quitar(id, n);
  tienda[id] = (tienda[id] || 0) + n;
  G.audio?.recoger();
  return true;
}

// ---------- inventario ----------
function equiparArma(id) {
  G.jugador.cambiarArma(id);
}
function usarObjeto(id) {
  const S = s(), o = OBJETOS[id];
  if (!cuenta(id)) { if (id === 'suero') G.ui.toast('No te quedan jeringas de suero'); return; }
  if (o.tipo === 'consumible') {
    quitar(id);
    const agua = id === 'agua' || id === 'agua_limpia';
    const medico = id === 'suero' && S.ventajas.includes('medico');
    const cura = Math.round(o.cura * (agua && S.ventajas.includes('zahori') ? 2 : 1) * (medico ? 1.5 : 1));
    G.jugador.cura += cura;
    if (o.sed) S.sed = Math.max(0, Math.min(1000, S.sed - o.sed));
    // El suero también va sanando los miembros heridos
    if (o.miembros) for (const k of Object.keys(S.miembros)) S.miembros[k] = Math.min(100, S.miembros[k] + o.miembros * (medico ? 2 : 1));
    G.audio?.recoger();
    G.ui.toast(`${o.nombre}: +${cura} PV${o.sed > 0 ? ', menos sed' : ''}`);
  } else if (id === 'kit_reparacion') sistemas.repararConKit();
  else if (id === 'dinamita') { G.ui.cerrarModal(); G.jugador.lanzarDinamita(); }
  else if (o.tipo === 'arma') equiparArma(id);
  else if (o.tipo === 'ropa') {
    S.equipo.ropa = S.equipo.ropa === id ? null : id;
    G.ui.toast(S.equipo.ropa ? `Te pones: ${o.nombre} (UD ${o.dt})` : `Te quitas: ${o.nombre}`);
  }
  G.ui.refrescar();
}

function saquear(a) {
  const S = s();
  S.saqueados[a.id] = true;
  const partes = [];
  const botin = { ...a.botin };
  // El arma que llevaba (usada: tiene poco estado)
  const ARMA_ITEM = { pistola: 'pistola9', revolver: 'revolver', rifle: 'rifle308', escopeta: 'escopeta', subfusil: 'subfusil', carabina: 'carabina' };
  if (a.armaNPC && ARMA_ITEM[a.armaNPC.id] && !botin[ARMA_ITEM[a.armaNPC.id]]) botin[ARMA_ITEM[a.armaNPC.id]] = 1;
  for (const [id, n] of Object.entries(botin)) {
    if (id === 'cobres') { S.cobres += n; partes.push(`${n} cobres`); } else { dar(id, n); partes.push(`${OBJETOS[id].nombre}${n > 1 ? ` ×${n}` : ''}`); }
  }
  G.audio?.recoger();
  G.ui.toast(partes.length ? `Encontrado: ${partes.join(', ')}` : 'No lleva nada útil');
}

// ---------- los Cuervos ----------
function cuervosHostiles() {
  const S = s();
  if (S.flags.cuervosHostiles || S.flags.cuervosFuera) return;
  S.flags.cuervosHostiles = true;
  G.ui.toast('Los Cuervos van a por ti', 'peligro');
  for (const a of G.actores) if (a.equipo === 'cuervos' && a.vivo) a.entrarCombate();
}

function resolverCuervos(como) {
  const S = s();
  S.flags.resolucion = como;
  S.flags.cuervosFuera = true;
  for (const a of G.actores) {
    if (a.equipo === 'cuervos' && a.vivo) { a.marchando = 0; a.estado = 'marcha'; }
  }
  if (etapa('q5') === 0) avanzar('q5', 1);
  guardar();
}

function actualizar(dt) {
  const S = s();
  encargos.actualizar(dt);
  sistemas.actualizarSupervivencia(dt);
  // Charla de los Cuervos por la radio, si está sintonizada
  if (S.radio === 'cuervos' && S.flags.repetidor) {
    relojRadio -= dt;
    if (relojRadio <= 0) {
      relojRadio = 45 + Math.random() * 35;
      const lista = S.flags.cuervosFuera || S.muertos.garza ? CHARLA_DERROTA : CHARLA_CUERVOS;
      mensajeRadio('cuervos', lista[Math.floor(Math.random() * lista.length)]);
    }
  }
  // Los Cuervos se marchan hacia el sur y desaparecen
  for (let i = G.actores.length - 1; i >= 0; i--) {
    const a = G.actores[i];
    if (a.estado !== 'marcha') continue;
    a.marchando += dt;
    if (a.marchando > 9 && a.pos.distanceTo(G.jugador.pos) > 25) {
      G.escena.remove(a.g);
      G.actores.splice(i, 1);
    }
  }
  // Lugares descubiertos
  for (const [id, l] of Object.entries(LUGARES)) {
    if (S.lugares[id]) continue;
    if (Math.hypot(G.jugador.pos.x - l.x, G.jugador.pos.z - l.z) < l.r * 0.8) {
      S.lugares[id] = true;
      G.ui.lugar(l.nombre);
      nota(`Descubierto: ${l.nombre}.`);
      ganarXP(10, `Descubierto: ${l.nombre}`);
      // Las secundarias arrancan al llegar al sitio
      if (id === 'mina' && !mision('q6')) empezar('q6');
      else if (id === 'caravana' && !mision('q7')) empezar('q7');
      else if (id === 'granja' && !mision('q8')) empezar('q8');
      guardar();
    }
  }
}

// Al cargar una partida, el mundo vuelve a quedar como estaba
function aplicarEstadoMundo() {
  const f = s().flags;
  if (f.puertaAbierta) G.mundo.abrirPuerta();
  if (f.bombaReparada) G.mundo.repararBomba();
  if (f.repetidor) G.mundo.activarBaliza();
  if (f.valvula) G.mundo.valvula.visible = false;
  if (f.cajaAbierta) G.mundo.abrirCajaFuerte();
  if (f.baul) { G.mundo.tapaBaul.rotation.x = -1.2; G.mundo.tapaBaul.position.z -= 0.35; G.mundo.tapaBaul.position.y += 0.3; }
  if (f.cuervosFuera) {
    for (let i = G.actores.length - 1; i >= 0; i--) {
      if (G.actores[i].equipo === 'cuervos') { G.escena.remove(G.actores[i].g); G.actores.splice(i, 1); }
    }
  }
  if (f.cuervosHostiles) for (const a of G.actores) if (a.equipo === 'cuervos') a.estado = 'quieto';
  if (!s().tienda) s().tienda = { ...TIENDA_PAZ };
  if (f.regulador && G.mundo.regulador) G.mundo.regulador.visible = false;
  if (f.doloresEncendida) G.mundo.encenderDolores?.();
  if (etapa('q11') === 0) asaltoEstacion();
  encargos.recrear();
}

function muerte() {
  G.jugando = false;
  document.exitPointerLock?.();
  G.ui.muerte();
}

// ---------- diálogos ----------
// Cada nodo tiene texto y opciones. Una opción puede pedir una habilidad ("prueba"),
// tener una condición ("si"), ejecutar algo ("hacer") e ir a otro nodo ("ir"; null cierra).
function puedeHablar(a) {
  if (a.companero) return a.vivo && a.estado !== 'inconsciente' && a.estado !== 'combate';
  if (a.vecino) return !a.hostil && !['huida', 'inconsciente', 'arresto', 'combate'].includes(a.estado);
  if (a.id === 'garza' && !s().flags.cuervosHostiles && !s().flags.cuervosFuera) return true;
  return false;
}

function dialogo(a) {
  const S = s(), f = S.flags;
  const adios = { texto: 'Adiós.', ir: null };
  switch (a.id) {
    case 'ines': {
      if (etapa('q1') === 0) {
        const comunes = [
          { texto: '¿Dónde estoy?', ir: 'donde', si: () => !f.dDonde, hacer: () => { f.dDonde = true; } },
          { texto: '¿Quién me disparó?', ir: 'quien', si: () => !f.dQuien, hacer: () => { f.dQuien = true; } },
          { texto: 'Gracias por curarme.', ir: 'gracias', hacer: () => avanzar('q1', 1) },
        ];
        return {
          inicio: { texto: 'Despacio, despacio. Llevas dos días delirando en esa cama. Te encontraron junto a la vía muerta, medio enterrado en la arena, con una bala en el hombro y la cantimplora vacía.', opciones: comunes },
          donde: { texto: 'En Cobreseco. Era un pueblo minero: la mina se agotó antes de que el mundo se acabara, y ni las bombas se molestaron en caer aquí. Ahora lo que se acaba es el agua. La bomba del pozo lleva un mes muerta.', opciones: comunes },
          quien: { texto: 'Ni idea. Llevabas un carné de zahorí, de los que encuentran agua bajo tierra. En un pueblo con sed eso vale más que el oro. Quizá por eso alguien te quería muerto.', opciones: comunes },
          gracias: { texto: 'Agradécemelo quedándote vivo. Tus cosas están en el baúl de la entrada. Si vas a moverte por aquí, prueba antes la pistola en el campo de tiro, detrás de La Sed, y luego preséntate al sheriff Ocaña.', opciones: [{ texto: 'Eso haré.', ir: null }] },
        };
      }
      const max = vidaMaxima(S.special.RES, S.nivel);
      return {
        inicio: {
          texto: S.vida < max ? 'Estás sangrando por mi porche. Siéntate.' : '¿Cómo va ese hombro? Mejor que la última vez que lo vi, espero.',
          opciones: [
            { texto: 'Cúrame. [20 cobres]', si: () => (S.vida < max || Object.values(S.miembros).some((m) => m < 100)) && S.cobres >= 20, hacer: () => { S.cobres -= 20; S.vida = max; for (const k of Object.keys(S.miembros)) S.miembros[k] = 100; G.audio?.recoger(); }, ir: 'curado' },
            { texto: '¿Qué sabes de los Cuervos?', ir: 'cuervos' },
            { texto: '[Medicina 30] Te ayudo con los vendajes a cambio de suero.', prueba: { hab: 'medicina', valor: 30 }, si: () => !f.dMedicina, hacer: () => { f.dMedicina = true; dar('suero', 2); ganarXP(20, 'Ayudaste a Inés'); }, ir: 'medicina', fallo: 'medicinaNo' },
            adios,
          ],
        },
        curado: { texto: 'Aguanta… Listo. Intenta que no te agujereen otra vez, que el hilo también escasea.', opciones: [adios] },
        cuervos: { texto: 'Bandidos. Garza los juntó hace un año con gente que echaron de otros pueblos. Acampan al sur. De momento solo roban caravanas, pero un pueblo con agua es mucho más tentador que una caravana.', opciones: [adios] },
        medicina: { texto: 'Mira tú, sabes hacer un vendaje en ocho. Toma dos jeringas, te las has ganado.', opciones: [adios] },
        medicinaNo: { texto: 'Gracias, pero así no. Me harías más trabajo del que me quitas.', opciones: [adios] },
      };
    }
    case 'ocana': {
      if (S.crimen?.activo) {
        const multa = S.crimen.multa;
        return {
          inicio: {
            texto: `Se acabó, forastero. Lo que has hecho en mi pueblo son ${multa} cobres de multa, o una noche en el calabozo. Tú eliges.`,
            opciones: [
              { texto: `Pagar la multa. [${multa} cobres]`, si: () => S.cobres >= multa, ir: 'pagado', hacer: () => sistemas.pagarMulta() },
              { texto: 'Pasaré la noche en el calabozo.', ir: null, hacer: () => sistemas.calabozo() },
              { texto: '[Habla 60] Ha sido un malentendido, sheriff. No volverá a pasar.', prueba: { hab: 'habla', valor: 60 }, si: () => !f.dMalentendido, ir: 'perdon', fallo: 'noCuela', hacer: () => { f.dMalentendido = true; sistemas.perdonar(); } },
              { texto: 'No pienso pagarte nada.', ir: null, hacer: () => sistemas.resistirse() },
            ],
          },
          pagado: { texto: 'Bien. Que no se repita, porque la próxima vez no hablaremos.', opciones: [adios] },
          perdon: { texto: 'Hmm. Por esta vez. Pero te estaré mirando, zahorí.', opciones: [adios] },
          noCuela: { texto: '¿Malentendido? Ahórrate el cuento. Paga o al calabozo.', opciones: [{ texto: 'Está bien, escucho.', ir: 'inicio', hacer: () => { f.dMalentendido = true; } }] },
        };
      }
      if (etapa('q1') === 3) {
        return {
          inicio: {
            texto: 'Así que tú eres el zahorí que nos trajo la arena. Inés dice que tienes buen pulso. Me alegro, porque aquí sobran problemas y faltan manos.',
            opciones: [{ texto: '¿Qué necesitas?', ir: 'encargo', hacer: () => completar('q1') }],
          },
          encargo: {
            texto: 'Los lagartos de ceniza han anidado en el arroyo, al norte. Se comen las gallinas y ya mordieron a un crío. Mata a media docena y te pago ochenta cobres.',
            opciones: [
              { texto: 'Hecho.', ir: null, hacer: () => empezar('q2') },
              { texto: '[Habla 30] Ochenta es poco por jugarse el pellejo.', prueba: { hab: 'habla', valor: 30 }, ir: 'regateo', fallo: 'regateoNo', hacer: () => { f.pagoExtra = true; } },
            ],
          },
          regateo: { texto: 'Je. Cien, y no me pidas más, que esto no es un mercado.', opciones: [{ texto: 'Trato hecho.', ir: null, hacer: () => empezar('q2') }] },
          regateoNo: { texto: 'Ochenta, forastero. Si quieres más, cava un pozo.', opciones: [{ texto: 'Está bien.', ir: null, hacer: () => empezar('q2') }] },
        };
      }
      if (etapa('q2') === 1) {
        return {
          inicio: { texto: 'Me dicen que ya no se oyen silbidos en el arroyo. Buen trabajo. Aquí tienes lo tuyo.', opciones: [{ texto: 'Un placer.', ir: 'despues', hacer: () => completar('q2') }] },
          despues: { texto: hecha('q3') ? 'Ahora que Lupe ha hecho correr el agua, tengo otro asunto para ti.' : 'Si te sobran ganas, habla con Lupe, la del pozo. Sin agua no hay pueblo.', opciones: [adios] },
        };
      }
      if (etapa('q4') === 2) {
        return {
          inicio: {
            texto: '¿Has oído algo en esa radio?',
            opciones: [{ texto: 'Garza quiere bajar al amanecer y quedarse con el pozo.', ir: 'plan', hacer: () => completar('q4') }],
          },
          plan: {
            texto: 'Lo que me temía. Con agua somos un botín. No tengo gente para una guerra. Ve a su campamento, al sur. Habla con Garza si crees que sirve de algo, o haz lo que tengas que hacer. Pero que no baje a Cobreseco.',
            opciones: [{ texto: 'Me ocupo.', ir: null, hacer: () => empezar('q5') }],
          },
        };
      }
      if (etapa('q5') === 1) {
        const textos = {
          habla: '¿Se han ido? ¿Sin un solo tiro? Vas a tener que enseñarme ese truco.',
          soborno: 'Les pagaste. No me gusta, pero los cobres se recuperan; los muertos no.',
          muerte: 'Garza ha muerto. Los demás se dispersarán por el yermo. Cobreseco te debe mucho, zahorí.',
        };
        return { inicio: { texto: textos[f.resolucion] || textos.muerte, opciones: [{ texto: 'Cobreseco sigue en pie.', ir: null, hacer: () => completar('q5') }] } };
      }
      if (hecha('q3') && !mision('q4')) {
        return {
          inicio: {
            texto: 'Lupe dice que vuelve a salir agua. Eso nos da un respiro y otro problema. El repetidor del cerro del Eco lleva meses mudo. Los Cuervos hablan por radio; si lo arreglamos, podremos oírlos.',
            opciones: [{ texto: 'Lo arreglaré.', ir: null, hacer: () => empezar('q4') }, { texto: 'Ahora no.', ir: null }],
          },
        };
      }
      if (f.asalto === 'rechazado' && etapa('q5') === 0 && !f.dAsalto) {
        return { inicio: { texto: 'Bajaron al amanecer, como dijo Garza. Si no llegas a estar aquí… Pero él sigue en su campamento. Acaba con esto antes de que vuelva con más.', opciones: [{ texto: 'Voy para allá.', ir: null, hacer: () => { f.dAsalto = true; } }] } };
      }
      const consejo = etapa('q2') === 0 ? 'Los lagartos están en el arroyo, al norte. Sigue el camino.'
        : etapa('q4') >= 0 ? 'El repetidor está al oeste, en lo alto del cerro. Paz tiene repuestos.'
        : etapa('q5') === 0 ? 'El campamento Cuervo está al sur, siguiendo el camino. Ten cuidado.'
        : 'Mantén los ojos abiertos, zahorí.';
      return {
        inicio: {
          texto: consejo,
          opciones: [
            { texto: '¿Algún otro trabajo?', ir: !mision('q3') ? 'lupe' : 'tablon' },
            adios,
          ],
        },
        lupe: { texto: 'Habla con Lupe, la del pozo. Sin agua no hay pueblo, y sin pueblo no hay sheriff.', opciones: [adios] },
        tablon: { texto: 'Mira el tablón de la entrada. Cada mañana clavo lo que hay: alimañas, cargas perdidas, recados. Se paga al terminar.', opciones: [adios] },
      };
    }
    case 'lupe': {
      if (!hecha('q1')) return { inicio: { texto: 'Ahora no, que estoy peleándome con esta bomba. Ve a ver a la doctora, que tienes mala cara.', opciones: [adios] } };
      if (!mision('q3')) {
        return {
          inicio: {
            texto: '¿Tú eres el zahorí? Pues ya puedes zahorear esto: la bomba se comió su válvula, y sin válvula no sube ni una gota.',
            opciones: [
              { texto: '¿Dónde consigo otra?', ir: 'donde', hacer: () => empezar('q3') },
              { texto: '[Reparar 35] Déjame ver la bomba.', prueba: { hab: 'reparar', valor: 35 }, si: () => !f.dReparar, hacer: () => { f.dReparar = true; ganarXP(20, 'Diagnóstico de la bomba'); }, ir: 'reparar', fallo: 'repararNo' },
            ],
          },
          reparar: { texto: 'Vaya, sabes de esto. Sí: es la válvula, no hay apaño posible. Pero gracias por confirmármelo.', opciones: [{ texto: '¿Dónde consigo otra?', ir: 'donde', hacer: () => empezar('q3') }] },
          repararNo: { texto: 'Quita, quita, que me lo desmontas entero.', opciones: [{ texto: '¿Dónde consigo otra válvula?', ir: 'donde', hacer: () => empezar('q3') }] },
          donde: { texto: 'En la gasolinera Ocaso, al este por el camino. El viejo Benito guardaba repuestos en su oficina. La oficina está cerrada, y Benito… Benito ya no va a abrirla. Salió hacia allí hace meses y no volvió.', opciones: [{ texto: 'Iré a buscarla.', ir: null }] },
        };
      }
      if (etapa('q3') === 0) return { inicio: { texto: 'La gasolinera Ocaso está al este. La válvula es roja, no tiene pérdida.', opciones: [adios] } };
      if (etapa('q3') === 1) {
        return {
          inicio: { texto: '¿La traes? ¡Esa es! Dame un momento…', opciones: [{ texto: 'Toda tuya.', ir: 'agua', hacer: () => { quitar('valvula'); completar('q3'); } }] },
          agua: { texto: '¿Lo oyes? ¡Agua! Toma, era de mi padre: un rifle de cerrojo. A mí me sobra y a ti te va a hacer falta. Pulsa 2 para sacarlo.', opciones: [adios] },
        };
      }
      // Trato del agua para la locomotora de Vía Muerta
      if (etapa('q10') === 0) {
        return {
          inicio: {
            texto: '¿Agua para una locomotora? ¿Sabes lo que nos costó que volviera a salir? Explícame por qué debería dársela a los del Riel.',
            opciones: [
              { texto: '[Habla 50] Con el tren llegarán comerciantes y médicos. Cobreseco dejará de estar sola.', prueba: { hab: 'habla', valor: 50 }, si: () => !f.dLupeRiel, ir: 'compartir', fallo: 'compartirNo', hacer: () => { f.acuerdoAgua = 'compartir'; avanzar('q10', 1); sistemas.karma(20, 'Has unido a Cobreseco y Vía Muerta'); sistemas.fama('pueblo', 3); } },
              { texto: 'Te pago el agua. [150 cobres]', si: () => S.cobres >= 150, ir: 'comprar', hacer: () => { S.cobres -= 150; f.acuerdoAgua = 'comprar'; avanzar('q10', 1); } },
              { texto: 'Lo pensaré.', ir: null },
            ],
          },
          compartir: { texto: 'Médicos y comerciantes… Inés estaría encantada. Está bien: un depósito a la semana, y que no se acostumbren. Diles que Cobreseco cumple.', opciones: [adios] },
          compartirNo: { texto: 'Bonitas palabras. Las palabras no mueven bombas. Si quieren agua, que la paguen.', opciones: [{ texto: 'Hablemos de precio, entonces.', ir: 'inicio', hacer: () => { f.dLupeRiel = true; } }, adios] },
          comprar: { texto: 'Ciento cincuenta. Hecho. Que manden el carro con los bidones y no se entretengan.', opciones: [adios] },
        };
      }
      if (f.acuerdoAgua === 'compartir') return { inicio: { texto: 'El carro de Vía Muerta pasó ayer a por su agua. Traían sal y noticias de la costa. Quizá tenías razón.', opciones: [adios] } };
      return { inicio: { texto: 'Ahora tenemos agua. Ojalá no tengamos que defenderla.', opciones: [adios] } };
    }
    case 'paz': {
      return {
        inicio: {
          texto: 'Ultramarinos Paz. Si no lo tengo, no existe; y si existe, es caro.',
          opciones: [
            { texto: 'Quiero comerciar.', ir: 'trueque' },
            { texto: 'Necesito un fusible cerámico.', si: () => etapa('q4') === 0, ir: 'fusible' },
            { texto: `Repárame el arma. [${S.equipo.arma ? sistemas.precioReparacion(S.equipo.arma) : 0} cobres]`, si: () => S.equipo.arma && (S.cnd[S.equipo.arma] ?? 100) < 99, ir: 'reparada', hacer: () => sistemas.repararEnTienda(S.equipo.arma) },
            { texto: '[Trueque 35] ¿No me harías precio de vecino?', prueba: { hab: 'trueque', valor: 35 }, si: () => !f.descuentoPaz && !f.dTrueque, hacer: () => { f.descuentoPaz = true; }, ir: 'descuento', fallo: 'descuentoNo' },
            { texto: 'Te traigo carne de lagarto.', si: () => cuenta('carne') > 0, ir: 'trueque' },
            adios,
          ],
        },
        reparada: { texto: 'Muelles nuevos, aceite y un buen golpe donde hacía falta. Como recién salida de la caja.', opciones: [{ texto: 'Quiero comerciar.', ir: 'trueque' }, adios] },
        fusible: { texto: 'Me queda uno, del último camión que pasó. No es barato, pero es el último que vas a ver en cien kilómetros. Lo tienes en la lista.', opciones: [{ texto: 'Déjame ver.', ir: 'trueque' }, adios] },
        descuento: { texto: 'Vale, vale. Para ti, un poco menos. Pero no se lo digas al sheriff.', opciones: [{ texto: 'Veamos qué tienes.', ir: 'trueque' }, adios] },
        descuentoNo: { texto: 'Precio de vecino es para los vecinos. Tú llevas aquí dos días.', opciones: [{ texto: 'Veamos qué tienes.', ir: 'trueque', hacer: () => { f.dTrueque = true; } }, adios] },
      };
    }
    case 'garza': {
      if (etapa('q5') !== 0) return { inicio: { texto: 'Esto no es sitio para turistas, forastero. Date la vuelta mientras puedas.', opciones: [{ texto: 'Ya me iba.', ir: null }] } };
      return {
        inicio: {
          texto: 'Mira quién sube por el camino: el zahorí de Ocaña. ¿Vienes a rendirte o a mendigar?',
          opciones: [{ texto: 'Sé lo que planeáis. Olvidad Cobreseco.', ir: 'plan' }, { texto: 'Solo miraba.', ir: null }],
        },
        plan: {
          texto: '¿Olvidarlo? Ahora tienen agua, y el agua manda. Al amanecer bajamos, y el que no se aparte se queda en la arena.',
          opciones: [
            { texto: '[Habla 40] Ocaña tiene un rifle en cada ventana y todo el pueblo sabe que venís. Os vais a desangrar por un pozo.', prueba: { hab: 'habla', valor: 40 }, si: () => !f.dHablaGarza, ir: 'convencido', fallo: 'noConvencido', hacer: () => { ganarXP(50, 'Garza convencido'); resolverCuervos('habla'); } },
            { texto: 'Os pago para que os vayáis. [150 cobres]', si: () => S.cobres >= 150, ir: 'pagado', hacer: () => { S.cobres -= 150; resolverCuervos('soborno'); } },
            { texto: 'Entonces se acaba aquí.', ir: null, hacer: () => cuervosHostiles() },
            { texto: 'Me lo pensaré.', ir: null },
          ],
        },
        convencido: { texto: '…Hay pozos más fáciles al norte. Está bien, zahorí. Nos vamos. Pero no vuelvas a cruzarte conmigo.', opciones: [{ texto: 'Buen viaje.', ir: null }] },
        noConvencido: { texto: '¿Me estás amenazando, en mi campamento? Tienes valor o muy poca cabeza.', opciones: [{ texto: 'Escucha…', ir: 'plan', hacer: () => { f.dHablaGarza = true; } }] },
        pagado: { texto: 'Ciento cincuenta… Con esto compramos agua donde nadie nos dispare. Trato hecho, zahorí.', opciones: [{ texto: 'Largaos.', ir: null }] },
      };
    }
    // ---------- Vía Muerta ----------
    case 'remedios': {
      if (!mision('q9')) {
        return {
          inicio: {
            texto: 'Remedios Vega, jefa de estación. De lo que queda de ella, al menos. Esto era la Ruta del Cobre: trenes cargados de mineral hasta la costa. Ahora solo nos queda la Dolores, y la Dolores no anda.',
            opciones: [{ texto: '¿Qué le pasa a la Dolores?', ir: 'dolores' }, { texto: '¿Quiénes sois?', ir: 'riel' }, adios],
          },
          riel: { texto: 'La gente del Riel: ferroviarios, mecánicos y algún que otro desesperado. Creemos que si el tren vuelve a correr, los pueblos dejarán de morirse de uno en uno.', opciones: [{ texto: '¿Qué le pasa a la Dolores?', ir: 'dolores' }, adios] },
          dolores: {
            texto: 'Le falta el regulador de vapor. Iba en un furgón que descarriló al norte, siguiendo la vía. Los lagartos han hecho nido allí y Rafa no puede dejar sola la estación. Tráemelo y te pagaré bien.',
            opciones: [{ texto: 'Iré a por él.', ir: null, hacer: () => empezar('q9') }, { texto: 'Ahora no.', ir: null }],
          },
        };
      }
      if (etapa('q9') >= 0) return { inicio: { texto: etapa('q9') === 0 ? 'El furgón descarrilado está al norte, siguiendo la vía. Cuidado con los lagartos.' : 'Llévale el regulador a Ciro, al taller. Él sabrá montarlo.', opciones: [adios] } };
      if (!mision('q10')) {
        return {
          inicio: {
            texto: 'Ciro dice que el regulador encaja como un guante. Ahora la Dolores necesita agua, mucha, para llenar la caldera. Y el único pozo vivo en cien kilómetros es el de Cobreseco.',
            opciones: [{ texto: 'Hablaré con los de Cobreseco.', ir: null, hacer: () => empezar('q10') }, { texto: 'Ahora no.', ir: null }],
          },
        };
      }
      if (etapa('q10') === 0) {
        return {
          inicio: {
            texto: '¿Has hablado con Lupe? Sin agua, la Dolores es un montón de hierro muy bonito.',
            opciones: [
              { texto: '[Ciencia 45] En el pozo seco de los Nogales queda un hilo de agua. Con una bomba de mano os bastaría.', prueba: { hab: 'ciencia', valor: 45 }, si: () => !f.dCienciaRiel, ir: 'nogales', fallo: 'nogalesNo', hacer: () => { f.acuerdoAgua = 'nogales'; avanzar('q10', 1); } },
              adios,
            ],
          },
          nogales: { texto: '¿Un hilo de agua en los Nogales? Si es verdad, no dependemos de nadie. Mandaré a Ciro con la bomba. Eres más listo de lo que pareces, zahorí.', opciones: [adios] },
          nogalesNo: { texto: 'No sé de qué me hablas. Habla con Lupe, en Cobreseco.', opciones: [{ texto: 'Está bien.', ir: null, hacer: () => { f.dCienciaRiel = true; } }] },
        };
      }
      if (etapa('q10') === 1) {
        const textos = {
          compartir: 'Lupe nos manda agua de Cobreseco. Dos pueblos ayudándose: hacía años que no veía algo así.',
          comprar: 'El agua de Cobreseco ha llegado, pagada con tus cobres. No lo olvidaremos.',
          nogales: 'Ciro ha bajado la bomba al pozo de los Nogales y sale agua: poca, pero constante. Y no le debemos nada a nadie.',
        };
        return {
          inicio: { texto: `${textos[f.acuerdoAgua] || textos.comprar} Esta noche encendemos la caldera.`, opciones: [{ texto: 'Que suene ese silbato.', ir: 'fin', hacer: () => completar('q10') }] },
          fin: { texto: '…Escucha. Primero tose, luego coge aire… ¡ahí está! La Dolores respira.', opciones: [adios] },
        };
      }
      if (hecha('q10') && !mision('q11')) {
        return {
          inicio: {
            texto: 'La Dolores echa humo, y eso se ve desde muy lejos. Rafa ha visto saqueadores rondando por el oeste. Si vienen, vendrán ahora, a por la locomotora.',
            opciones: [{ texto: 'Que vengan. Defenderé la estación.', ir: null, hacer: () => empezar('q11') }, { texto: 'Dame un momento para prepararme.', ir: null }],
          },
        };
      }
      if (etapa('q11') === 0) return { inicio: { texto: '¡Están aquí! ¡A cubierto y dispara!', opciones: [adios] } };
      if (etapa('q11') === 1) {
        return {
          inicio: {
            texto: 'Se acabó. La estación sigue en pie, y la Dolores también. Toma: era mi revólver de revisora, «El Revisor». Ahora es tuyo. Bienvenido al Riel, zahorí.',
            opciones: [{ texto: 'Es un honor.', ir: null, hacer: () => completar('q11') }],
          },
        };
      }
      return {
        inicio: {
          texto: f.estacionDefendida ? 'Gracias a ti, Vía Muerta tiene futuro. Y si te sobran cobres, Sol tiene la mesa preparada.' : 'Bienvenido a Vía Muerta.',
          opciones: [{ texto: '¿Cómo va el Riel?', ir: 'riel' }, adios],
        },
        riel: { texto: f.acuerdoAgua === 'compartir' ? 'Cada semana sube un carro a Cobreseco y baja otro con agua. Lupe regatea como una fiera, pero cumple.' : 'Despacio. Primero la Dolores, luego la vía hasta la costa. Un tramo cada vez.', opciones: [adios] },
      };
    }
    case 'ciro': {
      const base = [{ texto: 'Quiero comerciar.', ir: 'trueque' }];
      if (etapa('q9') === 1) {
        return {
          inicio: { texto: '¿Eso es…? ¡El regulador de la Dolores! Déjamelo, que esto lo monto yo con los ojos cerrados.', opciones: [{ texto: 'Todo tuyo.', ir: 'montado', hacer: () => { quitar('regulador'); completar('q9'); } }] },
          montado: { texto: 'Listo. Ahora le falta agua a la caldera. Habla con Remedios: ella tiene un plan, o eso dice.', opciones: [...base, adios] },
        };
      }
      return {
        inicio: {
          texto: etapa('q9') === 0 ? 'Sin regulador la Dolores es chatarra con ruedas. Si lo encuentras, tráemelo.' : 'Taller de Ciro. Arreglo, vendo y, si me pagas, no pregunto.',
          opciones: [
            ...base,
            { texto: `Repárame el arma. [${S.equipo.arma ? sistemas.precioReparacion(S.equipo.arma) : 0} cobres]`, si: () => S.equipo.arma && (S.cnd[S.equipo.arma] ?? 100) < 99, ir: 'reparada', hacer: () => sistemas.repararEnTienda(S.equipo.arma) },
            adios,
          ],
        },
        reparada: { texto: 'Como nueva. Bueno, como nueva de hace cuarenta años.', opciones: [...base, adios] },
      };
    }
    case 'sol': {
      const veto = S.casino?.vetado;
      return {
        inicio: {
          texto: veto ? 'Lo siento, cariño: la casa ya te ha invitado a la última. Puedes quedarte, pero aquí tus apuestas ya no valen.' : 'El Vagón de la Suerte. Caravana o blackjack, tú eliges. La casa siempre gana… casi siempre.',
          opciones: [
            { texto: 'Juguemos a Caravana.', si: () => !veto, ir: 'panel:caravana' },
            { texto: 'Juguemos al blackjack.', si: () => !veto, ir: 'panel:blackjack' },
            { texto: '¿Cómo se juega a Caravana?', ir: 'reglas' },
            adios,
          ],
        },
        reglas: {
          texto: 'Tres caravanas cada uno. Pon números en las tuyas hasta que sumen entre 21 y 26: entonces se venden. Cada número sigue la dirección de los anteriores, subiendo o bajando, o el mismo palo. La J quita una carta, la Q le da la vuelta a la dirección y la K dobla un número. Gana quien venda más caravanas que el otro.',
          opciones: [{ texto: 'Entendido.', ir: 'inicio' }, adios],
        },
      };
    }
    // ---------- compañeros ----------
    case 'rafa': {
      const st = S.companeros.rafa || {};
      if (!st.reclutado) {
        if (!hecha('q9')) return { inicio: { texto: 'Vigilo la vía por la jefa. Si buscas trabajo, habla con Remedios, en la estación.', opciones: [adios] } };
        return {
          inicio: {
            texto: 'Remedios dice que eres de fiar, y a mí me basta. Llevo un año mirando esta vía. Si necesitas a alguien con buena puntería, iré contigo.',
            opciones: [{ texto: 'Ven conmigo.', ir: 'vamos', hacer: () => reclutar('rafa') }, { texto: 'Ahora no.', ir: null }],
          },
          vamos: { texto: 'Por fin. Tú abre camino, que yo te cubro. Y si cargas demasiado, pásame algo: tengo la espalda ancha.', opciones: [adios] },
        };
      }
      return {
        inicio: {
          texto: st.siguiendo ? '¿Qué hacemos, zahorí?' : 'Aquí sigo, como me dijiste.',
          opciones: [
            st.siguiendo ? { texto: 'Espera aquí.', ir: null, hacer: () => esperarComp('rafa') } : { texto: 'Sígueme.', ir: null, hacer: () => seguirComp('rafa') },
            { texto: 'Cambiemos de equipo.', ir: 'panel:cont:comp_rafa' },
            { texto: 'Puedes volver a la estación.', ir: 'despedida', hacer: () => despedir('rafa') },
            { texto: 'Nada, sigamos.', ir: null },
          ],
        },
        despedida: { texto: 'Como quieras. Si me necesitas, ya sabes dónde estoy: mirando la vía.', opciones: [adios] },
      };
    }
    case 'canelo': {
      const st = S.companeros.canelo || {};
      if (!st.reclutado) {
        const ofrecer = (obj) => ({ texto: `Ofrecerle ${OBJETOS[obj].nombre.toLowerCase()}.`, si: () => cuenta(obj) > 0, ir: 'amigo', hacer: () => { quitar(obj); reclutar('canelo'); } });
        return {
          inicio: { texto: 'Un perro flaco, de color canela, te mira desde el rincón. Gruñe bajito, pero mueve la cola.', opciones: [ofrecer('cecina'), ofrecer('carne'), { texto: 'Dejarlo tranquilo.', ir: null }] },
          amigo: { texto: 'Se lo zampa en dos bocados, te lame la mano y se pone a tu lado como si siempre hubiera sido tuyo. Se llama Canelo, o así lo llamarás desde hoy.', opciones: [adios] },
        };
      }
      return {
        inicio: {
          texto: 'Canelo te mira con la lengua fuera, esperando.',
          opciones: [
            st.siguiendo ? { texto: 'Quieto. Espera aquí.', ir: null, hacer: () => esperarComp('canelo') } : { texto: '¡Vamos, Canelo!', ir: null, hacer: () => seguirComp('canelo') },
            { texto: 'Vete a casa, Canelo.', ir: null, hacer: () => despedir('canelo') },
            { texto: 'Buen chico.', ir: null },
          ],
        },
      };
    }
    case 'tablon': return encargos.dialogoTablon();
    case 'viajera': return encargos.dialogoViajera();
    case 'buhonero': {
      return {
        inicio: {
          texto: 'Tobías, para servirte. Mi mula y yo llevamos de todo un poco, y nada de lo que preguntes.',
          opciones: [{ texto: 'Enséñame lo que llevas.', ir: 'trueque' }, { texto: '¿Hay algo que deba saber por aquí?', ir: 'rumor' }, adios],
        },
        rumor: { texto: f.repetidor ? 'Los del sur hablan mucho por radio desde que alguien arregló el repetidor. Si tu brazal coge su frecuencia, escucha: se van de la lengua.' : 'Que el repetidor del cerro del Eco está mudo. Con un fusible nuevo, dicen, se oiría a los Cuervos desde aquí.', opciones: [adios] },
      };
    }
    case 'chema': {
      const frases = [
        'La Sed no tiene cerveza ni agua. Solo tiene sed, como su nombre.',
        'Dicen que el viejo Benito se fue a la gasolinera y no volvió. Yo digo que lo pilló el sol.',
        'Los Cuervos bajan a por agua cada vez más cerca. Un día de estos no se volverán.',
      ];
      return { inicio: { texto: frases[Math.floor(performance.now() / 7000) % frases.length], opciones: [adios] } };
    }
    case 'nieves': {
      return {
        inicio: {
          texto: hecha('q3') ? '¡Ha vuelto el agua! Llevaba un mes lavando con arena, hijo.' : 'Mi nieto dice que en el arroyo hay lagartos grandes como perros. Y mi nieto miente mucho, pero esta vez le creo.',
          opciones: [{ texto: 'Te traigo el agua del tablón. [3 Agua turbia]', si: () => encargos.puedeEntregarAgua(), ir: 'agua', hacer: () => encargos.entregarAgua() }, adios],
        },
        agua: { texto: 'Ay, qué peso me quitas. Toma, cecina de la que hago yo, que la de Paz es suela de zapato.', opciones: [adios] },
      };
    }
    default: return { inicio: { texto: '…', opciones: [adios] } };
  }
}

export const juego = {
  ganarXP, empezar, avanzar, completar, evento, objetivo, etapa, defMision, nota, sintonizar, mensajeRadio, esRobo,
  crimen: (t, v) => sistemas.crimen(t, v), arresto: (a) => sistemas.arresto(a), sistemas,
  textoInteractivo, usarInteractivo, puedeHablar, dialogo,
  precio, comprar, vender, tiendaDe, truequeEfectivo, equiparArma, usarObjeto, saquear,
  cuervosHostiles, resolverCuervos, actualizar, aplicarEstadoMundo, muerte,
  siguiendo, reclutar, despedir,
};
