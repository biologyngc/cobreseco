// Armas: modelos (en primera persona y en manos de los personajes), sus animaciones
// (balanceo, retroceso, recarga de cada tipo, cerrojo, cambio, enfundar, golpe de pico y lanzar
// dinamita), casquillos que rebotan, humo de la boca y la dinamita con su explosión.
import * as THREE from 'three';
import { G } from './state.js';
import { crear, medir, recortar } from './modelos.js';
import { clamp, lerp } from './noise.js';

const metal = new THREE.MeshStandardMaterial({ color: '#2f3032', metalness: 0.75, roughness: 0.38 });
const metalClaro = new THREE.MeshStandardMaterial({ color: '#55534e', metalness: 0.7, roughness: 0.4 });
const hierro = new THREE.MeshStandardMaterial({ color: '#3d3833', metalness: 0.6, roughness: 0.55 });
const madera = new THREE.MeshStandardMaterial({ color: '#6b4426', roughness: 0.68 });
const maderaOsc = new THREE.MeshStandardMaterial({ color: '#4a2e1a', roughness: 0.75 });
const laton = new THREE.MeshStandardMaterial({ color: '#c99a45', metalness: 0.85, roughness: 0.3 });
const rojoCartucho = new THREE.MeshStandardMaterial({ color: '#9a2a1f', roughness: 0.6 });
const rojoDinamita = new THREE.MeshStandardMaterial({ color: '#b3322a', roughness: 0.7 });
const mecha = new THREE.MeshStandardMaterial({ color: '#d9c9a0', roughness: 0.9 });

