// Arranque y bucle principal.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G, partidaNueva, cargarGuardada, guardar } from './state.js';
import { crearMundo } from './world.js';
import { crearActores } from './actors.js';
import { Jugador } from './player.js';
import { crearUI } from './ui.js';
import { crearEfectos } from './effects.js';
import { audio } from './audio.js';
import { juego } from './quests.js';
import { TIENDA_PAZ } from './data.js';
import { cargarModelos } from './modelos.js';
import { crearBrazal } from './brazal.js';
import { crearCasino } from './casino.js';

const $ = (s) => document.querySelector(s);

async function fuentes() {
  try {
    await Promise.race([
      Promise.all(['800 70px "Big Shoulders Display"', '400 18px Spectral', '20px VT323'].map((f) => document.fonts.load(f))),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* se usan las fuentes de reserva */ }
}

function sesion(clave, valor) {
  try {
    if (valor === undefined) return sessionStorage.getItem(clave);
    if (valor === null) sessionStorage.removeItem(clave);
    else sessionStorage.setItem(clave, valor);
  } catch { return null; }
  return null;
}

async function iniciar(datosHot = {}) {
  await fuentes();
  // La carga es un sondeo: la sonda baja hasta el agua (142 m) a medida que llegan los modelos
  await cargarModelos((p, hechos, total) => {
    $('#carga-nivel').style.height = `${p * (142 / 150) * 100}%`;
    $('#carga-texto').textContent = p >= 1 ? 'Agua a 142 m. Cobreseco está listo.' : `Sonda a ${Math.round(p * 142)} m · ${hechos} de ${total} piezas`;
  });
  const lienzo = $('#lienzo');
  // El suavizado lo hace el compositor (MSAA en su propio búfer), no el lienzo
  const render = new THREE.WebGLRenderer({ canvas: lienzo, antialias: false, powerPreference: 'high-performance' });
  render.shadowMap.enabled = true;
  render.shadowMap.autoUpdate = false;
  render.shadowMap.type = THREE.PCFSoftShadowMap;
  render.toneMapping = THREE.ACESFilmicToneMapping;
  render.toneMappingExposure = 1.05;
  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 2200);
  escena.add(camara);
  Object.assign(G, { escena, camara, render, audio, juego });
  window.cobreseco = G; // acceso desde la consola para depurar

  const composer = new EffectComposer(render);
  composer.addPass(new RenderPass(escena, camara));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.35, 0.55, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  G.s = partidaNueva();
  G.mundo = crearMundo(escena);
  G.efectos = crearEfectos(escena);
  G.jugador = new Jugador(camara, lienzo);
  G.brazal = crearBrazal(camara);
  G.ui = crearUI();
  G.casino = crearCasino();
  G.actores = crearActores(escena);

  // ---------- calidad gráfica ----------
  // escala: resolución interna; sombra: tamaño del mapa y cada cuántos fotogramas se recalcula;
  // veg y dist: densidad y distancia de la vegetación; actores: distancia a la que se dibujan.
  const CALIDADES = {
    alta: { escala: 1, sombra: 2048, cadaSombra: 1, bloom: true, msaa: 4, veg: 1, dist: 230, actores: 150 },
    media: { escala: 0.85, sombra: 1024, cadaSombra: 2, bloom: true, msaa: 2, veg: 0.6, dist: 170, actores: 110 },
    baja: { escala: 0.65, sombra: 1024, cadaSombra: 4, bloom: false, msaa: 0, veg: 0.35, dist: 120, actores: 80 },
  };
  let preferencia = 'auto';
  try { preferencia = localStorage.getItem('cobreseco-calidad') || 'auto'; } catch { /* sin almacenamiento */ }
  let nivel = preferencia === 'auto' ? 'media' : preferencia;
  let C = CALIDADES[nivel];
  let ancho = 0, alto = 0;
  const ajustarTamano = (forzar) => {
    const w = lienzo.clientWidth || innerWidth, h = lienzo.clientHeight || innerHeight;
    if (!forzar && w === ancho && h === alto) return;
    ancho = w;
    alto = h;
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
    const pr = Math.min(devicePixelRatio, 1) * C.escala;
    render.setPixelRatio(pr);
    composer.setPixelRatio(pr);
    render.setSize(w, h, false);
    composer.setSize(w, h);
  };
  const aplicarCalidad = (n) => {
    nivel = n;
    C = CALIDADES[n];
    bloom.enabled = C.bloom;
    composer.renderTarget1.samples = C.msaa;
    composer.renderTarget2.samples = C.msaa;
    composer.renderTarget1.dispose();
    composer.renderTarget2.dispose();
    G.mundo.ponerSombra(C.sombra);
    G.mundo.calidad.densidad = C.veg;
    G.mundo.calidad.distancia = C.dist;
    ajustarTamano(true);
  };
  G.calidad = {
    get nivel() { return nivel; },
    get preferencia() { return preferencia; },
    elegir(p) {
      preferencia = p;
      try { localStorage.setItem('cobreseco-calidad', p); } catch { /* sin almacenamiento */ }
      aplicarCalidad(p === 'auto' ? 'media' : p);
      medicion = { t: 0, cuadros: 0, hecha: p !== 'auto' };
    },
  };
  aplicarCalidad(nivel);
  // Modo automático: mide los FPS reales unos segundos y baja o sube la calidad
  let medicion = { t: 0, cuadros: 0, hecha: preferencia !== 'auto' };
  const medirCalidad = (dt) => {
    if (medicion.hecha || !G.jugando || G.modal || document.hidden) return;
    medicion.t += dt;
    medicion.cuadros++;
    if (medicion.t < 4) return;
    const fps = medicion.cuadros / medicion.t;
    medicion = { t: 0, cuadros: 0, hecha: false };
    if (fps < 32 && nivel !== 'baja') aplicarCalidad(nivel === 'alta' ? 'media' : 'baja');
    else if (fps > 57 && nivel === 'media') aplicarCalidad('alta');
    else medicion.hecha = true;
  };

  const guardada = cargarGuardada();
  if (guardada) $('#bt-continuar').hidden = false;

  function empezar(s, nueva) {
    audio.iniciar();
    G.s = s;
    if (!G.s.tienda) G.s.tienda = { ...TIENDA_PAZ };
    for (const a of G.actores) escena.remove(a.g);
    G.actores = crearActores(escena);
    juego.aplicarEstadoMundo();
    G.jugador.colocar(s.pos[0], s.pos[1], s.pos[2], s.yaw);
    G.jugador.equiparModelo();
    G.brazal.marcasCambiaron();
    G.audio.ponerMusica?.((s.radio || 'musica') === 'musica');
    $('#titulo').hidden = true;
    $('#muerte').hidden = true;
    $('#hud').hidden = false;
    $('#tactil').hidden = !matchMedia('(pointer: coarse)').matches;
    G.jugando = true;
    G.modal = null;
    if (nueva) {
      juego.empezar('q1');
      G.ui.toast('Despiertas en la clínica de Cobreseco. Habla con la doctora (E).');
    }
    try { const r = lienzo.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* el primer clic lo pedirá */ }
    G.ui.bloqueo(false);
  }

  $('#bt-nueva').addEventListener('click', () => empezar(partidaNueva(), true));
  $('#bt-continuar').addEventListener('click', () => { const g = cargarGuardada(); if (g) empezar(g, false); });
  $('#bt-creditos').addEventListener('click', () => { $('#creditos').hidden = false; });
  $('#cr-cerrar').addEventListener('click', () => { $('#creditos').hidden = true; });
  const recargar = () => { sesion('cobreseco-auto', '1'); location.reload(); };
  $('#mu-cargar').addEventListener('click', () => { if (cargarGuardada()) recargar(); else empezar(partidaNueva(), true); });
  $('#mu-nueva').addEventListener('click', () => { try { localStorage.removeItem('cobreseco-partida-v1'); } catch { /* nada */ } sesion('cobreseco-auto', null); location.reload(); });

  window.claude?.hot?.snapshot?.(() => (G.jugando ? { s: G.s } : {}));

  $('#cargando').hidden = true;
  if (datosHot.s) empezar(datosHot.s, false);
  else if (sesion('cobreseco-auto') && guardada) { sesion('cobreseco-auto', null); empezar(guardada, false); }

  // ---------- bucle ----------
  const reloj = new THREE.Clock();
  const frustum = new THREE.Frustum(), mProj = new THREE.Matrix4(), esfera = new THREE.Sphere();
  let t = 0, guardadoT = 0, cuadro = 0;
  const centroTitulo = new THREE.Vector3();
  render.setAnimationLoop(() => {
    const dtRealSinTope = reloj.getDelta();
    const dtReal = Math.min(dtRealSinTope, 0.05);
    t += dtReal;
    ajustarTamano();
    medirCalidad(dtRealSinTope);
    cuadro++;
    if (cuadro % C.cadaSombra === 0) render.shadowMap.needsUpdate = true;
    if (G.jugando) {
      const S = G.s, J = G.jugador;
      let dt = 0;
      if (!G.modal || G.modal === 'mira-ejecuta') {
        dt = dtReal * G.escalaTiempo;
        S.hora += (dt * 30) / 3600;
        if (S.hora >= 24) { S.hora -= 24; S.dia++; }
        let det = -100;
        // Recorte por cámara de cada personaje entero, con la cámara del fotograma anterior
        mProj.multiplyMatrices(camara.projectionMatrix, camara.matrixWorldInverse);
        frustum.setFromProjectionMatrix(mProj);
        for (const a of G.actores) {
          const d = a.pos.distanceTo(J.pos);
          esfera.center.set(a.pos.x, a.pos.y + 0.9, a.pos.z);
          esfera.radius = (d < 30 ? 4 : 1.8) * (a.escala || 1);
          a.g.visible = !a.dentro && d < C.actores && frustum.intersectsSphere(esfera);
          a.lejos = d > 60;
          a.sombraSegunDistancia(d);
          if (a.vivo && d > 170 && a.estado === 'quieto') continue;
          a.actualizar(dt, t);
          if (a.vivo && a.hostil) det = Math.max(det, a.puntos);
        }
        G.deteccion = det;
        juego.actualizar(dt);
        J.armas.actualizarMundo(dt);
      }
      if ((G.modal === 'dialogo' || G.modal === 'trueque') && G.hablandoCon) {
        const a = G.hablandoCon;
        if (!a.sentado) a.mirarA(J.pos.x, J.pos.z, dtReal, 4);
        a.animarModelo(dtReal);
      }
      if (!G.modal) J.actualizar(dt);
      else if (G.modal === 'mira' || G.modal === 'mira-ejecuta') {
        J.actualizarMira(dtReal);
        J.animarMira(dtReal);
      }
      G.mundo.ponerHora(S.hora, J.pos);
      G.mundo.actualizar(dt || (G.modal ? 0 : dtReal), t, J.pos);
      G.efectos.actualizar(dtReal * (G.modal === 'mira-ejecuta' ? 0.4 : 1));
      G.brazal.actualizar(dtReal);
      G.ui.actualizar(dtReal);
      guardadoT += dtReal;
      if (guardadoT > 60 && !G.modal) { guardadoT = 0; guardar(); }
    } else {
      // Pantalla de título: la cámara rodea el pueblo al atardecer
      const a = t * 0.04;
      // Lo bastante lejos para no atravesar el almacén de Paz ni La Sed
      camara.position.set(Math.cos(a) * 58, 17 + Math.sin(t * 0.1) * 1.5, Math.sin(a) * 58);
      camara.lookAt(0, 3, 0);
      G.mundo.ponerHora(18.35, centroTitulo);
      G.mundo.actualizar(dtReal, t, camara.position);
    }
    composer.render();
  });
}

const arrancar = (datos) => iniciar(datos).catch((e) => {
  $('#carga-texto').textContent = `No se pudo iniciar el juego: ${e.message}. Recarga la página para intentarlo otra vez.`;
  console.error(e);
});
if (window.claude?.hot?.ready) window.claude.hot.ready(arrancar);
else arrancar(window.claude?.hot?.data ?? {});
