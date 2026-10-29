// Interfaz: HUD, brújula, diálogos, cuaderno, comercio, terminal, ganzúa, M.I.R.A. y pantallas.
import * as THREE from 'three';
import { G, guardar, cuenta } from './state.js';
import { OBJETOS, MISIONES, LUGARES, CONTENEDORES } from './data.js';
import { xpParaNivel, vidaMaxima, pamMaximos, estadoDeteccion, PARTES, cargaMaxima, pesoInventario, specialEfectivo, tramo, TRAMOS_SED, TRAMOS_SUENO, estadoMaximoReparando } from './rules.js';
import { clamp } from './noise.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const HAB = { armas: 'Armas', cuerpo: 'Cuerpo a cuerpo', explosivos: 'Explosivos', sigilo: 'Sigilo', ganzua: 'Ganzúa', ciencia: 'Ciencia', habla: 'Habla', trueque: 'Trueque', reparar: 'Reparar', medicina: 'Medicina', supervivencia: 'Supervivencia' };
const SPECIAL = { FUE: 'Fuerza', PER: 'Percepción', RES: 'Resistencia', CAR: 'Carisma', INT: 'Inteligencia', AGI: 'Agilidad', SUE: 'Suerte' };
const v3 = new THREE.Vector3();

function proyectar(p) {
  v3.copy(p).project(G.camara);
  if (v3.z > 1) return null;
  return { x: (v3.x * 0.5 + 0.5) * innerWidth, y: (-v3.y * 0.5 + 0.5) * innerHeight };
}

