// El mundo: terreno, cielo con ciclo de día, pueblo, gasolinera, repetidor, campamento y vegetación.
// Todo se genera por código; no hay modelos ni texturas externos.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, rng, smooth, lerp, clamp, distPolilinea } from './noise.js';
import { LUGARES } from './data.js';
import { hay, crear, piezas, variantes, abrirHuecos } from './modelos.js';
import { estuco, madera as texMadera, chapa as texChapa, arena as texArena, piedra as texPiedra, repetida } from './texturas.js';
import { crearRejilla, sueloRejilla, empujarRejilla, cortaRejilla } from './rejilla.js';

const TAM = 560;
const SEG = 150;

const LLANOS = [
  { x: 0, z: 0, r: 60 },
  { x: 150, z: 30, r: 32 },
  { x: 35, z: 165, r: 30 },
  { x: -150, z: -40, r: 9 },
  { x: -118, z: 78, r: 20 },
  { x: 118, z: -72, r: 22 },
];

const CAMINOS = [
  [[0, 0], [40, 6], [95, 16], [150, 25]],
  [[0, 0], [8, 55], [22, 115], [35, 160]],
  [[0, 0], [-3, -55], [6, -105]],
  [[0, 0], [-55, -14], [-110, -34], [-142, -40]],
  [[0, 0], [-40, 28], [-82, 55], [-116, 78]],
  [[0, 0], [42, -20], [85, -46], [118, -72]],
];

function alturaBruta(x, z) {
  let h = (fbm(x * 0.007 + 3.1, z * 0.007 - 1.7, 5) - 0.5) * 26;
  h += (fbm(x * 0.035, z * 0.035, 2) - 0.5) * 2.4;
  const r = Math.hypot(x, z);
  h += smooth(165, 255, r) * (34 + 30 * fbm(x * 0.014 + 9, z * 0.014, 3));
  h += 22 * Math.exp(-((x + 150) ** 2 + (z + 40) ** 2) / (2 * 26 * 26));
  const cauce = -125 + Math.sin(x * 0.028) * 12 + Math.sin(x * 0.071) * 4;
  h -= 5 * (1 - smooth(2, 15, Math.abs(z - cauce))) * (1 - smooth(110, 170, Math.abs(x)));
  return h;
}
for (const l of LLANOS) l.h = alturaBruta(l.x, l.z);

export function altura(x, z) {
  let h = alturaBruta(x, z);
  for (const l of LLANOS) {
    const d = Math.hypot(x - l.x, z - l.z);
    if (d < l.r) h = lerp(l.h, h, smooth(l.r * 0.55, l.r, d));
  }
  return h;
}

const enCamino = (x, z) => Math.min(...CAMINOS.map((c) => distPolilinea(x, z, c)));

// Altura más baja del terreno bajo un objeto de radio r: apoyado ahí no queda ninguna esquina en el aire
export function alturaMin(x, z, r) {
  let h = altura(x, z);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    h = Math.min(h, altura(x + Math.cos(a) * r, z + Math.sin(a) * r), altura(x + Math.cos(a) * r * 0.5, z + Math.sin(a) * r * 0.5));
  }
  return h;
}

// ---------- materiales ----------
const cacheMat = new Map();
const TEXTURAS = { estuco, madera: texMadera, chapa: texChapa, piedra: texPiedra };
// extra.tex = 'estuco' | 'madera' | 'chapa' | 'piedra' y extra.rep = [x, y] añaden una textura repetida.
function mat(color, extra = {}) {
  const k = color + JSON.stringify(extra);
  if (!cacheMat.has(k)) {
    const { tex, rep = [1, 1], ...resto } = extra;
    if (tex) resto.map = repetida(TEXTURAS[tex](), rep[0], rep[1]);
    cacheMat.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: !tex, ...resto }));
  }
  return cacheMat.get(k);
}

function tono(hex, delta) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, clamp(hsl.l + delta, 0, 1));
  return '#' + c.getHexString();
}

function caja(padre, w, h, d, material, x, y, z, sombra = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = sombra;
  m.receiveShadow = true;
  padre.add(m);
  return m;
}

function cilindro(padre, rArriba, rAbajo, h, lados, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rArriba, rAbajo, h, lados), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  padre.add(m);
  return m;
}

// Barra entre dos puntos (patas de torres, travesaños).
function barra(padre, a, b, r, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 5), material);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  padre.add(m);
  return m;
}

function texturaCartel(texto, { ancho = 512, alto = 128, fondo = '#5b3d28', tinta = '#f1e2c2', borde = '#2e1e14', tamano = 70 } = {}) {
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  const x = c.getContext('2d');
  x.fillStyle = fondo;
  x.fillRect(0, 0, ancho, alto);
  for (let i = 0; i < 4; i++) {
    x.fillStyle = `rgba(0,0,0,${0.08 + (i % 2) * 0.06})`;
    x.fillRect(0, (alto / 4) * i, ancho, 3);
  }
  x.strokeStyle = borde;
  x.lineWidth = 10;
  x.strokeRect(5, 5, ancho - 10, alto - 10);
  x.fillStyle = tinta;
  x.font = `${tamano}px Rye, Georgia, serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(texto, ancho / 2, alto / 2 + 4, ancho - 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Tablón de corcho con carteles de «Se busca» clavados, para la oficina del sheriff
function texturaTablon() {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 270;
  const x = c.getContext('2d');
  x.fillStyle = '#8a6440';
  x.fillRect(0, 0, 384, 270);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(${60 + Math.random() * 40},${35 + Math.random() * 30},20,0.25)`;
    x.fillRect(Math.random() * 384, Math.random() * 270, 2, 2);
  }
  const papeles = [[20, 18, 110, 140, -0.05, 'SE BUSCA'], [146, 26, 100, 128, 0.04, 'RECOMPENSA'], [262, 14, 104, 150, -0.02, 'SE BUSCA'], [60, 168, 150, 86, 0.03, 'AVISO'], [228, 176, 130, 80, -0.04, 'AGUA']];
  for (const [px, py, w, h, giro, titulo] of papeles) {
    x.save();
    x.translate(px + w / 2, py + h / 2);
    x.rotate(giro);
    x.fillStyle = '#e8dcbc';
    x.fillRect(-w / 2, -h / 2, w, h);
    x.fillStyle = '#2a1d14';
    x.font = '700 15px Rye, Georgia, serif';
    x.textAlign = 'center';
    x.fillText(titulo, 0, -h / 2 + 22, w - 10);
    x.fillStyle = 'rgba(42,29,20,0.55)';
    for (let k = 0; k < (h - 40) / 12; k++) x.fillRect(-w / 2 + 10, -h / 2 + 34 + k * 12, w - 20 - (k % 3) * 12, 3);
    x.fillStyle = '#9a2a1c';
    x.beginPath(); x.arc(0, -h / 2 + 6, 4, 0, 7); x.fill();
    x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Junta en una malla por material todas las piezas estáticas de un grupo (menos las excluidas).
// Una casa pasa de ~80 llamadas de dibujo a ~6.
function fusionar(grupo, excluir = new Set()) {
  grupo.updateMatrixWorld(true);
  const inversa = grupo.matrixWorld.clone().invert();
  const porMaterial = new Map();
  const quitar = [];
  const excluido = (m) => {
    for (let o = m; o && o !== grupo; o = o.parent) if (excluir.has(o) || o.userData.modelo) return true;
    return false;
  };
  grupo.traverse((m) => {
    // Los modelos descargados y las piezas ocultas o animadas se dejan como están
    if (!m.isMesh || !m.visible || m.isInstancedMesh || m.isSkinnedMesh || excluido(m) || Array.isArray(m.material)) return;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) return;
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inversa, m.matrixWorld));
    if (!porMaterial.has(m.material)) porMaterial.set(m.material, { geos: [], sombra: false });
    const e = porMaterial.get(m.material);
    e.geos.push(geo);
    e.sombra = e.sombra || m.castShadow;
    quitar.push(m);
  });
  for (const m of quitar) m.parent.remove(m);
  for (const [material, e] of porMaterial) {
    const malla = new THREE.Mesh(mergeGeometries(e.geos), material);
    malla.castShadow = e.sombra;
    malla.receiveShadow = true;
    grupo.add(malla);
  }
}

function texturaCharco() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------- ciclo del día ----------
const CICLO = [
  { h: 0, arriba: '#060a17', horiz: '#141a2c', abajo: '#0d0b0b', sol: '#000000', luz: '#7f8fc4', iLuz: 0.32, cielo: '#26304e', suelo: '#18120d', iAmb: 0.42, niebla: '#111625' },
  { h: 4.9, arriba: '#0c1330', horiz: '#2b2a44', abajo: '#120e0d', sol: '#2a1a28', luz: '#8a8fc0', iLuz: 0.35, cielo: '#2f3658', suelo: '#1e1610', iAmb: 0.45, niebla: '#25233a' },
  { h: 6.3, arriba: '#3a5a8e', horiz: '#f08d5c', abajo: '#2a1d16', sol: '#ff9a52', luz: '#ffa76b', iLuz: 1.4, cielo: '#8aa0c8', suelo: '#6b4a33', iAmb: 0.8, niebla: '#d9936a' },
  { h: 8.6, arriba: '#3d78b8', horiz: '#cad8dc', abajo: '#5a4434', sol: '#fff4dc', luz: '#fff0d6', iLuz: 3.2, cielo: '#a9c4e0', suelo: '#8a6a4a', iAmb: 1.1, niebla: '#c8cfca' },
  { h: 15.4, arriba: '#3d78b8', horiz: '#cad8dc', abajo: '#5a4434', sol: '#fff4dc', luz: '#fff0d6', iLuz: 3.2, cielo: '#a9c4e0', suelo: '#8a6a4a', iAmb: 1.1, niebla: '#c8cfca' },
  { h: 17.6, arriba: '#46689f', horiz: '#f2ae78', abajo: '#4a3426', sol: '#ffc07a', luz: '#ffbf85', iLuz: 2.6, cielo: '#b0b8c8', suelo: '#8a5e3e', iAmb: 0.95, niebla: '#e3a97a' },
  { h: 19.0, arriba: '#2c386c', horiz: '#e9764a', abajo: '#2a1a14', sol: '#ff7a3a', luz: '#ff8a55', iLuz: 1.3, cielo: '#7d6d8c', suelo: '#5a3a28', iAmb: 0.7, niebla: '#c66c4f' },
  { h: 20.4, arriba: '#111937', horiz: '#4c2f47', abajo: '#120d0d', sol: '#a8403a', luz: '#8d7fb8', iLuz: 0.4, cielo: '#383d64', suelo: '#20160f', iAmb: 0.5, niebla: '#2c2135' },
  { h: 24, arriba: '#060a17', horiz: '#141a2c', abajo: '#0d0b0b', sol: '#000000', luz: '#7f8fc4', iLuz: 0.32, cielo: '#26304e', suelo: '#18120d', iAmb: 0.42, niebla: '#111625' },
];
const COLORES_CICLO = ['arriba', 'horiz', 'abajo', 'sol', 'luz', 'cielo', 'suelo', 'niebla'];
for (const k of CICLO) for (const c of COLORES_CICLO) k[c] = new THREE.Color(k[c]);

function muestraCiclo(h) {
  let i = 0;
  while (i < CICLO.length - 2 && CICLO[i + 1].h <= h) i++;
  const a = CICLO[i], b = CICLO[i + 1];
  const t = clamp((h - a.h) / (b.h - a.h), 0, 1);
  const r = { iLuz: lerp(a.iLuz, b.iLuz, t), iAmb: lerp(a.iAmb, b.iAmb, t) };
  for (const c of COLORES_CICLO) r[c] = a[c].clone().lerp(b[c], t);
  return r;
}