function malla(g, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
const caja = (g, w, h, d, mat, x, y, z) => malla(g, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
// Cilindro a lo largo de z
function tubo(g, r, largo, mat, x, y, z, lados = 10) {
  const m = malla(g, new THREE.CylinderGeometry(r, r, largo, lados), mat, x, y, z);
  m.rotation.x = Math.PI / 2;
  return m;
}

// ---------- modelos ----------
// Todos con la boca del cañón hacia -Z. userData.boca y userData.expulsion son puntos locales;
// userData.piezas guarda las partes que se mueven al recargar.
function escopeta() {
  const g = new THREE.Group();
  const canones = new THREE.Group();
  canones.position.set(0, 0.022, -0.1);
  g.add(canones);
  for (const sx of [-0.0135, 0.0135]) tubo(canones, 0.0125, 0.62, metal, sx, 0, -0.31);
  caja(canones, 0.046, 0.012, 0.6, metalClaro, 0, 0.014, -0.31);
  caja(canones, 0.05, 0.034, 0.22, madera, 0, -0.024, -0.2);
  caja(g, 0.052, 0.062, 0.15, metalClaro, 0, 0.0, -0.035);
  for (const sx of [-0.012, 0.012]) caja(g, 0.008, 0.03, 0.02, metal, sx, 0.036, 0.03);
  const culata = caja(g, 0.044, 0.09, 0.32, madera, 0, -0.045, 0.2);
  culata.rotation.x = 0.14;
  caja(g, 0.03, 0.04, 0.05, maderaOsc, 0, -0.06, 0.055);
  g.userData.boca = new THREE.Vector3(0, 0.022, -0.73);
  g.userData.expulsion = new THREE.Vector3(0, 0.03, -0.09);
  g.userData.piezas = { canones };
  return g;
}

function pico() {
  const g = new THREE.Group();
  const mango = malla(g, new THREE.CylinderGeometry(0.017, 0.021, 0.82, 10), madera, 0, -0.1, 0);
  mango.castShadow = false;
  const cabeza = new THREE.Group();
  cabeza.position.set(0, 0.32, 0);
  g.add(cabeza);
  caja(cabeza, 0.05, 0.06, 0.07, hierro, 0, 0, 0);
  const punta1 = malla(cabeza, new THREE.ConeGeometry(0.026, 0.26, 8), hierro, 0, 0, -0.16);
  punta1.rotation.x = -Math.PI / 2 - 0.12;
  const punta2 = malla(cabeza, new THREE.ConeGeometry(0.03, 0.2, 4), hierro, 0, 0.01, 0.13);
  punta2.rotation.x = Math.PI / 2 + 0.15;
  g.userData.boca = new THREE.Vector3(0, 0.32, -0.28);
  g.userData.piezas = {};
  return g;
}

// Revólver: cañón, tambor y empuñadura de madera
function revolver() {
  const g = new THREE.Group();
  tubo(g, 0.011, 0.19, metal, 0, 0.02, -0.12);
  caja(g, 0.014, 0.016, 0.19, metalClaro, 0, 0.036, -0.12);
  caja(g, 0.03, 0.055, 0.1, metal, 0, 0.012, -0.01);
  const tambor = malla(g, new THREE.CylinderGeometry(0.028, 0.028, 0.052, 12), metalClaro, 0, 0.012, 0.0);
  tambor.rotation.z = Math.PI / 2;
  const grip = caja(g, 0.028, 0.11, 0.05, maderaOsc, 0, -0.055, 0.052);
  grip.rotation.x = 0.33;
  caja(g, 0.026, 0.06, 0.055, metal, 0, 0.0, 0.03);
  g.userData.boca = new THREE.Vector3(0, 0.02, -0.22);
  g.userData.expulsion = new THREE.Vector3(0.03, 0.02, 0.0);
  g.userData.piezas = {};
  return g;
}

// Subfusil de chatarra: camisa perforada, cajón, cargador recto y culata de alambre
function subfusil() {
  const g = new THREE.Group();
  tubo(g, 0.009, 0.3, metal, 0, 0.02, -0.2);
  tubo(g, 0.017, 0.16, metalClaro, 0, 0.02, -0.15, 8);
  caja(g, 0.04, 0.05, 0.26, metal, 0, 0.0, 0.02);
  caja(g, 0.03, 0.024, 0.13, metalClaro, 0.004, 0.036, 0.0);
  caja(g, 0.026, 0.12, 0.05, metal, 0, -0.085, 0.03); // cargador (fijo, a la vista)
  const grip = caja(g, 0.028, 0.09, 0.04, maderaOsc, 0, -0.05, 0.12);
  grip.rotation.x = 0.3;
  caja(g, 0.02, 0.055, 0.02, metal, 0, 0.0, 0.17);
  for (const sx of [-0.02, 0.02]) tubo(g, 0.006, 0.12, metal, sx, -0.012, 0.2, 6);
  g.userData.boca = new THREE.Vector3(0, 0.02, -0.36);
  g.userData.expulsion = new THREE.Vector3(0.03, 0.02, 0.0);
  g.userData.piezas = {};
  return g;
}

// Carabina de palanca: cañón largo con tubo de carga, palanca y maderas
function carabina() {
  const g = new THREE.Group();
  tubo(g, 0.01, 0.6, metal, 0, 0.03, -0.32);
  tubo(g, 0.008, 0.5, metalClaro, 0, 0.013, -0.3);
  caja(g, 0.03, 0.06, 0.16, metalClaro, 0, 0.012, 0.0);
  const palanca = new THREE.Group();
  palanca.position.set(0, -0.03, 0.04);
  caja(palanca, 0.018, 0.05, 0.018, metal, 0, -0.02, 0.0);
  const aro = malla(palanca, new THREE.TorusGeometry(0.028, 0.006, 6, 12), metal, 0, -0.06, 0.0);
  aro.rotation.x = Math.PI / 2;
  g.add(palanca);
  caja(g, 0.028, 0.03, 0.22, madera, 0, 0.012, -0.2);
  const culata = caja(g, 0.034, 0.08, 0.26, madera, 0, -0.022, 0.2);
  culata.rotation.x = 0.1;
  g.userData.boca = new THREE.Vector3(0, 0.03, -0.62);
  g.userData.expulsion = new THREE.Vector3(0.025, 0.04, 0.0);
  g.userData.piezas = {};
  return g;
}

// Machete de chatarra: hoja de sierra con mango de cuero (apunta hacia arriba, como el pico)
function machete() {
  const g = new THREE.Group();
  const mango = malla(g, new THREE.CylinderGeometry(0.016, 0.019, 0.14, 8), maderaOsc, 0, -0.03, 0);
  mango.castShadow = false;
  caja(g, 0.07, 0.013, 0.022, metal, 0, 0.05, 0);
  caja(g, 0.04, 0.34, 0.006, metalClaro, 0.006, 0.24, 0);
  const punta = malla(g, new THREE.ConeGeometry(0.023, 0.09, 4), metalClaro, 0.006, 0.44, 0);
  punta.rotation.y = Math.PI / 4;
  g.userData.boca = new THREE.Vector3(0, 0.42, -0.02);
  g.userData.piezas = {};
  return g;
}

export function modeloDinamita() {
  const g = new THREE.Group();
  tubo(g, 0.017, 0.2, rojoDinamita, 0, 0, 0);
  for (const z of [-0.07, 0.07]) {
    const b = tubo(g, 0.0175, 0.012, mecha, 0, 0, z);
    b.scale.set(1.02, 1, 1.02);
  }
  const m = malla(g, new THREE.CylinderGeometry(0.0025, 0.0025, 0.07, 5), mecha, 0, 0, -0.13);
  m.rotation.x = Math.PI / 2;
  g.userData.mecha = new THREE.Vector3(0, 0, -0.165);
  return g;
}

// Arma en primera persona o en manos de un personaje (mano = true: sin orden de dibujo especial)
export function modeloArma(id, mano = false) {
  let g = null;
  if (id === 'escopeta') g = escopeta();
  else if (id === 'pico') g = pico();
  else if (id === 'revolver') g = revolver();
  else if (id === 'subfusil') g = subfusil();
  else if (id === 'carabina') g = carabina();
  else if (id === 'machete') g = machete();
  else {
    const def = id === 'pistola9' ? { n: 'ph_service_pistol', largo: 0.24, ajuste: [0, -0.02, 0.02] } : { n: 'ph_bolt_action_rifle_7_62', largo: 1.05, ajuste: [0, -0.03, -0.2] };
    if (id === 'pistola9') recortar('ph_service_pistol', [-0.06, -0.06, -0.03], [0.18, 0.09, 0.03]);
    const o = crear(def.n, { largo: def.largo }, { girar: Math.PI / 2 });
    g = new THREE.Group();
    if (o) {
      o.position.set(...def.ajuste);
      g.add(o);
      const b = medir(o);
      const cy = (b.min.y + b.max.y) / 2, cx = (b.min.x + b.max.x) / 2;
      g.userData.boca = new THREE.Vector3(cx, cy + 0.02, b.min.z);
      if (id === 'pistola9') {
        // Cargador que cae y entra por la empuñadura al recargar
        const cargador = caja(g, 0.024, 0.085, 0.034, metal, cx, b.min.y + 0.035, b.max.z - 0.045);
        cargador.visible = false;
        cargador.userData.reposo = cargador.position.clone();
        g.userData.piezas = { cargador };
        g.userData.expulsion = new THREE.Vector3(cx + 0.012, b.max.y - 0.01, b.max.z - 0.09);
      } else {
        // Manilla del cerrojo, a la derecha del cajón de mecanismos
        const cerrojo = new THREE.Group();
        cerrojo.position.set(cx + 0.012, cy + 0.035, b.max.z - 0.43);
        const brazo = malla(cerrojo, new THREE.CylinderGeometry(0.006, 0.006, 0.06, 6), metalClaro, 0.03, 0, 0);
        brazo.rotation.z = Math.PI / 2;
        malla(cerrojo, new THREE.SphereGeometry(0.011, 8, 6), metalClaro, 0.06, 0, 0);
        g.add(cerrojo);
        cerrojo.userData.reposo = cerrojo.position.clone();
        g.userData.piezas = { cerrojo };
        g.userData.expulsion = new THREE.Vector3(cx + 0.02, cy + 0.04, b.max.z - 0.45);
      }
    } else {
      caja(g, 0.045, 0.05, id === 'pistola9' ? 0.22 : 0.9, metal, 0, 0.03, id === 'pistola9' ? -0.06 : -0.45);
      g.userData.boca = new THREE.Vector3(0, 0.03, id === 'pistola9' ? -0.18 : -0.9);
      g.userData.piezas = {};
    }
  }
  g.userData.expulsion ??= new THREE.Vector3(0.02, 0.03, -0.05);
  g.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = false;
    m.receiveShadow = !!mano;
    if (!mano) m.renderOrder = 5;
  });
  return g;
}

