// Personajes y criaturas: modelos hechos con piezas simples, IA con máquina de estados
// (quieto, alerta, combate, huida, arresto, inconsciente, muerto) y detección del jugador.
import * as THREE from 'three';
import { G } from './state.js';
import { TIPOS, PERSONAJES, ENEMIGOS, VALENTIA, ARMAS_NPC } from './data.js';
import { puntuacionDeteccion, xpPorMuerte, danoTrasDT } from './rules.js';
import { clamp } from './noise.js';
import { crear, crearPersonaje, clipsPara, gltf } from './modelos.js';

// Modelo descargado de cada personaje o tipo de enemigo (Mixamo y Sketchfab).
const MODELO_PERSONAJE = { ines: 'mx_ines', ocana: 'mx_ocana', lupe: 'mx_lupe', paz: 'mx_paz', chema: 'mx_chema', nieves: 'mx_nieves', garza: 'mx_garza', buhonero: 'mx_cuervo1', viajera: 'mx_paz' };
const MODELO_ANIMAL = { lagarto: { n: 'geco', largo: 1.35 }, lagarto_alfa: { n: 'geco', largo: 1.35 }, perro: { n: 'lobo', largo: 1.45 }, perro_alfa: { n: 'lobo', largo: 1.45 } };

const cache = new Map();
function m(color, extra = {}) {
  const k = color + JSON.stringify(extra);
  if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra }));
  return cache.get(k);
}

function pieza(padre, geo, mat, x, y, z, parte) {
  const p = new THREE.Mesh(geo, mat);
  p.position.set(x, y, z);
  p.castShadow = true;
  p.userData.parte = parte;
  padre.add(p);
  return p;
}

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function modeloHumano(o) {
  const g = new THREE.Group();
  const ropa = m(o.ropa), piel = m(o.piel), oscuro = m('#2a221c'), acento = m(o.acento || '#8a6a4a');
  const cadera = new THREE.Group();
  cadera.position.y = 0.95;
  g.add(cadera);
  const piernas = [];
  for (const s of [-1, 1]) {
    const pg = new THREE.Group();
    pg.position.set(s * 0.12, 0, 0);
    pieza(pg, B(0.17, 0.82, 0.2), m('#3a3530'), 0, -0.42, 0, 'piernas');
    pieza(pg, B(0.19, 0.14, 0.3), oscuro, 0, -0.86, 0.05, 'piernas');
    cadera.add(pg);
    piernas.push(pg);
  }
  const torso = pieza(cadera, B(0.5, 0.62, 0.28), ropa, 0, 0.36, 0, 'torso');
  pieza(cadera, B(0.52, 0.1, 0.3), oscuro, 0, 0.06, 0, 'torso');
  pieza(cadera, B(0.3, 0.1, 0.05), acento, 0, 0.6, 0.15, 'torso');
  const brazos = [];
  for (const s of [-1, 1]) {
    const bg = new THREE.Group();
    bg.position.set(s * 0.33, 0.62, 0);
    pieza(bg, B(0.14, 0.6, 0.16), ropa, 0, -0.28, 0, 'brazos');
    pieza(bg, B(0.12, 0.13, 0.13), piel, 0, -0.62, 0, 'brazos');
    cadera.add(bg);
    brazos.push(bg);
  }
  const cabeza = new THREE.Group();
  cabeza.position.y = 0.86;
  cadera.add(cabeza);
  pieza(cabeza, new THREE.IcosahedronGeometry(0.15, 1), piel, 0, 0.1, 0, 'cabeza');
  pieza(cabeza, B(0.1, 0.1, 0.12), piel, 0, -0.04, 0, 'cabeza');
  if (o.pelo) pieza(cabeza, new THREE.SphereGeometry(0.16, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), m(o.pelo), 0, 0.12, -0.02, 'cabeza');
  if (o.sombrero === 'ala') {
    pieza(cabeza, new THREE.CylinderGeometry(0.34, 0.34, 0.03, 10), m('#5a4030'), 0, 0.22, 0, 'cabeza');
    pieza(cabeza, new THREE.CylinderGeometry(0.15, 0.17, 0.17, 8), m('#5a4030'), 0, 0.31, 0, 'cabeza');
    pieza(cabeza, new THREE.CylinderGeometry(0.172, 0.172, 0.04, 8), acento, 0, 0.25, 0, 'cabeza');
  } else if (o.sombrero === 'gorra') {
    pieza(cabeza, new THREE.SphereGeometry(0.165, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), acento, 0, 0.13, 0, 'cabeza');
    pieza(cabeza, B(0.24, 0.025, 0.16), acento, 0, 0.14, 0.15, 'cabeza');
  } else if (o.sombrero === 'panuelo') {
    pieza(cabeza, B(0.31, 0.12, 0.3), acento, 0, 0.03, 0.02, 'cabeza');
    pieza(cabeza, new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), m('#2a2522'), 0, 0.12, 0, 'cabeza');
  }
  // Ojos
  pieza(cabeza, B(0.035, 0.03, 0.02), m('#15110e'), -0.055, 0.12, 0.145, 'cabeza');
  pieza(cabeza, B(0.035, 0.03, 0.02), m('#15110e'), 0.055, 0.12, 0.145, 'cabeza');
  let arma = null;
  if (o.armado) {
    arma = new THREE.Group();
    pieza(arma, B(0.06, 0.1, o.rifle ? 0.95 : 0.3), m('#2b2c2e', { metalness: 0.6 }), 0, 0, o.rifle ? 0.3 : 0.12, 'brazos');
    if (o.rifle) pieza(arma, B(0.07, 0.14, 0.35), m('#5b3b22'), 0, -0.03, -0.2, 'brazos');
    arma.position.set(0, -0.6, 0.08);
    brazos[1].add(arma);
  }
  return { g, cadera, piernas, brazos, cabeza, torso, arma, altura: 1.85 };
}