export function crearMundo(escena) {
  const mundo = {
    colisores: [],
    ocluyentes: [],
    puntos: {},
    interactivos: [],
    botellas: [],
    animados: [],
    lamparas: [],
    hogueras: [],
    plataformas: [],
    celdas: [],
    rejillas: [],
  };
  const R = rng(1977);

  const colisor = (x0, x1, z0, z1, y0, y1, id) => {
    const c = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1, id };
    mundo.colisores.push(c);
    return c;
  };
  const interactivo = (id, x, y, z, radio = 2.2) => {
    const it = { id, pos: new THREE.Vector3(x, y, z), radio };
    mundo.interactivos.push(it);
    return it;
  };
  // Coloca un modelo descargado; devuelve null si no está y se usa el hecho por código.
  const poner = (nombre, medida, x, y, z, rotY = 0, { girar = 0, colision = 0, alto = 2, padre = escena, filtro = null } = {}) => {
    const o = crear(nombre, medida, { girar, filtro });
    if (!o) return null;
    o.position.set(x, y ?? altura(x, z), z);
    o.rotation.y = rotY;
    padre.add(o);
    if (colision) colisor(x - colision, x + colision, z - colision, z + colision, o.position.y - 1, o.position.y + alto);
    return o;
  };

  // ---------- cielo ----------
  const cieloMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      cArriba: { value: new THREE.Color() },
      cHorizonte: { value: new THREE.Color() },
      cAbajo: { value: new THREE.Color() },
      cSol: { value: new THREE.Color() },
      dirSol: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 cArriba; uniform vec3 cHorizonte; uniform vec3 cAbajo; uniform vec3 cSol; uniform vec3 dirSol;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 c = y > 0.0 ? mix(cHorizonte, cArriba, pow(smoothstep(0.0, 0.55, y), 0.65))
                         : mix(cHorizonte, cAbajo, smoothstep(0.0, 0.12, -y));
        float s = max(dot(d, normalize(dirSol)), 0.0);
        c += cSol * (pow(s, 900.0) * 6.0 + pow(s, 14.0) * 0.32 + pow(s, 3.0) * 0.08);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const cielo = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 18), cieloMat);
  cielo.renderOrder = -10;
  escena.add(cielo);

  // Estrellas
  {
    const n = 900, p = new Float32Array(n * 3), r2 = rng(7);
    for (let i = 0; i < n; i++) {
      const u = r2() * 2 - 1, a = r2() * Math.PI * 2, y = Math.abs(u) * 0.95 + 0.05;
      const k = Math.sqrt(1 - y * y);
      p.set([Math.cos(a) * k * 850, y * 850, Math.sin(a) * k * 850], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color: 0xfff4e0, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    mundo.estrellas = new THREE.Points(g, m);
    escena.add(mundo.estrellas);
  }

  escena.fog = new THREE.Fog(0xd9a07a, 70, 330);

  const hemi = new THREE.HemisphereLight(0xa9c4e0, 0x8a6a4a, 1);
  escena.add(hemi);
  const sol = new THREE.DirectionalLight(0xffffff, 3);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  const sc = sol.shadow.camera;
  sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 260;
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.06;
  escena.add(sol, sol.target);
  mundo.ponerSombra = (tam) => {
    sol.shadow.mapSize.set(tam, tam);
    if (sol.shadow.map) { sol.shadow.map.dispose(); sol.shadow.map = null; }
  };

  // ---------- terreno ----------
  const geo = new THREE.PlaneGeometry(TAM, TAM, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colores = new Float32Array(pos.count * 3);
  const cArena = new THREE.Color('#d6b081'), cOcre = new THREE.Color('#c4885a'), cRoca = new THREE.Color('#985a3d'),
    cRocaOsc = new THREE.Color('#6e4232'), cMatorral = new THREE.Color('#9d9466'), cCamino = new THREE.Color('#b99573'),
    cBarro = new THREE.Color('#8f7a66'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = altura(x, z);
    pos.setY(i, h);
    const pend = Math.abs(altura(x + 1.5, z) - h) + Math.abs(altura(x, z + 1.5) - h);
    c.copy(cArena).lerp(cOcre, smooth(0.35, 0.7, fbm(x * 0.02, z * 0.02, 3)));
    c.lerp(cMatorral, smooth(0.55, 0.8, fbm(x * 0.05 + 40, z * 0.05, 2)) * 0.55);
    c.lerp(cRoca, smooth(0.9, 2.2, pend));
    c.lerp(cRocaOsc, smooth(18, 50, h) * 0.6);
    const cauce = -125 + Math.sin(x * 0.028) * 12 + Math.sin(x * 0.071) * 4;
    c.lerp(cBarro, (1 - smooth(1, 6, Math.abs(z - cauce))) * (1 - smooth(110, 160, Math.abs(x))));
    c.lerp(cCamino, (1 - smooth(1.8, 4.2, enCamino(x, z))) * 0.85);
    const v = 0.94 + fbm(x * 0.3, z * 0.3, 1) * 0.12;
    colores.set([c.r * v, c.g * v, c.b * v], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  geo.computeVertexNormals();
  const terreno = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: repetida(texArena(), 110, 110) }));
  terreno.receiveShadow = true;
  escena.add(terreno);
  mundo.terreno = terreno;

  // Suelo lejano para que el horizonte no se corte. Va justo por debajo del borde más bajo del
  // terreno: antes estaba a 30 m y donde el borde era más bajo se veía como una repisa en el aire.
  let bordeMin = Infinity;
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    for (const rr of [TAM * 0.48, TAM * 0.5]) bordeMin = Math.min(bordeMin, altura(Math.cos(a) * rr, Math.sin(a) * rr));
  }
  const lejos = new THREE.Mesh(new THREE.RingGeometry(TAM * 0.48, 1400, 48, 1), new THREE.MeshStandardMaterial({ color: '#7a4c36', roughness: 1 }));
  lejos.rotation.x = -Math.PI / 2;
  lejos.position.y = bordeMin - 1.5;
  escena.add(lejos);

  // Mesetas lejanas, recortadas contra el cielo
  const mesetas = new THREE.Group();
  const mesetaMat = new THREE.MeshBasicMaterial({ color: '#7a4a3a', fog: false });
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + R() * 0.2, rr = 520 + R() * 160;
    const ancho = 40 + R() * 70, alto = 25 + R() * 70;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(ancho * (0.55 + R() * 0.2), ancho, alto, 6 + Math.floor(R() * 3)), mesetaMat);
    m.position.set(Math.cos(a) * rr, alto / 2 + 10, Math.sin(a) * rr);
    m.rotation.y = R() * 3;
    mesetas.add(m);
  }
  escena.add(mesetas);

  // Nubes planas
  const nubes = new THREE.Group();
  const nubeMat = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false, transparent: true, opacity: 0.5, depthWrite: false });
  for (let i = 0; i < 11; i++) {
    const n = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), nubeMat);
      b.scale.set(90 + R() * 80, 2 + R() * 2, 22 + R() * 22);
      b.position.set(k * 70 - 105 + R() * 20, R() * 4, R() * 20 - 10);
      n.add(b);
    }
    const a = R() * Math.PI * 2, rr = 620 + R() * 260;
    n.position.set(Math.cos(a) * rr, 330 + R() * 90, Math.sin(a) * rr);
    nubes.add(n);
  }
  nubes.visible = false; // sin nubes: el cielo del desierto queda limpio
  escena.add(nubes);

  // ---------- edificios ----------
  const ventanaMat = new THREE.MeshStandardMaterial({ color: '#3b2a1e', emissive: '#ffb057', emissiveIntensity: 0.05, roughness: 0.6, flatShading: true });
  const madera = mat('#8a6446', { tex: 'madera' }), maderaOsc = mat('#5e4230', { tex: 'madera' }), chapa = mat('#a39a90', { metalness: 0.45, roughness: 0.6, tex: 'chapa', rep: [2, 2] });
  const oxido = mat('#b0683f', { metalness: 0.25, roughness: 0.8, tex: 'chapa' }), piedra = mat('#a39383', { tex: 'piedra' });

  // hueco = true: paredes con puerta abierta, suelo de tablas y techo, para poder entrar.
  function edificio({ x, z, rot = 0, w = 8, d = 7, h = 4, color = '#c99d74', cartel, porche = true, ventanas = 2, techoChapa = false, hueco = false }) {
    const g = new THREE.Group();
    const y0 = alturaMin(x, z, Math.max(w, d) / 2) - 0.25;
    g.position.set(x, y0, z);
    g.rotation.y = rot;
    const muro = mat(tono(color, 0.06), { tex: 'estuco', rep: [w / 4, (h + 0.25) / 4] }), borde = mat(tono(color, -0.06), { tex: 'estuco' }), zocalo = mat(tono(color, -0.2), { tex: 'estuco', rep: [w / 3, 0.3] });
    let cuerpo = null;
    if (hueco) {
      const e = 0.25, H = h + 0.25, pw = 1.4, ph = 2.45, lado = (w - pw) / 2;
      const muroIn = mat(tono(color, 0.12), { tex: 'estuco', rep: [w / 3, H / 3] });
      caja(g, w, H, e, muro, 0, H / 2, -d / 2 + e / 2);
      caja(g, e, H, d, muro, -w / 2 + e / 2, H / 2, 0);
      caja(g, e, H, d, muro, w / 2 - e / 2, H / 2, 0);
      caja(g, lado, H, e, muro, -(pw / 2 + lado / 2), H / 2, d / 2 - e / 2);
      caja(g, lado, H, e, muro, pw / 2 + lado / 2, H / 2, d / 2 - e / 2);
      caja(g, pw, H - ph, e, muro, 0, ph + (H - ph) / 2, d / 2 - e / 2);
      // Enlucido claro por dentro, suelo de tablas a la altura del porche y techo
      for (const [ww, dd, px, pz] of [[w - 2 * e, 0.02, 0, -d / 2 + e + 0.01], [0.02, d - 2 * e, -w / 2 + e + 0.01, 0], [0.02, d - 2 * e, w / 2 - e - 0.01, 0]]) caja(g, ww, H - 0.6, dd, muroIn, px, 0.5 + (H - 0.6) / 2, pz, false);
      caja(g, w - 2 * e, 0.5, d - 2 * e, mat('#6e5038', { tex: 'madera', rep: [w / 2, d / 2] }), 0, 0.25, 0, false);
      caja(g, w, 0.25, d, mat('#4a3a2e', { tex: 'madera', rep: [w / 2, d / 2] }), 0, H - 0.12, 0);
    } else {
      cuerpo = caja(g, w, h + 0.25, d, muro, 0, (h + 0.25) / 2, 0);
      caja(g, w + 0.12, 0.7, d + 0.12, zocalo, 0, 0.35, 0);
    }
    if (techoChapa) {
      const t = caja(g, w + 0.8, 0.12, d + 0.8, chapa, 0, h + 0.55, 0);
      t.rotation.x = 0.12;
    } else {
      caja(g, w + 0.24, 0.55, 0.3, borde, 0, h + 0.5, d / 2 - 0.1);
      caja(g, w + 0.24, 0.55, 0.3, borde, 0, h + 0.5, -d / 2 + 0.1);
      caja(g, 0.3, 0.55, d, borde, w / 2 - 0.1, h + 0.5, 0);
      caja(g, 0.3, 0.55, d, borde, -w / 2 + 0.1, h + 0.5, 0);
      for (let vx = -w / 2 + 0.8; vx < w / 2 - 0.4; vx += 1.25) {
        const v = cilindro(g, 0.09, 0.09, 0.8, 5, maderaOsc, vx, h - 0.35, d / 2 + 0.25);
        v.rotation.x = Math.PI / 2;
      }
    }
    // Puerta: cerrada en las casas macizas; en las huecas, abierta contra la pared de dentro
    if (hueco) caja(g, 0.08, 2.3, 1.3, maderaOsc, 0.68, 1.65, d / 2 - 0.95);
    else caja(g, 1.35, 2.35, 0.14, maderaOsc, 0, 1.38, d / 2 + 0.03);
    caja(g, 1.65, 0.16, 0.2, madera, 0, hueco ? 2.62 + 0.3 : 2.62, d / 2 + 0.06);
    const huecos = [];
    for (let i = 0; i < ventanas; i++) {
      const vx = ((i + 1) / (ventanas + 1) - 0.5) * w;
      if (Math.abs(vx) < 1.2) continue;
      huecos.push(vx);
    }
    if (!huecos.length && w > 5) huecos.push(-w / 3, w / 3);
    for (const vx of huecos) {
      caja(g, 1.05, 0.95, 0.1, ventanaMat, vx, 2.1, d / 2 + 0.03, false);
      caja(g, 0.28, 1.05, 0.08, madera, vx - 0.7, 2.1, d / 2 + 0.06);
      caja(g, 0.28, 1.05, 0.08, madera, vx + 0.7, 2.1, d / 2 + 0.06);
    }
    caja(g, 0.95, 0.85, 0.1, ventanaMat, w / 4, 2.1, -d / 2 - 0.03, false);
    // Dinteles de madera, alféizares y marco de la puerta
    for (const vx of huecos) {
      caja(g, 1.4, 0.15, 0.2, maderaOsc, vx, 2.66, d / 2 + 0.09);
      caja(g, 1.2, 0.08, 0.16, borde, vx, 1.6, d / 2 + 0.08);
    }
    caja(g, 0.14, 2.45, 0.2, madera, -0.75, 1.42, d / 2 + 0.08);
    caja(g, 0.14, 2.45, 0.2, madera, 0.75, 1.42, d / 2 + 0.08);
    // Ventana lateral y canales de desagüe del tejado plano
    caja(g, 0.1, 0.85, 1.0, ventanaMat, w / 2 + 0.03, 2.1, -d / 6, false);
    caja(g, 0.1, 1.1, 0.2, maderaOsc, w / 2 + 0.06, 2.1, -d / 6 - 0.6);
    if (!techoChapa) {
      for (const vx of [-w / 2 + 0.7, w / 2 - 0.7]) {
        const c = cilindro(g, 0.08, 0.1, 0.9, 6, maderaOsc, vx, h + 0.15, d / 2 + 0.4);
        c.rotation.x = Math.PI / 2 - 0.25;
      }
    }
    // Segundo piso de los edificios altos
    if (h > 5) for (const vx of huecos) {
      caja(g, 0.95, 0.9, 0.1, ventanaMat, vx, 4.25, d / 2 + 0.03, false);
      caja(g, 1.3, 0.13, 0.18, maderaOsc, vx, 4.78, d / 2 + 0.09);
    }
    if (!porche) caja(g, 1.9, 0.22, 0.7, piedra, 0, 0.11, d / 2 + 0.35);
    if (porche) {
      // Barandilla del porche, con hueco delante de la puerta
      const fz = d / 2 + 2.45, yb = 0.54;
      for (const [a, b] of [[-w / 2 + 0.3, -1.0], [1.0, w / 2 - 0.3]]) {
        caja(g, b - a, 0.08, 0.08, madera, (a + b) / 2, yb + 0.85, fz);
        for (let px = a; px <= b + 0.01; px += 0.45) caja(g, 0.05, 0.8, 0.05, maderaOsc, px, yb + 0.42, fz);
      }
      // Balcón sobre el porche en los edificios altos
      if (h > 5) {
        caja(g, w + 0.2, 0.07, 0.07, madera, 0, h + 0.75, d / 2 + 2.7);
        for (let px = -w / 2; px <= w / 2 + 0.01; px += 0.5) caja(g, 0.05, 0.75, 0.05, maderaOsc, px, h + 0.38, d / 2 + 2.7);
      }
    }
    if (porche) {
      const fondo = 2.6;
      caja(g, w, 0.18, fondo, madera, 0, 0.45, d / 2 + fondo / 2);
      // Tarima del porche pisable
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const esquinas = [[-w / 2, d / 2], [w / 2, d / 2], [-w / 2, d / 2 + fondo], [w / 2, d / 2 + fondo]].map(([lx, lz]) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs]);
      mundo.plataformas.push({
        x0: Math.min(...esquinas.map((e) => e[0])), x1: Math.max(...esquinas.map((e) => e[0])),
        z0: Math.min(...esquinas.map((e) => e[1])), z1: Math.max(...esquinas.map((e) => e[1])), y: y0 + 0.54,
      });
      for (const px of [-w / 2 + 0.25, 0, w / 2 - 0.25]) {
        if (px === 0 && w < 9) continue;
        cilindro(g, 0.1, 0.12, h - 0.5, 6, maderaOsc, px, (h - 0.5) / 2 + 0.4, d / 2 + fondo - 0.15);
      }
      const t = caja(g, w + 0.3, 0.12, fondo + 0.4, techoChapa ? chapa : madera, 0, h - 0.05, d / 2 + fondo / 2);
      t.rotation.x = 0.1;
      if (cartel) {
        const cm = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 0.6, 4.6), 0.95),
          new THREE.MeshStandardMaterial({ map: texturaCartel(cartel), roughness: 0.8, emissive: '#ffffff', emissiveIntensity: 0.02 }));
        cm.position.set(0, h + 0.38, d / 2 + fondo + 0.2);
        cm.rotation.x = -0.08;
        g.add(cm);
        const sop = caja(g, Math.min(w - 0.6, 4.6) + 0.2, 0.08, 0.12, maderaOsc, 0, h - 0.1, d / 2 + fondo + 0.17);
        sop.castShadow = false;
      }
    }
    escena.add(g);
    if (hueco) {
      // Los muebles se añaden después; la rejilla se calcula con cerrarEdificio()
      g.userData.y0 = y0;
      return g;
    }
    fusionar(g, new Set([cuerpo]));
    const giro = Math.abs(Math.sin(rot)) > 0.5;
    const hw = (giro ? d : w) / 2, hd = (giro ? w : d) / 2;
    colisor(x - hw, x + hw, z - hd, z + hd, y0 - 2, y0 + h + 0.8);
    cuerpo.updateMatrixWorld();
    mundo.ocluyentes.push(cuerpo);
    return g;
  }
  // Funde las piezas de un edificio hueco con sus muebles y calcula su rejilla de colisión
  function cerrarEdificio(g, base, excluir = new Set()) {
    fusionar(g, excluir);
    g.updateMatrixWorld(true);
    g.traverse((m) => { if (m.isMesh && !m.userData.actor) mundo.ocluyentes.push(m); });
    const r = crearRejilla(g, base);
    r.grupo = g;
    mundo.rejillas.push(r);
  }
  // Coordenadas del mundo de un punto local (lx, lz) de un grupo colocado con rotación Y
  const aMundo = (g, lx, lz) => {
    const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
    return [g.position.x + lx * c + lz * s, g.position.z - lx * s + lz * c];
  };
  mundo.aMundo = aMundo;

  // Edificio descargado: el modelo va dentro de un grupo y los muebles se ponen en sus metros.
  function casaModelo(nombre, { x, z, rot = 0, medida = {}, filtro = null, radio = 6, hundir = 0.04 }) {
    const o = crear(nombre, medida, { filtro, centrar: false });
    if (!o) return null;
    const g = new THREE.Group();
    const y = alturaMin(x, z, radio) - hundir;
    g.position.set(x, y, z);
    g.rotation.y = rot;
    g.add(o);
    o.traverse((m) => {
      if (!m.isMesh) return;
      // Hay paredes de un solo plano: por dentro se verían transparentes
      m.material.side = THREE.DoubleSide;
      m.castShadow = true;
      m.receiveShadow = true;
    });
    escena.add(g);
    g.userData.y0 = y;
    return g;
  }

  // Frente hacia la plaza: rot = PI/2 mira al este, -PI/2 al oeste, 0 al sur, PI al norte.
  // Las coordenadas de dentro de cada edificio son las del modelo (en metros, sin centrar).
  const cartelEn = (g, texto, ancho, x, y, z, rotY = 0, opciones = {}) => {
    const cm = new THREE.Mesh(new THREE.PlaneGeometry(ancho, ancho / 4),
      new THREE.MeshStandardMaterial({ map: texturaCartel(texto, opciones), roughness: 0.8, side: THREE.DoubleSide }));
    cm.position.set(x, y, z);
    cm.rotation.y = rotY;
    g.add(cm);
    return cm;
  };
  const ponerEn = (g, lista) => {
    for (const [n, medida, x, y, z, r = 0] of lista) poner(n, medida, x, y, z, r, { padre: g });
  };
  // Baúl del jugador, que se abre en la primera misión
  function baul(g, x, y, z, rotY) {
    const b = new THREE.Group();
    b.position.set(x, y, z);
    b.rotation.y = rotY;
    caja(b, 1.3, 0.7, 0.8, mat('#5b3b22'), 0, 0.35, 0);
    const tapa = caja(b, 1.36, 0.22, 0.86, mat('#6e4a2c'), 0, 0.78, 0);
    caja(b, 1.4, 0.08, 0.06, oxido, 0, 0.5, 0.42);
    g.add(b);
    mundo.tapaBaul = tapa;
    const [wx, wz] = aMundo(g, x, z);
    mundo.puntos.baul = new THREE.Vector3(wx, g.position.y + y + 0.8, wz);
    interactivo('baul', wx, g.position.y + y + 0.8, wz, 1.8);
    return tapa;
  }
  // Mostrador de Paz, a lo largo de z
  function mostrador(g, x, y, z) {
    caja(g, 0.7, 1.05, 3.2, madera, x, y + 0.52, z);
    caja(g, 0.9, 0.08, 3.4, maderaOsc, x, y + 1.08, z);
    for (let i = 0; i < 2; i++) caja(g, 0.25, 0.3, 0.25, mat(['#c25a3c', '#3f6f6a'][i]), x + 0.05, y + 1.27, z - 1.3 + i * 0.5);
    poner('ph_CashRegister_01', { largo: 0.5 }, x, y + 1.12, z + 0.6, Math.PI / 2, { padre: g });
    poner('ph_vintage_oil_lamp', { alto: 0.4 }, x + 0.1, y + 1.12, z + 1.3, 0, { padre: g });
  }

  // Interactivo en las coordenadas de dentro de un edificio
  function interactivoEn(g, id, lx, ly, lz, radio) {
    const [x, z] = aMundo(g, lx, lz);
    interactivo(id, x, g.userData.y0 + ly, z, radio);
  }
  // Banco de trabajo: mesa con tornillo, herramientas colgadas y una lata de clavos
  function bancoTrabajo(g, x, y, z) {
    const b = new THREE.Group();
    b.position.set(x, y, z);
    caja(b, 1.8, 0.08, 0.75, madera, 0, 0.86, 0);
    for (const [px, pz] of [[-0.82, -0.32], [0.82, -0.32], [-0.82, 0.32], [0.82, 0.32]]) caja(b, 0.08, 0.86, 0.08, maderaOsc, px, 0.43, pz);
    caja(b, 1.7, 0.05, 0.6, maderaOsc, 0, 0.25, 0);
    caja(b, 1.8, 0.7, 0.05, maderaOsc, 0, 1.25, -0.36);
    const tornillo = mat('#4b4d4a', { metalness: 0.6, roughness: 0.45 });
    caja(b, 0.16, 0.12, 0.22, tornillo, 0.6, 0.96, 0.18);
    caja(b, 0.04, 0.04, 0.3, tornillo, 0.6, 0.96, 0.38);
    for (let i = 0; i < 4; i++) caja(b, 0.04, 0.32 - i * 0.04, 0.02, tornillo, -0.6 + i * 0.22, 1.3, -0.32);
    cilindro(b, 0.07, 0.07, 0.14, 8, oxido, -0.3, 0.97, 0.15);
    g.add(b);
  }

  // ---------- clínica de Inés: el banco del oeste, con el mostrador enrejado como dispensario ----------
  const clinica = casaModelo('banco', { x: -19.5, z: -8, rot: Math.PI / 2, radio: 6, filtro: (m) => m.name !== 'Object_99' });
  if (clinica) {
    const g = clinica, s = 0.2;
    cartelEn(g, 'CLÍNICA', 2.4, -0.1, 8.3, 2.8);
    ponerEn(g, [
      ['cama_medica', { largo: 2.1 }, -2.75, s, -0.85, Math.PI / 2],
      ['ph_old_bed_frame', { largo: 2.0 }, -2.8, s, 1.25, Math.PI / 2],
      ['ph_vintage_cabinet_01', { alto: 1.9 }, 2.85, s, 1.4, -Math.PI / 2],
      ['ph_medical_box', { largo: 0.45 }, -1.4, 1.12, -2.6, 0.2],
      ['ph_wooden_stool_02', { alto: 0.6 }, -1.7, s, -0.6, 0.4],
      ['ph_vintage_oil_lamp', { alto: 0.4 }, 0.9, 1.12, -2.6, 0],
    ]);
    const tapa = baul(g, -1.65, s, 1.0, Math.PI / 2);
    interactivoEn(g, 'cont:armario_clinica', 2.5, s + 1.0, 1.4, 1.3);
    interactivoEn(g, 'cama_clinica', -2.8, s + 0.6, 1.6, 1.4);
    cerrarEdificio(g, g.userData.y0, new Set([tapa]));
  } else {
    edificio({ x: -20, z: -8, rot: Math.PI / 2, w: 9, d: 7, h: 4.2, color: '#d7b48d', cartel: 'CLÍNICA', ventanas: 2 });
    const tapa = baul(escena, -14.6, altura(-14.6, -10.6) + 0.45, -10.6, 0);
    void tapa;
  }

  // ---------- Ultramarinos Paz: el almacén abandonado, con la puerta abierta ----------
  abrirHuecos('tienda_abandonada', [[9.0, 0.0, -1.8, 11, 4.0, 2.1]]);
  const tienda = casaModelo('tienda_abandonada', { x: 24.5, z: -9, rot: Math.PI, medida: { escala: 0.85 }, radio: 9, filtro: (m) => !/Ground/.test(m.name) });
  if (tienda) {
    const g = tienda, s = 0.3;
    // Tapa el cartel «Welcome» del modelo
    cartelEn(g, 'ULTRAMARINOS PAZ', 4.8, 8.95, 4.72, 0.13, Math.PI / 2);
    mostrador(g, 5.4, s, -2.6);
    ponerEn(g, [
      ['ph_wooden_display_shelves_01', { alto: 2.0 }, 3.0, s, -5.15, 0],
      ['ph_steel_frame_shelves_01', { alto: 2.0 }, 0.4, s, -5.2, 0],
      ['ph_Shelf_01', { alto: 1.8 }, 5.7, s, -5.3, 0],
      ['ph_wooden_bookshelf_worn', { alto: 2.0 }, 1.5, s, 1.1, Math.PI],
      ['ph_wine_barrel_01', { alto: 1.0 }, -2.0, s, -4.9, 0],
      ['ph_wine_barrel_01', { alto: 1.0 }, -3.1, s, -4.8, 0.6],
      ['ph_Barrel_01', { alto: 1 }, -6.5, s, -4.5, 0],
      ['ph_wooden_crate_01', { alto: 0.8 }, -7.2, s, -2.8, 0.1],
      ['ph_wooden_crate_01', { alto: 0.8 }, -7.2, s + 0.8, -2.8, 0.5],
      ['ph_wooden_crate_01', { alto: 0.8 }, -6.3, s, -2.9, 0.2],
      ['ph_old_military_crate', { largo: 1.1 }, -5.0, s, 0.4, 0.2],
      ['ph_metal_jerrycan', { alto: 0.45 }, 6.2, s, -4.7, 0.4],
    ]);
    bancoTrabajo(g, -5.0, s, -5.05);
    interactivoEn(g, 'banco', -5.0, s + 1.0, -4.4, 1.4);
    interactivoEn(g, 'cont:estante_paz', 3.0, s + 1.0, -4.5, 1.4);
    cerrarEdificio(g, g.userData.y0);
  } else {
    edificio({ x: 20, z: -9, rot: -Math.PI / 2, w: 9.5, d: 7, h: 4.4, color: '#c79a72', cartel: 'ULTRAMARINOS PAZ', ventanas: 2 });
    const g = new THREE.Group();
    g.position.set(14.1, altura(14, -9), -9.3);
    mostrador(g, 0, 0.22, 0);
    escena.add(g); fusionar(g);
    colisor(13.7, 14.5, -11, -7.6, g.position.y - 1, g.position.y + 1.4);
  }

  // ---------- La Sed: el interior del saloon, con una fachada del oeste por delante ----------
  const sed = casaModelo('saloon_interior', { x: -13.9, z: 16, rot: Math.PI / 2, medida: { alto: 5.2 }, radio: 8 });
  if (sed) {
    const g = sed;
    const x0 = -6.52, x1 = 2.63, W = x1 - x0, xc = (x0 + x1) / 2, zf = -2.6, H = 6.4, pw = 1.9, ph = 2.7, lado = (W - pw) / 2;
    const tabla = mat('#7d5a3e', { tex: 'madera', rep: [W / 1.5, H / 1.5] });
    // Frente falso con hueco para las puertas de vaivén
    caja(g, lado, H, 0.22, tabla, x0 + lado / 2, H / 2, zf + 0.11);
    caja(g, lado, H, 0.22, tabla, x1 - lado / 2, H / 2, zf + 0.11);
    caja(g, pw, H - ph, 0.22, tabla, xc, ph + (H - ph) / 2, zf + 0.11);
    caja(g, W * 0.55, 0.9, 0.22, tabla, xc, H + 0.45, zf + 0.11);
    caja(g, W + 0.3, 0.16, 0.36, maderaOsc, xc, H, zf + 0.16);
    caja(g, W * 0.55 + 0.3, 0.16, 0.36, maderaOsc, xc, H + 0.9, zf + 0.16);
    for (const vx of [xc - 2.9, xc + 2.9]) {
      caja(g, 1.5, 1.3, 0.1, ventanaMat, vx, 1.75, zf + 0.25, false);
      caja(g, 1.8, 0.14, 0.18, maderaOsc, vx, 2.48, zf + 0.28);
      caja(g, 1.7, 0.1, 0.22, maderaOsc, vx, 1.05, zf + 0.28);
    }
    for (const vx of [xc - 2.6, xc, xc + 2.6]) caja(g, 1.0, 1.2, 0.1, ventanaMat, vx, 4.35, zf + 0.25, false);
    caja(g, pw + 0.3, 0.16, 0.26, maderaOsc, xc, ph + 0.08, zf + 0.26);
    // Puertas de vaivén, abiertas hacia dentro
    for (const sx of [-1, 1]) caja(g, 0.05, 1.05, 0.85, madera, xc + sx * (pw / 2 - 0.06), 1.4, zf - 0.45);
    // Porche con tejadillo, balcón y el cartel grande
    const fondo = 2.6;
    caja(g, W, 0.2, fondo, madera, xc, 0.1, zf + 0.22 + fondo / 2);
    for (const px of [x0 + 0.2, xc - 1.6, xc + 1.6, x1 - 0.2]) cilindro(g, 0.1, 0.12, 3.2, 6, maderaOsc, px, 1.7, zf + fondo);
    const tejado = caja(g, W + 0.3, 0.12, fondo + 0.3, maderaOsc, xc, 3.35, zf + fondo / 2 + 0.1);
    tejado.rotation.x = 0.08;
    caja(g, W + 0.2, 0.07, 0.07, madera, xc, 4.1, zf + fondo);
    for (let px = x0; px <= x1 + 0.01; px += 0.5) caja(g, 0.05, 0.7, 0.05, maderaOsc, px, 3.75, zf + fondo);
    cartelEn(g, 'LA SED', 5.2, xc, 5.45, zf + 0.25, 0, { tamano: 86 });
    // Dentro: taburetes en la barra, barriles detrás y un quinqué
    ponerEn(g, [
      ['ph_bar_chair_round_01', { alto: 0.8 }, -0.45, 0, -12.4, 0],
      ['ph_bar_chair_round_01', { alto: 0.8 }, -0.45, 0, -11.2, 0.5],
      ['ph_bar_chair_round_01', { alto: 0.8 }, -0.45, 0, -9.0, 1.2],
      ['ph_wine_barrel_01', { alto: 1.0 }, 2.05, 0, -14.0, 0],
      ['ph_wine_barrel_01', { alto: 1.0 }, 2.05, 0, -7.6, 0.8],
      ['ph_ceiling_fan', { largo: 1.4 }, xc, 2.75, -6.5, 0],
    ]);
    cerrarEdificio(g, g.userData.y0);
  } else {
    edificio({ x: -20.5, z: 16, rot: Math.PI / 2, w: 11, d: 8, h: 5.6, color: '#b98463', cartel: 'LA SED', ventanas: 3 });
  }

  // ---------- oficina del sheriff: hecha por código, hueca, con calabozo y tablón de recompensas ----------
  let sheriffG = null;
  {
    const g = sheriffG = edificio({ x: 20, z: 16, rot: -Math.PI / 2, w: 8.5, d: 7, h: 4, color: '#cfae8c', cartel: 'SHERIFF', ventanas: 2, hueco: true });
    const s = 0.5, hierro = mat('#3a3633', { metalness: 0.6, roughness: 0.45 });
    // Calabozo en el rincón del fondo
    const cx1 = -1.4, cz1 = -0.7;
    for (let bx = -4.0; bx < cx1; bx += 0.2) cilindro(g, 0.022, 0.022, 2.6, 5, hierro, bx, s + 1.3, cz1);
    for (let bz = -3.2; bz < cz1; bz += 0.2) cilindro(g, 0.022, 0.022, 2.6, 5, hierro, cx1, s + 1.3, bz);
    caja(g, 2.7, 0.07, 0.07, hierro, -2.7, s + 2.6, cz1);
    caja(g, 0.07, 0.07, 2.6, hierro, cx1, s + 2.6, -1.95);
    caja(g, 2.7, 0.07, 0.07, hierro, -2.7, s + 0.1, cz1);
    ponerEn(g, [
      ['ph_old_bed_frame', { largo: 1.9 }, -3.4, s, -2.1, Math.PI / 2],
      ['ph_WoodenTable_02', { alto: 0.8 }, 1.6, s, -1.0, 0],
      ['ph_WoodenChair_01', { alto: 0.95 }, 1.6, s, -2.05, 0],
      ['ph_WoodenChair_01', { alto: 0.95 }, 1.5, s, 0.05, Math.PI + 0.3],
      ['ph_steel_frame_shelves_01', { alto: 2.0 }, 3.75, s, -2.3, -Math.PI / 2],
      ['ph_wall_clock', { alto: 0.4 }, 1.6, 2.7, -3.2, 0],
      ['ph_vintage_oil_lamp', { alto: 0.4 }, 1.75, s + 0.8, -0.9, 0],
      ['ph_Rockingchair_01', { alto: 1.1 }, 3.2, s, 2.3, Math.PI + 0.6],
    ]);
    // Tablón de recompensas, en la pared de la entrada por dentro
    const tablon = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.05), new THREE.MeshStandardMaterial({ map: texturaTablon(), roughness: 0.9 }));
    tablon.position.set(-2.4, s + 1.55, 3.22);
    tablon.rotation.y = Math.PI;
    g.add(tablon);
    caja(g, 1.62, 1.17, 0.04, maderaOsc, -2.4, s + 1.55, 3.25);
    const [tx, tz] = aMundo(g, -2.4, 2.6);
    interactivo('tablon', tx, g.userData.y0 + s + 1.3, tz, 1.6);
    mundo.puntos.tablon = new THREE.Vector3(tx, g.userData.y0 + s + 1.3, tz);
    interactivoEn(g, 'cont:taquilla_sheriff', 3.2, s + 1.0, -2.3, 1.3);
    cerrarEdificio(g, g.userData.y0, new Set([tablon]));
  }

  // ---------- luz de interiores ----------
  // Una sola luz puntual que se enciende en el edificio donde está el jugador: los interiores se
  // quedaban a oscuras bajo la sombra del tejado, y una luz por casa costaría demasiado.
  const luzInterior = new THREE.PointLight('#ffcf94', 0, 15, 1.4);
  escena.add(luzInterior);
  mundo.interiores = [];
  for (const [g, lx, ly, lz, fuerza] of [[clinica, 0, 2.7, 0, 10], [tienda, 0, 2.9, -1.5, 14], [sed, -1.95, 2.7, -8.5, 16], [sheriffG, 0, 2.6, 0, 9]]) {
    if (!g) continue;
    const r = mundo.rejillas.find((rj) => rj.grupo === g);
    const [x, z] = aMundo(g, lx, lz);
    mundo.interiores.push({ r, pos: new THREE.Vector3(x, g.userData.y0 + ly, z), fuerza });
  }

  // ---------- puertas: rutas para entrar y salir de los edificios ----------
  // Cada edificio con interior guarda tres puntos en línea con su puerta (dentro, en el umbral
  // por fuera y algo más lejos). Quien persigue o huye pasa por ellos en vez de chocar con la pared.
  mundo.edificios = [];
  for (const [g, x, zDentro, zFuera, zLejos, ejeX] of [
    [clinica, -0.24, 1.4, 3.6, 5.8, false], [tienda, 0.13, 7.4, 9.8, 13.2, true],
    [sed, -1.95, -3.5, -1.0, 1.2, false], [sheriffG, 0, 2.4, 4.6, 7.2, false]]) {
    if (!g) continue;
    const r = mundo.rejillas.find((rj) => rj.grupo === g);
    const punto = (d) => { const [wx, wz] = ejeX ? aMundo(g, d, x) : aMundo(g, x, d); return new THREE.Vector3(wx, 0, wz); };
    mundo.edificios.push({ r, dentro: punto(zDentro), fuera: punto(zFuera), lejos: punto(zLejos) });
  }
  mundo.dentroDe = (p) => mundo.edificios.find((e) => p.x > e.r.x0 + 0.6 && p.x < e.r.x1 - 0.6 && p.z > e.r.z0 + 0.6 && p.z < e.r.z1 - 0.6 && sueloRejilla(e.r, p.x, p.z) !== null) || null;
  // Puntos de paso entre dos sitios: salir por la puerta de uno y entrar por la del otro
  mundo.ruta = (desde, hasta) => {
    const a = mundo.dentroDe(desde), b = mundo.dentroDe(hasta);
    if (a === b) return [];
    const pts = [];
    if (a) pts.push(a.dentro, a.fuera, a.lejos);
    if (b) pts.push(b.lejos, b.fuera, b.dentro);
    return pts.map((p) => p.clone());
  };

  // ---------- casas de los vecinos (cerradas) ----------
  function casaCerrada(nombre, { x, z, rot = 0, medida = {}, filtro = null, radio = 5 }, alternativa) {
    const o = crear(nombre, medida, { filtro });
    if (!o) { edificio(alternativa); return null; }
    const y = alturaMin(x, z, radio) - 0.05;
    o.position.set(x, y, z);
    o.rotation.y = rot;
    escena.add(o);
    o.traverse((m) => {
      if (!m.isMesh) return;
      m.material.side = THREE.DoubleSide;
      mundo.ocluyentes.push(m);
    });
    mundo.rejillas.push(crearRejilla(o, y));
    return o;
  }
  casaCerrada('oficina_sheriff', { x: -5, z: -30, medida: { alto: 4.8 }, radio: 5 }, { x: -5, z: -30, rot: 0, w: 7, d: 6, h: 3.6, color: '#d1a684', porche: false, ventanas: 2 });
  edificio({ x: 9, z: -31, rot: 0, w: 6, d: 6, h: 3.4, color: '#bf8f6b', porche: false, ventanas: 1, techoChapa: true });
  casaCerrada('casa_vieja', { x: -6, z: 33, radio: 5.5 }, { x: -6, z: 33, rot: Math.PI, w: 7.5, d: 6, h: 3.6, color: '#c69b78', porche: true, ventanas: 2 });
  casaCerrada('casa_oeste', { x: 9, z: 34, radio: 4.5, filtro: (m) => !/Ground/.test(m.name) }, { x: 9, z: 34, rot: Math.PI, w: 6, d: 5.5, h: 3.3, color: '#d6b392', porche: false, ventanas: 1, techoChapa: true });
  edificio({ x: -38, z: -14, rot: Math.PI / 2, w: 6, d: 6, h: 3.4, color: '#b78867', porche: false, ventanas: 1 });
  edificio({ x: 37, z: 2, rot: -Math.PI / 2, w: 7, d: 6, h: 3.5, color: '#caa07c', porche: false, ventanas: 2, techoChapa: true });

  const yPlaza = altura(0, 0);

  // ---------- pozo y bomba ----------
  {
    const g = new THREE.Group();
    g.position.set(0, yPlaza, 0);
    cilindro(g, 1.5, 1.6, 0.95, 12, piedra, 0, 0.47, 0);
    cilindro(g, 1.25, 1.25, 0.96, 12, mat('#2a211b'), 0, 0.5, 0).castShadow = false;
    for (const sx of [-1.3, 1.3]) caja(g, 0.18, 2.6, 0.18, maderaOsc, sx, 1.6, 0);
    caja(g, 2.9, 0.18, 0.2, maderaOsc, 0, 2.9, 0);
    cilindro(g, 0.22, 0.22, 0.22, 10, oxido, 0, 2.7, 0).rotation.z = Math.PI / 2;
    // Bomba de mano
    if (!poner('bomba_mano', { alto: 1.7 }, 2.2, 0, 0.6, Math.PI, { padre: g })) {
      caja(g, 0.6, 1.1, 0.6, mat('#4f5a52', { metalness: 0.5, roughness: 0.5 }), 2.2, 0.55, 0.6);
      cilindro(g, 0.08, 0.08, 1.6, 6, oxido, 2.2, 1.6, 0.6);
      const pal = caja(g, 1.1, 0.07, 0.07, oxido, 2.5, 2.25, 0.6);
      pal.rotation.z = -0.35;
      const canal = cilindro(g, 0.07, 0.07, 0.8, 6, oxido, 2.2, 1.0, 1.0);
      canal.rotation.x = Math.PI / 2;
    }
    // Abrevadero
    caja(g, 3.2, 0.12, 1.0, maderaOsc, 2.6, 0.12, 2.1);
    caja(g, 3.2, 0.6, 0.12, madera, 2.6, 0.4, 1.66);
    caja(g, 3.2, 0.6, 0.12, madera, 2.6, 0.4, 2.54);
    caja(g, 0.12, 0.6, 1.0, madera, 1.06, 0.4, 2.1);
    caja(g, 0.12, 0.6, 1.0, madera, 4.14, 0.4, 2.1);
    const agua = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.05, 0.78),
      new THREE.MeshStandardMaterial({ color: '#3f8a8c', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85, emissive: '#0d3a3a', emissiveIntensity: 0.4 }));
    agua.position.set(2.6, 0.55, 2.1);
    agua.visible = false;
    g.add(agua);
    const chorro = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.75, 6),
      new THREE.MeshStandardMaterial({ color: '#8fd0d0', transparent: true, opacity: 0.7, emissive: '#2f7a7a', emissiveIntensity: 0.6 }));
    chorro.position.set(2.2, 0.9, 1.4);
    chorro.visible = false;
    g.add(chorro);
    escena.add(g); fusionar(g, new Set([agua, chorro]));
    mundo.aguaBomba = agua;
    mundo.chorroBomba = chorro;
    colisor(-1.7, 1.7, -1.7, 1.7, yPlaza - 1, yPlaza + 3);
    colisor(1.0, 4.2, 1.5, 2.7, yPlaza - 1, yPlaza + 0.8);
    mundo.puntos.pozo = new THREE.Vector3(0, yPlaza + 1, 0);
    interactivo('bomba_pozo', 2.2, yPlaza + 1, 1.2, 1.4);
  }

  // ---------- farolas ----------
  const charcoMat = new THREE.MeshBasicMaterial({ map: texturaCharco(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: '#ffb066' });
  for (const [lx, lz] of [[-9, -10], [9, -12], [-9, 10], [9, 9], [-26, 2]]) {
    const y = altura(lx, lz);
    const g = new THREE.Group();
    g.position.set(lx, y, lz);
    cilindro(g, 0.07, 0.1, 4.2, 6, maderaOsc, 0, 2.1, 0);
    caja(g, 0.9, 0.08, 0.08, maderaOsc, 0.4, 4.0, 0);
    const farol = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.38, 0.28),
      new THREE.MeshStandardMaterial({ color: '#2f2418', emissive: '#ffae4f', emissiveIntensity: 0.1 }));
    farol.position.set(0.8, 3.75, 0);
    g.add(farol);
    if (poner('ph_Lantern_01', { alto: 0.5 }, 0.8, 3.48, 0, 0, { padre: g })) farol.scale.setScalar(0.35);
    // Charco de luz falso en el suelo: mucho más barato que una luz puntual
    const charco = new THREE.Mesh(new THREE.CircleGeometry(6, 24), charcoMat.clone());
    charco.rotation.x = -Math.PI / 2;
    charco.position.set(0.8, 0.06, 0);
    charco.renderOrder = 2;
    g.add(charco);
    escena.add(g); fusionar(g, new Set([farol, charco]));
    mundo.lamparas.push({ charco, farol, pos: new THREE.Vector3(lx + 0.8, y + 3.5, lz) });
  }

  // ---------- objetos sueltos por el pueblo ----------
  {
    // Apoyados en lo más bajo bajo su base (nada queda en el aire) o en el porche si están encima
    const sueloEn = (x, z, r) => {
      let h = alturaMin(x, z, r);
      for (const p of mundo.plataformas) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) h = Math.max(h, p.y);
      for (const rj of mundo.rejillas) { const s = sueloRejilla(rj, x, z); if (s !== null) h = s; }
      return h;
    };
    const objetos = [
      ['ph_WoodenChair_01', { alto: 0.95 }, -14.7, 14.3, 1.9],
      ['ph_WoodenChair_01', { alto: 0.95 }, -15.0, 21.2, 1.2],
      ['ph_WoodenChair_01', { alto: 0.95 }, 15.6, 13.4, -1.4],
      ['ph_Barrel_01', { alto: 1 }, 14.0, -2.6, 0],
      ['ph_Barrel_01', { alto: 1 }, 14.8, -1.9, 1.3],
      ['ph_wooden_crate_01', { alto: 0.8 }, 25.2, -16.4, 0.3],
      ['ph_wooden_crate_01', { alto: 0.8 }, 26.2, -17.0, 1.1],
      ['ph_old_military_crate', { largo: 1.1 }, 23.4, -16.8, 0.2],
      ['ph_Barrel_01', { alto: 1 }, -12.6, 23.4, 0.6],
      ['ph_wooden_crate_01', { alto: 0.8 }, -25.2, 9.8, 0.5],
      ['ph_old_tyre', { largo: 0.8 }, 5.2, -28.6, 0.2],
      ['ph_rusted_wheel_rim_01', { largo: 0.7 }, 33, -2.6, 1],
      ['ph_metal_jerrycan', { alto: 0.5 }, 3.6, -1.2, 0.7],
    ];
    for (const [n, medida, x, z, rot] of objetos) {
      const o = poner(n, medida, x, sueloEn(x, z, 0.4), z, rot);
      if (o && (n.includes('Barrel') || n.includes('crate'))) colisor(x - 0.45, x + 0.45, z - 0.45, z + 0.45, o.position.y - 1, o.position.y + 1);
    }
  }

  // ---------- depósito de agua y molino ----------
  let primerDeposito = true;
  if (poner('deposito_agua', { alto: 14 }, 26, alturaMin(26, -30, 2.6) - 0.05, -30, 0.5, { colision: 2.6, alto: 14, filtro: (m) => (primerDeposito ? !(primerDeposito = false) : false) })) {
    // Modelo de Sketchfab: el pack trae cuatro depósitos iguales y solo se usa el primero
  } else {
    const x = 26, z = -30, y = altura(x, z), g = new THREE.Group();
    g.position.set(x, y, z);
    for (const [px, pz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) {
      barra(g, new THREE.Vector3(px * 1.15, 0, pz * 1.15), new THREE.Vector3(px, 9, pz), 0.14, maderaOsc);
    }
    barra(g, new THREE.Vector3(-1.9, 3, -1.9), new THREE.Vector3(1.9, 6, -1.9), 0.06, madera);
    barra(g, new THREE.Vector3(-1.9, 3, 1.9), new THREE.Vector3(1.9, 6, 1.9), 0.06, madera);
    cilindro(g, 2.7, 2.7, 3.4, 12, mat('#7b5536'), 0, 10.7, 0);
    for (const by of [9.5, 10.7, 11.9]) cilindro(g, 2.76, 2.76, 0.12, 12, oxido, 0, by, 0);
    cilindro(g, 0.1, 2.95, 1.5, 12, mat('#5a4a3e'), 0, 13.15, 0);
    escena.add(g); fusionar(g);
    colisor(x - 2.2, x + 2.2, z - 2.2, z + 2.2, y - 1, y + 14);
  }
  if (poner('paredes_oeste', { alto: 11 }, -34, null, 30, 0.8, { colision: 1.4, alto: 11, filtro: (m) => m.name.startsWith('Windmill') })) {
    // Molino del pack del oeste de Sketchfab
  } else {
    const x = -34, z = 30, y = alturaMin(x, z, 1.7) - 0.05, g = new THREE.Group();
    g.position.set(x, y, z);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      barra(g, new THREE.Vector3(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6), new THREE.Vector3(Math.cos(a) * 0.25, 9.5, Math.sin(a) * 0.25), 0.07, mat('#6b625a', { metalness: 0.5 }));
    }
    const rueda = new THREE.Group();
    rueda.position.set(0, 9.8, 0.4);
    for (let i = 0; i < 14; i++) {
      const aspa = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.2, 0.04), mat('#c9c0b0', { metalness: 0.3 }));
      aspa.position.set(0, 1.4, 0);
      const brazo = new THREE.Group();
      brazo.rotation.z = (i / 14) * Math.PI * 2;
      aspa.rotation.y = 0.35;
      aspa.castShadow = true;
      brazo.add(aspa);
      rueda.add(brazo);
    }
    g.add(rueda);
    const cola = caja(g, 0.05, 1.0, 2.2, mat('#a8452e'), 0, 9.8, -1.6);
    cola.castShadow = true;
    escena.add(g); fusionar(g, new Set([rueda]));
    mundo.animados.push((dt) => { rueda.rotation.z += dt * 1.6; });
    colisor(x - 1.4, x + 1.4, z - 1.4, z + 1.4, y - 1, y + 10);
  }

  // ---------- campo de tiro ----------
  {
    const x0 = -46, y = altura(x0, 15);
    const g = new THREE.Group();
    g.position.set(x0, y, 0);
    for (let z = 7; z <= 25; z += 3) cilindro(g, 0.09, 0.1, 1.3, 5, maderaOsc, 0, 0.65, z);
    caja(g, 0.12, 0.1, 18.4, madera, 0, 1.2, 16);
    caja(g, 0.12, 0.1, 18.4, madera, 0, 0.7, 16);
    escena.add(g); fusionar(g);
    const vidrio = new THREE.MeshStandardMaterial({ color: '#5f9e6e', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88, emissive: '#1f4a2c', emissiveIntensity: 0.4 });
    const vidrioAmbar = vidrio.clone();
    vidrioAmbar.color.set('#b0742e');
    vidrioAmbar.emissive.set('#4a2a0c');
    let i = 0;
    for (let z = 9; z <= 23; z += 2.3) {
      const b = new THREE.Group();
      const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.26, 8), i % 2 ? vidrioAmbar : vidrio);
      cuerpo.position.y = 0.13;
      const cuello = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.12, 6), cuerpo.material);
      cuello.position.y = 0.32;
      b.add(cuerpo, cuello);
      b.position.set(x0, y + 1.25, z);
      for (const m of [cuerpo, cuello]) {
        m.castShadow = true;
        m.userData.botella = b;
      }
      escena.add(b);
      mundo.botellas.push(b);
      i++;
    }
    caja(escena, 0.5, 0.06, 0.5, madera, -33.5, altura(-33.5, 15) + 0.03, 15, false);
    mundo.puntos.campo_tiro = new THREE.Vector3(-34, altura(-34, 15) + 1, 15);
    {
      const hx = -37, hz = 7, hy = altura(hx, hz);
      const h = new THREE.Group();
      h.position.set(hx, hy, hz);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), piedra);
        p.position.set(Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62);
        p.castShadow = true;
        h.add(p);
      }
      for (let i = 0; i < 3; i++) {
        const l = cilindro(h, 0.06, 0.07, 0.9, 6, maderaOsc, 0, 0.12, 0);
        l.rotation.set(Math.PI / 2, (i / 3) * Math.PI, 0.25);
      }
      const llama = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 6), new THREE.MeshBasicMaterial({ color: '#ff9a3a', transparent: true, opacity: 0.9, toneMapped: false }));
      llama.position.y = 0.5;
      h.add(llama);
      escena.add(h);
      mundo.animados.push((dt, t) => { const k = 1 + Math.sin(t * 12) * 0.1 + Math.sin(t * 7.1) * 0.07; llama.scale.set(k, 1 + Math.sin(t * 9) * 0.15, k); llama.rotation.y += dt * 2; });
      mundo.hogueras.push({ pos: new THREE.Vector3(hx, hy + 1, hz) });
      colisor(hx - 0.7, hx + 0.7, hz - 0.7, hz + 0.7, hy - 1, hy + 0.5);
      interactivo('hoguera:tiro', hx, hy + 0.6, hz, 2);
    }
  }

  // ---------- coches abandonados ----------
  const pinturas = ['#6f8a8c', '#a3593a', '#c2b28f', '#5e6a4a', '#7a3b33'];
  let nCoche = 0;
  function coche(x, z, rot, color) {
    interactivo(`coche:${nCoche}`, x, altura(x, z) + 1, z, 2.8);
    const modelo = nCoche++ % 2 ? 'sedan' : 'coche_oxidado';
    const m = poner(modelo, { largo: 4.5 }, x, altura(x, z) - 0.05, z, rot, { girar: Math.PI / 2 });
    if (m) {
      // Se inclina con el terreno: las cuatro ruedas tocan el suelo aunque esté en cuesta
      const c = Math.cos(rot), s = Math.sin(rot);
      const hF = altura(x + c * 2, z - s * 2), hB = altura(x - c * 2, z + s * 2);
      const hI = altura(x + s * 0.9, z + c * 0.9), hD = altura(x - s * 0.9, z - c * 0.9);
      m.rotation.order = 'YXZ';
      m.rotation.z = Math.atan2(hF - hB, 4) + (R() - 0.5) * 0.03;
      m.rotation.x = -Math.atan2(hI - hD, 1.8);
      m.position.y = Math.min((hF + hB + hI + hD) / 4, altura(x, z)) - 0.06;
      const giro = Math.abs(Math.sin(rot)) > 0.5;
      const hw = giro ? 1.0 : 2.2, hd = giro ? 2.2 : 1.0, y = altura(x, z);
      colisor(x - hw, x + hw, z - hd, z + hd, y - 1, y + 1.8);
      m.traverse((o) => { if (o.isMesh) mundo.ocluyentes.push(o); });
      return;
    }
    const y = altura(x, z), g = new THREE.Group();
    g.position.set(x, y + 0.05, z);
    g.rotation.y = rot;
    g.rotation.z = (R() - 0.5) * 0.08;
    const pint = mat(color, { metalness: 0.3, roughness: 0.75 });
    caja(g, 4.3, 0.75, 1.85, pint, 0, 0.7, 0);
    caja(g, 2.2, 0.66, 1.65, pint, -0.25, 1.4, 0);
    caja(g, 2.0, 0.5, 1.7, mat('#20242a', { roughness: 0.3 }), -0.25, 1.4, 0);
    caja(g, 1.2, 0.12, 1.9, oxido, 1.6, 1.1, 0);
    for (const [wx, wz] of [[1.35, 0.95], [-1.35, 0.95], [1.35, -0.95], [-1.35, -0.95]]) {
      if (R() < 0.25) continue;
      const r = cilindro(g, 0.38, 0.38, 0.28, 10, mat('#1d1b1a'), wx, 0.38, wz);
      r.rotation.x = Math.PI / 2;
    }
    escena.add(g); fusionar(g);
    const giro = Math.abs(Math.sin(rot)) > 0.5;
    const hw = giro ? 1.0 : 2.2, hd = giro ? 2.2 : 1.0;
    colisor(x - hw, x + hw, z - hd, z + hd, y - 1, y + 1.8);
    mundo.ocluyentes.push(g.children[0]);
  }
  coche(30, -18, 0.2, pinturas[0]);
  coche(-30, 40, 1.4, pinturas[1]);
  coche(72, 12, 1.65, pinturas[2]);
  coche(16, 95, 0.4, pinturas[3]);
  coche(-80, -26, 1.2, pinturas[4]);
  coche(118, 8, 2.9, pinturas[1]);

  // ---------- postes de la luz con cables ----------
  {
    const ruta = CAMINOS[0];
    const postes = [];
    for (let d = 14; d < 148; d += 19) {
      let restante = d, p = null;
      for (let i = 0; i < ruta.length - 1 && !p; i++) {
        const [ax, az] = ruta[i], [bx, bz] = ruta[i + 1], l = Math.hypot(bx - ax, bz - az);
        if (restante <= l) {
          const t = restante / l, nx = -(bz - az) / l, nz = (bx - ax) / l;
          p = [ax + (bx - ax) * t + nx * 5, az + (bz - az) * t + nz * 5];
        } else restante -= l;
      }
      if (!p) break;
      const y = altura(p[0], p[1]);
      const g = new THREE.Group();
      g.position.set(p[0], y, p[1]);
      const tilt = (R() - 0.5) * 0.1;
      g.rotation.z = tilt;
      cilindro(g, 0.11, 0.15, 7.2, 6, maderaOsc, 0, 3.6, 0);
      caja(g, 0.12, 0.12, 1.9, maderaOsc, 0, 6.8, 0);
      escena.add(g); fusionar(g);
      postes.push(new THREE.Vector3(p[0], y + 6.9, p[1]));
    }
    const lm = new THREE.LineBasicMaterial({ color: '#241a14' });
    for (let i = 0; i < postes.length - 1; i++) {
      for (const off of [-0.8, 0.8]) {
        const a = postes[i].clone(), b = postes[i + 1].clone();
        a.z += off; b.z += off;
        const pts = [];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12;
          const p = a.clone().lerp(b, t);
          p.y -= Math.sin(Math.PI * t) * 1.1;
          pts.push(p);
        }
        escena.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm));
      }
    }
  }

  // ---------- gasolinera Ocaso ----------
  {
    const cx = 150, cz = 25, y = altura(cx, cz);
    const g = new THREE.Group();
    g.position.set(cx, y, cz);
    const blanco = mat('#d8cfbf'), rojo = mat('#a8452e');
    for (const [px, pz] of [[-6, -4], [6, -4], [-6, 4], [6, 4]]) cilindro(g, 0.22, 0.22, 4.7, 8, blanco, px, 2.35, pz);
    caja(g, 14.5, 0.55, 10.2, blanco, 0, 4.95, 0);
    caja(g, 14.7, 0.32, 10.4, rojo, 0, 4.6, 0);
    for (const px of [-3, 3]) {
      caja(g, 0.95, 0.18, 0.75, mat('#3a3631'), px, 0.09, 0);
      if (poner('surtidor', { alto: 1.75 }, px, 0.18, 0, 0, { padre: g })) continue;
      caja(g, 0.75, 1.6, 0.55, mat(px < 0 ? '#b5523a' : '#d9c79a'), px, 0.8, 0);
      caja(g, 0.5, 0.36, 0.05, mat('#1c1a17', { emissive: '#4d3a1c', emissiveIntensity: 0.3 }), px, 1.22, 0.29);
    }
    // Restos alrededor de la gasolinera
    poner('ph_old_tyre', { largo: 0.8 }, -7.5, 0, 3.2, 0.3, { padre: g });
    poner('ph_old_tyre', { largo: 0.8 }, -7.2, 0.22, 3.4, 1.1, { padre: g });
    poner('ph_Barrel_01', { alto: 1 }, 7.4, 0, -4.4, 0, { padre: g });
    poner('ph_Barrel_01', { alto: 1 }, 8.2, 0, -3.8, 1, { padre: g });
    poner('ph_metal_jerrycan', { alto: 0.5 }, 6.6, 0, -4.9, 0.6, { padre: g });
    poner('ph_rusted_wheel_rim_01', { largo: 0.7 }, -5.5, 0, -6.2, 0.2, { padre: g });
    caja(g, 1.8, 0.25, 9.0, mat('#9c958a'), 0, 0.12, 0);
    escena.add(g); fusionar(g);
    for (const [px, pz] of [[-6, -4], [6, -4], [-6, 4], [6, 4]]) colisor(cx + px - 0.3, cx + px + 0.3, cz + pz - 0.3, cz + pz + 0.3, y - 1, y + 5);
    colisor(cx - 3.4, cx - 2.6, cz - 0.3, cz + 0.3, y - 1, y + 1.7);
    colisor(cx + 2.6, cx + 3.4, cz - 0.3, cz + 0.3, y - 1, y + 1.7);

    // Poste del cartel
    const pg = new THREE.Group();
    pg.position.set(cx - 12, altura(cx - 12, cz - 8), cz - 8);
    cilindro(pg, 0.18, 0.22, 9, 8, mat('#6b625a', { metalness: 0.5 }), 0, 4.5, 0);
    const cartel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.8, 0.3), [
      mat('#2c2620'), mat('#2c2620'), mat('#2c2620'), mat('#2c2620'),
      new THREE.MeshStandardMaterial({ map: texturaCartel('OCASO', { fondo: '#e6dccb', tinta: '#a8452e', borde: '#a8452e', tamano: 92 }), roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ map: texturaCartel('OCASO', { fondo: '#e6dccb', tinta: '#a8452e', borde: '#a8452e', tamano: 92 }), roughness: 0.7 }),
    ]);
    cartel.position.set(0, 9.4, 0);
    cartel.rotation.y = -0.6;
    cartel.castShadow = true;
    pg.add(cartel);
    escena.add(pg);

    // Oficina hueca: frente hacia el sur (z menor), puerta en el centro
    const ox = 150, oz = 37, oy = altura(ox, oz) - 0.05, W = 8, D = 6, H = 3.4;
    const og = new THREE.Group();
    og.position.set(0, oy, 0);
    const muro = mat('#cbb89c'), suelo = mat('#6d6256');
    const pared = (w, d, x, z) => {
      const m = caja(og, w, H, d, muro, x, H / 2, z);
      colisor(x - w / 2, x + w / 2, z - d / 2, z + d / 2, oy - 1, oy + H + 0.3);
      mundo.ocluyentes.push(m);
    };
    pared(W, 0.25, ox, oz + D / 2);
    pared(0.25, D, ox - W / 2, oz);
    pared(0.25, D, ox + W / 2, oz);
    pared(3.35, 0.25, ox - W / 2 + 3.35 / 2, oz - D / 2);
    pared(3.35, 0.25, ox + W / 2 - 3.35 / 2, oz - D / 2);
    caja(og, 1.3, H - 2.35, 0.25, muro, ox, 2.35 + (H - 2.35) / 2, oz - D / 2);
    caja(og, W + 0.5, 0.25, D + 0.5, mat('#7c6f62'), ox, H + 0.12, oz);
    caja(og, W - 0.2, 0.06, D - 0.2, suelo, ox, 0.06, oz).castShadow = false;
    caja(og, 2.6, 0.9, 0.15, ventanaMat, ox + 2.2, 1.9, oz - D / 2 - 0.08, false);
    // Puerta con bisagra a la izquierda
    const bisagra = new THREE.Group();
    bisagra.position.set(ox - 0.65, 0, oz - D / 2);
    const hoja = caja(bisagra, 1.3, 2.3, 0.1, mat('#8a4b2c', { metalness: 0.3 }), 0.65, 1.15, 0);
    caja(bisagra, 0.1, 0.1, 0.12, mat('#d8cfbf', { metalness: 0.6 }), 1.1, 1.15, -0.08);
    og.add(bisagra);
    mundo.puertaOcaso = bisagra;
    mundo.colisorPuerta = colisor(ox - 0.65, ox + 0.65, oz - D / 2 - 0.1, oz - D / 2 + 0.1, oy - 1, oy + 2.4, 'puerta');
    mundo.ocluyentes.push(hoja);
    interactivo('puerta_ocaso', ox, oy + 1.2, oz - D / 2 - 0.4, 2);
    // Interior
    const mesa = poner('ph_metal_office_desk', { largo: 1.9 }, ox + 2.4, 0.06, oz + 2.2, 0, { padre: og });
    const alturaMesa = mesa ? 0.78 : 0.9;
    if (!mesa) {
      caja(og, 2.2, 0.08, 0.9, madera, ox + 2.4, 0.86, oz + 2.2);
      for (const [lx, lz] of [[-1, -0.38], [1, -0.38], [-1, 0.38], [1, 0.38]]) caja(og, 0.08, 0.84, 0.08, maderaOsc, ox + 2.4 + lx, 0.42, oz + 2.2 + lz);
    }
    poner('ph_WoodenChair_01', { alto: 0.95 }, ox + 2.2, 0.06, oz + 1.35, Math.PI + 0.3, { padre: og });
    if (!poner('terminal', { largo: 0.75 }, ox + 2.4, alturaMesa, oz + 2.25, Math.PI, { padre: og, filtro: (m) => m.name.startsWith('Comp_Screen') })) {
      caja(og, 0.75, 0.55, 0.55, mat('#4a4740', { metalness: 0.3 }), ox + 2.4, 1.18, oz + 2.25);
      const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.4),
        new THREE.MeshStandardMaterial({ color: '#0b0a06', emissive: '#e8a33a', emissiveIntensity: 0.9 }));
      pantalla.position.set(ox + 2.4, 1.2, oz + 1.965);
      pantalla.rotation.y = Math.PI;
      og.add(pantalla);
    }
    // Brillo ámbar de la pantalla, para que se vea desde la puerta

    interactivo('terminal', ox + 2.4, oy + 1.2, oz + 1.6, 1.6);
    const caja1 = caja(og, 0.85, 1.05, 0.7, mat('#3b3d3a', { metalness: 0.6, roughness: 0.45 }), ox - 3.35, 0.53, oz + 2.4);
    const puertaCaja = caja(og, 0.08, 0.9, 0.6, mat('#565952', { metalness: 0.7, roughness: 0.35 }), ox - 2.89, 0.53, oz + 2.4);
    mundo.puertaCaja = puertaCaja;
    void caja1;
    interactivo('caja_fuerte', ox - 2.7, oy + 0.8, oz + 2.4, 1.5);
    caja(og, 1.8, 0.08, 0.7, madera, ox - 2.7, 0.92, oz - 1.6);
    // Archivador metálico junto a la ventana
    caja(og, 0.55, 1.3, 0.5, mat('#5c6058', { metalness: 0.5, roughness: 0.5 }), ox + 3.45, 0.65, oz - 1.9);
    for (let k = 0; k < 3; k++) caja(og, 0.5, 0.02, 0.02, mat('#2a2c29'), ox + 3.45, 0.3 + k * 0.4, oz - 1.64);
    colisor(ox + 3.15, ox + 3.75, oz - 2.15, oz - 1.65, oy - 1, oy + 1.4);
    interactivo('cont:armario_ocaso', ox + 3.45, oy + 1.0, oz - 1.5, 1.3);
    for (const [lx, lz] of [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]]) caja(og, 0.08, 0.9, 0.08, maderaOsc, ox - 2.7 + lx, 0.45, oz - 1.6 + lz);
    const valvula = new THREE.Group();
    const rojoV = mat('#b13a2a', { metalness: 0.4, roughness: 0.5 });
    const aro = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 12), rojoV);
    aro.rotation.x = Math.PI / 2;
    aro.position.y = 0.2;
    valvula.add(aro, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 8), mat('#6b6a63', { metalness: 0.6 })));
    valvula.position.set(ox - 2.7, 1.0, oz - 1.6);
    og.add(valvula);
    mundo.valvula = valvula;
    mundo.puntos.valvula = new THREE.Vector3(ox - 2.7, oy + 1, oz - 1.6);
    interactivo('valvula', ox - 2.7, oy + 1.1, oz - 1.6, 1.6);
    caja(og, 0.25, 0.08, 0.25, new THREE.MeshBasicMaterial({ color: '#ffe2a8', toneMapped: false }), ox, H - 0.05, oz, false);
    escena.add(og); fusionar(og, new Set([bisagra, valvula, puertaCaja]));

    // Camión cisterna y esqueleto con la llave
    const tx = 166, tz = 12, ty = altura(tx, tz);
    const camion = poner('camion', { largo: 8 }, tx, ty - 0.05, tz, 0.5, { girar: Math.PI / 2 });
    if (camion) camion.traverse((o) => { if (o.isMesh) mundo.ocluyentes.push(o); });
    else {
      const tg = new THREE.Group();
      tg.position.set(tx, ty, tz);
      tg.rotation.y = 0.5;
      const tanque = cilindro(tg, 1.35, 1.35, 7.5, 12, mat('#9a5b3a', { metalness: 0.35, roughness: 0.8 }), -0.8, 1.8, 0);
      tanque.rotation.z = Math.PI / 2;
      caja(tg, 2.2, 2.0, 2.3, mat('#5b6a6e', { metalness: 0.3 }), 4.0, 1.4, 0);
      caja(tg, 1.0, 0.7, 2.1, mat('#1d2226'), 4.4, 1.9, 0);
      caja(tg, 9.5, 0.3, 1.6, oxido, 0.6, 0.45, 0);
      escena.add(tg);
    }
    colisor(tx - 4.2, tx + 4.2, tz - 2.6, tz + 2.6, ty - 1, ty + 3.2);
    const ex = 163.5, ez = 6.8, ey = altura(ex, ez);
    const esq = crear('esqueleto', { alto: 1.75 });
    if (esq) {
      const pivote = new THREE.Group();
      pivote.position.set(ex, ey + 0.12, ez);
      pivote.rotation.y = 0.9;
      esq.rotation.x = -Math.PI / 2;
      esq.position.z = 0.85;
      pivote.add(esq);
      escena.add(pivote);
    } else {
    const hueso = mat('#e4dccb');
    const eg = new THREE.Group();
    eg.position.set(ex, ey + 0.08, ez);
    eg.rotation.y = 0.9;
    const craneo = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), hueso);
    craneo.position.set(0.9, 0.06, 0);
    eg.add(craneo);
    for (let k = 0; k < 5; k++) {
      const c = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 4, 8, Math.PI), hueso);
      c.position.set(0.45 - k * 0.09, 0.05, 0);
      c.rotation.set(0, Math.PI / 2, Math.PI / 2);
      eg.add(c);
    }
    eg.add(caja(eg, 0.6, 0.12, 0.32, mat('#3d4a5a'), 0.25, 0.04, 0, false));
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 4), hueso);
      b.rotation.z = Math.PI / 2;
      b.position.set(-0.35, 0.03, s * 0.12);
      eg.add(b);
    }
    escena.add(eg);
    }
    mundo.puntos.esqueleto = new THREE.Vector3(ex, ey + 0.5, ez);
    interactivo('esqueleto', ex, ey + 0.4, ez, 1.8);
  }

  // ---------- repetidor del cerro del Eco ----------
  {
    const rx = -150, rz = -40, ry = altura(rx, rz);
    const g = new THREE.Group();
    g.position.set(rx, ry, rz);
    const acero = mat('#7a7f7a', { metalness: 0.6, roughness: 0.5 });
    const base = 1.8, top = 0.32, H = 19;
    const torre = poner('torre_radio', { alto: H + 1 }, 0, 0, 0, 0.3, { padre: g, filtro: (m) => !m.name.startsWith('Floor') });
    if (!torre) {
      const esquinas = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [sx, sz] of esquinas) barra(g, new THREE.Vector3(sx * base, 0, sz * base), new THREE.Vector3(sx * top, H, sz * top), 0.08, acero);
      for (let yy = 0; yy < H - 2; yy += 2.6) {
        const k1 = lerp(base, top, yy / H), k2 = lerp(base, top, (yy + 2.6) / H);
        for (let i = 0; i < 4; i++) {
          const [ax, az] = esquinas[i], [bx, bz] = esquinas[(i + 1) % 4];
          barra(g, new THREE.Vector3(ax * k1, yy, az * k1), new THREE.Vector3(bx * k2, yy + 2.6, bz * k2), 0.035, acero);
          barra(g, new THREE.Vector3(ax * k2, yy + 2.6, az * k2), new THREE.Vector3(bx * k2, yy + 2.6, bz * k2), 0.03, acero);
        }
      }
      const plato = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3.2), mat('#d6d1c6', { side: THREE.DoubleSide }));
      plato.position.set(0.8, 13, 0);
      plato.rotation.z = -Math.PI / 2;
      plato.castShadow = true;
      g.add(plato);
    }
    poner('ph_portable_generator', { largo: 1.1 }, 1.4, alturaMin(rx + 1.4, rz + 3.4, 0.6) - ry, 3.4, -0.6, { padre: g });
    interactivo('cont:caja_repetidor', rx + 1.4, ry + 0.8, rz + 3.9, 1.3);
    const baliza = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: '#4a1410', emissive: '#ff3b2a', emissiveIntensity: 0 }));
    baliza.position.y = H + 0.3;
    g.add(baliza);
    const luzBaliza = { intensity: 0 };
    const caja2 = poner('ph_utility_box_01', { alto: 1.6 }, 3.2, alturaMin(rx + 3.2, rz + 2.2, 0.5) - ry, 2.2, 0, { padre: g });
    const armario = caja(g, 1.3, 1.7, 0.9, mat('#5a6656', { metalness: 0.3 }), 3.2, 0.85, 2.2);
    if (caja2) armario.visible = false;
    else caja(g, 0.9, 0.6, 0.05, mat('#1b1d1a', { emissive: '#3a2a12', emissiveIntensity: 0.3 }), 3.2, 1.1, 2.67, false);
    barra(g, new THREE.Vector3(3.2, 1.6, 2.0), new THREE.Vector3(0.3, 4, 0.3), 0.03, mat('#1d1b1a'));
    escena.add(g); fusionar(g, new Set([baliza, armario]));
    mundo.ocluyentes.push(armario);
    colisor(rx + 2.55, rx + 3.85, rz + 1.75, rz + 2.65, ry - 1, ry + 1.8);
    colisor(rx - 1.9, rx + 1.9, rz - 1.9, rz + 1.9, ry - 1, ry + 19);
    mundo.baliza = { baliza, luzBaliza };
    mundo.puntos.repetidor = new THREE.Vector3(rx + 3.2, ry + 1.2, rz + 2.7);
    interactivo('repetidor', rx + 3.2, ry + 1.2, rz + 3.2, 2);
  }

  // ---------- campamento Cuervo ----------
  {
    const cx = 35, cz = 165, cy = altura(cx, cz);
    const g = new THREE.Group();
    g.position.set(cx, cy, cz);
    if (!poner('ph_stone_fire_pit', { largo: 2.3 }, 0, 0, 0, 0, { padre: g })) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), piedra);
        p.position.set(Math.cos(a) * 1.05, 0.15, Math.sin(a) * 1.05);
        p.castShadow = true;
        g.add(p);
      }
      for (let i = 0; i < 3; i++) {
        const l = cilindro(g, 0.1, 0.12, 1.5, 6, maderaOsc, 0, 0.22, 0);
        l.rotation.set(Math.PI / 2, (i / 3) * Math.PI, 0.2);
      }
    }
    // Altura del suelo bajo un punto del campamento, relativa al centro (el campamento no es llano del todo)
    const hy = (lx, lz, r = 0.5) => alturaMin(cx + lx, cz + lz, r) - cy;
    // Cajas, barriles y neumáticos del campamento
    poner('ph_old_military_crate', { largo: 1.1 }, 3.2, hy(3.2, 2.6), 2.6, 0.4, { padre: g });
    poner('ph_wooden_crate_01', { alto: 0.8 }, 4.1, hy(4.1, 3.3), 3.3, 1.2, { padre: g });
    poner('ph_wooden_crate_01', { alto: 0.8 }, 4.1, hy(4.1, 3.3) + 0.8, 3.3, 0.7, { padre: g });
    poner('ph_Barrel_01', { alto: 1 }, -3.6, hy(-3.6, 2.8), 2.8, 0, { padre: g });
    poner('ph_old_tyre', { largo: 0.8 }, -4.4, hy(-4.4, -2.2), -2.2, 0.5, { padre: g });
    poner('ph_metal_jerrycan', { alto: 0.5 }, 2.6, hy(2.6, -3.4), -3.4, 2, { padre: g });
    const llamaMat = new THREE.MeshBasicMaterial({ color: '#ff9a3a', transparent: true, opacity: 0.92, toneMapped: false });
    const llamaMat2 = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.9, toneMapped: false });
    const llama = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 6), llamaMat);
    llama.position.y = 0.95;
    const llama2 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.95, 5), llamaMat2);
    llama2.position.y = 0.75;
    g.add(llama, llama2);
    const luzFuego = new THREE.PointLight('#ff8a3a', 25, 26, 2);
    luzFuego.position.y = 1.6;
    g.add(luzFuego);
    // Brasas
    const nb = 60, pb = new Float32Array(nb * 3), vb = [];
    for (let i = 0; i < nb; i++) { pb.set([0, R() * 4, 0], i * 3); vb.push(R()); }
    const gb = new THREE.BufferGeometry();
    gb.setAttribute('position', new THREE.BufferAttribute(pb, 3));
    const brasas = new THREE.Points(gb, new THREE.PointsMaterial({ color: '#ffb35a', size: 0.09, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }));
    g.add(brasas);
    mundo.hogueras.push({ pos: new THREE.Vector3(cx, cy + 1, cz), luz: luzFuego });
    mundo.animados.push((dt, t) => {
      const f = 1 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.06;
      llama.scale.set(f, 1 + Math.sin(t * 9.1) * 0.12, f);
      llama2.scale.set(1, 1 + Math.sin(t * 11.7) * 0.15, 1);
      llama.rotation.y += dt * 2;
      luzFuego.intensity = 22 + Math.sin(t * 17) * 4 + Math.sin(t * 5.3) * 3;
      const a = brasas.geometry.attributes.position;
      for (let i = 0; i < nb; i++) {
        let y = a.getY(i) + dt * (0.8 + vb[i]);
        if (y > 4.5) y = 0.6;
        a.setXYZ(i, Math.sin(t * 0.7 + i) * 0.3 * (y / 4), y, Math.cos(t * 0.9 + i * 1.7) * 0.3 * (y / 4));
      }
      a.needsUpdate = true;
    });
    const telas = ['#4b3b33', '#5a4a3a', '#3d3a35', '#6b5338'];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4, tx = Math.cos(a) * 10, tz = Math.sin(a) * 10;
      const tienda = poner('tienda_campana', { largo: 4.6 }, tx, hy(tx, tz, 2.2) - 0.05, tz, -a + Math.PI / 2, { padre: g });
      if (tienda) {
        // La lona es un solo plano: por dentro tiene que verse
        tienda.traverse((o) => { if (o.isMesh) o.material.side = THREE.DoubleSide; });
        colisor(cx + tx - 1.8, cx + tx + 1.8, cz + tz - 1.8, cz + tz + 1.8, cy - 1, cy + 2.6);
        tienda.traverse((o) => { if (o.isMesh) mundo.ocluyentes.push(o); });
        continue;
      }
      const t = new THREE.Mesh(new THREE.ConeGeometry(2.5, 2.9, 4), mat(telas[i]));
      t.position.set(tx, 1.45, tz);
      t.rotation.y = a + Math.PI / 4;
      t.castShadow = true;
      t.receiveShadow = true;
      g.add(t);
      colisor(cx + tx - 1.6, cx + tx + 1.6, cz + tz - 1.6, cz + tz + 1.6, cy - 1, cy + 2.6);
      mundo.ocluyentes.push(t);
    }
    // Barricadas de chatarra
    for (let i = 0; i < 14; i++) {
      const a = -0.4 - (i / 14) * Math.PI * 1.1, r = 17 + R() * 1.5;
      const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
      if (i % 3 === 2) {
        // Bidones oxidados
        for (let k = 0; k < 2; k++) {
          const px = bx + k * 0.7, pz = bz + k * 0.3;
          if (poner('ph_Barrel_01', { alto: 1 }, px, hy(px, pz, 0.35), pz, R() * 6, { padre: g })) continue;
          cilindro(g, 0.32, 0.32, 0.9, 10, mat(['#a0562f', '#6f7a6e', '#b8863b'][(i + k) % 3], { metalness: 0.4, roughness: 0.6 }), px, hy(px, pz, 0.35) + 0.45, pz);
        }
        continue;
      }
      const alto = 0.8 + R() * 0.6;
      // Chapas clavadas en la arena: el pie queda un poco enterrado aunque el suelo baje
      const b = caja(g, 1.6 + R() * 0.8, alto + 0.25, 0.08, mat(R() < 0.5 ? '#9a8670' : '#a0562f', { metalness: 0.45, roughness: 0.55 }), bx, hy(bx, bz, 1.1) + (alto + 0.25) / 2 - 0.2, bz);
      b.rotation.y = -a + Math.PI / 2 + (R() - 0.5) * 0.5;
      b.rotation.z = (R() - 0.5) * 0.25;
    }
    // Estandarte
    cilindro(g, 0.07, 0.09, 6.5, 6, maderaOsc, 4, 3.25, -3);
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 160;
    const x = cv.getContext('2d');
    x.fillStyle = '#16120f'; x.fillRect(0, 0, 256, 160);
    x.fillStyle = '#e8dcc4';
    x.beginPath();
    x.moveTo(30, 95); x.quadraticCurveTo(90, 40, 128, 78); x.quadraticCurveTo(166, 40, 226, 95);
    x.quadraticCurveTo(170, 70, 140, 96); x.lineTo(128, 120); x.lineTo(116, 96); x.quadraticCurveTo(86, 70, 30, 95);
    x.fill();
    x.fillRect(122, 66, 12, 14);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const bandera = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5, 8, 1), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 1 }));
    bandera.position.set(5.25, 5.6, -3);
    bandera.castShadow = true;
    g.add(bandera);
    const bpos = bandera.geometry.attributes.position, base = bpos.array.slice();
    mundo.animados.push((dt, t) => {
      for (let i = 0; i < bpos.count; i++) {
        const xx = base[i * 3];
        bpos.setZ(i, Math.sin(t * 3 + xx * 2.4) * 0.14 * (xx + 1.2));
      }
      bpos.needsUpdate = true;
    });
    escena.add(g); fusionar(g, new Set([llama, llama2, bandera]));
    colisor(cx - 1.2, cx + 1.2, cz - 1.2, cz + 1.2, cy - 1, cy + 1.2);
    interactivo('cont:cajas_cuervo', cx + 3.6, cy + 0.8, cz + 2.9, 1.6);
    interactivo('hoguera:cuervo', cx, cy + 0.6, cz, 2.2);
    // La chabola de Garza, al sur del fuego (solo la casa delantera del modelo)
    casaCerrada('chabola', { x: cx + 2, z: cz + 17, rot: Math.PI, medida: { escala: 0.55 }, radio: 4.5, filtro: (m) => /ID_0[126]/.test(m.name) }, { x: cx + 2, z: cz + 17, rot: Math.PI, w: 7, d: 5, h: 3.2, color: '#9a7a5a', porche: false, ventanas: 1, techoChapa: true });
  }

  // ---------- mina del Cobre Viejo (tomada por saqueadores) ----------
  {
    const mx = -118, mz = 78, my = altura(mx, mz);
    const g = new THREE.Group();
    g.position.set(mx, my, mz);
    const rocaOsc = mat('#6e4836', { tex: 'piedra' }), rocaMed = mat('#8a6048', { tex: 'piedra' });
    // Ladera de roca con la bocamina
    const muro = caja(g, 17, 8, 4.5, rocaOsc, 0, 3.4, 7.2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8 - 0.5) * 2.6;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(2 + R() * 1.7, 0), i % 2 ? rocaMed : rocaOsc);
      r.position.set(Math.sin(a) * 7, 1.2 + R() * 1.8, 4.8 + Math.cos(a) * 1.8 + R());
      r.scale.set(1.3, 1 + R() * 0.7, 1.3);
      r.rotation.set(R(), R() * 6, R());
      r.castShadow = r.receiveShadow = true;
      g.add(r);
    }
    // Marco de madera y galería oscura
    caja(g, 0.5, 3.1, 0.5, maderaOsc, -1.9, 1.55, 2.3);
    caja(g, 0.5, 3.1, 0.5, maderaOsc, 1.9, 1.55, 2.3);
    caja(g, 4.7, 0.5, 0.55, maderaOsc, 0, 3.1, 2.3);
    caja(g, 3.4, 2.7, 0.3, mat('#09090b'), 0, 1.35, 2.5, false);
    caja(g, 3.8, 0.45, 2.4, maderaOsc, 0, 3.0, 3.6);
    // Raíles y vagoneta volcada
    for (const sx of [-0.55, 0.55]) caja(g, 0.1, 0.1, 8, mat('#4a3f38', { metalness: 0.4 }), sx, 0.06, -1.5);
    const cart = new THREE.Group();
    cart.position.set(0.3, 0, -3);
    cart.rotation.z = 0.5;
    caja(cart, 1.1, 0.7, 1.5, mat('#5a4a40', { metalness: 0.3 }), 0, 0.6, 0);
    caja(cart, 0.98, 0.5, 1.38, mat('#2a2420'), 0, 0.72, 0);
    for (const [wx, wz] of [[-0.56, -0.5], [0.56, -0.5], [-0.56, 0.5], [0.56, 0.5]]) {
      const w = cilindro(cart, 0.22, 0.22, 0.1, 10, mat('#30302e', { metalness: 0.5 }), wx, 0.22, wz);
      w.rotation.z = Math.PI / 2;
    }
    g.add(cart);
    for (let i = 0; i < 4; i++) {
      const o = new THREE.Mesh(new THREE.ConeGeometry(0.8 + R() * 0.5, 0.6 + R() * 0.3, 7), mat('#7a5a38'));
      o.position.set(-5 + R() * 9, 0.3, -3 + R() * 4);
      o.castShadow = true; o.receiveShadow = true;
      g.add(o);
    }
    // Caja fuerte del capataz y cajón de dinamitero
    caja(g, 0.9, 0.6, 0.62, mat('#4a4036', { metalness: 0.4, roughness: 0.5 }), -3.4, 0.32, 0.6);
    caja(g, 0.96, 0.12, 0.68, mat('#6a5a3a', { metalness: 0.6 }), -3.4, 0.64, 0.6);
    if (!poner('ph_old_military_crate', { largo: 0.95 }, 3.4, 0, -0.4, 0.4, { padre: g })) caja(g, 0.85, 0.6, 0.85, madera, 3.4, 0.3, -0.4);
    // Hoguera del campamento saqueador
    const hx = 1.5, hz = 1.8;
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), piedra); p.position.set(hx + Math.cos(a) * 0.6, 0.08, hz + Math.sin(a) * 0.6); p.castShadow = true; g.add(p); }
    const llamaMina = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 6), new THREE.MeshBasicMaterial({ color: '#ff9a3a', transparent: true, opacity: 0.9, toneMapped: false }));
    llamaMina.position.set(hx, 0.5, hz);
    g.add(llamaMina);
    mundo.animados.push((dt, t) => { const k = 1 + Math.sin(t * 12) * 0.1 + Math.sin(t * 6.7) * 0.07; llamaMina.scale.set(k, 1 + Math.sin(t * 9) * 0.15, k); llamaMina.rotation.y += dt * 2; });
    mundo.hogueras.push({ pos: new THREE.Vector3(mx + hx, my + 0.6, mz + hz) });
    escena.add(g);
    g.traverse((m) => { if (m.isMesh && m !== llamaMina) mundo.ocluyentes.push(m); });
    colisor(mx - 8.5, mx + 8.5, mz + 5, mz + 9.5, my - 1, my + 8);
    colisor(mx - 2.2, mx - 1.6, mz + 2.0, mz + 2.6, my - 1, my + 3.1);
    colisor(mx + 1.6, mx + 2.2, mz + 2.0, mz + 2.6, my - 1, my + 3.1);
    interactivo('caja_mina', mx - 3.4, my + 0.6, mz + 1.1, 1.4);
    mundo.puntos.caja_mina = new THREE.Vector3(mx - 3.4, my + 0.8, mz + 0.6);
    interactivo('cont:cajon_mina', mx + 3.4, my + 0.6, mz - 0.4, 1.4);
    interactivo('hoguera:mina', mx + hx, my + 0.6, mz + hz, 2);
  }

  // ---------- granja de los Nogales (manada de perros) ----------
  {
    const gx = 118, gz = -72, gy = altura(gx, gz);
    const g = new THREE.Group();
    g.position.set(gx, gy, gz);
    const tabla = mat('#9a7a52', { tex: 'madera' }), tablaGris = mat('#7d6e5c', { tex: 'madera' });
    // Casa de la granja (cabaña con hueco de puerta)
    const W = 7, D = 6, H = 3;
    caja(g, W, 0.2, D, tablaGris, 0, 0.1, 0);
    caja(g, W, H, 0.25, tabla, 0, H / 2, -D / 2); // fondo
    caja(g, 0.25, H, D, tabla, -W / 2, H / 2, 0); // oeste
    caja(g, 0.25, H, D, tabla, W / 2, H / 2, 0); // este
    // Frente con hueco de puerta
    caja(g, (W - 1.4) / 2, H, 0.25, tabla, -(W + 1.4) / 4, H / 2, D / 2);
    caja(g, (W - 1.4) / 2, H, 0.25, tabla, (W + 1.4) / 4, H / 2, D / 2);
    caja(g, 1.6, 0.8, 0.25, tabla, 0, H - 0.4, D / 2);
    // Tejado a dos aguas
    const t1 = caja(g, W + 0.6, 0.2, D * 0.62, tablaGris, 0, H + 0.6, -D * 0.26);
    t1.rotation.x = -0.5;
    const t2 = caja(g, W + 0.6, 0.2, D * 0.62, tablaGris, 0, H + 0.6, D * 0.26);
    t2.rotation.x = 0.5;
    // Alacena dentro, al fondo
    caja(g, 1.1, 1.6, 0.5, mat('#6b4a2e', { tex: 'madera' }), -2.2, 0.8, -D / 2 + 0.6);
    // Pozo seco
    const pr = cilindro(g, 1.0, 1.1, 1.2, 14, mat('#8a7a66', { tex: 'piedra' }), 5.5, 0.6, 3.5);
    caja(g, 0.2, 1.5, 0.2, maderaOsc, 4.9, 1.2, 3.5);
    caja(g, 0.2, 1.5, 0.2, maderaOsc, 6.1, 1.2, 3.5);
    caja(g, 1.6, 0.2, 0.3, maderaOsc, 5.5, 2.0, 3.5);
    // Depósito de agua seco
    if (!poner('deposito_agua', { alto: 3.4 }, -6, 0, 4, 0.5, { padre: g, colision: 0 })) cilindro(g, 1.3, 1.3, 2.6, 12, mat('#7a6a55', { metalness: 0.2 }), -6, 1.3, 4);
    // Vallas rotas
    for (let i = 0; i < 6; i++) { const px = -7 + i * 2.6; if (R() < 0.3) continue; caja(g, 0.14, 1.0, 0.14, tablaGris, px, 0.5, 7.5); if (i < 5) caja(g, 2.6, 0.1, 0.1, tablaGris, px + 1.3, 0.7, 7.5); }
    // Nogales secos
    for (const [tx, tz] of [[-8, -6], [9, -4]]) if (!poner('ph_dead_tree_trunk', { largo: 3 }, tx, 0, tz, R() * 6, { padre: g })) cilindro(g, 0.2, 0.3, 3, 6, maderaOsc, tx, 1.5, tz);
    escena.add(g);
    g.traverse((m) => { if (m.isMesh) mundo.ocluyentes.push(m); });
    // Colisores de la casa (cuatro paredes) y el pozo
    colisor(gx - W / 2, gx + W / 2, gz - D / 2 - 0.2, gz - D / 2 + 0.2, gy - 1, gy + H);
    colisor(gx - W / 2 - 0.2, gx - W / 2 + 0.2, gz - D / 2, gz + D / 2, gy - 1, gy + H);
    colisor(gx + W / 2 - 0.2, gx + W / 2 + 0.2, gz - D / 2, gz + D / 2, gy - 1, gy + H);
    colisor(gx + 4.4, gx + 6.6, gz + 2.4, gz + 4.6, gy - 1, gy + 1.2);
    interactivo('alacena_granja', gx - 2.2, gy + 1.0, gz - D / 2 + 1.1, 1.5);
    mundo.puntos.alacena_granja = new THREE.Vector3(gx - 2.2, gy + 1.2, gz - D / 2 + 0.6);
    interactivo('cont:arcon_granja', gx + 2.4, gy + 0.6, gz - D / 2 + 0.7, 1.4);
  }

  // ---------- caravana calcinada (junto al camino de Ocaso) ----------
  {
    const cx = 72, cz = 4, cy = alturaMin(cx, cz, 3.5);
    const g = new THREE.Group();
    g.position.set(cx, cy, cz);
    const quemado = mat('#2a2420'), quemadoClaro = mat('#3c352d'), ceniza = mat('#39342f');
    // Suelo de ceniza
    const mancha = new THREE.Mesh(new THREE.CircleGeometry(5, 18), ceniza);
    mancha.rotation.x = -Math.PI / 2;
    mancha.position.y = 0.03;
    mancha.receiveShadow = true;
    g.add(mancha);
    // Chasis del carromato quemado
    caja(g, 2.2, 0.3, 4.2, quemado, 0, 0.6, 0);
    caja(g, 2.0, 0.6, 1.0, quemadoClaro, 0, 1.0, -1.3); // caja delantera medio entera
    // Arcos del toldo, calcinados y torcidos
    for (let i = 0; i < 4; i++) {
      const arco = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.04, 5, 10, Math.PI), quemado);
      arco.position.set(0, 0.75, 1.3 - i * 0.9);
      arco.rotation.set(0, Math.PI / 2, (R() - 0.5) * 0.4);
      arco.castShadow = true;
      g.add(arco);
    }
    // Ruedas: una en su sitio, otra caída
    for (const [wx, wz, caida] of [[1.15, -1, 0], [-1.15, -1, 0], [1.15, 1.3, 0], [-1.6, 1.6, 1]]) {
      const w = cilindro(g, 0.6, 0.6, 0.12, 12, quemadoClaro, wx, caida ? 0.12 : 0.6, wz);
      w.rotation.z = caida ? 0 : Math.PI / 2;
      if (caida) w.rotation.x = Math.PI / 2;
    }
    // Cajas desperdigadas y un esqueleto junto a los restos
    for (let i = 0; i < 3; i++) { const b = caja(g, 0.6, 0.6, 0.6, i ? quemadoClaro : madera, -2.5 + R() * 5, 0.3, 2 + R() * 2); b.rotation.y = R(); }
    const esq = new THREE.Group();
    esq.position.set(2.2, 0.1, 1.2);
    esq.rotation.y = 0.8;
    caja(esq, 0.3, 0.1, 0.7, mat('#d8cdb6'), 0, 0.06, 0);
    const craneo = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat('#e4dbc6'));
    craneo.position.set(0, 0.1, -0.45);
    esq.add(craneo);
    g.add(esq);
    escena.add(g);
    colisor(cx - 1.2, cx + 1.2, cz - 2.2, cz + 2.2, cy - 1, cy + 1.3);
    interactivo('restos_caravana', cx, cy + 0.8, cz - 1.3, 1.8);
    mundo.puntos.restos_caravana = new THREE.Vector3(cx, cy + 0.8, cz - 1.3);
  }

  // ---------- arroyo: huesos y nidos ----------
  for (let i = 0; i < 14; i++) {
    const x = -60 + R() * 130, cauce = -125 + Math.sin(x * 0.028) * 12 + Math.sin(x * 0.071) * 4, z = cauce + (R() - 0.5) * 10;
    const y = altura(x, z);
    if (R() < 0.5) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat('#8a7461'));
      n.scale.set(1.4, 0.45, 1.2);
      n.position.set(x, y - 0.05, z);
      n.receiveShadow = true;
      escena.add(n);
      for (let k = 0; k < 3; k++) {
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), mat('#e8dfc8'));
        h.scale.y = 1.3;
        h.position.set(x + (R() - 0.5) * 0.6, y + 0.45, z + (R() - 0.5) * 0.6);
        escena.add(h);
      }
    } else {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 4), mat('#e4dccb'));
      b.rotation.set(Math.PI / 2, R() * 3, 0);
      b.position.set(x, alturaMin(x, z, 0.6) + 0.05, z);
      escena.add(b);
    }
  }

  // ---------- vegetación y rocas (instanciadas) ----------
  const libre = (x, z, margen) => {
    for (const l of LLANOS) if (Math.hypot(x - l.x, z - l.z) < l.r * 0.85 + margen) return false;
    if (enCamino(x, z) < 4 + margen) return false;
    return Math.hypot(x, z) < 245;
  };
  function instancias(geom, material, n, colocar, colores) {
    const im = new THREE.InstancedMesh(geom, material, n);
    im.castShadow = true;
    im.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let k = 0, intentos = 0;
    while (k < n && intentos < n * 30) {
      intentos++;
      const r = colocar();
      if (!r) continue;
      p.set(r.x, r.y, r.z);
      e.set(r.rx || 0, r.ry || 0, r.rz || 0);
      q.setFromEuler(e);
      s.set(r.sx, r.sy, r.sz);
      m4.compose(p, q, s);
      im.setMatrixAt(k, m4);
      if (colores) im.setColorAt(k, new THREE.Color(colores[Math.floor(R() * colores.length)]).multiplyScalar(0.85 + R() * 0.3));
      if (r.colisor) colisor(r.x - r.colisor, r.x + r.colisor, r.z - r.colisor, r.z + r.colisor, r.y - 1, r.y + r.alto);
      k++;
    }
    im.count = k;
    escena.add(im);
    return im;
  }
  // Instancias de un modelo descargado: una InstancedMesh por pieza, todas con las mismas posiciones.
  // Se reparten por celdas de 140 m para que la cámara descarte las que no ve y las lejanas se oculten.
  const CELDA = 140;
  function instanciasModelo(lista, n, colocar, sombra = true) {
    if (!lista || !lista.length) return false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    const porCelda = new Map();
    let k = 0, intentos = 0;
    while (k < n && intentos < n * 30) {
      intentos++;
      const r = colocar();
      if (!r) continue;
      pos.set(r.x, r.y, r.z);
      e.set(r.rx || 0, r.ry || 0, r.rz || 0);
      q.setFromEuler(e);
      s.set(r.sx, r.sy, r.sz);
      m4.compose(pos, q, s);
      const clave = `${Math.floor(r.x / CELDA)},${Math.floor(r.z / CELDA)}`;
      if (!porCelda.has(clave)) porCelda.set(clave, []);
      porCelda.get(clave).push(m4.clone());
      if (r.colisor) colisor(r.x - r.colisor, r.x + r.colisor, r.z - r.colisor, r.z + r.colisor, r.y - 1, r.y + r.alto);
      k++;
    }
    const tmp = new THREE.Matrix4();
    for (const [clave, matrices] of porCelda) {
      const [cx, cz] = clave.split(',').map(Number);
      const celda = { centro: new THREE.Vector3((cx + 0.5) * CELDA, 0, (cz + 0.5) * CELDA), mallas: [] };
      for (const p of lista) {
        const im = new THREE.InstancedMesh(p.geometria, p.material, matrices.length);
        matrices.forEach((m, i) => im.setMatrixAt(i, p.matriz ? tmp.multiplyMatrices(m, p.matriz) : m));
        im.castShadow = sombra;
        im.receiveShadow = true;
        im.userData.total = matrices.length;
        im.computeBoundingSphere();
        escena.add(im);
        celda.mallas.push(im);
      }
      mundo.celdas.push(celda);
    }
    return true;
  }
  const verticalAlto = (m) => {
    m.updateWorldMatrix(true, false);
    const t = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    return t.y > 3 * Math.max(t.x, t.z) && m.geometry.attributes.position.count < 10000;
  };
  const ponerSaguaros = instanciasModelo(piezas('saguaro', { alto: 5 }, { filtro: verticalAlto }), 150, () => {
    const x = (R() - 0.5) * 480, z = (R() - 0.5) * 480;
    if (!libre(x, z, 3)) return null;
    const sc = 0.65 + R() * 0.6;
    return { x, y: alturaMin(x, z, 0.45 * sc) - 0.12, z, ry: R() * 6.3, sx: sc, sy: sc * (0.85 + R() * 0.3), sz: sc, colisor: 0.4, alto: 4 };
  });
  instanciasModelo(piezas('joshua', { alto: 4.5 }), 40, () => {
    const x = (R() - 0.5) * 460, z = (R() - 0.5) * 460;
    if (!libre(x, z, 5)) return null;
    const sc = 0.7 + R() * 0.6;
    return { x, y: alturaMin(x, z, 1.1 * sc) - 0.12, z, ry: R() * 6.3, sx: sc, sy: sc, sz: sc, colisor: 0.5, alto: 4 };
  });
  instanciasModelo(piezas('ph_dead_tree_trunk', { largo: 3.2 }), 30, () => {
    const x = (R() - 0.5) * 460, z = (R() - 0.5) * 460;
    if (!libre(x, z, 2)) return null;
    const sc = 0.7 + R() * 0.7;
    return { x, y: alturaMin(x, z, 1.6 * sc) - 0.08, z, ry: R() * 6.3, sx: sc, sy: sc, sz: sc };
  });
  const rocasModelo = variantes('rocas');
  rocasModelo.forEach((v, i) => instanciasModelo([v], 34, () => {
    const x = (R() - 0.5) * 500, z = (R() - 0.5) * 500;
    if (!libre(x, z, 1)) return null;
    const s = 0.8 + R() ** 2 * (i >= 5 ? 6 : 3);
    return { x, y: alturaMin(x, z, s * 0.45) - s * 0.06, z, ry: R() * 6, sx: s, sy: s, sz: s, colisor: s > 2.5 ? s * 0.35 : 0, alto: s * 0.5 };
  }));
  const matorralModelo = instanciasModelo(piezas('ph_wild_rooibos_bush', { alto: 1 }), 200, () => {
    const x = (R() - 0.5) * 500, z = (R() - 0.5) * 500;
    if (!libre(x, z, -2) && R() > 0.15) return null;
    if (enCamino(x, z) < 2.5 || Math.hypot(x, z) < 40 || Math.hypot(x - 150, z - 30) < 20) return null;
    const s = 0.6 + R() * 0.9;
    return { x, y: alturaMin(x, z, 0.45 * s) - 0.06, z, ry: R() * 6, sx: s, sy: s, sz: s };
  }, false);
  instanciasModelo(piezas('ph_cheiridopsis_succulent', { alto: 0.35 }), 180, () => {
    const x = (R() - 0.5) * 500, z = (R() - 0.5) * 500;
    if (enCamino(x, z) < 2.5 || Math.hypot(x, z) < 30) return null;
    const s = 0.7 + R() * 1.2;
    return { x, y: altura(x, z) - 0.03, z, ry: R() * 6, sx: s, sy: s, sz: s };
  }, false);

  // Saguaro hecho por código (solo si no cargó el modelo)
  if (!ponerSaguaros) {
    const partes = [];
    const tronco = new THREE.CylinderGeometry(0.3, 0.36, 4.2, 7);
    tronco.translate(0, 2.1, 0);
    partes.push(tronco);
    const tapa = new THREE.SphereGeometry(0.3, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    tapa.translate(0, 4.2, 0);
    partes.push(tapa);
    for (const [s, hy, alto] of [[1, 1.8, 1.4], [-1, 2.4, 1.0]]) {
      const codo = new THREE.CylinderGeometry(0.2, 0.2, 0.75, 6);
      codo.rotateZ(Math.PI / 2);
      codo.translate(s * 0.55, hy, 0);
      const brazo = new THREE.CylinderGeometry(0.2, 0.22, alto, 6);
      brazo.translate(s * 0.88, hy + alto / 2 - 0.05, 0);
      const t2 = new THREE.SphereGeometry(0.2, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2);
      t2.translate(s * 0.88, hy + alto - 0.05, 0);
      partes.push(codo, brazo, t2);
    }
    const geoCactus = mergeGeometries(partes.map((p) => p.toNonIndexed()));
    instancias(geoCactus, mat('#ffffff'), 150, () => {
      const x = (R() - 0.5) * 480, z = (R() - 0.5) * 480;
      if (!libre(x, z, 3)) return null;
      const sc = 0.7 + R() * 0.7;
      return { x, y: altura(x, z) - 0.1, z, ry: R() * 6.3, sx: sc, sy: sc * (0.8 + R() * 0.5), sz: sc, colisor: 0.4, alto: 4 };
    }, ['#5d7a45', '#6a8450', '#52703f']);
  }
  // Rocas hechas por código (pocas si hay modelos, para variar)
  {
    const g1 = new THREE.IcosahedronGeometry(1, 0);
    const nRocas = rocasModelo.length ? 70 : 280;
    const p = g1.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + R() * 0.4), p.getY(i) * (0.7 + R() * 0.3), p.getZ(i) * (0.8 + R() * 0.4));
    g1.computeVertexNormals();
    instancias(g1, mat('#ffffff'), nRocas, () => {
      const x = (R() - 0.5) * 500, z = (R() - 0.5) * 500;
      if (!libre(x, z, 1)) return null;
      const s = 0.4 + R() ** 2 * 3.2;
      return { x, y: altura(x, z) - s * 0.25, z, rx: R(), ry: R() * 6, rz: R(), sx: s * (0.8 + R() * 0.6), sy: s * (0.5 + R() * 0.4), sz: s, colisor: s > 1.4 ? s * 0.7 : 0, alto: s };
    }, ['#9a6448', '#8a5a40', '#a67b5b', '#7c5a4a', '#b08a68']);
  }
  // Matorral hecho por código (menos si hay modelos)
  {
    const g1 = new THREE.IcosahedronGeometry(0.7, 0);
    instancias(g1, mat('#ffffff'), matorralModelo ? 120 : 460, () => {
      const x = (R() - 0.5) * 500, z = (R() - 0.5) * 500;
      if (!libre(x, z, -2) && R() > 0.15) return null;
      if (enCamino(x, z) < 2.5) return null;
      if (Math.hypot(x - 0, z - 0) < 40 || Math.hypot(x - 150, z - 30) < 20) return null;
      const s = 0.5 + R() * 0.9;
      return { x, y: altura(x, z) + 0.15 * s, z, ry: R() * 6, sx: s, sy: s * 0.55, sz: s * (0.8 + R() * 0.4) };
    }, ['#7d7a45', '#8d7f4c', '#6c6a3c', '#9a8a5a']);
  }
  // Árboles secos
  {
    const partes = [];
    const t = new THREE.CylinderGeometry(0.12, 0.2, 3, 5);
    t.translate(0, 1.5, 0);
    partes.push(t.toNonIndexed());
    for (let i = 0; i < 4; i++) {
      const r = new THREE.CylinderGeometry(0.04, 0.08, 1.6, 4);
      r.translate(0, 0.8, 0);
      r.rotateZ(0.7 + i * 0.15);
      r.rotateY((i / 4) * Math.PI * 2);
      r.translate(0, 2.2 + i * 0.2, 0);
      partes.push(r.toNonIndexed());
    }
    instancias(mergeGeometries(partes), mat('#5a4535'), 45, () => {
      const x = (R() - 0.5) * 460, z = (R() - 0.5) * 460;
      if (!libre(x, z, 2)) return null;
      const s = 0.8 + R() * 0.8;
      return { x, y: alturaMin(x, z, 0.25) - 0.06, z, ry: R() * 6, rz: (R() - 0.5) * 0.2, sx: s, sy: s, sz: s, colisor: 0.25, alto: 3 };
    });
  }

  // ---------- polvo en el aire ----------
  // Poco, fino y cerca del suelo: con más parecían bichos o trozos de algo flotando
  {
    const n = 220, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) p.set([(R() - 0.5) * 80, R() * 6, (R() - 0.5) * 80], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    mundo.polvo = new THREE.Points(g, new THREE.PointsMaterial({ color: '#f2d9b0', size: 0.035, transparent: true, opacity: 0.3, depthWrite: false }));
    mundo.polvo.frustumCulled = false;
    // Apagado: aun finas, las motas se leían como cosas flotando en el aire
    mundo.polvo.visible = false;
    escena.add(mundo.polvo);
  }

  // ---------- funciones del mundo ----------
  const dirSol = new THREE.Vector3();
  let iLuzActual = 3;

  mundo.ponerHora = (h, centro) => {
    const k = muestraCiclo(h);
    const t = (h - 6) / 13.6;
    const sobre = t > 0 && t < 1;
    dirSol.set(Math.cos(Math.PI * t), Math.sin(Math.PI * t) * 1.05, 0.38).normalize();
    cieloMat.uniforms.cArriba.value.copy(k.arriba);
    cieloMat.uniforms.cHorizonte.value.copy(k.horiz);
    cieloMat.uniforms.cAbajo.value.copy(k.abajo);
    cieloMat.uniforms.cSol.value.copy(k.sol);
    cieloMat.uniforms.dirSol.value.copy(dirSol);
    escena.fog.color.copy(k.niebla);
    const luzDir = sobre && dirSol.y > 0.04 ? dirSol : new THREE.Vector3(-0.35, 0.85, -0.4).normalize();
    sol.position.copy(centro).addScaledVector(luzDir, 120);
    sol.target.position.copy(centro);
    sol.color.copy(k.luz);
    sol.intensity = k.iLuz;
    iLuzActual = k.iLuz;
    hemi.color.copy(k.cielo);
    hemi.groundColor.copy(k.suelo);
    hemi.intensity = k.iAmb;
    mesetaMat.color.set('#7a4a3a').lerp(k.horiz, 0.55).multiplyScalar(0.55 + 0.45 * Math.min(1, k.iLuz / 2));
    nubeMat.color.set('#ffffff').lerp(k.horiz, 0.45).lerp(k.sol, 0.15).multiplyScalar(0.35 + 0.65 * Math.min(1, k.iLuz / 2.5));
    nubeMat.opacity = 0.04 + 0.16 * Math.min(1, k.iLuz / 2.5);
    const noche = 1 - smooth(0.4, 1.4, k.iLuz);
    mundo.estrellas.material.opacity = noche * 0.9;
    ventanaMat.emissiveIntensity = 0.05 + noche * 2.4;
    for (const l of mundo.lamparas) {
      l.charco.material.opacity = noche * 0.55;
      l.farol.material.emissiveIntensity = 0.1 + noche * 3;
    }
    cielo.position.copy(centro);
    mundo.estrellas.position.copy(centro);
    mesetas.position.set(centro.x, 0, centro.z);
    mundo.noche = noche;
  };

  mundo.luzEn = (p) => {
    let l = clamp(iLuzActual / 3, 0.15, 1);
    if (mundo.noche > 0.2) {
      for (const lp of mundo.lamparas) if (lp.pos.distanceTo(p) < 9) l += 0.45 * mundo.noche;
    }
    for (const f of mundo.hogueras) if (f.pos.distanceTo(p) < 11) l += 0.5;
    return clamp(l, 0.15, 1);
  };

  // ¿Hay línea de vista entre a y b? Comprueba muros y el terreno.
  mundo.lineaDeVista = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    for (const c of mundo.colisores) {
      if (c.id === 'puerta' && mundo.puertaAbierta) continue;
      let t0 = 0, t1 = 1;
      const ejes = [[a.x, dx, c.x0, c.x1], [a.y, dy, c.y0, c.y1], [a.z, dz, c.z0, c.z1]];
      let corta = true;
      for (const [o, d, mn, mx] of ejes) {
        if (Math.abs(d) < 1e-6) {
          if (o < mn || o > mx) { corta = false; break; }
        } else {
          let ta = (mn - o) / d, tb = (mx - o) / d;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) { corta = false; break; }
        }
      }
      if (corta && c.y1 - c.y0 > 1.2) return false;
    }
    for (const r of mundo.rejillas) if (cortaRejilla(r, a, b)) return false;
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      if (altura(a.x + dx * t, a.z + dz * t) > a.y + dy * t + 0.1) return false;
    }
    return true;
  };

  // Empuja un círculo fuera de los colisores. Devuelve true si chocó.
  mundo.empujar = (p, radio, alto = 1.8) => {
    let choco = false;
    for (const c of mundo.colisores) {
      if (c.id === 'puerta' && mundo.puertaAbierta) continue;
      if (p.y + alto < c.y0 || p.y > c.y1 - 0.3) continue;
      const qx = clamp(p.x, c.x0, c.x1), qz = clamp(p.z, c.z0, c.z1);
      let dx = p.x - qx, dz = p.z - qz;
      const d = Math.hypot(dx, dz);
      if (d >= radio) continue;
      choco = true;
      if (d > 1e-5) {
        p.x = qx + (dx / d) * radio;
        p.z = qz + (dz / d) * radio;
      } else {
        const op = [[p.x - c.x0, -1, 0], [c.x1 - p.x, 1, 0], [p.z - c.z0, 0, -1], [c.z1 - p.z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
        if (op[1]) p.x = op[1] < 0 ? c.x0 - radio : c.x1 + radio;
        else p.z = op[2] < 0 ? c.z0 - radio : c.z1 + radio;
      }
    }
    for (const r of mundo.rejillas) if (empujarRejilla(r, p, radio)) choco = true;
    return choco;
  };

  // Altura del suelo pisable: porches, la oficina de Ocaso y el suelo de los edificios con interior
  // (dentro de un edificio manda su suelo aunque el terreno quede un poco más alto).
  mundo.suelo = (x, z) => {
    let h = altura(x, z);
    for (const p of mundo.plataformas) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) h = Math.max(h, p.y);
    for (const r of mundo.rejillas) {
      if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
      const s = sueloRejilla(r, x, z);
      if (s !== null) h = s;
    }
    return h;
  };

  // Calidad: distancia a la que se ve la vegetación y fracción de plantas que se dibujan
  mundo.calidad = { distancia: 230, densidad: 1 };
  let relojCeldas = 0;
  mundo.actualizar = (dt, t, centro) => {
    relojCeldas -= dt || 0.016;
    if (relojCeldas <= 0) {
      relojCeldas = 0.4;
      const { distancia, densidad } = mundo.calidad;
      for (const c of mundo.celdas) {
        const ver = Math.hypot(c.centro.x - centro.x, c.centro.z - centro.z) < distancia + CELDA * 0.7;
        for (const im of c.mallas) {
          im.visible = ver;
          im.count = Math.max(1, Math.round(im.userData.total * densidad));
        }
      }
    }
    for (const f of mundo.animados) f(dt, t);
    // Luz del edificio donde está el jugador (se apaga despacio al salir)
    let dentroDe = null;
    for (const it of mundo.interiores) {
      const r = it.r;
      if (centro.x > r.x0 && centro.x < r.x1 && centro.z > r.z0 && centro.z < r.z1 && sueloRejilla(r, centro.x, centro.z) !== null) { dentroDe = it; break; }
    }
    if (dentroDe && luzInterior.intensity < 0.05) luzInterior.position.copy(dentroDe.pos);
    const objetivoLuz = dentroDe && dentroDe.pos.distanceTo(luzInterior.position) < 0.1 ? dentroDe.fuerza : 0;
    // (siempre «visible» con intensidad 0 al salir: encenderla y apagarla obligaría a recompilar los shaders)
    luzInterior.intensity += (objetivoLuz - luzInterior.intensity) * Math.min(1, (dt || 0.016) * 4);
    mundo.interiorActual = dentroDe;
    const pp = mundo.polvo.geometry.attributes.position;
    for (let i = 0; mundo.polvo.visible && i < pp.count; i++) {
      let x = pp.getX(i) + dt * 0.6, z = pp.getZ(i) + dt * 0.25, y = pp.getY(i) + Math.sin(t + i) * dt * 0.1;
      if (x - centro.x > 40) x -= 80; if (x - centro.x < -40) x += 80;
      if (z - centro.z > 40) z -= 80; if (z - centro.z < -40) z += 80;
      if (y < altura(x, z) + 0.2 || y > centro.y + 5) y = Math.max(altura(x, z) + 0.3, centro.y + Math.random() * 4 - 1);
      pp.setXYZ(i, x, y, z);
    }
    pp.needsUpdate = true;
    nubes.rotation.y += dt * 0.002;
    if (mundo.balizaActiva) {
      const on = Math.sin(t * 3) > 0.2;
      mundo.baliza.baliza.material.emissiveIntensity = on ? 3 : 0.2;
      mundo.baliza.luzBaliza.intensity = on ? 18 : 0;
    }
    if (mundo.chorroBomba.visible) mundo.chorroBomba.scale.y = 1 + Math.sin(t * 20) * 0.05;
  };

  // Objetos de los encargos y encuentros: la caja perdida de una caravana y una caja donde
  // se sienta la viajera herida (sentada en el aire quedaba fatal)
  let cajaCaravana = null, asiento = null;
  mundo.cajaCaravana = (x, z) => {
    if (cajaCaravana) return;
    const y = alturaMin(x, z, 0.7);
    cajaCaravana = poner('ph_old_military_crate', { largo: 1.2 }, x, y - 0.02, z, 0.7);
    for (const [n, dx, dz, r] of [['ph_Barrel_01', 1.3, 0.6, 0.3], ['ph_rusted_wheel_rim_01', -1.4, 0.9, 1.2]]) poner(n, n.includes('Barrel') ? { alto: 1 } : { largo: 0.7 }, x + dx, alturaMin(x + dx, z + dz, 0.4), z + dz, r);
    interactivo('caja_caravana', x, y + 0.6, z, 1.8);
    mundo.puntos.caja_caravana = new THREE.Vector3(x, y + 0.6, z);
  };
  mundo.quitarCajaCaravana = () => {
    const i = mundo.interactivos.findIndex((it) => it.id === 'caja_caravana');
    if (i >= 0) mundo.interactivos.splice(i, 1);
  };
  mundo.asiento = (x, z) => {
    if (asiento) escena.remove(asiento);
    asiento = poner('ph_wooden_crate_01', { alto: 0.48 }, x, alturaMin(x, z, 0.4) - 0.02, z - 0.12, 0.2);
  };
  mundo.quitarAsiento = () => { if (asiento) escena.remove(asiento); asiento = null; };

  mundo.abrirPuerta = () => {
    mundo.puertaAbierta = true;
    mundo.puertaOcaso.rotation.y = -1.7;
  };
  mundo.repararBomba = () => {
    mundo.aguaBomba.visible = true;
    mundo.chorroBomba.visible = true;
  };
  mundo.activarBaliza = () => { mundo.balizaActiva = true; };
  mundo.abrirCajaFuerte = () => {
    mundo.puertaCaja.position.x += 0.3;
    mundo.puertaCaja.rotation.y = -1.2;
  };
  mundo.reiniciarBotellas = () => { for (const b of mundo.botellas) b.visible = true; };

  mundo.LUGARES = LUGARES;
  mundo.lineaPoligono = enCamino;
  mundo.alturaTerreno = altura;
  return mundo;
}