export function crearUI() {
  const ui = {};
  const hud = $('#hud');
  const flotantes = [];
  let herida = 0, marcaT = 0, lugarT = 0, relojBrazal = 0;

  // ---------- avisos ----------
  ui.toast = (texto, tipo = '') => {
    const t = el('div', `toast ${tipo}`, texto);
    $('#toasts').prepend(t);
    while ($('#toasts').children.length > 6) $('#toasts').lastChild.remove();
    setTimeout(() => t.classList.add('fuera'), 4800);
    setTimeout(() => t.remove(), 5400);
  };
  ui.lugar = (nombre) => {
    const l = $('#lugar');
    l.querySelector('b').textContent = nombre;
    l.hidden = false;
    lugarT = 4;
  };
  ui.subidaNivel = (n, pts, ventaja) => {
    ui.toast(`Nivel ${n}. Tienes ${pts} puntos de habilidad${ventaja ? ' y una ventaja' : ''} nuevos: abre el brazal con Tab para repartirlos.`, 'nivel');
  };
  ui.marca = (critico) => {
    const m = $('#marca');
    m.classList.toggle('critico', !!critico);
    m.style.opacity = 1;
    marcaT = 0.25;
  };
  ui.numero = (p, n, critico) => ui.flotante(p, `${n}`, critico ? 'critico' : '');
  ui.flotante = (p, texto, cls = '') => {
    const d = el('div', `flotante ${cls}`, texto);
    $('#flotantes').append(d);
    flotantes.push({ d, p: p.clone(), t: 0.9, dy: 0 });
  };
  ui.ladrido = (actor, texto) => {
    if (!texto) return;
    const d = el('div', 'flotante ladrido', texto);
    $('#flotantes').append(d);
    flotantes.push({ d, actor, t: 2.6, dy: 0 });
  };
  ui.herido = (n) => { herida = Math.min(1, herida + n / 25 + 0.25); };
  ui.mira = (on) => { $('#visor').hidden = !on; $('#cruz').style.opacity = on ? 0 : ''; };
  ui.bloqueo = (on) => { $('#pista-clic').hidden = on || !!G.modal || !G.jugando || matchMedia('(pointer: coarse)').matches; };
  ui.refrescar = () => { ui.refrescarBrazal?.(); };

  ui.emision = (lineas) => {
    const e = $('#emision');
    e.hidden = false;
    e.innerHTML = '';
    G.audio?.radio();
    lineas.forEach((l, i) => setTimeout(() => {
      e.append(el('p', i ? '' : 'nota', l));
      if (i) G.audio?.radio();
    }, i * 2600));
    setTimeout(() => { e.hidden = true; }, lineas.length * 2600 + 4000);
  };

  // ---------- modales ----------
  function abrirModal(nombre) {
    G.modal = nombre;
    document.body.classList.add('en-modal');
    G.jugador.teclas.clear();
    G.jugador.apuntando = false;
    document.exitPointerLock?.();
    $('#pista-clic').hidden = true;
  }
  function cerrarModal() {
    for (const id of ['dialogo', 'trueque', 'terminal', 'ganzua', 'contenedor', 'fabricar', 'esperar']) $('#' + id).hidden = true;
    G.brazal?.cerrar();
    G.modal = null;
    G.hablandoCon = null;
    document.body.classList.remove('en-modal');
    if (G.jugando && !matchMedia('(pointer: coarse)').matches) {
      try { const r = G.render.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* el clic lo pedirá */ }
    }
    ui.bloqueo(false);
  }
  ui.cerrarModal = cerrarModal;

  // ---------- diálogo ----------
  let dlg = null;
  ui.abrirDialogo = (actor) => {
    const arbol = G.juego.dialogo(actor);
    dlg = { actor, arbol };
    abrirModal('dialogo');
    // El tablón no es un personaje: no hay nadie a quien girar hacia el jugador
    G.hablandoCon = actor.mirarA ? actor : null;
    $('#dialogo').hidden = false;
    $('#dlg-nombre').textContent = actor.nombre;
    mostrarNodo('inicio');
  };
  function mostrarNodo(clave) {
    if (clave === null || clave === undefined) { cerrarModal(); return; }
    if (clave === 'trueque') { abrirTrueque(dlg.actor); return; }
    const n = dlg.arbol[clave];
    if (!n) { cerrarModal(); return; }
    $('#dlg-texto').textContent = n.texto;
    const ops = $('#dlg-opciones');
    ops.innerHTML = '';
    const visibles = n.opciones.filter((o) => !o.si || o.si());
    visibles.forEach((o, i) => {
      const b = el('button', 'opcion');
      let txt = o.texto;
      if (o.prueba) {
        const tiene = G.s.hab[o.prueba.hab];
        const ok = tiene >= o.prueba.valor;
        txt = txt.replace(/^\[[^\]]+\]\s*/, '');
        b.innerHTML = `<span class="n">${i + 1}</span><span class="prueba ${ok ? 'ok' : 'no'}">[${HAB[o.prueba.hab]} ${tiene}/${o.prueba.valor}]</span> ${txt}`;
      } else b.innerHTML = `<span class="n">${i + 1}</span>${txt}`;
      b.addEventListener('click', () => elegir(o));
      ops.append(b);
    });
    dlg.visibles = visibles;
  }
  function elegir(o) {
    G.audio?.clic();
    if (o.prueba && G.s.hab[o.prueba.hab] < o.prueba.valor) {
      G.audio?.error();
      mostrarNodo(o.fallo ?? null);
      return;
    }
    if (o.hacer) o.hacer();
    if (o.prueba) G.audio?.ok();
    mostrarNodo(o.ir);
  }

  // ---------- comercio ----------
  let comerciante = null;
  function abrirTrueque(actor) {
    comerciante = actor;
    $('#dialogo').hidden = true;
    abrirModal('trueque');
    $('#trueque').hidden = false;
    const esPaz = actor.id === 'paz';
    $('#tr-titulo').textContent = esPaz ? 'Ultramarinos Paz' : actor.nombre;
    $('#tr-vende').textContent = `${esPaz ? 'Paz' : actor.nombre.split(',')[0]} vende`;
    pintarTrueque();
  }
  function filaObjeto(id, n, precio, accion, etiqueta) {
    const o = OBJETOS[id];
    const f = el('button', 'fila');
    f.innerHTML = `<span class="nombre">${o.nombre}</span><span class="cant">×${n}</span><span class="precio">${precio}<small> c</small></span>`;
    f.title = `${etiqueta}. Mayús + clic para 10.`;
    f.addEventListener('click', (e) => { if (accion(e.shiftKey ? 10 : 1)) pintarTrueque(); });
    return f;
  }
  function pintarTrueque() {
    const S = G.s;
    $('#tr-cobres').textContent = S.cobres;
    $('#tr-habilidad').textContent = `Trueque ${G.juego.truequeEfectivo()}${S.flags.descuentoPaz ? ' (precio de vecino)' : ''}`;
    const venta = $('#tr-tienda'), mio = $('#tr-mio');
    venta.innerHTML = '';
    mio.innerHTML = '';
    const tienda = G.juego.tiendaDe(comerciante);
    for (const [id, n] of Object.entries(tienda)) {
      if (n > 0) venta.append(filaObjeto(id, n, G.juego.precio(id, true), (k) => G.juego.comprar(id, k, tienda), 'Comprar'));
    }
    for (const [id, n] of Object.entries(S.inv)) {
      if (OBJETOS[id].tipo === 'clave') continue;
      mio.append(filaObjeto(id, n, G.juego.precio(id, false), (k) => G.juego.vender(id, k, tienda), 'Vender'));
    }
    if (!venta.children.length) venta.append(el('p', 'vacio', 'No le queda nada más.'));
    if (!mio.children.length) mio.append(el('p', 'vacio', 'No llevas nada que vender.'));
  }
  $('#tr-cerrar').addEventListener('click', cerrarModal);

  // ---------- brazal ----------
  // Lo que antes era el cuaderno, ahora en la pantalla del aparato de la muñeca.
  let pestana = 'estado';
  const EMISORAS = [
    { id: 'musica', nombre: 'Radio Cobreseco', texto: 'Guitarra y viento desde lo alto del depósito de agua. Emite todo el día.' },
    { id: 'cuervos', nombre: 'Frecuencia de los Cuervos', si: () => G.s.flags.repetidor, texto: 'La banda de Garza habla por aquí desde que arreglaste el repetidor.' },
    { id: 'socorro', nombre: 'Señal de socorro', si: () => !!G.s.encuentro?.socorro, texto: 'Una baliza manual, muy débil. Alguien pide ayuda en el yermo.' },
    { id: 'apagada', nombre: 'Apagada', texto: 'Solo el zumbido del aparato.' },
  ];
  ui.abrirBrazal = (p) => {
    if (p) pestana = p;
    abrirModal('brazal');
    G.brazal.abrir();
    G.audio?.clic();
    pintarBrazal();
  };
  ui.abrirCuaderno = ui.abrirBrazal;
  document.querySelectorAll('#brazal [data-pestana]').forEach((b) => b.addEventListener('click', () => {
    pestana = b.dataset.pestana;
    G.audio?.tecla();
    pintarBrazal();
  }));
  $('#br-cerrar').addEventListener('click', cerrarModal);

  const hora = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  const RUMBOS = ['al sur', 'al sureste', 'al este', 'al noreste', 'al norte', 'al noroeste', 'al oeste', 'al suroeste'];
  const rumbo = (dx, dz) => RUMBOS[((Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) % 8) + 8) % 8];

  function pintarPie() {
    const S = G.s;
    const vmax = vidaMaxima(S.special.RES, S.nivel), pmax = pamMaximos(S.special.AGI);
    $('#br-reloj').textContent = `Día ${S.dia} · ${hora(S.hora)} · ${S.cobres} cobres`;
    $('#br-pv i').style.width = `${clamp(S.vida / vmax, 0, 1) * 100}%`;
    $('#br-pv-n').textContent = `${Math.ceil(S.vida)}/${vmax}`;
    $('#br-pa i').style.width = `${clamp(S.pa / pmax, 0, 1) * 100}%`;
    $('#br-pa-n').textContent = `${Math.floor(S.pa)}/${pmax}`;
    $('#br-nivel').textContent = `Nivel ${S.nivel} · ${S.xp} PE${S.puntos ? ` · ${S.puntos} puntos libres` : ''}`;
  }

  function pintarBrazal() {
    const S = G.s, c = $('#br-contenido');
    document.querySelectorAll('#brazal [data-pestana]').forEach((b) => b.setAttribute('aria-selected', b.dataset.pestana === pestana));
    pintarPie();
    c.innerHTML = '';
    c.scrollTop = 0;
    if (pestana === 'estado') {
      const sig = xpParaNivel(S.nivel + 1), ant = xpParaNivel(S.nivel);
      const dt = S.equipo.ropa ? OBJETOS[S.equipo.ropa].dt : 0;
      const esp = specialEfectivo(S), sis = G.juego.sistemas;
      const barra = (v) => `<i class="br-barra"><i style="width:${clamp(v, 0, 100)}%"></i></i>`;
      const nombreSed = tramo(TRAMOS_SED, S.sed)?.[1] || 'Sin sed', nombreSueno = tramo(TRAMOS_SUENO, S.cansancio)?.[1] || 'Descansado';
      const miembro = (k, n) => `<li><span>${n}</span>${S.miembros[k] <= 0 ? '<em>lisiado</em>' : ''}${barra(S.miembros[k])}</li>`;
      c.innerHTML = `
        <h4>El zahorí · nivel ${S.nivel}</h4>
        <p style="margin:0 0 8px">Experiencia <i class="br-medidor" style="width:220px"><i style="width:${clamp((S.xp - ant) / (sig - ant), 0, 1) * 100}%"></i></i> ${S.xp} / ${sig} PE</p>
        <div class="br-cols">
          <div><h4>Atributos</h4><ul class="br-lista">${Object.entries(SPECIAL).map(([k, n]) => `<li><span>${n}</span><b>${esp[k]}${esp[k] < S.special[k] ? ` <em>(${S.special[k]})</em>` : ''}</b></li>`).join('')}</ul>
            <h4>Cuerpo</h4><ul class="br-lista">
              ${S.extremo ? `<li><span>${nombreSed}</span>${barra(100 - S.sed / 10)}</li><li><span>${nombreSueno}</span>${barra(100 - S.cansancio / 10)}</li>` : ''}
              ${miembro('cabeza', 'Cabeza')}${miembro('brazos', 'Brazos')}${miembro('piernas', 'Piernas')}
              <li><span>Umbral de daño</span><b>${dt + (S.ventajas.includes('piel_curtida') ? 3 : 0)}</b></li>
            </ul>
            <h4>Reputación</h4><ul class="br-lista">
              <li><span>Karma <small>${S.karma > 0 ? '+' : ''}${S.karma}</small></span><b>${sis.tituloKarma()}</b></li>
              <li><span>En Cobreseco</span><b>${sis.estadoFama('pueblo')}</b></li>
              <li><span>Con los Cuervos</span><b>${sis.estadoFama('cuervos')}</b></li>
              <li><span>Bajas</span><b>${S.bajas}</b></li>
              <li><span>Lugares descubiertos</span><b>${Object.keys(S.lugares).length} de ${Object.keys(LUGARES).length}</b></li>
            </ul></div>
          <div><h4>Habilidades${S.puntos ? ` · ${S.puntos} por repartir` : ''}</h4>
            <ul class="br-lista">${Object.entries(HAB).map(([k, n]) => `<li><span>${n}</span><b>${S.hab[k]}</b>${S.puntos && S.hab[k] < 100 ? `<button class="br-boton mas" data-sube="${k}" aria-label="Subir ${n}">+</button>` : ''}</li>`).join('')}</ul>
            <h4>Ventajas${S.ventajasPendientes ? ` · elige ${S.ventajasPendientes}` : ''}</h4>
            <div id="br-ventajas"></div>
          </div>
        </div>`;
      const cv = c.querySelector('#br-ventajas');
      if (!S.ventajas.length && !S.ventajasPendientes) cv.append(el('p', 'br-vacio', 'Cada dos niveles eliges una ventaja.'));
      for (const v of sis.ventajasDisponibles()) {
        const tiene = S.ventajas.includes(v.id);
        if (!tiene && !S.ventajasPendientes) continue;
        const d = el('div', `br-ventaja${v.razon && !tiene ? ' bloqueada' : ''}`, `<span>${v.nombre}<small>${v.texto}${v.razon && !tiene ? ` Requiere: ${v.razon}.` : ''}</small></span>`);
        if (!tiene && !v.razon) {
          const b = el('button', 'br-boton', 'Elegir');
          b.addEventListener('click', () => { if (sis.elegirVentaja(v.id)) pintarBrazal(); });
          d.append(b);
        }
        cv.append(d);
      }
      c.querySelectorAll('[data-sube]').forEach((b) => b.addEventListener('click', (e) => {
        const k = b.dataset.sube;
        const n = e.shiftKey ? Math.min(5, S.puntos, 100 - S.hab[k]) : 1;
        S.hab[k] += n;
        S.puntos -= n;
        G.audio?.tecla();
        pintarBrazal();
        if (!S.puntos) guardar();
      }));
    } else if (pestana === 'objetos') {
      const peso = pesoInventario(S, OBJETOS), carga = cargaMaxima(S);
      c.append(el('p', peso > carga ? 'br-nota' : 'br-vacio', `Peso ${peso} de ${carga} kg${peso > carga ? ' · vas sobrecargado: no puedes correr ni viajar' : ''}`));
      const grupos = { arma: 'Armas', explosivo: 'Explosivos', ropa: 'Ropa', consumible: 'Para curarse', municion: 'Munición', herramienta: 'Herramientas', clave: 'Objetos de misión', chatarra: 'Chatarra y materiales' };
      for (const [tipo, titulo] of Object.entries(grupos)) {
        const ids = Object.keys(S.inv).filter((id) => OBJETOS[id].tipo === tipo);
        if (!ids.length) continue;
        c.append(el('h4', '', titulo));
        const ul = el('ul', 'br-lista');
        for (const id of ids) {
          const o = OBJETOS[id];
          const li = el('li');
          const equipado = S.equipo.arma === id || S.equipo.ropa === id;
          let extra = o.texto || '';
          if (o.arma) {
            const cnd = Math.round(S.cnd[id] ?? 100);
            extra = o.arma.cuerpo ? `Daño ${o.arma.dano} · pega con la Fuerza · estado ${cnd} %` : `Daño ${o.arma.dano}${o.arma.perdigones ? ` ×${o.arma.perdigones} perdigones` : ''} · cargador ${o.arma.cargador} · estado ${cnd} %${S.atascadas?.[id] ? ' · encasquillada' : ''}`;
          }
          if (o.peso) extra += `${extra ? ' · ' : ''}${o.peso} kg`;
          if (o.dt) extra = `Umbral de daño ${o.dt}`;
          li.innerHTML = `<span>${o.nombre}${S.inv[id] > 1 ? ` ×${S.inv[id]}` : ''}${equipado ? ' <em>(puesto)</em>' : ''}<small>${extra}</small></span>`;
          const accion = o.tipo === 'consumible' ? (o.sed > 0 ? 'Beber' : 'Usar') : o.tipo === 'arma' ? (equipado ? null : 'Empuñar') : o.tipo === 'ropa' ? (equipado ? 'Quitar' : 'Ponerse')
            : id === 'kit_reparacion' && S.equipo.arma ? 'Arreglar el arma' : id === 'dinamita' ? 'Lanzar' : null;
          if (accion) {
            const b = el('button', 'br-boton', accion);
            b.addEventListener('click', () => { G.juego.usarObjeto(id); pintarBrazal(); });
            li.append(b);
          }
          ul.append(li);
        }
        c.append(ul);
      }
      if (!c.children.length) c.append(el('p', 'br-vacio', 'No llevas nada encima.'));
    } else if (pestana === 'misiones') {
      const ids = Object.keys(S.misiones);
      if (!ids.length) c.append(el('p', 'br-vacio', 'Todavía no tienes misiones. Habla con la doctora Inés.'));
      for (const estado of ['activa', 'hecha']) {
        for (const id of ids.filter((k) => S.misiones[k].estado === estado)) {
          const m = S.misiones[id], def = G.juego.defMision(id);
          if (!def) continue;
          const box = el('div', `br-mision ${estado}${S.activa === id ? ' sigue' : ''}`);
          box.append(el('h4', '', `${def.titulo}${estado === 'hecha' ? ' (completada)' : ''}`));
          const ol = el('ol');
          def.etapas.forEach((e, i) => {
            if (i > m.etapa && estado === 'activa') return;
            ol.append(el('li', i < m.etapa || estado === 'hecha' ? 'tachada' : '', e.texto));
          });
          box.append(ol);
          if (estado === 'activa' && S.activa !== id) {
            const b = el('button', 'br-boton', 'Seguir esta misión');
            b.addEventListener('click', () => { S.activa = id; G.audio?.tecla(); pintarBrazal(); });
            box.append(b);
          }
          c.append(box);
        }
      }
    } else if (pestana === 'mapa') {
      const caja = el('div', 'br-mapa');
      const cv = el('canvas');
      caja.append(cv);
      const lado = el('div');
      lado.append(el('p', '', 'Clic en el mapa para poner una marca. Clic sobre una marca, o clic derecho, para quitarla. Las marcas salen en la brújula y en el horizonte.'));
      const J = G.jugador;
      const lista = el('ul', 'br-lista');
      (S.marcas || []).forEach((m, i) => {
        const d = Math.hypot(m.x - J.pos.x, m.z - J.pos.z);
        const li = el('li', '', `<span>Marca ${m.n}<small>${Math.round(d)} m ${rumbo(m.x - J.pos.x, m.z - J.pos.z)}</small></span>`);
        const q = el('button', 'br-boton', 'Quitar');
        q.addEventListener('click', () => { quitarMarca(i); });
        li.append(q);
        lista.append(li);
      });
      if (!(S.marcas || []).length) lista.append(el('li', 'br-vacio', '<span>Sin marcas.</span>'));
      lado.append(lista);
      // Viaje rápido a los lugares descubiertos
      lado.append(el('h4', '', 'Viaje rápido'));
      const motivo = G.juego.sistemas.motivoNoViajar();
      if (motivo) lado.append(el('p', 'br-vacio', `${motivo}: no puedes viajar.`));
      const viajes = el('ul', 'br-lista');
      for (const [id, l] of Object.entries(LUGARES)) {
        if (!S.lugares[id] || Math.hypot(l.x - J.pos.x, l.z - J.pos.z) < l.r) continue;
        const li = el('li', '', `<span>${l.nombre}<small>${Math.round(Math.hypot(l.x - J.pos.x, l.z - J.pos.z))} m ${rumbo(l.x - J.pos.x, l.z - J.pos.z)}</small></span>`);
        if (!motivo) {
          const b = el('button', 'br-boton', 'Viajar');
          b.addEventListener('click', () => { if (G.juego.sistemas.viajar(id)) cerrarModal(); });
          li.append(b);
        }
        viajes.append(li);
      }
      if (viajes.children.length) lado.append(viajes);
      caja.append(lado);
      c.append(caja);
      pintarMapa(cv);
      const aMundo = (e) => {
        const k = cv.width / cv.clientWidth;
        return [((e.offsetX * k) / cv.width - 0.5) * MAPA_T, ((e.offsetY * k) / cv.height - 0.5) * MAPA_T];
      };
      const cerca = (wx, wz) => (S.marcas || []).findIndex((m) => Math.hypot(m.x - wx, m.z - wz) < 9);
      cv.addEventListener('click', (e) => {
        const [wx, wz] = aMundo(e);
        const i = cerca(wx, wz);
        if (i >= 0) { quitarMarca(i); return; }
        S.marcas = S.marcas || [];
        if (S.marcas.length >= 5) { G.audio?.error(); ui.toast('El brazal guarda cinco marcas como mucho. Quita una antes.'); return; }
        const usados = new Set(S.marcas.map((m) => m.n));
        let n = 1;
        while (usados.has(n)) n++;
        S.marcas.push({ x: wx, z: wz, n });
        G.audio?.ok();
        G.brazal.marcasCambiaron();
        pintarBrazal();
      });
      cv.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const [wx, wz] = aMundo(e);
        const i = cerca(wx, wz);
        if (i >= 0) quitarMarca(i);
      });
    } else if (pestana === 'radio') {
      const caja = el('div', 'br-cols');
      const izq = el('div', 'br-emisoras');
      izq.append(el('h4', '', 'Emisoras'));
      for (const e of EMISORAS) {
        if (e.si && !e.si()) continue;
        const b = el('button', 'br-boton', e.nombre);
        b.setAttribute('aria-pressed', (S.radio || 'musica') === e.id);
        b.addEventListener('click', () => { G.juego.sintonizar(e.id); pintarBrazal(); });
        izq.append(b);
      }
      const der = el('div');
      const actual = EMISORAS.find((e) => e.id === (S.radio || 'musica'));
      der.append(el('h4', '', actual.nombre));
      der.append(el('p', '', actual.texto));
      const onda = el('canvas', 'br-onda');
      onda.width = 340; onda.height = 46;
      der.append(onda);
      const ultimas = (S.radioLog || []).filter((l) => l.e === actual.id).slice(-4);
      for (const l of ultimas) der.append(el('p', 'br-nota', `<small>${hora(l.h)}</small>${l.t}`));
      caja.append(izq, der);
      c.append(caja);
    } else if (pestana === 'notas') {
      const notas = [...(S.notas || [])].reverse();
      if (!notas.length) c.append(el('p', 'br-vacio', 'El brazal apunta solo lo importante: misiones, lugares, mensajes. Todavía no hay nada.'));
      for (const n of notas) c.append(el('div', 'br-nota', `<small>Día ${n.d}, ${hora(n.h)}</small>${n.t}`));
    } else if (pestana === 'ajustes') {
      c.innerHTML = `
        <div class="br-ajustes">
          <div class="calidades"><button id="aj-guardar" class="br-boton">Guardar partida</button>
          <button id="aj-linterna" class="br-boton" aria-pressed="${G.brazal.linterna}">Linterna (L): ${G.brazal.linterna ? 'encendida' : 'apagada'}</button>
          <button id="aj-extremo" class="br-boton" aria-pressed="${S.extremo}">Modo extremo: ${S.extremo ? 'sí' : 'no'}</button></div>
          <p class="br-vacio" style="margin:0">En modo extremo tienes sed y cansancio: bebe agua y duerme en tu catre de la clínica.</p>
          <h4>Calidad gráfica</h4>
          <div class="calidades">${[['auto', 'Automática'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']].map(([k, n]) => `<button class="br-boton" data-calidad="${k}" aria-pressed="${G.calidad.preferencia === k}">${n}</button>`).join('')}</div>
          <p class="br-vacio" style="margin:0">Ahora en calidad ${G.calidad.nivel}. Si va lento, elige Baja.</p>
          <h4>Controles</h4>
          <dl>
            <dt>WASD</dt><dd>Moverse · Mayús para correr</dd>
            <dt>Ratón</dt><dd>Mirar · clic izquierdo dispara · derecho apunta</dd>
            <dt>E</dt><dd>Hablar, abrir, recoger</dd>
            <dt>C</dt><dd>Agacharse (sigilo)</dd>
            <dt>Q</dt><dd>M.I.R.A.: congela el tiempo y apunta por partes</dd>
            <dt>R · H</dt><dd>Recargar o soltar un encasquillamiento · inyectarse suero</dd>
            <dt>1 – 8</dt><dd>Armas (rueda del ratón para cambiar): pistola, rifle, escopeta, pico, revólver, subfusil, carabina, machete</dd>
            <dt>Z · G</dt><dd>Enfundar el arma · lanzar dinamita</dd>
            <dt>Tab · M</dt><dd>Brazal · brazal en el mapa</dd>
            <dt>T · L</dt><dd>Esperar · linterna del brazal</dd>
            <dt>F5 · F9</dt><dd>Guardado rápido · cargar</dd>
          </dl>
        </div>`;
      $('#aj-guardar').addEventListener('click', () => { guardar(); ui.toast('Partida guardada'); G.audio?.ok(); });
      $('#aj-linterna').addEventListener('click', () => { G.brazal.alternarLinterna(); pintarBrazal(); });
      $('#aj-extremo').addEventListener('click', () => { S.extremo = !S.extremo; G.audio?.tecla(); pintarBrazal(); });
      c.querySelectorAll('[data-calidad]').forEach((b) => b.addEventListener('click', () => { G.calidad.elegir(b.dataset.calidad); pintarBrazal(); }));
    }
  }
  ui.refrescarBrazal = () => { if (G.modal === 'brazal') pintarBrazal(); };

  // ---------- contenedores ----------
  let contActual = null;
  ui.abrirContenedor = (id) => {
    contActual = id;
    abrirModal('contenedor');
    $('#contenedor').hidden = false;
    const def = CONTENEDORES[id];
    $('#co-titulo').textContent = def.nombre;
    const robo = G.juego.sistemas.esRobo(id);
    const dueno = robo ? G.actores.find((a) => a.id === def.dueno) : null;
    $('#co-aviso').hidden = !robo;
    if (robo) $('#co-aviso').textContent = `Es de ${dueno ? dueno.nombre : 'alguien del pueblo'}. Si te ven cogerlo, es un robo.`;
    pintarContenedor();
  };
  function pintarContenedor() {
    const S = G.s, sis = G.juego.sistemas, c = sis.contenido(contActual);
    const robo = sis.esRobo(contActual);
    const dentro = $('#co-dentro'), mio = $('#co-mio');
    dentro.innerHTML = '';
    mio.innerHTML = '';
    const fila = (nombre, n, cls, fn) => {
      const f = el('button', `fila${cls ? ` ${cls}` : ''}`, `<span class="nombre">${nombre}</span><span class="cant">×${n}</span><span class="precio"></span>`);
      f.addEventListener('click', (e) => { if (fn(e.shiftKey)) { if (G.modal === 'contenedor') pintarContenedor(); } });
      return f;
    };
    for (const [id, n] of Object.entries(c.objetos)) {
      const nombre = id === 'cobres' ? 'Cobres' : OBJETOS[id].nombre;
      dentro.append(fila(nombre, n, robo ? 'robo' : '', (todo) => sis.tomar(contActual, id, todo ? n : 1)));
    }
    if (!dentro.children.length) dentro.append(el('p', 'vacio', 'Vacío.'));
    for (const [id, n] of Object.entries(S.inv)) {
      if (OBJETOS[id].tipo === 'clave') continue;
      mio.append(fila(OBJETOS[id].nombre, n, '', (todo) => sis.dejar(contActual, id, todo ? n : 1)));
    }
    $('#co-peso').textContent = `Peso ${pesoInventario(S, OBJETOS)} de ${cargaMaxima(S)} kg.`;
    $('#co-todo').hidden = !Object.keys(c.objetos).length;
  }
  $('#co-todo').addEventListener('click', () => {
    const c = G.juego.sistemas.contenido(contActual);
    for (const [id, n] of Object.entries({ ...c.objetos })) { G.juego.sistemas.tomar(contActual, id, n); if (G.modal !== 'contenedor') return; }
    pintarContenedor();
  });
  $('#co-cerrar').addEventListener('click', cerrarModal);

  // ---------- fabricación ----------
  let estacion = 'banco';
  ui.abrirFabricar = (donde) => {
    estacion = donde;
    abrirModal('fabricar');
    $('#fabricar').hidden = false;
    $('#fa-titulo').textContent = donde === 'banco' ? 'Banco de trabajo' : 'Hoguera';
    pintarFabricar();
  };
  function pintarFabricar() {
    const lista = $('#fa-lista');
    lista.innerHTML = '';
    for (const r of G.juego.sistemas.recetas(estacion)) {
      const usa = Object.entries(r.usa).map(([o, n]) => `${OBJETOS[o].nombre.toLowerCase()} ×${n} (tienes ${cuenta(o)})`).join(', ');
      const da = Object.entries(r.da).map(([o, n]) => `${OBJETOS[o].nombre}${n > 1 ? ` ×${n}` : ''}`).join(', ');
      const d = el('div', 'receta', `<b>${da}</b><small>Con ${usa}.</small>${r.razon ? `<small class="no">${r.razon}.</small>` : ''}`);
      const b = el('button', 'cerrar', 'Hacer');
      b.disabled = !!r.razon;
      b.addEventListener('click', () => { if (G.juego.sistemas.fabricar(r.id)) pintarFabricar(); });
      d.append(b);
      lista.append(d);
    }
  }
  $('#fa-cerrar').addEventListener('click', cerrarModal);

  // ---------- esperar y dormir ----------
  let durmiendo = false;
  ui.abrirEsperar = (dormir) => {
    durmiendo = dormir;
    if (G.juego.sistemas.hayPeligro()) { G.audio?.error(); ui.toast('No puedes esperar con enemigos cerca.'); return; }
    abrirModal('esperar');
    $('#esperar').hidden = false;
    $('#es-titulo').textContent = dormir ? 'Dormir' : 'Esperar';
    $('#es-ok').textContent = dormir ? 'Dormir' : 'Esperar';
    const S = G.s;
    $('#es-texto').textContent = dormir
      ? 'Tu catre en la clínica. Dormir cura y quita el cansancio; la sed sigue subiendo, aunque más despacio.'
      : `Son las ${hora(S.hora)} del día ${S.dia}. Esperar no cura ni quita el cansancio.`;
    $('#es-horas').value = dormir ? 8 : 4;
    $('#es-num').textContent = $('#es-horas').value;
    $('#es-horas').focus();
  };
  $('#es-horas').addEventListener('input', () => { $('#es-num').textContent = $('#es-horas').value; });
  $('#es-ok').addEventListener('click', () => {
    const h = Number($('#es-horas').value);
    if (G.juego.sistemas.pasarTiempo(h, durmiendo)) cerrarModal();
  });
  $('#es-cerrar').addEventListener('click', cerrarModal);

  function quitarMarca(i) {
    G.s.marcas.splice(i, 1);
    G.audio?.tecla();
    G.brazal.marcasCambiaron();
    pintarBrazal();
  }

  // Mapa en ámbar: relieve sombreado, caminos, lugares, objetivo, marcas y el jugador
  const MAPA_T = 520;
  let fondoMapa = null;
  function pintarMapa(cv) {
    const T = MAPA_T, R = 680;
    cv.width = R; cv.height = R;
    const x = cv.getContext('2d');
    if (!fondoMapa) {
      fondoMapa = document.createElement('canvas');
      fondoMapa.width = R; fondoMapa.height = R;
      const fx = fondoMapa.getContext('2d');
      const img = fx.createImageData(R, R);
      for (let j = 0; j < R; j++) {
        for (let i = 0; i < R; i++) {
          const wx = (i / R - 0.5) * T, wz = (j / R - 0.5) * T;
          const h = G.mundo.alturaTerreno(wx, wz);
          const hx = G.mundo.alturaTerreno(wx + 1, wz);
          const luz = clamp(0.32 + (h - hx) * 0.35 + h * 0.004, 0.08, 0.75);
          const camino = G.mundo.lineaPoligono(wx, wz) < 2.2;
          const curva = Math.abs((h / 6) - Math.round(h / 6)) < 0.035;
          const k = camino ? 0.95 : curva ? luz + 0.18 : luz;
          const p = (j * R + i) * 4;
          img.data[p] = 255 * k; img.data[p + 1] = 181 * k; img.data[p + 2] = 71 * k * 0.8; img.data[p + 3] = 255;
        }
      }
      fx.putImageData(img, 0, 0);
    }
    x.drawImage(fondoMapa, 0, 0);
    const aPx = (wx, wz) => [(wx / T + 0.5) * R, (wz / T + 0.5) * R];
    x.font = '26px VT323, monospace';
    x.textAlign = 'center';
    x.shadowColor = 'rgba(0,0,0,0.9)';
    x.shadowBlur = 4;
    for (const [id, l] of Object.entries(LUGARES)) {
      if (!G.s.lugares[id]) continue;
      const [px, py] = aPx(l.x, l.z);
      x.fillStyle = '#ffe2b0';
      x.fillRect(px - 5, py - 5, 10, 10);
      x.fillText(l.nombre, px, py - 12);
    }
    const ob = G.juego.objetivo();
    if (ob && ob.pos) {
      const [px, py] = aPx(ob.pos.x, ob.pos.z);
      x.strokeStyle = '#fff1c9'; x.lineWidth = 3;
      x.beginPath(); x.arc(px, py, 13, 0, 7); x.stroke();
      x.beginPath(); x.arc(px, py, 4, 0, 7); x.stroke();
    }
    for (const m of G.s.marcas || []) {
      const [px, py] = aPx(m.x, m.z);
      x.save();
      x.translate(px, py);
      x.rotate(Math.PI / 4);
      x.fillStyle = '#160d04'; x.strokeStyle = '#ffb547'; x.lineWidth = 3;
      x.fillRect(-9, -9, 18, 18); x.strokeRect(-9, -9, 18, 18);
      x.restore();
      x.fillStyle = '#ffb547';
      x.font = '22px VT323, monospace';
      x.fillText(String(m.n), px, py + 7);
    }
    const J = G.jugador;
    const [jx, jy] = aPx(J.pos.x, J.pos.z);
    x.save();
    x.translate(jx, jy);
    x.rotate(-J.yaw);
    x.fillStyle = '#fff1c9';
    x.beginPath(); x.moveTo(0, 15); x.lineTo(10, -10); x.lineTo(0, -4); x.lineTo(-10, -10); x.closePath(); x.fill();
    x.restore();
    x.fillStyle = '#ffe2b0';
    x.font = '30px VT323, monospace';
    x.fillText('N', R / 2, 28);
  }

  // Osciloscopio de la radio: se mueve mientras la pestaña está abierta
  function pintarOnda(t) {
    const cv = document.querySelector('#br-contenido .br-onda');
    if (!cv) return;
    const x = cv.getContext('2d'), W = cv.width, H = cv.height;
    const emisora = G.s.radio || 'musica';
    x.clearRect(0, 0, W, H);
    x.strokeStyle = '#ffb547';
    x.lineWidth = 2;
    x.shadowColor = 'rgba(255,181,71,0.8)';
    x.shadowBlur = 6;
    x.beginPath();
    for (let i = 0; i <= W; i += 3) {
      let y = 0;
      if (emisora === 'musica') y = Math.sin(i * 0.09 + t * 7) * 9 + Math.sin(i * 0.031 - t * 3) * 7;
      else if (emisora === 'apagada') y = (Math.random() - 0.5) * 1.5;
      else y = (Math.random() - 0.5) * 18 * (0.4 + 0.6 * Math.abs(Math.sin(t * 2.3)));
      if (i) x.lineTo(i, H / 2 + y); else x.moveTo(i, H / 2 + y);
    }
    x.stroke();
  }

  // ---------- terminal ----------
  const PALABRAS = ['CANTINA', 'ESPUELA', 'BARRACA', 'CERROJO', 'PISTOLA', 'MONTURA', 'PRADERA', 'COBARDE', 'SENDERO', 'CANTERA', 'GALOPAR', 'BANDIDO', 'CENIZAS', 'CABALLO', 'VAQUERO', 'CARRETA', 'SOMBRAS', 'MINEROS', 'AGUJERO', 'RASTROS', 'BALANZA', 'ACEQUIA', 'TINAJAS', 'CANTARO', 'CORRIDO', 'MANANTE'];
  let term = null;
  ui.abrirTerminal = (cb) => {
    abrirModal('terminal');
    $('#terminal').hidden = false;
    const desorden = '!@#$%^&*()[]{}<>?/\\|;:\'",.-_=+';
    const filas = 32, ancho = 12;
    const lineas = [];
    for (let i = 0; i < filas; i++) {
      let l = '';
      for (let k = 0; k < ancho; k++) l += desorden[Math.floor(Math.random() * desorden.length)];
      lineas.push(l.split(''));
    }
    const elegidas = [...PALABRAS].sort(() => Math.random() - 0.5).slice(0, 10);
    const clave = elegidas[Math.floor(Math.random() * elegidas.length)];
    const filasPal = [...Array(filas).keys()].sort(() => Math.random() - 0.5).slice(0, elegidas.length);
    const palabras = elegidas.map((w, i) => ({ w, fila: filasPal[i], col: Math.floor(Math.random() * (ancho - w.length + 1)), quitada: false }));
    for (const p of palabras) for (let k = 0; k < p.w.length; k++) lineas[p.fila][p.col + k] = p.w[k];
    // Pares de signos en filas sin palabra
    const pares = [];
    const abre = '([{<', cierra = ')]}>';
    for (let i = 0; i < filas; i++) {
      if (palabras.some((p) => p.fila === i) || Math.random() < 0.55) continue;
      const t = Math.floor(Math.random() * 4), largo = 2 + Math.floor(Math.random() * 4), col = Math.floor(Math.random() * (ancho - largo));
      lineas[i][col] = abre[t];
      for (let k = 1; k < largo; k++) if (/[A-Z]/.test(lineas[i][col + k]) || abre.includes(lineas[i][col + k]) || cierra.includes(lineas[i][col + k])) lineas[i][col + k] = '.';
      lineas[i][col + largo] = cierra[t];
      pares.push({ fila: i, col, largo: largo + 1, usado: false });
    }
    term = { cb, clave, palabras, pares, lineas, intentos: 4, registro: [], hecho: false };
    pintarTerminal();
  };
  function pintarTerminal() {
    const t = term, cont = $('#te-volcado');
    $('#te-intentos').innerHTML = `${t.intentos} ${t.intentos === 1 ? 'INTENTO' : 'INTENTOS'} RESTANTES: ${'<i></i>'.repeat(t.intentos)}`;
    $('#te-aviso').textContent = t.intentos === 1 ? '!!! ATENCIÓN: BLOQUEO INMINENTE !!!' : 'INTRODUZCA LA CONTRASEÑA';
    cont.innerHTML = '';
    const col = [el('div', 'col'), el('div', 'col')];
    t.lineas.forEach((l, i) => {
      const fila = el('div', 'fila');
      fila.append(el('span', 'dir', '0x' + (0xF4A0 + i * 12).toString(16).toUpperCase()));
      const cuerpo = el('span', 'cuerpo');
      let k = 0;
      while (k < l.length) {
        const p = t.palabras.find((w) => w.fila === i && w.col === k);
        const par = t.pares.find((q) => q.fila === i && q.col === k && !q.usado);
        if (p) {
          const s = el('button', 'palabra', p.quitada ? '.'.repeat(p.w.length) : p.w);
          if (!p.quitada) s.addEventListener('click', () => probarPalabra(p));
          s.addEventListener('mouseenter', () => G.audio?.tecla());
          cuerpo.append(s);
          k += p.w.length;
        } else if (par) {
          const s = el('button', 'par', l.slice(k, k + par.largo).join(''));
          s.addEventListener('click', () => usarPar(par));
          cuerpo.append(s);
          k += par.largo;
        } else {
          cuerpo.append(document.createTextNode(l[k]));
          k++;
        }
      }
      fila.append(cuerpo);
      col[i < 16 ? 0 : 1].append(fila);
    });
    cont.append(...col);
    $('#te-registro').innerHTML = t.registro.slice(-14).map((r) => `<p>&gt;${r}</p>`).join('');
  }
  function probarPalabra(p) {
    const t = term;
    if (t.hecho) return;
    G.audio?.tecla();
    if (p.w === t.clave) {
      t.registro.push(p.w, 'Contraseña aceptada.');
      t.hecho = true;
      G.audio?.ok();
      pintarTerminal();
      setTimeout(menuTerminal, 700);
      t.cb('ok');
      return;
    }
    let iguales = 0;
    for (let k = 0; k < p.w.length; k++) if (p.w[k] === t.clave[k]) iguales++;
    t.intentos--;
    t.registro.push(p.w, 'Entrada denegada.', `Coincidencia = ${iguales}`);
    G.audio?.error();
    if (t.intentos <= 0) {
      t.hecho = true;
      t.registro.push('TERMINAL BLOQUEADO.', 'Contacte con el administrador.');
      pintarTerminal();
      t.cb('bloqueado');
      setTimeout(cerrarModal, 2200);
      return;
    }
    pintarTerminal();
  }
  function usarPar(par) {
    const t = term;
    if (t.hecho) return;
    par.usado = true;
    G.audio?.ok();
    const falsas = t.palabras.filter((p) => p.w !== t.clave && !p.quitada);
    if (t.intentos < 4 && Math.random() < 0.3) {
      t.intentos = 4;
      t.registro.push(t.lineas[par.fila].slice(par.col, par.col + par.largo).join(''), 'Intentos restablecidos.');
    } else if (falsas.length) {
      falsas[Math.floor(Math.random() * falsas.length)].quitada = true;
      t.registro.push(t.lineas[par.fila].slice(par.col, par.col + par.largo).join(''), 'Señuelo eliminado.');
    }
    for (let k = par.col; k < par.col + par.largo; k++) t.lineas[par.fila][k] = '.';
    pintarTerminal();
  }
  function menuTerminal() {
    const cont = $('#te-volcado');
    $('#te-intentos').textContent = 'GASOLINERA OCASO · OFICINA';
    $('#te-aviso').textContent = 'BIENVENIDO, BENITO';
    cont.innerHTML = '';
    const menu = el('div', 'menu-term');
    const entradas = [
      ['Abrir la caja fuerte', () => { if (!G.s.flags.cajaAbierta) term.cb('caja'); mostrarTexto('Cerradura de la caja fuerte: ABIERTA.'); }],
      ['Diario: 14 de agosto', () => mostrarTexto('Otro camión que no llega. Me quedan tres válvulas de bomba y ni una gota de gasolina que vender. Lupe dice que la de Cobreseco aguantará otro año. Lupe es una optimista.')],
      ['Diario: 2 de septiembre', () => mostrarTexto('Han vuelto los perros. Tres, flacos, de los que ya no le tienen miedo a nada. Mañana voy a mirar si en la cisterna queda algo de gasoil. Si no vuelvo, la llave de la oficina está en mi bolsillo, como siempre.')],
      ['Salir', () => cerrarModal()],
    ];
    for (const [txt, fn] of entradas) {
      const b = el('button', 'palabra', `&gt; ${txt}`);
      b.addEventListener('click', () => { G.audio?.tecla(); fn(); });
      menu.append(b);
    }
    cont.append(menu);
    function mostrarTexto(tx) {
      $('#te-registro').innerHTML = `<p>${tx}</p>`;
    }
  }
  $('#te-cerrar').addEventListener('click', cerrarModal);

  // ---------- ganzúa ----------
  let gz = null;
  const nivelCerradura = (n) => (n <= 25 ? 'Fácil' : n <= 50 ? 'Normal' : n <= 75 ? 'Difícil' : 'Muy difícil');
  ui.abrirGanzua = (nivel, cb) => {
    abrirModal('ganzua');
    $('#ganzua').hidden = false;
    const hab = G.s.hab.ganzua;
    gz = { nivel, cb, centro: (Math.random() * 160 - 80) * Math.PI / 180, ancho: Math.max(5, 9 + (hab - nivel) * 0.5) * Math.PI / 180, angulo: 0, giro: 0, tension: 0, girando: false, abierta: false };
    $('#gz-info').textContent = `Cerradura ${nivelCerradura(nivel)} (${nivel}) · tu Ganzúa ${hab} · horquillas ${cuenta('horquilla')}`;
    pintarGanzua();
  };
  const lienzoG = $('#gz-lienzo');
  lienzoG.addEventListener('pointermove', (e) => {
    if (!gz || gz.girando) return;
    const r = lienzoG.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * 0.62);
    gz.angulo = clamp(Math.atan2(dx, -dy), -Math.PI / 2, Math.PI / 2);
  });
  const empezarGiro = () => { if (gz && !gz.abierta) gz.girando = true; };
  const pararGiro = () => { if (gz) gz.girando = false; };
  $('#gz-girar').addEventListener('pointerdown', empezarGiro);
  window.addEventListener('pointerup', pararGiro);
  $('#gz-cerrar').addEventListener('click', cerrarModal);
  function actualizarGanzua(dt) {
    if (!gz || G.modal !== 'ganzua') return;
    const k = G.jugador.teclas;
    if (keys.izq) gz.angulo = clamp(gz.angulo - dt * 1.2, -Math.PI / 2, Math.PI / 2);
    if (keys.der) gz.angulo = clamp(gz.angulo + dt * 1.2, -Math.PI / 2, Math.PI / 2);
    void k;
    const dif = Math.abs(gz.angulo - gz.centro);
    const maximo = dif < gz.ancho ? Math.PI / 2 : Math.max(0, Math.PI / 2 * (1 - (dif - gz.ancho) / (40 * Math.PI / 180)));
    if (gz.girando) {
      gz.giro = Math.min(gz.giro + dt * 2.4, maximo);
      if (gz.giro >= Math.PI / 2 - 0.01) {
        gz.abierta = true;
        gz.girando = false;
        G.audio?.ok();
        $('#gz-info').textContent = 'Abierta.';
        setTimeout(() => { cerrarModal(); gz.cb(true); }, 500);
      } else if (gz.giro >= maximo - 0.01) {
        gz.tension += dt;
        if (Math.random() < dt * 8) G.audio?.tecla();
        if (gz.tension > 0.9) {
          G.juego && G.s.inv.horquilla && (G.s.inv.horquilla -= 1, G.s.inv.horquilla <= 0 && delete G.s.inv.horquilla);
          G.audio?.error();
          gz.tension = 0;
          gz.girando = false;
          gz.giro = 0;
          ui.toast('Se rompió una horquilla');
          if (!cuenta('horquilla')) { $('#gz-info').textContent = 'No te quedan horquillas.'; setTimeout(cerrarModal, 900); }
          else $('#gz-info').textContent = `Cerradura ${nivelCerradura(gz.nivel)} (${gz.nivel}) · tu Ganzúa ${G.s.hab.ganzua} · horquillas ${cuenta('horquilla')}`;
        }
      }
    } else {
      gz.giro = Math.max(0, gz.giro - dt * 3);
      gz.tension = Math.max(0, gz.tension - dt);
    }
    pintarGanzua();
  }
  function pintarGanzua() {
    const c = lienzoG, x = c.getContext('2d');
    const W = c.width = 420, H = c.height = 340;
    x.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.62;
    x.fillStyle = '#2a211b';
    x.beginPath(); x.arc(cx, cy, 120, 0, 7); x.fill();
    x.strokeStyle = '#5b4637'; x.lineWidth = 6; x.stroke();
    x.save();
    x.translate(cx, cy);
    x.rotate(gz ? gz.giro : 0);
    x.fillStyle = '#b48a4a';
    x.beginPath(); x.arc(0, 0, 70, 0, 7); x.fill();
    x.fillStyle = '#7b5a2e';
    x.beginPath(); x.arc(0, 0, 58, 0, 7); x.fill();
    x.fillStyle = '#120d0a';
    x.beginPath(); x.arc(0, -12, 12, 0, 7); x.fill();
    x.fillRect(-6, -12, 12, 40);
    x.restore();
    if (gz) {
      x.save();
      x.translate(cx, cy);
      x.rotate(gz.angulo);
      const temblor = gz.tension > 0 ? (Math.random() - 0.5) * gz.tension * 4 : 0;
      x.strokeStyle = '#c9ccc8';
      x.lineWidth = 4;
      x.beginPath(); x.moveTo(temblor, -5); x.lineTo(temblor, -160); x.stroke();
      x.restore();
      x.save();
      x.translate(cx, cy + 4);
      x.rotate(gz.giro * 0.8 + 0.6);
      x.strokeStyle = '#8b8e8a';
      x.lineWidth = 6;
      x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 130); x.stroke();
      x.restore();
    }
  }

  // ---------- M.I.R.A. ----------
  let miraBotones = [];
  ui.abrirMira = () => {
    $('#mira').hidden = false;
    document.exitPointerLock?.();
    pintarMira();
  };
  ui.cerrarMira = (interrumpido) => {
    $('#mira').hidden = true;
    if (interrumpido && G.modal === 'mira') G.jugador.cancelarMira();
    if (G.jugando) {
      try { const r = G.render.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* sin bloqueo */ }
    }
  };
  function pintarMira() {
    const J = G.jugador, em = J.estadoMira;
    if (!em) return;
    const a = em.objetivos[em.i];
    $('#mi-objetivo').innerHTML = `<b>${a.nombre}</b> <span>nivel ${a.nivel}</span><div class="vida-obj"><div style="width:${(a.vida / a.vidaMax) * 100}%"></div></div>`;
    const cont = $('#mi-partes');
    cont.innerHTML = '';
    miraBotones = J.probabilidades(a).map((p, i) => {
      const b = el('button', 'parte', `<span class="n">${i + 1}</span>${PARTES[p.parte].nombre}<b>${p.prob}%</b>`);
      b.addEventListener('click', () => { if (J.encolar(p.parte)) pintarMira(); });
      cont.append(b);
      return { b, parte: p.parte };
    });
    const cola = em.cola.map((c) => PARTES[c.parte].nombre).join(' · ') || 'ningún disparo';
    $('#mi-cola').textContent = `En cola: ${cola}`;
    $('#mi-pa').innerHTML = `PA <b>${Math.floor(G.s.pa)}</b> / ${pamMaximos(G.s.special.AGI)} · ${J.arma.pa} por disparo`;
  }
  $('#mi-disparar').addEventListener('click', () => { if (G.jugador.ejecutarMira()) $('#mi-controles').hidden = true; else ui.cerrarMira(); });
  $('#mi-siguiente').addEventListener('click', () => siguienteObjetivo());
  $('#mi-salir').addEventListener('click', () => { G.jugador.cancelarMira(); ui.cerrarMira(); });
  function siguienteObjetivo() {
    const em = G.jugador.estadoMira;
    if (!em) return;
    em.i = (em.i + 1) % em.objetivos.length;
    pintarMira();
  }

  // ---------- teclado de la interfaz ----------
  const keys = { izq: false, der: false };
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.izq = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.der = false;
    if (e.code === 'Space' && G.modal === 'ganzua') pararGiro();
  });
  ui.tecla = (e) => {
    if (!G.jugando) return false;
    const c = e.code;
    if ((c === 'Tab' || c === 'KeyI') && (!G.modal || G.modal === 'brazal')) {
      e.preventDefault();
      if (G.modal === 'brazal') cerrarModal(); else ui.abrirBrazal();
      return true;
    }
    if (c === 'KeyM' && (!G.modal || G.modal === 'brazal')) {
      e.preventDefault();
      ui.abrirBrazal('mapa');
      return true;
    }
    if (c === 'KeyT' && !G.modal) { ui.abrirEsperar(false); return true; }
    if (c === 'F5') { e.preventDefault(); guardar(); ui.toast('Guardado rápido'); G.audio?.ok(); return true; }
    if (c === 'F9') {
      e.preventDefault();
      try { if (localStorage.getItem('cobreseco-partida-v1')) { sessionStorage.setItem('cobreseco-auto', '1'); location.reload(); } } catch { /* sin almacenamiento */ }
      return true;
    }
    if (c === 'KeyL' && !G.modal) {
      const on = G.brazal.alternarLinterna();
      ui.toast(on ? 'Linterna del brazal encendida' : 'Linterna apagada');
      return true;
    }
    if (!G.modal) return false;
    if (G.modal === 'esperar' && c === 'Enter') { $('#es-ok').click(); return true; }
    if (G.modal === 'dialogo') {
      const n = parseInt(e.key, 10);
      if (n >= 1 && dlg.visibles && dlg.visibles[n - 1]) elegir(dlg.visibles[n - 1]);
      if (c === 'Escape') cerrarModal();
      return true;
    }
    if (G.modal === 'ganzua') {
      if (c === 'KeyA' || c === 'ArrowLeft') keys.izq = true;
      if (c === 'KeyD' || c === 'ArrowRight') keys.der = true;
      if (c === 'Space' || c === 'KeyE') { e.preventDefault(); empezarGiro(); }
      if (c === 'Escape') cerrarModal();
      return true;
    }
    if (G.modal === 'mira') {
      const n = parseInt(e.key, 10);
      if (n >= 1 && miraBotones[n - 1]) miraBotones[n - 1].b.click();
      if (c === 'Tab') { e.preventDefault(); siguienteObjetivo(); }
      if (c === 'Backspace') { G.jugador.desencolar(); pintarMira(); }
      if (c === 'Enter' || c === 'KeyQ' || c === 'Space') { e.preventDefault(); $('#mi-disparar').click(); }
      if (c === 'Escape') { G.jugador.cancelarMira(); ui.cerrarMira(); }
      return true;
    }
    if (c === 'Escape') { cerrarModal(); return true; }
    return true;
  };

  // ---------- pantallas ----------
  ui.muerte = () => {
    $('#muerte').hidden = false;
    hud.hidden = true;
  };
  ui.final = () => {
    const S = G.s;
    const textos = {
      habla: 'Los Cuervos se fueron al norte sin disparar un tiro. En La Sed todavía discuten qué les dijiste.',
      soborno: 'Los Cuervos cogieron tus cobres y se perdieron por el camino del sur. Puede que vuelvan; de momento, el pozo es de Cobreseco.',
      muerte: 'Garza quedó en la arena de su propio campamento. Sin él, los Cuervos se dispersaron por el yermo.',
    };
    $('#fi-texto').textContent = textos[S.flags.resolucion] || textos.muerte;
    $('#fi-datos').innerHTML = `
      <div><dt>Nivel</dt><dd>${S.nivel}</dd></div>
      <div><dt>Experiencia</dt><dd>${S.xp} PE</dd></div>
      <div><dt>Bajas</dt><dd>${S.bajas}</dd></div>
      <div><dt>Cobres</dt><dd>${S.cobres}</dd></div>
      <div><dt>Días</dt><dd>${S.dia}</dd></div>`;
    abrirModal('final');
    $('#final').hidden = false;
  };
  $('#fi-seguir').addEventListener('click', () => { $('#final').hidden = true; cerrarModal(); });

  // ---------- controles táctiles ----------
  const tactil = $('#tactil');
  if (matchMedia('(pointer: coarse)').matches) {
    let joy = null, mirar = null;
    const base = $('#joy'), palo = $('#joy-palo');
    tactil.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      if (e.clientX < innerWidth * 0.45 && !joy) {
        joy = { id: e.pointerId, x: e.clientX, y: e.clientY };
        base.style.left = `${e.clientX - 60}px`;
        base.style.top = `${e.clientY - 60}px`;
        base.hidden = false;
      } else if (!mirar) mirar = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    tactil.addEventListener('pointermove', (e) => {
      if (joy && e.pointerId === joy.id) {
        const dx = clamp((e.clientX - joy.x) / 50, -1, 1), dy = clamp((e.clientY - joy.y) / 50, -1, 1);
        palo.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
        G.jugador.tactilMov = [dx, -dy];
      }
      if (mirar && e.pointerId === mirar.id) {
        G.jugador.tactil(0, 0, e.clientX - mirar.x, e.clientY - mirar.y);
        mirar.x = e.clientX; mirar.y = e.clientY;
      }
    });
    const soltar = (e) => {
      if (joy && e.pointerId === joy.id) { joy = null; base.hidden = true; palo.style.transform = ''; G.jugador.tactilMov = null; }
      if (mirar && e.pointerId === mirar.id) mirar = null;
    };
    tactil.addEventListener('pointerup', soltar);
    tactil.addEventListener('pointercancel', soltar);
    const accion = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); if (G.jugando && !G.modal) fn(); });
    accion('#t-disparar', () => { G.jugador.disparoPendiente = true; });
    accion('#t-usar', () => G.jugador.interactuar());
    accion('#t-agachar', () => { G.jugador.agachado = !G.jugador.agachado; });
    accion('#t-mira', () => G.jugador.abrirMira());
    accion('#t-recargar', () => G.jugador.recargar());
    $('#t-cuaderno').addEventListener('pointerdown', (e) => { e.preventDefault(); if (G.modal === 'brazal') cerrarModal(); else if (!G.modal) ui.abrirBrazal(); });
  }

  // ---------- bucle del HUD ----------
  const PUNTOS = [['S', 0], ['SO', -Math.PI / 4], ['O', -Math.PI / 2], ['NO', -3 * Math.PI / 4], ['N', Math.PI], ['NE', 3 * Math.PI / 4], ['E', Math.PI / 2], ['SE', Math.PI / 4]];
  const tira = $('#brujula-tira');
  const marcas = PUNTOS.map(([n]) => { const m = el('span', n.length === 1 ? 'card' : 'card menor', n); tira.append(m); return m; });
  const marcaObj = el('span', 'obj', ''); tira.append(marcaObj);
  const marcasLug = Object.keys(LUGARES).map(() => { const m = el('span', 'lug', ''); tira.append(m); return m; });
  const marcasEne = Array.from({ length: 6 }, () => { const m = el('span', 'ene', ''); tira.append(m); return m; });
  const marcasPropias = Array.from({ length: 5 }, () => { const m = el('span', 'marca', '<b></b>'); tira.append(m); return m; });

  function enBrujula(span, ang, visible = true) {
    let rel = ang - G.jugador.yaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const ok = visible && Math.abs(rel) < Math.PI / 2;
    span.style.display = ok ? '' : 'none';
    if (ok) span.style.left = `${50 - (rel / (Math.PI / 2)) * 50}%`;
  }

  ui.actualizar = (dt) => {
    const S = G.s, J = G.jugador;
    if (!S || !J) return;
    const vmax = vidaMaxima(S.special.RES, S.nivel), pmax = pamMaximos(S.special.AGI);
    $('#vida .relleno').style.width = `${clamp(S.vida / vmax, 0, 1) * 100}%`;
    $('#vida .num').textContent = Math.ceil(S.vida);
    $('#vida').classList.toggle('bajo', S.vida / vmax < 0.3);
    $('#pa .relleno').style.width = `${clamp(S.pa / pmax, 0, 1) * 100}%`;
    $('#pa .num').textContent = Math.floor(S.pa);
    const arma = J.arma;
    $('#municion').hidden = !arma;
    if (arma) {
      $('#mun-cargador').textContent = S.cargadores[arma.id] || 0;
      $('#mun-total').textContent = `/ ${cuenta(arma.municion)}`;
      const cnd = S.cnd[arma.id] ?? 100;
      $('#mun-nombre').textContent = J.atascada ? 'Encasquillada · R' : J.recargando > 0 ? 'Recargando…' : J.enfundada ? `${OBJETOS[arma.id].nombre} · enfundada` : OBJETOS[arma.id].nombre;
      $('#mun-estado i').style.width = `${cnd}%`;
      $('#mun-estado').classList.toggle('bajo', cnd < 50);
      $('#mun-cargador').hidden = !!arma.cuerpo;
      $('#mun-total').hidden = !!arma.cuerpo;
    }
    // Brújula
    PUNTOS.forEach(([, a], i) => enBrujula(marcas[i], a));
    const ob = G.juego.objetivo();
    if (ob && ob.pos) enBrujula(marcaObj, Math.atan2(ob.pos.x - J.pos.x, ob.pos.z - J.pos.z));
    else marcaObj.style.display = 'none';
    marcasPropias.forEach((m, i) => {
      const mk = (S.marcas || [])[i];
      if (!mk) { m.style.display = 'none'; return; }
      m.querySelector('b').textContent = mk.n;
      enBrujula(m, Math.atan2(mk.x - J.pos.x, mk.z - J.pos.z), Math.hypot(mk.x - J.pos.x, mk.z - J.pos.z) > 4);
    });
    Object.entries(LUGARES).forEach(([id, l], i) => {
      const d = Math.hypot(l.x - J.pos.x, l.z - J.pos.z);
      enBrujula(marcasLug[i], Math.atan2(l.x - J.pos.x, l.z - J.pos.z), S.lugares[id] && d > l.r * 0.6 && d < 260);
    });
    const hostiles = G.actores.filter((a) => a.vivo && a.hostil && (a.estado === 'combate' || a.puntos > -20) && a.pos.distanceTo(J.pos) < 70);
    marcasEne.forEach((m, i) => {
      const a = hostiles[i];
      if (!a) { m.style.display = 'none'; return; }
      enBrujula(m, Math.atan2(a.pos.x - J.pos.x, a.pos.z - J.pos.z));
      m.classList.toggle('combate', a.estado === 'combate');
    });
    // Objetivo
    $('#objetivo').hidden = !ob;
    if (ob) { $('#obj-titulo').textContent = ob.titulo; $('#obj-texto').textContent = ob.texto; }
    // Sigilo
    const sig = $('#sigilo');
    sig.hidden = !J.agachado;
    if (J.agachado) {
      const combate = G.actores.some((a) => a.vivo && a.hostil && a.estado === 'combate' && a.pos.distanceTo(J.pos) < 90);
      const est = combate ? 'detectado' : estadoDeteccion(G.deteccion);
      sig.className = est;
      sig.textContent = { oculto: '[ OCULTO ]', alerta: '[ ALERTA ]', detectado: '[ DETECTADO ]' }[est];
    }
    // Aviso de interacción
    // Condición del cuerpo y crimen
    const etiquetas = [];
    if (S.extremo) {
      const ts = tramo(TRAMOS_SED, S.sed), tc = tramo(TRAMOS_SUENO, S.cansancio);
      if (ts) etiquetas.push([ts[1], S.sed >= 500]);
      if (tc) etiquetas.push([tc[1], S.cansancio >= 600]);
    }
    if (J.limites().sobrecarga) etiquetas.push(['Sobrecarga', true]);
    if (S.miembros.piernas <= 0) etiquetas.push(['Pierna lisiada', true]);
    if (S.miembros.brazos <= 0) etiquetas.push(['Brazo lisiado', true]);
    if (S.miembros.cabeza <= 0) etiquetas.push(['Herida en la cabeza', true]);
    const clave = etiquetas.map((e) => e[0]).join('|');
    if (clave !== ui.ultimaCondicion) {
      ui.ultimaCondicion = clave;
      $('#condicion').innerHTML = etiquetas.map(([t, g]) => `<span class="${g ? 'grave' : ''}">${t}</span>`).join('');
    }
    $('#buscado').hidden = !S.crimen?.activo;
    if (S.crimen?.activo) $('#buscado').textContent = `Cobreseco te busca · multa de ${S.crimen.multa} cobres`;
    $('#mun-dinamita').textContent = cuenta('dinamita') ? `Dinamita ×${cuenta('dinamita')} · G` : '';
    const av = $('#aviso');
    const cand = !G.modal ? J.candidato() : null;
    av.hidden = !cand;
    if (cand) av.querySelector('span').textContent = cand.txt;
    av.classList.toggle('robo', !!cand?.robo);
    // Marcas, heridas, flotantes
    marcaT -= dt;
    if (marcaT <= 0) $('#marca').style.opacity = 0;
    herida = Math.max(0, herida - dt * 0.8);
    $('#herida').style.opacity = herida;
    if (lugarT > 0) { lugarT -= dt; if (lugarT <= 0) $('#lugar').hidden = true; }
    for (let i = flotantes.length - 1; i >= 0; i--) {
      const f = flotantes[i];
      f.t -= dt;
      f.dy += dt * (f.actor ? 0 : 40);
      const p = f.actor ? f.actor.ojos().add(new THREE.Vector3(0, 0.45, 0)) : f.p;
      const s = proyectar(p);
      if (f.t <= 0 || !s) { f.d.remove(); flotantes.splice(i, 1); continue; }
      f.d.style.transform = `translate(${s.x}px, ${s.y - f.dy}px) translate(-50%, -100%)`;
      f.d.style.opacity = Math.min(1, f.t * 3);
    }
    // M.I.R.A.: coloca las etiquetas de cada parte sobre el objetivo
    if (G.modal === 'mira' && J.estadoMira) {
      // Columna de partes junto al objetivo, en el orden de las teclas 1-4
      const a = J.estadoMira.objetivos[J.estadoMira.i];
      const s = proyectar(a.punto('torso'));
      if (s) {
        const n = miraBotones.length;
        const derecha = s.x < innerWidth * 0.62;
        miraBotones.forEach(({ b }, i) => {
          const x = clamp(s.x + (derecha ? 46 : -46), 90, innerWidth - 90);
          const y = clamp(s.y + (i - (n - 1) / 2) * 44, 130, innerHeight - 190);
          b.style.transform = `translate(${x}px, ${y}px) translate(${derecha ? '0' : '-100%'}, -50%)`;
        });
        $('#mi-guia').style.transform = `translate(${s.x}px, ${s.y}px)`;
      }
    }
    if (G.modal === 'mira-ejecuta' || G.modal === 'mira') $('#mi-controles').hidden = G.modal !== 'mira';
    const enMira = G.modal === 'mira' || G.modal === 'mira-ejecuta';
    $('#brujula').hidden = enMira;
    document.body.classList.toggle('en-mira', enMira);
    $('#pista-clic').hidden = J.bloqueado || !!G.modal || !G.jugando || matchMedia('(pointer: coarse)').matches;
    if (G.modal === 'brazal') { relojBrazal += dt; pintarPie(); pintarOnda(relojBrazal); }
    actualizarGanzua(dt);
  };

  return ui;
}