function modeloCuadrupedo(o, perro) {
  const g = new THREE.Group();
  const cuerpo = m(o.color), vientre = m(o.vientre), oscuro = m('#1a1714');
  const raiz = new THREE.Group();
  raiz.position.y = perro ? 0.62 : 0.38;
  g.add(raiz);
  const torso = pieza(raiz, B(perro ? 0.42 : 0.5, perro ? 0.42 : 0.3, perro ? 1.0 : 1.1), cuerpo, 0, 0, 0, 'torso');
  pieza(raiz, B(perro ? 0.36 : 0.44, 0.08, perro ? 0.8 : 0.95), vientre, 0, perro ? -0.2 : -0.14, 0, 'torso');
  const cabeza = new THREE.Group();
  cabeza.position.set(0, perro ? 0.22 : 0.05, perro ? 0.62 : 0.66);
  raiz.add(cabeza);
  if (perro) {
    pieza(cabeza, B(0.3, 0.28, 0.32), cuerpo, 0, 0, 0, 'cabeza');
    pieza(cabeza, B(0.18, 0.15, 0.26), cuerpo, 0, -0.05, 0.26, 'cabeza');
    for (const s of [-1, 1]) pieza(cabeza, new THREE.ConeGeometry(0.06, 0.16, 4), oscuro, s * 0.1, 0.2, -0.05, 'cabeza');
  } else {
    pieza(cabeza, new THREE.ConeGeometry(0.2, 0.58, 5).rotateX(Math.PI / 2), cuerpo, 0, 0, 0.18, 'cabeza');
    pieza(cabeza, B(0.3, 0.1, 0.24), vientre, 0, -0.1, 0.06, 'cabeza');
    for (const s of [-1, 1]) pieza(cabeza, new THREE.SphereGeometry(0.05, 6, 4), m('#e8b53a', { emissive: '#7a4a08', emissiveIntensity: 0.6 }), s * 0.13, 0.06, 0.12, 'cabeza');
    for (let i = 0; i < 6; i++) pieza(raiz, new THREE.ConeGeometry(0.05, 0.16, 4), oscuro, 0, 0.2, 0.4 - i * 0.16, 'torso');
  }
  const cola = new THREE.Group();
  cola.position.set(0, perro ? 0.12 : 0, perro ? -0.5 : -0.55);
  raiz.add(cola);
  pieza(cola, new THREE.ConeGeometry(perro ? 0.06 : 0.16, perro ? 0.45 : 1.1, 5).rotateX(-Math.PI / 2 + (perro ? 0.6 : 0)), cuerpo, 0, 0, perro ? -0.2 : -0.5, 'torso');
  const piernas = [];
  for (const [px, pz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pg = new THREE.Group();
    pg.position.set(px * (perro ? 0.16 : 0.3), 0, pz * (perro ? 0.36 : 0.35));
    if (perro) pieza(pg, B(0.1, 0.62, 0.12), cuerpo, 0, -0.31, 0, 'piernas');
    else {
      pieza(pg, B(0.26, 0.09, 0.1), cuerpo, px * 0.12, -0.05, 0, 'piernas');
      pieza(pg, B(0.09, 0.3, 0.09), cuerpo, px * 0.24, -0.2, 0, 'piernas');
    }
    raiz.add(pg);
    piernas.push(pg);
  }
  return { g, raiz, cabeza, cola, piernas, torso, altura: perro ? 0.9 : 0.6 };
}

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();

// Fogonazo de las armas de los personajes (una textura para todos)
let matDestello = null;
function materialDestello() {
  if (matDestello) return matDestello;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,248,215,1)');
  g.addColorStop(0.35, 'rgba(255,190,90,0.85)');
  g.addColorStop(1, 'rgba(255,120,30,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  matDestello = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  return matDestello;
}

// Frases de combate, por bando
const FRASES = {
  combate: {
    cuervos: ['¡Ahí está!', '¡Es el zahorí!', '¡A por él!', '¡Rodeadlo!'],
    pueblo: ['¡Fuera de mi pueblo!', '¡Te lo has buscado!', '¡Quieto ahí!'],
    ocana: ['¡Alto en nombre de la ley!', '¡Suelta el arma!'],
  },
  herido: ['¡Me ha dado!', '¡Ay!', '¡Cuidado, que tira bien!'],
  recarga: ['¡Recargo!', '¡Cubridme!'],
  escondido: ['¿Dónde se ha metido?', 'Sal de ahí, que no muerdo.'],
  dinamita: ['¡Dinamita!', '¡Toma esto!'],
  huida: ['¡Me retiro!', '¡Socorro!', '¡No dispares!'],
};
const una = (lista) => lista[Math.floor(Math.random() * lista.length)];

export class Actor {
  constructor(def) {
    this.id = def.id;
    this.def = def;
    const tipo = def.tipo ? TIPOS[def.tipo] : null;
    this.tipo = tipo;
    this.nombre = def.nombre || (tipo ? tipo.nombre : def.id);
    // Vecino: personaje con nombre del pueblo (se habla con él); esencial: no muere, cae inconsciente
    this.vecino = !tipo;
    this.esencial = !!def.esencial;
    this.equipo = tipo ? (tipo.criatura ? 'fauna' : (tipo.faccion || 'cuervos')) : 'pueblo';
    this.nivel = tipo ? tipo.nivel : def.nivel || 4;
    this.vidaMax = tipo ? tipo.vida : def.vida || 80;
    this.vida = this.vidaMax;
    this.dt = tipo ? tipo.dt : def.dt || 0;
    this.criatura = tipo ? tipo.criatura : false;
    const armaId = tipo ? tipo.arma : def.arma;
    this.armaNPC = armaId ? { id: armaId, ...ARMAS_NPC[armaId] } : null;
    this.municionNPC = this.armaNPC?.cargador || 0;
    this.recargaNPC = 0;
    this.dinamitaNPC = tipo?.dinamita || 0;
    this.velocidadBase = tipo ? tipo.velocidad : 4.4;
    this.valentia = tipo ? tipo.valentia : def.valentia || 'normal';
    this.percepcion = tipo ? tipo.percepcion : 6;
    // Vida de cada miembro: a cero queda lisiado (piernas: cojea; brazos: apunta peor)
    this.miembros = { cabeza: this.vidaMax * 0.3, brazos: this.vidaMax * 0.35, piernas: this.vidaMax * 0.35 };
    this.lisiado = {};
    this.estado = 'quieto';
    this.hogar = new THREE.Vector3(def.x, 0, def.z);
    this.yaw = def.yaw ?? Math.random() * 6.28;
    this.conciencia = 0;
    this.cooldown = Math.random();
    this.tiempoEstado = 0;
    this.destino = null;
    this.fase = Math.random() * 6;
    this.puntos = -100;
    this.ronda = def.ronda ? def.ronda.map(([x, z]) => new THREE.Vector3(x, 0, z)) : null;
    this.iRonda = 0;
    const escala = (tipo && tipo.escala) || 1;
    if (!tipo || tipo.forma === 'humano') {
      const o = tipo ? { ...tipo, armado: true } : def;
      this.modelo = modeloHumano(o);
    } else {
      this.modelo = modeloCuadrupedo(tipo, tipo.forma === 'perro');
    }
    this.escala = escala;
    this.modelo.g.scale.setScalar(escala);
    this.g = this.modelo.g;
    this.g.userData.actor = this;
    this.g.traverse((o) => { if (o.isMesh) o.userData.actor = this; });
    this.pos = this.g.position;
    this.pos.set(def.x, G.mundo.suelo(def.x, def.z), def.z);
    this.g.rotation.y = this.yaw;
    this.mallas = [];
    this.g.traverse((o) => { if (o.isMesh) this.mallas.push(o); });
    this.ponerModelo();
  }

  // Sustituye el muñeco hecho por código por el modelo descargado. El muñeco se queda invisible
  // y sigue sirviendo para los impactos por partes (cabeza, torso, brazos, piernas).
  ponerModelo() {
    let visual = null;
    const tipo = this.def.tipo;
    if (MODELO_PERSONAJE[this.id] || (tipo && TIPOS[tipo] && !TIPOS[tipo].criatura)) {
      const n = MODELO_PERSONAJE[this.id] || (Number(this.id.replace(/\D/g, '')) % 2 ? 'mx_cuervo2' : 'mx_cuervo1');
      visual = crearPersonaje(n, 1.78);
      if (visual) {
        this.humano = true;
        this.mixer = new THREE.AnimationMixer(visual);
        this.acciones = {};
        for (const [k, clip] of Object.entries(clipsPara(visual))) this.acciones[k] = this.mixer.clipAction(clip);
      }
    } else if (MODELO_ANIMAL[tipo]) {
      const m = MODELO_ANIMAL[tipo];
      visual = crear(m.n, { largo: m.largo });
      if (visual) {
        this.animal = true;
        this.mixer = new THREE.AnimationMixer(visual);
        const anims = gltf(m.n).animations;
        this.acciones = {};
        for (const c of anims) {
          const k = /howl/i.test(c.name) ? 'aullar' : 'andar';
          this.acciones[k] = this.mixer.clipAction(c);
        }
      }
    }
    if (!visual) return;
    for (const m of this.mallas) m.visible = false;
    // El recorte por cámara se hace por personaje entero (en el bucle principal): recortar cada
    // pieza por separado hacía desaparecer manos, botas o el pelo a medio paso.
    visual.updateMatrixWorld(true);
    this.pieles = [];
    visual.traverse((o) => {
      if (o.isBone && !this.mano && /RightHand$/.test(o.name.replace(/_\d+$/, ''))) this.mano = o;
      if (!o.isSkinnedMesh) return;
      o.frustumCulled = false;
      // Las piezas pequeñas (hebillas, correas…) nunca dan sombra
      o.userData.pequena = this.animal || o.geometry.attributes.position.count < 1500;
      o.castShadow = !o.userData.pequena;
      this.pieles.push(o);
    });
    this.conSombra = true;
    this.visual = visual;
    this.g.add(visual);
    // Arma en la mano derecha, a la vista solo cuando pelea
    if (this.humano && this.armaNPC && G.jugador?.armas) {
      this.armaVisual = G.jugador.armas.armaDePersonaje(this.armaNPC.modelo);
      this.g.add(this.armaVisual);
      this.destello = new THREE.Sprite(materialDestello().clone());
      this.destello.scale.setScalar(this.armaNPC.rifle ? 0.55 : 0.4);
      this.destello.visible = false;
      this.armaVisual.add(this.destello);
      this.destello.position.copy(this.armaVisual.userData.boca);
    }
    this.reproducir(this.animal ? 'andar' : 'reposo', 0);
    if (this.animal && this.acciones.andar) this.acciones.andar.timeScale = 0;
  }

  // Solo los personajes cercanos proyectan sombra
  sombraSegunDistancia(d) {
    const s = d < 30;
    if (!this.pieles || s === this.conSombra) return;
    this.conSombra = s;
    for (const p of this.pieles) p.castShadow = s && !p.userData.pequena;
  }

  reproducir(nombre, fundido = 0.25, unaVez = false) {
    if (!this.acciones || this.animActual === nombre) return;
    const a = this.acciones[nombre];
    if (!a) return;
    a.reset();
    a.setLoop(unaVez ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = unaVez;
    a.play();
    if (this.accionActual && fundido > 0) this.accionActual.crossFadeTo(a, fundido, false);
    else if (this.accionActual) this.accionActual.stop();
    this.accionActual = a;
    this.animActual = nombre;
  }

  get armado() { return !!this.armaNPC; }
  get apuntandoArma() { return this.estado === 'combate' || this.estado === 'arresto'; }

  animarModelo(dt) {
    if (!this.mixer || !this.g.visible) return;
    // Velocidad suavizada: la animación sigue a lo que el personaje se movió de verdad, sin
    // alternar andar y quieto en fotogramas seguidos (eso era lo que lo hacía temblar)
    const vReal = this.andando || 0;
    this.vSuave = (this.vSuave || 0) + (vReal - (this.vSuave || 0)) * Math.min(1, dt * 7);
    // Los lejanos se animan uno de cada dos fotogramas
    this.acumAnim = (this.acumAnim || 0) + dt;
    this.cuadro = (this.cuadro || 0) + 1;
    if (this.lejos && this.cuadro % 2) return;
    dt = this.acumAnim;
    this.acumAnim = 0;
    const v = this.vSuave;
    if (this.humano) {
      const ar = this.armaNPC;
      const andar = this.acciones.andar_normal ? 'andar_normal' : 'andar';
      const yaAnda = this.animActual === andar || this.animActual === 'correr';
      const anda = v > (yaAnda ? 0.15 : 0.45);
      if (!this.vivo || this.estado === 'inconsciente') this.reproducir('morir', 0.15, true);
      else if (this.golpeAnim > 0) { this.golpeAnim -= dt; this.reproducir('golpe', 0.1, true); }
      else if (this.sentado && !anda && this.acciones.sentado) this.reproducir('sentado', 0.5);
      else if (G.hablandoCon === this) this.reproducir('hablar');
      else if (this.apuntandoArma && ar && this.recargaNPC <= 0) this.reproducir(v > 0.3 ? 'andar_apuntando' : ar.rifle ? 'apuntar_rifle' : 'apuntar');
      else if (v > 3.3) this.reproducir('correr');
      else if (anda) this.reproducir(andar, 0.35);
      else this.reproducir(this.mirandoAlrededor && this.acciones.mirar ? 'mirar' : 'reposo', 0.4);
      const cojera = this.lisiado.piernas ? 0.7 : 1;
      if (this.animActual === andar || this.animActual === 'andar_apuntando') this.accionActual.timeScale = clamp(v / 1.35, 0.7, 1.6) * cojera;
      if (this.animActual === 'correr') this.accionActual.timeScale = clamp(v / 4.5, 0.8, 1.4) * cojera;
    } else if (this.animal) {
      const andar = this.acciones.andar;
      if (this.vivo && this.estado === 'alerta' && this.acciones.aullar && this.tipo.forma === 'perro' && v < 0.2) this.reproducir('aullar');
      else {
        this.reproducir('andar');
        if (andar) andar.timeScale = this.vivo ? clamp(v / 2.5, 0, 2) : 0;
      }
    }
    this.mixer.update(dt);
    this.colocarArma();
  }

  // El arma va en la mano derecha y apunta al jugador mientras pelea
  colocarArma() {
    const a = this.armaVisual;
    if (!a) return;
    const vis = this.vivo && this.estado !== 'inconsciente' && this.apuntandoArma && this.recargaNPC <= 0;
    a.visible = vis;
    if (!vis || !this.mano) return;
    this.mano.getWorldPosition(tmp3);
    a.position.copy(this.g.worldToLocal(tmp3.clone()));
    const J = G.jugador;
    a.lookAt(J.pos.x, J.pos.y + (J.agachado ? 0.9 : 1.3), J.pos.z);
  }

  get vivo() { return this.estado !== 'muerto'; }
  get hostil() {
    if (this.estado === 'inconsciente') return false;
    if (this.equipo === 'fauna') return true;
    // El desertor de los encargos va por libre: es hostil aunque la banda no lo sea
    if (this.equipo === 'cuervos') return !!this.def.hostil || !!G.s.flags.cuervosHostiles;
    // Otras bandas (saqueadores): hostiles de salida, sin relación con Garza
    if (this.equipo !== 'pueblo') return !!this.def.hostil || !!this.tipo?.hostil;
    // Vecinos: los armados pelean si hay un crimen sin pagar; los demás solo huyen
    return !!this.enfadado || (!!G.s.crimen?.activo && this.armado);
  }
  get botin() {
    if (this.tipo) return this.tipo.botin;
    return this.def.botin || {};
  }

  punto(parte) {
    const h = this.modelo.altura * this.escala;
    const y = parte === 'cabeza' ? h * (this.criatura ? 0.55 : 0.93) : parte === 'piernas' ? h * 0.25 : h * (this.criatura ? 0.6 : 0.62);
    if (this.criatura && parte === 'cabeza') {
      return tmp.set(Math.sin(this.yaw) * 0.65 * this.escala, y, Math.cos(this.yaw) * 0.65 * this.escala).add(this.pos).clone();
    }
    if (this.estado === 'inconsciente' || !this.vivo) return new THREE.Vector3(this.pos.x, this.pos.y + 0.25, this.pos.z);
    return new THREE.Vector3(this.pos.x, this.pos.y + y, this.pos.z);
  }

  ladrar(lista, prob = 1) {
    if (this.criatura || (this.reloj_ladrido || 0) > performance.now() || Math.random() > prob) return;
    this.reloj_ladrido = performance.now() + 4500;
    G.ui.ladrido(this, una(lista));
  }

  mirarA(x, z, dt, vel = 6) {
    const objetivo = Math.atan2(x - this.pos.x, z - this.pos.z);
    let d = objetivo - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += clamp(d, -vel * dt, vel * dt);
    this.g.rotation.y = this.yaw;
    return Math.abs(d);
  }

  // girar = false: se mueve sin darse la vuelta (de lado o hacia atrás mientras apunta)
  mover(x, z, dt, vel, girar = true) {
    tmp.set(x - this.pos.x, 0, z - this.pos.z);
    const d = tmp.length();
    if (d < 0.3) return true;
    // Gira primero y luego anda: si el giro es grande, casi no avanza mientras se da la vuelta
    const giro = girar ? this.mirarA(x, z, dt, this.criatura ? 8 : 5) : 0;
    const avance = Math.min(d, vel * dt) * clamp(1.3 - giro, 0.15, 1);
    tmp.normalize().multiplyScalar(avance);
    const x0 = this.pos.x, z0 = this.pos.z;
    this.pos.x += tmp.x;
    this.pos.z += tmp.z;
    G.mundo.empujar(this.pos, this.criatura ? 0.45 : 0.35, 1.6);
    this.pos.y = G.mundo.suelo(this.pos.x, this.pos.z, this.pos.y);
    // Lo que avanzó de verdad (contra una pared es casi nada, y entonces no mueve las piernas).
    // Atascado es avanzar mucho menos de lo que intentó, no ir despacio mientras gira.
    const real = Math.hypot(this.pos.x - x0, this.pos.z - z0);
    this.andando = dt > 0 ? real / dt : 0;
    if (avance > 1e-4 && real < avance * 0.3) this.atascado = (this.atascado || 0) + dt;
    else this.atascado = 0;
    return false;
  }

  // Ir hacia un punto rodeando paredes: por las puertas si hay que entrar o salir de un edificio,
  // y bordeando el obstáculo si se queda atascado. Devuelve true al llegar.
  perseguir(destino, dt, vel) {
    const ahora = performance.now();
    if (!this.rutaP || ahora - (this.rutaT || 0) > 900 || !this.rutaDest || this.rutaDest.distanceToSquared(destino) > 4) {
      this.rutaP = G.mundo.ruta ? G.mundo.ruta(this.pos, destino) : [];
      this.rutaT = ahora;
      this.rutaDest = destino.clone();
    }
    while (this.rutaP.length && Math.hypot(this.rutaP[0].x - this.pos.x, this.rutaP[0].z - this.pos.z) < 0.7) this.rutaP.shift();
    // Si ya está más cerca del siguiente punto que el primero, el primero ya lo pasó
    const d2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
    while (this.rutaP.length > 1 && d2(this.pos, this.rutaP[1]) < d2(this.rutaP[0], this.rutaP[1])) this.rutaP.shift();
    const p = this.rutaP.length ? this.rutaP[0] : destino;
    if (this.rodeo && this.rodeo.t > 0) {
      this.rodeo.t -= dt;
      this.mover(this.pos.x + this.rodeo.x * 3, this.pos.z + this.rodeo.z * 3, dt, vel);
      return false;
    }
    const llegado = this.mover(p.x, p.z, dt, vel);
    if (this.atascado > 0.6) {
      // Bordea de lado; si ya bordeó por un lado y sigue atascado, prueba el otro
      tmp.set(p.x - this.pos.x, 0, p.z - this.pos.z).normalize();
      const signo = this.ladoRodeo = -(this.ladoRodeo || (Math.random() < 0.5 ? 1 : -1));
      this.rodeo = { x: -tmp.z * signo, z: tmp.x * signo, t: 0.9 };
      this.atascado = 0;
    }
    return llegado && !this.rutaP.length;
  }

  ojos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.modelo.altura * this.escala * 0.9, this.pos.z);
  }

  ve(objetivo) {
    return G.mundo.lineaDeVista(this.ojos(), objetivo);
  }

  enCono(p) {
    tmp2.set(p.x - this.pos.x, 0, p.z - this.pos.z).normalize();
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    return tmp2.x * fx + tmp2.z * fz > Math.cos((190 / 2) * Math.PI / 180);
  }

  // Detección del jugador (sigilo-y-deteccion.md).
  detectar(dt) {
    const J = G.jugador;
    const dist = this.pos.distanceTo(J.pos);
    if (dist > 75) { this.puntos = -100; return; }
    const ojosJ = J.centro();
    const visible = this.ve(ojosJ);
    this.puntos = puntuacionDeteccion({
      distancia: dist, enCono: this.enCono(J.pos), visible, luz: G.mundo.luzEn(J.pos),
      agachado: J.agachado, ruido: J.ruido, sigilo: G.s.hab.sigilo + (G.s.ventajas.includes('pies_ligeros') ? 10 : 0),
      percepcion: this.percepcion * (this.lisiado.cabeza ? 0.5 : 1),
    });
    if (this.puntos > 0) this.conciencia += dt * (0.6 + this.puntos / 30);
    else this.conciencia = Math.max(0, this.conciencia - dt * 0.25);
    if (this.puntos > -20 && this.estado === 'quieto' && this.hostil) {
      this.estado = 'alerta';
      this.destino = J.pos.clone();
      this.tiempoEstado = 0;
    }
    if (this.conciencia >= 1 && this.hostil) this.entrarCombate();
  }

  entrarCombate() {
    if (!this.vivo || this.estado === 'combate' || this.estado === 'huida' || this.estado === 'inconsciente') return;
    // Sin arma no se pelea: un vecino desarmado huye
    if (this.vecino && !this.armado) { this.huir(); return; }
    G.audio?.alerta(this.pos, this.criatura);
    this.estado = 'combate';
    this.conciencia = 1;
    this.tiempoEstado = 0;
    if (!this.criatura) this.ladrar(this.id === 'ocana' ? FRASES.combate.ocana : FRASES.combate[this.equipo] || FRASES.combate.pueblo, 0.8);
    // Avisa a los de su grupo cercanos
    for (const a of G.actores) {
      if (a !== this && a.vivo && a.equipo === this.equipo && a.estado !== 'combate' && a.estado !== 'inconsciente' && a.pos.distanceTo(this.pos) < 30 && a.hostil) {
        if (a.vecino && !a.armado) { a.huir(); continue; }
        a.estado = 'combate';
        a.conciencia = 1;
      }
    }
  }

  huir() {
    if (this.estado === 'huida' || !this.vivo) return;
    this.estado = 'huida';
    this.tiempoEstado = 0;
    this.ladrar(FRASES.huida, 0.9);
  }

  actualizar(dt, t) {
    if (!this.vivo) {
      this.tiempoEstado += dt;
      if (this.humano) {
        this.g.position.y = G.mundo.suelo(this.pos.x, this.pos.z);
        this.animarModelo(dt);
        return;
      }
      const k = clamp(this.tiempoEstado * 3, 0, 1);
      this.g.rotation.z = (this.criatura ? Math.PI * 0.95 : Math.PI / 2) * k * this.ladoCaida;
      this.g.position.y = G.mundo.suelo(this.pos.x, this.pos.z) + (this.criatura ? 0.25 : 0.12) * k;
      return;
    }
    // Inconsciente: en el suelo un rato y luego se levanta
    if (this.estado === 'inconsciente') {
      this.tiempoEstado += dt;
      if (this.tiempoEstado > 25) this.levantarse();
      this.animarModelo(dt);
      return;
    }
    this.andando = 0;
    this.cooldown -= dt;
    this.tiempoEstado += dt;
    // Solo se está sentado en calma: en una pelea o huyendo se levanta
    if (this.estado !== 'quieto') this.sentado = false;
    const J = G.jugador;
    // La detección (rayos de visión) se calcula 5 veces por segundo, no en cada fotograma
    if (this.hostil && this.estado !== 'huida') {
      this.relojDeteccion = (this.relojDeteccion ?? Math.random() * 0.2) - dt;
      if (this.relojDeteccion <= 0) { this.detectar(0.2 - this.relojDeteccion); this.relojDeteccion = 0.2; }
    } else this.puntos = -100;

    switch (this.estado) {
      case 'quieto': this.deambular(dt); break;
      case 'alerta': {
        if (this.destino && !this.perseguir(this.destino, dt, this.vel(0.5))) { /* sigue */ }
        else if (this.tiempoEstado > 6) { this.estado = 'quieto'; this.conciencia = 0; }
        if (this.tiempoEstado > 12) { this.estado = 'quieto'; this.conciencia = 0; }
        break;
      }
      case 'combate': this.combatir(dt, J); break;
      case 'arresto': this.arrestar(dt, J); break;
      case 'huida': {
        if (this.vecino) { this.huirVecino(dt, J); break; }
        tmp.set(this.pos.x - J.pos.x, 0, this.pos.z - J.pos.z).normalize().multiplyScalar(10);
        this.mover(this.pos.x + tmp.x, this.pos.z + tmp.z, dt, this.vel(1.1));
        // ia-de-combate.md + wiki: quien huye puede volver si lo dejan en paz
        if (this.tiempoEstado > 7 && this.pos.distanceTo(J.pos) > 25) {
          this.estado = this.hostil ? 'combate' : 'quieto';
          this.umbralHuida = -1;
        }
        break;
      }
      case 'marcha':
        // Los Cuervos se van del campamento hacia el sur
        this.mover(this.pos.x + 2, this.pos.z + 10, dt, 3.4);
        break;
      default: break;
    }
    if (G.hablandoCon === this && !this.sentado) this.mirarA(G.jugador.pos.x, G.jugador.pos.z, dt, 4);
    if (this.destello) {
      this.fogonazo = (this.fogonazo || 0) - dt;
      this.destello.visible = this.fogonazo > 0;
    }
    this.animar(dt, t);
    this.animarModelo(dt);
  }

  vel(f = 1) { return this.velocidadBase * f * (this.lisiado.piernas ? 0.45 : 1); }

  // Horario de los vecinos: de noche (21:30–6:30) se van a su sitio de dormir siguiendo
  // los puntos de def.casa (de la calle hacia dentro) y por la mañana vuelven por el mismo camino.
  horario(dt) {
    const casa = this.def.casa;
    if (!casa) return false;
    const h = G.s.hora, noche = h >= 21.5 || h < 6.5;
    if (this.deNoche === undefined) {
      // Al cargar la partida de noche, ya está en casa
      this.deNoche = noche;
      if (noche) { const [x, z] = casa[casa.length - 1]; this.pos.set(x, G.mundo.suelo(x, z), z); this.dentro = !!this.def.entra; }
      return noche;
    }
    if (noche !== this.deNoche) {
      this.deNoche = noche;
      this.dentro = false;
      const puntos = casa.map(([x, z]) => new THREE.Vector3(x, 0, z));
      this.rutaCasa = noche ? puntos : [...puntos.reverse(), new THREE.Vector3(this.def.x, 0, this.def.z)];
      if (!noche && this.ronda) this.iRonda = 0;
    }
    if (!this.rutaCasa) return noche;
    const p = this.rutaCasa[0];
    // Si se atasca contra algo, salta al siguiente punto para no quedarse andando contra la pared
    if (this.mover(p.x, p.z, dt, 1.35) || this.atascado > 2.5) {
      this.rutaCasa.shift();
      this.atascado = 0;
      if (!this.rutaCasa.length) {
        this.rutaCasa = null;
        // Llegó a su puerta: entra y no se le ve hasta la mañana
        if (noche && this.def.entra) this.dentro = true;
      }
    }
    return true;
  }

  deambular(dt) {
    this.sentado = false;
    this.mirandoAlrededor = false;
    if (this.horario(dt)) return;
    if (this.ronda) {
      const p = this.ronda[this.iRonda];
      if (this.mover(p.x, p.z, dt, 1.3) || this.atascado > 2.5) {
        this.atascado = 0;
        if (!this.espera) this.espera = 3 + Math.random() * 5;
        this.espera -= dt;
        this.mirandoAlrededor = this.espera > 2;
        if (this.espera <= 0) { this.espera = 0; this.iRonda = (this.iRonda + 1) % this.ronda.length; }
      }
      return;
    }
    if (this.vecino) {
      // Vuelve a su sitio si lo apartaron, y se sienta si su sitio es una silla
      if (Math.hypot(this.pos.x - this.def.x, this.pos.z - this.def.z) > 0.5) {
        this.puesto ??= new THREE.Vector3(this.def.x, 0, this.def.z);
        this.perseguir(this.puesto, dt, 1.3);
        return;
      }
      const cerca = this.pos.distanceTo(G.jugador.pos) < 5;
      this.sentado = !!this.def.sentado;
      // Los vecinos miran al jugador cuando está cerca (los sentados no se giran en la silla)
      if (cerca && !this.sentado) this.mirarA(G.jugador.pos.x, G.jugador.pos.z, dt, 3);
      else this.mirarA(this.pos.x + Math.sin(this.def.yaw) * 5, this.pos.z + Math.cos(this.def.yaw) * 5, dt, 2);
      return;
    }
    if (!this.destino || this.tiempoEstado > 9) {
      const r = this.def.campamento ? 6 : 9;
      this.destino = new THREE.Vector3(this.hogar.x + (Math.random() - 0.5) * r * 2, 0, this.hogar.z + (Math.random() - 0.5) * r * 2);
      this.tiempoEstado = Math.random() * -4;
    }
    if (this.tiempoEstado > 0) this.mover(this.destino.x, this.destino.z, dt, this.vel(0.25));
  }

  // Vecino que huye: se aleja del jugador y, si tiene casa, se encierra en ella
  huirVecino(dt, J) {
    const d = this.pos.distanceTo(J.pos);
    const casa = this.def.casa;
    if (casa && this.def.entra) {
      if (!this.rutaHuida) this.rutaHuida = casa.map(([x, z]) => new THREE.Vector3(x, 0, z));
      const p = this.rutaHuida[0];
      if (p && (this.mover(p.x, p.z, dt, this.vel(1.1)) || this.atascado > 1.5)) {
        this.rutaHuida.shift();
        this.atascado = 0;
        if (!this.rutaHuida.length) { this.dentro = true; this.rutaHuida = null; }
      }
      return;
    }
    // Si está en el mismo edificio que el jugador, sale por la puerta
    const aqui = G.mundo.dentroDe?.(this.pos);
    if (aqui && aqui === G.mundo.dentroDe(J.pos) && d < 28) {
      this.perseguir(aqui.lejos, dt, this.vel(1.1));
    } else if (d < 28) {
      tmp.set(this.pos.x - J.pos.x, 0, this.pos.z - J.pos.z).normalize();
      // Contra una pared, prueba de lado
      if (this.atascado > 0.6) tmp.set(-tmp.z, 0, tmp.x);
      this.mover(this.pos.x + tmp.x * 6, this.pos.z + tmp.z * 6, dt, this.vel(1.1));
    } else if (!G.s.crimen?.activo && !this.enfadado && this.tiempoEstado > 8) {
      this.estado = 'quieto';
    }
    // Un esencial con arma que se ha recuperado vuelve a pelear si sigue habiendo crimen
    if (this.armado && this.vida / this.vidaMax > 0.5 && this.tiempoEstado > 10 && this.hostil) this.estado = 'combate';
  }

  combatir(dt, J) {
    const tp = this.tipo;
    const dist = this.pos.distanceTo(J.pos);
    if (dist > 110) { this.estado = 'quieto'; this.conciencia = 0; return; }
    if (this.criatura) {
      if (dist > tp.alcance * 0.85) this.perseguir(J.pos, dt, this.vel(1));
      else {
        this.mirarA(J.pos.x, J.pos.z, dt, 10);
        if (this.cooldown <= 0) {
          this.cooldown = tp.cadencia;
          this.atacando = 0.25;
          G.audio?.mordisco(this.pos, tp.forma === 'perro');
          J.recibirDano(tp.dano, this);
        }
      }
      return;
    }
    const ar = this.armaNPC;
    if (!ar) { this.huir(); return; }
    // El sheriff acepta la rendición si enfundas el arma a la vista
    if (this.id === 'ocana' && G.s.crimen?.activo && J.enfundada && dist < 30 && this.ve(J.centro())) {
      this.estado = 'arresto';
      this.tiempoEstado = 0;
      G.s.crimen.tregua = true;
      G.ui.ladrido(this, '¡Las manos donde las vea! No te muevas.');
      return;
    }
    if (this.vecino && G.s.crimen?.tregua) { this.mirarA(J.pos.x, J.pos.z, dt, 6); return; }
    const visible = this.ve(J.centro());
    this.sinVer = visible ? 0 : (this.sinVer || 0) + dt;
    if (this.sinVer > 4 && this.sinVer - dt <= 4) this.ladrar(FRASES.escondido, 0.6);
    // Recargando: se aparta un poco y no dispara
    if (this.recargaNPC > 0) {
      this.recargaNPC -= dt;
      tmp.set(this.pos.x - J.pos.x, 0, this.pos.z - J.pos.z).normalize();
      this.mover(this.pos.x + tmp.x * 3, this.pos.z + tmp.z * 3, dt, this.vel(0.5), false);
      if (this.recargaNPC <= 0) this.municionNPC = ar.cargador;
      return;
    }
    // Dinamita: si llevas un rato a cubierto y estás a tiro, te la lanzan
    if (this.dinamitaNPC > 0 && this.sinVer > 2.5 && dist > 8 && dist < 26 && this.cooldown <= 0) {
      this.lanzarDinamita(J);
      return;
    }
    const ideal = ar.ideal;
    // Sin verte (o lejos) va a buscarte; viéndote, se aparta o se mueve de lado sin dejar de apuntar
    if (!visible || dist > ideal + 6) this.perseguir(J.pos, dt, this.vel(1));
    else if (dist < ideal - 6) {
      tmp.set(this.pos.x - J.pos.x, 0, this.pos.z - J.pos.z).normalize();
      const lado = Math.sin(this.fase + this.tiempoEstado * 0.5);
      this.mover(this.pos.x + tmp.x * 3 + tmp.z * lado * 3, this.pos.z + tmp.z * 3 - tmp.x * lado * 3, dt, this.vel(0.55), false);
    } else {
      const lado = Math.sin(this.fase + this.tiempoEstado * 0.7) > 0 ? 1 : -1;
      tmp.set(J.pos.x - this.pos.x, 0, J.pos.z - this.pos.z).normalize();
      this.mover(this.pos.x + tmp.z * lado * 2, this.pos.z - tmp.x * lado * 2, dt, this.vel(0.4), false);
    }
    if (visible) this.mirarA(J.pos.x, J.pos.z, dt, 9);
    if (visible && this.cooldown <= 0 && dist < ar.alcance) {
      this.cooldown = ar.cadencia * (0.8 + Math.random() * 0.5);
      this.disparar(J, dist);
    }
  }

  // Ocaña se acerca a detenerte; si vuelves a sacar el arma o te alejas, sigue el tiroteo
  arrestar(dt, J) {
    const dist = this.pos.distanceTo(J.pos);
    if (!G.s.crimen?.activo) { this.estado = 'quieto'; return; }
    if (!J.enfundada || dist > 35) {
      G.s.crimen.tregua = false;
      this.estado = 'combate';
      G.ui.ladrido(this, '¡Lo sabía!');
      return;
    }
    if (dist > 2.6) this.perseguir(J.pos, dt, this.vel(0.55));
    else {
      this.mirarA(J.pos.x, J.pos.z, dt, 6);
      if (!G.modal) G.juego.arresto(this);
    }
  }

  disparar(J, dist) {
    const ar = this.armaNPC;
    this.municionNPC--;
    this.fogonazo = 0.06;
    G.audio?.disparoLejano(this.pos, !!ar.rifle);
    const boca = this.armaVisual && this.armaVisual.visible ? this.armaVisual.localToWorld(this.armaVisual.userData.boca.clone()) : this.ojos();
    let prob = ar.precision * clamp(1.15 - dist / (ar.alcance * 1.1), 0.2, 1);
    if (J.agachado) prob *= 0.85;
    if (J.moviendo) prob *= J.corriendo ? 0.65 : 0.85;
    if (this.lisiado.brazos) prob *= 0.55;
    if (this.lisiado.cabeza) prob *= 0.8;
    if (this.andando > 1) prob *= 0.85;
    if (Math.random() < prob) {
      // La escopeta pierde fuerza con la distancia
      const dano = ar.dano * (ar.id === 'escopeta' ? clamp(1.5 - dist / 16, 0.25, 1.3) : 1);
      J.recibirDano(dano, this);
      G.efectos?.estela(boca, J.centro());
    } else G.efectos?.zumbido(boca, true);
    if (this.municionNPC <= 0) {
      this.recargaNPC = ar.recarga;
      this.ladrar(FRASES.recarga, 0.5);
    }
  }

  lanzarDinamita(J) {
    this.dinamitaNPC--;
    this.cooldown = 2.5;
    this.ladrar(FRASES.dinamita, 1);
    const origen = this.ojos().add(new THREE.Vector3(0, 0.2, 0));
    // Tiro parabólico hacia donde estabas, con algo de error
    const destino = J.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4));
    const d = Math.hypot(destino.x - origen.x, destino.z - origen.z);
    const tVuelo = clamp(d / 12, 0.6, 1.6);
    const vel = new THREE.Vector3((destino.x - origen.x) / tVuelo, (destino.y - origen.y + 4.9 * tVuelo * tVuelo) / tVuelo, (destino.z - origen.z) / tVuelo);
    G.jugador.armas.lanzarDinamita({ origen, vel, mecha: tVuelo + 1.4, dano: 70, radio: 6, dueno: this.id });
  }

  // Daño recibido. info.delJugador marca el ataque del jugador (para crímenes contra vecinos)
  recibirDano(dano, parte, info = {}) {
    if (!this.vivo || this.estado === 'inconsciente') return 0;
    const final = danoTrasDT(dano, this.dt);
    this.vida -= final;
    this.golpe = 0.15;
    this.golpeAnim = 0.4;
    this.animActual = null;
    // Miembros
    if (parte && this.miembros[parte] !== undefined && !this.lisiado[parte]) {
      this.miembros[parte] -= final;
      if (this.miembros[parte] <= 0 && this.vida > 0) {
        this.lisiado[parte] = true;
        G.ui.flotante(this.punto(parte), { piernas: 'Pierna lisiada', brazos: 'Brazo lisiado', cabeza: 'Aturdido' }[parte], 'critico');
      }
    }
    if (this.vecino && info.delJugador) G.juego.crimen(this.vida <= 0 && !this.esencial ? 'asesinato' : 'agresion', this);
    if (this.vida <= 0) {
      if (this.esencial) this.caerInconsciente();
      else this.morir(info);
      return final;
    }
    if (this.equipo === 'cuervos' && !this.def.hostil && !G.s.flags.cuervosHostiles) G.juego.cuervosHostiles();
    if (!this.criatura) this.ladrar(FRASES.herido, 0.3);
    if (this.vecino && !this.armado) { this.huir(); return final; }
    if (this.estado !== 'huida') this.entrarCombate();
    // Huida por valentía: umbral de la tabla con un margen aleatorio
    if (this.umbralHuida === undefined) {
      const base = VALENTIA[this.valentia];
      this.umbralHuida = base >= 1 ? 1 : base * (0.75 + Math.random() * 0.5);
    }
    if (this.vida / this.vidaMax < this.umbralHuida && this.estado !== 'huida') this.huir();
    return final;
  }

  // Los esenciales no mueren: caen inconscientes 25 s (como en New Vegas) y luego se levantan
  caerInconsciente() {
    this.estado = 'inconsciente';
    this.vida = 0;
    this.tiempoEstado = 0;
    this.ladoCaida = Math.random() < 0.5 ? 1 : -1;
    G.audio?.muerte(this.pos, false);
    G.ui.flotante(this.punto('cabeza'), 'Inconsciente');
    if (!this.humano) this.g.rotation.z = Math.PI / 2 * this.ladoCaida;
  }

  levantarse() {
    this.vida = this.vidaMax * 0.35;
    this.estado = this.hostil && this.armado ? 'combate' : this.hostil ? 'huida' : 'quieto';
    this.tiempoEstado = 0;
    this.umbralHuida = undefined;
    this.animActual = null;
    this.g.rotation.z = 0;
  }

  morir(info) {
    this.estado = 'muerto';
    this.vida = 0;
    this.tiempoEstado = 0;
    this.ladoCaida = Math.random() < 0.5 ? 1 : -1;
    if (this.armaVisual) this.armaVisual.visible = false;
    G.s.muertos[this.id] = true;
    G.s.bajas++;
    const xp = xpPorMuerte(this.nivel, this.criatura);
    if (info.delJugador) G.juego.ganarXP(xp, `${this.nombre} abatido`);
    G.juego.evento('muerte', { actor: this });
    G.audio?.muerte(this.pos, this.criatura);
    if (info.critico) G.ui.toast('Golpe crítico', 'critico');
  }

  animar(dt, t) {
    const mo = this.modelo;
    const v = this.andando;
    this.fase += dt * (v > 0 ? 3 + v * 1.6 : 1);
    const amp = v > 0 ? clamp(v / 4, 0.25, 0.9) : 0;
    if (mo.cadera) {
      mo.piernas[0].rotation.x = Math.sin(this.fase) * amp;
      mo.piernas[1].rotation.x = -Math.sin(this.fase) * amp;
      mo.brazos[0].rotation.x = -Math.sin(this.fase) * amp * 0.7;
      const apunta = this.apuntandoArma && this.armado;
      mo.brazos[1].rotation.x = apunta ? -1.45 : Math.sin(this.fase) * amp * 0.7;
      mo.cadera.position.y = 0.95 + Math.abs(Math.sin(this.fase)) * amp * 0.05 + (v === 0 ? Math.sin(t * 1.5 + this.fase) * 0.006 : 0);
      mo.cabeza.rotation.y = v === 0 && this.estado === 'quieto' ? Math.sin(t * 0.4 + this.fase) * 0.3 : 0;
    } else {
      for (let i = 0; i < 4; i++) mo.piernas[i].rotation.x = Math.sin(this.fase * 1.4 + (i === 0 || i === 3 ? 0 : Math.PI)) * amp * 0.9;
      mo.cola.rotation.y = Math.sin(this.fase * 0.9) * (0.25 + amp * 0.3);
      mo.raiz.rotation.z = Math.sin(this.fase * 1.4) * amp * 0.05;
      if (this.atacando > 0) {
        this.atacando -= dt;
        mo.cabeza.rotation.x = -0.5;
      } else mo.cabeza.rotation.x = Math.sin(t * 2 + this.fase) * 0.06;
    }
    if (this.golpe > 0) {
      this.golpe -= dt;
      // El muñeco hecho por código da un respingo; el modelo descargado ya tiene su animación de golpe
      if (!this.visual) this.g.position.y += 0.03;
    }
  }
}

export function crearActores(escena) {
  const lista = [];
  for (const p of PERSONAJES) lista.push(new Actor(p));
  for (const e of ENEMIGOS) {
    if (G.s.muertos[e.id]) continue;
    lista.push(new Actor(e));
  }
  for (const a of lista) escena.add(a.g);
  return lista;
}