// ---------- texturas de efectos ----------
function texturaRadial(colores) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  colores.forEach(([p, col]) => g.addColorStop(p, col));
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function texturaFogonazo() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.translate(64, 64);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 60);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.25, 'rgba(255,200,110,0.9)');
  g.addColorStop(1, 'rgba(255,120,30,0)');
  x.fillStyle = g;
  // Estrella de cinco puntas irregular
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, r = i % 2 ? 16 : 52 + (i * 7) % 10;
    x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  x.closePath();
  x.fill();
  return new THREE.CanvasTexture(c);
}

// ---------- sistema ----------
export function crearArmas(jugador) {
  const escena = G.escena;
  const v = new THREE.Vector3(), v2 = new THREE.Vector3();

  // Fogonazo con forma de estrella
  jugador.fogonazo.material.map = texturaFogonazo();
  jugador.fogonazo.material.color.set('#ffffff');
  jugador.fogonazo.material.blending = THREE.AdditiveBlending;
  jugador.fogonazo.material.needsUpdate = true;

  // Casquillos (pool fijo): latón para las balas, rojo para los cartuchos
  const geoCasq = new THREE.CylinderGeometry(0.0045, 0.0045, 0.019, 6);
  const geoCart = new THREE.CylinderGeometry(0.0095, 0.0095, 0.06, 8);
  const casquillos = Array.from({ length: 28 }, () => {
    const m = new THREE.Mesh(geoCasq, laton);
    m.visible = false;
    m.castShadow = false;
    escena.add(m);
    return { m, vel: new THREE.Vector3(), giro: new THREE.Vector3(), vida: 0, botes: 0 };
  });
  let iCasq = 0;
  function casquillo(origen, cartucho = false) {
    const c = casquillos[iCasq];
    iCasq = (iCasq + 1) % casquillos.length;
    c.m.geometry = cartucho ? geoCart : geoCasq;
    c.m.material = cartucho ? rojoCartucho : laton;
    c.m.position.copy(origen);
    c.m.visible = true;
    const cam = G.camara;
    const der = v.set(1, 0, 0).applyQuaternion(cam.quaternion);
    c.vel.copy(der).multiplyScalar(cartucho ? 0.7 : 1.6 + Math.random() * 0.6);
    c.vel.y += cartucho ? 0.6 : 1.8 + Math.random() * 0.6;
    c.vel.addScaledVector(v2.set(0, 0, -1).applyQuaternion(cam.quaternion), -0.3);
    c.giro.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    c.vida = 5;
    c.botes = 0;
  }

  // Humo de la boca del cañón (sprites suaves que suben y se abren)
  const texHumo = texturaRadial([[0, 'rgba(210,200,185,0.55)'], [0.6, 'rgba(180,170,160,0.18)'], [1, 'rgba(160,150,140,0)']]);
  const humos = Array.from({ length: 18 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texHumo, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false;
    escena.add(s);
    return { s, vida: 0, total: 1, vel: new THREE.Vector3() };
  });
  let iHumo = 0;
  function humo(p, n = 2, grande = 1) {
    for (let k = 0; k < n; k++) {
      const h = humos[iHumo];
      iHumo = (iHumo + 1) % humos.length;
      h.s.position.copy(p);
      h.s.visible = true;
      h.total = h.vida = (0.8 + Math.random() * 0.6) * grande;
      h.vel.set((Math.random() - 0.5) * 0.4, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4).multiplyScalar(grande);
      h.s.scale.setScalar(0.08 * grande);
      h.escala = grande;
    }
  }

  // Destello de explosión
  const texFuego = texturaRadial([[0, 'rgba(255,245,200,1)'], [0.3, 'rgba(255,170,60,0.9)'], [0.7, 'rgba(200,70,20,0.4)'], [1, 'rgba(120,30,10,0)']]);
  const destellos = Array.from({ length: 4 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texFuego, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false }));
    s.visible = false;
    escena.add(s);
    return { s, vida: 0 };
  });

  // ---------- dinamita ----------
  const cartuchos = [];
  function lanzarDinamita({ origen, vel, mecha = 3, dano = 90, radio = 6.5, dueno = 'jugador' }) {
    const m = modeloDinamita();
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    m.position.copy(origen);
    escena.add(m);
    cartuchos.push({ m, vel: vel.clone(), mecha, dano, radio, dueno, giro: new THREE.Vector3(4 + Math.random() * 6, Math.random() * 3, Math.random() * 3), quieto: false });
    G.audio?.mecha?.(origen);
  }
  function explotar(c) {
    const p = c.m.position.clone();
    escena.remove(c.m);
    G.audio?.explosion?.(p);
    // Fogonazo grande y luz
    for (let i = 0; i < 2; i++) {
      const d = destellos.find((x) => x.vida <= 0) || destellos[0];
      d.s.position.copy(p).y += 0.6 + i * 0.4;
      d.s.visible = true;
      d.vida = 0.45 + i * 0.15;
      d.total = d.vida;
      d.s.scale.setScalar(2 + i * 2);
    }
    humo(p.clone().setY(p.y + 0.5), 6, 6);
    G.efectos.explosion?.(p);
    G.jugador.luzExplosion(p);
    // Daño con caída por distancia y temblor de cámara
    const J = G.jugador;
    const dj = J.centro().distanceTo(p);
    J.temblor = Math.max(J.temblor || 0, clamp(1.2 - dj / 30, 0, 1));
    if (dj < c.radio) J.recibirDano(c.dano * (1 - dj / c.radio) ** 0.8, { pos: p });
    for (const a of G.actores) {
      if (!a.vivo || a.dentro) continue;
      const d = a.punto('torso').distanceTo(p);
      if (d >= c.radio) continue;
      a.recibirDano(c.dano * (1 - d / c.radio) ** 0.8, 'torso', { explosion: true, delJugador: c.dueno === 'jugador' });
      if (a.vivo) { a.estado = a.estado === 'quieto' ? 'alerta' : a.estado; a.destino = p.clone(); }
    }
    // Las botellas del campo de tiro también saltan
    for (const b of G.mundo.botellas) if (b.visible && b.position.distanceTo(p) < c.radio) { b.visible = false; G.efectos.cristal(b.position); }
  }

  // ---------- animación en primera persona ----------
  const A = {
    accion: null, // { tipo, t, dur, alTerminar, hechos: Set }
    sway: new THREE.Vector2(), swayVel: new THREE.Vector2(),
    pos: new THREE.Vector3(0.2, -0.2, -0.42), rot: new THREE.Euler(),
    bajado: 0, // 0 arma arriba, 1 abajo del todo (cambio y enfundar)
    correr: 0,
    tiempo: 0,
  };
  // Pose de reposo de cada clase (cadera) y apuntando
  const POSES = {
    pistola: { cadera: [0.19, -0.19, -0.4], mira: [0, -0.135, -0.38] },
    rifle: { cadera: [0.2, -0.21, -0.42], mira: [0, -0.12, -0.44] },
    escopeta: { cadera: [0.2, -0.22, -0.4], mira: [0, -0.148, -0.36] },
    cuerpo: { cadera: [0.3, -0.36, -0.52], mira: [0.3, -0.36, -0.52] },
  };
  const DINAMITA_FP = modeloDinamita();
  DINAMITA_FP.traverse((o) => { if (o.isMesh) { o.renderOrder = 5; o.castShadow = false; } });
  DINAMITA_FP.visible = false;
  jugador.cam.add(DINAMITA_FP);

  function empezar(tipo, dur, alTerminar, opciones = {}) {
    A.accion = { tipo, t: 0, dur, alTerminar, hechos: new Set(), ...opciones };
  }
  const tramo = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const suave = (x) => x * x * (3 - 2 * x);
  const pico01 = (t, a, b) => Math.sin(Math.PI * tramo(t, a, b)); // sube y baja dentro del tramo

  const ar = {
    casquillo, humo, lanzarDinamita,
    get ocupado() { return !!A.accion; },
    get accion() { return A.accion?.tipo || null; },
    recargar(arma, dur, alTerminar) { empezar('recarga', dur, alTerminar, { clase: arma.clase }); },
    cerrojo(alTerminar) { empezar('cerrojo', 0.62, alTerminar); },
    atasco(alTerminar) { empezar('atasco', 1.15, alTerminar); },
    golpe(alGolpear, alTerminar) { empezar('golpe', 0.62, alTerminar, { alGolpear }); },
    lanzar(alSoltar, alTerminar) { empezar('lanzar', 0.85, alTerminar, { alSoltar }); },
    cambiar(alCambiar, alTerminar) { empezar('cambio', 0.5, alTerminar, { alCambiar }); },
    cancelar() { A.accion = null; },
    // Cada fotograma: coloca el grupo del arma y anima sus piezas
    actualizar(dt, e) {
      A.tiempo += dt;
      const g = jugador.armaG, arma = e.arma;
      const modelo = arma ? jugador.modelos[arma.id] : null;
      const clase = arma?.clase || 'pistola';
      const pose = POSES[clase] || POSES.pistola;
      // Balanceo: el arma se queda atrás cuando giras la cámara y vuelve con un muelle
      const k = 60, amort = 9;
      A.swayVel.x += ((-e.ratonX * 0.0009 - A.sway.x) * k - A.swayVel.x * amort) * dt;
      A.swayVel.y += ((-e.ratonY * 0.0009 - A.sway.y) * k - A.swayVel.y * amort) * dt;
      A.sway.addScaledVector(A.swayVel, dt);
      A.sway.clampScalar(-0.08, 0.08);
      A.correr = lerp(A.correr, e.corriendo && !A.accion ? 1 : 0, Math.min(1, dt * 8));
      const enfundada = e.enfundada && !A.accion;
      A.bajado = lerp(A.bajado, enfundada ? 1 : 0, Math.min(1, dt * 9));

      const objetivo = v.set(...(e.apuntando && !A.accion ? pose.mira : pose.cadera));
      A.pos.lerp(objetivo, Math.min(1, dt * 14));
      const p = v2.copy(A.pos);
      let rx = 0, ry = 0, rz = 0;
      // Paso: un ocho suave al andar, más amplio al correr
      const amp = e.moviendo && e.enSuelo ? (e.corriendo ? 0.028 : 0.012) * (e.apuntando ? 0.3 : 1) : 0;
      p.x += Math.sin(e.bob * 0.5) * amp;
      p.y -= Math.abs(Math.cos(e.bob * 0.5)) * amp * 0.9;
      rz += Math.sin(e.bob * 0.5) * amp * 1.5;
      // Respiración
      p.y += Math.sin(A.tiempo * 1.7) * (e.apuntando ? 0.0006 : 0.0018);
      // Correr: arma cruzada y baja
      p.x += A.correr * 0.06; p.y -= A.correr * 0.1; p.z += A.correr * 0.05;
      rx -= A.correr * 0.45; ry += A.correr * 0.7; rz += A.correr * 0.3;
      // Balanceo
      ry += A.sway.x * 3; rx += A.sway.y * 3;
      p.x += A.sway.x * 0.25; p.y += A.sway.y * 0.25;
      // Retroceso
      const r = e.retroceso;
      p.z += r * (clase === 'escopeta' ? 0.09 : clase === 'rifle' ? 0.07 : 0.045);
      rx += r * (clase === 'pistola' ? 0.5 : 0.28);
      // Bajada (cambio de arma y enfundar)
      let bajada = A.bajado;
      // Acciones
      const ac = A.accion;
      const piezas = modelo?.userData.piezas || {};
      if (piezas.cargador) { piezas.cargador.visible = false; piezas.cargador.position.copy(piezas.cargador.userData.reposo); piezas.cargador.material.opacity = 1; }
      if (piezas.cerrojo) { piezas.cerrojo.position.copy(piezas.cerrojo.userData.reposo); piezas.cerrojo.rotation.set(0, 0, 0); }
      if (piezas.canones) piezas.canones.rotation.x = 0;
      DINAMITA_FP.visible = false;
      if (ac) {
        ac.t += dt / ac.dur;
        const t = Math.min(1, ac.t);
        const una = (nombre, cuando, fn) => { if (t >= cuando && !ac.hechos.has(nombre)) { ac.hechos.add(nombre); fn(); } };
        if (ac.tipo === 'recarga' && ac.clase === 'pistola') {
          const inc = suave(tramo(t, 0, 0.18)) * (1 - suave(tramo(t, 0.82, 1)));
          rz += inc * 0.55; rx += inc * 0.25; p.x -= inc * 0.05; p.y += inc * 0.02;
          if (piezas.cargador) {
            const sale = tramo(t, 0.18, 0.36), entra = tramo(t, 0.42, 0.62);
            piezas.cargador.visible = t > 0.16 && t < 0.66;
            const bajo = t < 0.4 ? suave(sale) : 1 - suave(entra);
            piezas.cargador.position.y = piezas.cargador.userData.reposo.y - bajo * 0.2;
          }
          una('suelta', 0.2, () => G.audio?.tecla());
          una('mete', 0.6, () => G.audio?.recarga());
          rx -= pico01(t, 0.66, 0.8) * 0.18; p.z += pico01(t, 0.66, 0.8) * 0.02;
          una('corredera', 0.72, () => G.audio?.clic());
        } else if (ac.tipo === 'recarga' && ac.clase === 'rifle') {
          const inc = suave(tramo(t, 0, 0.14)) * (1 - suave(tramo(t, 0.88, 1)));
          rz -= inc * 0.5; rx += inc * 0.22; p.x -= inc * 0.03;
          if (piezas.cerrojo) {
            const arriba = suave(tramo(t, 0.1, 0.18)) * (1 - suave(tramo(t, 0.86, 0.92)));
            const atras = suave(tramo(t, 0.18, 0.26)) * (1 - suave(tramo(t, 0.78, 0.86)));
            piezas.cerrojo.rotation.z = arriba * 1.2;
            piezas.cerrojo.position.z += atras * 0.07;
          }
          for (let i = 0; i < 5; i++) {
            const c = 0.32 + i * 0.09;
            rx -= pico01(t, c, c + 0.07) * 0.05;
            una(`bala${i}`, c + 0.04, () => G.audio?.tecla());
          }
          una('cierra', 0.84, () => G.audio?.recarga());
        } else if (ac.tipo === 'recarga' && ac.clase === 'escopeta') {
          const inc = suave(tramo(t, 0, 0.15)) * (1 - suave(tramo(t, 0.86, 1)));
          rz += inc * 0.35; rx += inc * 0.3; p.y += inc * 0.03;
          if (piezas.canones) piezas.canones.rotation.x = -suave(tramo(t, 0.12, 0.24)) * (1 - suave(tramo(t, 0.74, 0.8))) * 0.55;
          una('abre', 0.2, () => G.audio?.clic());
          una('vainas', 0.28, () => { const o = modelo.localToWorld(modelo.userData.expulsion.clone()); casquillo(o, true); casquillo(o, true); });
          rx -= pico01(t, 0.42, 0.5) * 0.08; rx -= pico01(t, 0.56, 0.64) * 0.08;
          una('c1', 0.47, () => G.audio?.tecla());
          una('c2', 0.61, () => G.audio?.tecla());
          una('cierra', 0.78, () => G.audio?.recarga());
        } else if (ac.tipo === 'cerrojo') {
          rx += pico01(t, 0, 1) * 0.12; p.y -= pico01(t, 0, 1) * 0.02;
          if (piezas.cerrojo) {
            const arriba = suave(tramo(t, 0.08, 0.22)) * (1 - suave(tramo(t, 0.72, 0.86)));
            const atras = suave(tramo(t, 0.22, 0.38)) * (1 - suave(tramo(t, 0.5, 0.68)));
            piezas.cerrojo.rotation.z = arriba * 1.2;
            piezas.cerrojo.position.z += atras * 0.07;
          }
          una('vaina', 0.38, () => { casquillo(modelo.localToWorld(modelo.userData.expulsion.clone())); G.audio?.clic(); });
          una('cierra', 0.66, () => G.audio?.tecla());
        } else if (ac.tipo === 'atasco') {
          const inc = suave(tramo(t, 0, 0.2)) * (1 - suave(tramo(t, 0.85, 1)));
          rz += inc * 0.7; rx += inc * 0.3;
          rx -= pico01(t, 0.35, 0.45) * 0.25;
          p.z += pico01(t, 0.62, 0.74) * 0.04;
          una('golpe', 0.4, () => G.audio?.tecla());
          una('suelta', 0.68, () => { if (modelo) casquillo(modelo.localToWorld(modelo.userData.expulsion.clone())); G.audio?.recarga(); });
        } else if (ac.tipo === 'golpe') {
          // Coger impulso, descargar el pico y volver
          const carga = suave(tramo(t, 0, 0.32)), golpe = suave(tramo(t, 0.32, 0.46)), vuelta = suave(tramo(t, 0.55, 1));
          const ang = carga * 1.1 - golpe * 2.1 + vuelta * 1.0;
          rx += ang; p.y += carga * 0.12 - golpe * 0.14 + vuelta * 0.02; p.z -= golpe * 0.12 * (1 - vuelta);
          ry += carga * 0.25 - golpe * 0.35 + vuelta * 0.1;
          una('golpea', 0.44, () => ac.alGolpear?.());
        } else if (ac.tipo === 'lanzar') {
          bajada = Math.max(bajada, pico01(t, 0, 1) * 0.8);
          DINAMITA_FP.visible = t < 0.5;
          const sube = suave(tramo(t, 0, 0.3)), tira = suave(tramo(t, 0.3, 0.48));
          DINAMITA_FP.position.set(-0.16 + tira * 0.14, -0.3 + sube * 0.14 + tira * 0.12, -0.36 - tira * 0.3);
          DINAMITA_FP.rotation.set(-0.4 - tira * 1.6, 0.3, 0.5);
          if (t < 0.45 && Math.random() < 0.6) G.efectos.chispa?.(DINAMITA_FP.localToWorld(DINAMITA_FP.userData.mecha.clone()));
          una('mecha', 0.05, () => G.audio?.mecha?.());
          una('suelta', 0.42, () => ac.alSoltar?.());
        } else if (ac.tipo === 'cambio') {
          bajada = Math.max(bajada, t < 0.5 ? suave(tramo(t, 0, 0.45)) : 1 - suave(tramo(t, 0.55, 1)));
          una('cambia', 0.5, () => ac.alCambiar?.());
        }
        if (ac.t >= 1) {
          A.accion = null;
          ac.alTerminar?.();
        }
      }
      p.y -= bajada * 0.42; rx -= bajada * 0.9;
      g.position.copy(p);
      g.rotation.set(rx, ry, rz);
      g.visible = !!arma && bajada < 0.97;
    },
    // Física de casquillos, humo, destellos y cartuchos de dinamita
    actualizarMundo(dt) {
      for (const c of casquillos) {
        if (!c.m.visible) continue;
        c.vida -= dt;
        if (c.vida <= 0) { c.m.visible = false; continue; }
        if (c.botes < 3) {
          c.vel.y -= 9.8 * dt;
          c.m.position.addScaledVector(c.vel, dt);
          c.m.rotation.x += c.giro.x * dt; c.m.rotation.y += c.giro.y * dt; c.m.rotation.z += c.giro.z * dt;
          const suelo = G.mundo.suelo(c.m.position.x, c.m.position.z) + 0.005;
          if (c.m.position.y < suelo) {
            c.m.position.y = suelo;
            c.vel.y = -c.vel.y * 0.35;
            c.vel.x *= 0.5; c.vel.z *= 0.5;
            c.giro.multiplyScalar(0.5);
            if (c.botes === 0) G.audio?.casquillo?.(c.m.position);
            c.botes++;
            if (c.botes >= 3) c.m.rotation.set(Math.PI / 2, Math.random() * 6, 0);
          }
        }
      }
      for (const h of humos) {
        if (!h.s.visible) continue;
        h.vida -= dt;
        if (h.vida <= 0) { h.s.visible = false; continue; }
        const k = 1 - h.vida / h.total;
        h.s.position.addScaledVector(h.vel, dt);
        h.s.scale.setScalar((0.08 + k * 0.5) * (h.escala || 1));
        h.s.material.opacity = (1 - k) * 0.55;
      }
      for (const d of destellos) {
        if (d.vida <= 0) continue;
        d.vida -= dt;
        d.s.material.opacity = Math.max(0, d.vida / d.total);
        d.s.scale.multiplyScalar(1 + dt * 2.5);
        if (d.vida <= 0) d.s.visible = false;
      }
      for (let i = cartuchos.length - 1; i >= 0; i--) {
        const c = cartuchos[i];
        c.mecha -= dt;
        if (Math.random() < 0.7) G.efectos.chispa?.(c.m.localToWorld(c.m.userData.mecha.clone()));
        if (!c.quieto) {
          c.vel.y -= 9.8 * dt;
          const antes = c.m.position.clone();
          c.m.position.addScaledVector(c.vel, dt);
          // Rebota en paredes (las rejillas de los edificios) y en el suelo
          const tope = c.m.position.clone();
          G.mundo.empujar(tope, 0.08, 0.3);
          if (tope.distanceToSquared(c.m.position) > 1e-6) {
            c.m.position.x = antes.x; c.m.position.z = antes.z;
            c.vel.x *= -0.4; c.vel.z *= -0.4;
          }
          const suelo = G.mundo.suelo(c.m.position.x, c.m.position.z) + 0.02;
          if (c.m.position.y < suelo) {
            c.m.position.y = suelo;
            c.vel.y = -c.vel.y * 0.3;
            c.vel.x *= 0.55; c.vel.z *= 0.55;
            if (c.vel.length() < 0.6) { c.quieto = true; c.m.rotation.set(0, c.m.rotation.y, 0); }
          }
          c.m.rotation.x += c.giro.x * dt; c.m.rotation.y += c.giro.y * dt;
        }
        if (c.mecha <= 0) { cartuchos.splice(i, 1); explotar(c); }
      }
    },
    // Arma en manos de un personaje: se coloca en su mano derecha apuntando al blanco
    armaDePersonaje(id) {
      const exterior = new THREE.Group();
      const m = modeloArma(id, true);
      m.rotation.y = Math.PI; // la boca pasa a +Z, que es hacia donde mira lookAt
      exterior.add(m);
      exterior.userData.boca = m.userData.boca.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      exterior.visible = false;
      return exterior;
    },
  };
  return ar;
}
