// Modelos descargados (Mixamo, Sketchfab y Poly Haven), ya convertidos a GLB comprimido.
// Cada modelo viene a una escala distinta: aquí se miden y se normalizan al tamaño que pide el juego.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as clonarConEsqueleto } from 'three/addons/utils/SkeletonUtils.js';

export const LISTA = [
  // Personajes y animaciones (Mixamo)
  'mx_ocana', 'mx_ines', 'mx_lupe', 'mx_paz', 'mx_chema', 'mx_nieves', 'mx_garza', 'mx_cuervo1', 'mx_cuervo2', 'animaciones',
  // Sketchfab
  'saguaro', 'joshua', 'rocas', 'deposito_agua', 'torre_radio', 'surtidor', 'bomba_mano',
  'tienda_campana', 'coche_oxidado', 'sedan', 'camion', 'terminal', 'esqueleto', 'lobo', 'geco',
  // Poly Haven
  'ph_Barrel_01', 'ph_CashRegister_01', 'ph_Lantern_01', 'ph_WoodenChair_01', 'ph_bolt_action_rifle_7_62',
  'ph_cheiridopsis_succulent', 'ph_dead_tree_trunk', 'ph_metal_jerrycan', 'ph_metal_office_desk', 'ph_old_military_crate',
  'ph_old_tyre', 'ph_portable_generator', 'ph_rusted_wheel_rim_01', 'ph_service_pistol', 'ph_stone_fire_pit',
  'ph_utility_box_01', 'ph_wild_rooibos_bush', 'ph_wooden_crate_01',
  // Casas con interior (Sketchfab) y muebles (Poly Haven)
  'casa_vieja', 'tienda_abandonada', 'chabola', 'banco', 'saloon_interior', 'oficina_sheriff', 'casa_oeste', 'cama_medica',
  'ph_WoodenTable_02', 'ph_wooden_stool_02', 'ph_Shelf_01', 'ph_wooden_bookshelf_worn', 'ph_steel_frame_shelves_01',
  'ph_old_bed_frame', 'ph_vintage_cabinet_01', 'ph_medical_box', 'ph_Rockingchair_01', 'ph_bar_chair_round_01',
  'ph_wine_barrel_01', 'ph_wooden_display_shelves_01', 'ph_vintage_oil_lamp', 'ph_wall_clock', 'ph_ceiling_fan',
];

const cache = {};

export async function cargarModelos(progreso) {
  const cargador = new GLTFLoader();
  cargador.setMeshoptDecoder(MeshoptDecoder);
  let hechos = 0;
  // En la versión publicada cada GLB va en base64 dentro de un .json; en local se lee el .glb.
  const leer = async (n) => {
    const r = await fetch(`modelos/${n}.json`);
    if (r.ok) {
      const { glb } = await r.json();
      const bin = Uint8Array.from(atob(glb), (c) => c.charCodeAt(0));
      return cargador.parseAsync(bin.buffer, 'modelos/');
    }
    return cargador.loadAsync(`modelos/${n}.glb`);
  };
  // Seis descargas a la vez como mucho, y un reintento: con todas a la vez el servidor
  // cortaba conexiones y algunas casas se quedaban sin cargar.
  const cola = [...LISTA];
  const trabajador = async () => {
    while (cola.length) {
      const n = cola.shift();
      for (let intento = 0; intento < 2; intento++) {
        try {
          cache[n] = await leer(n);
          cache[n].scene.updateMatrixWorld(true);
          break;
        } catch (e) {
          if (intento) { console.warn('No se pudo cargar', n, e); cache[n] = null; }
        }
      }
      hechos++;
      progreso?.(hechos / LISTA.length, hechos, LISTA.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, trabajador));
}

export const hay = (n) => !!cache[n];
export const gltf = (n) => cache[n];

// Caja que envuelve el modelo, teniendo en cuenta los huesos de las mallas con esqueleto.
// Las mallas normales se miden vértice a vértice: girar la caja de la geometría la agranda,
// y con una caja más grande de la cuenta el modelo quedaba flotando sobre el suelo.
const vMedir = new THREE.Vector3();
export function medir(raiz) {
  raiz.updateMatrixWorld(true);
  const caja = new THREE.Box3(), b = new THREE.Box3();
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) {
      o.skeleton.update(); o.computeBoundingBox(); b.copy(o.boundingBox);
      b.applyMatrix4(o.matrixWorld);
    } else {
      b.makeEmpty();
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) b.expandByPoint(vMedir.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
    }
    caja.union(b);
  });
  return caja;
}

function sombras(o) {
  o.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = !m.isSkinnedMesh;
    }
  });
}

// Copia del modelo dentro de un grupo, escalada a una medida y apoyada en y = 0.
// medida: { alto } | { largo } (lado horizontal mayor) | { ancho } | { escala } ; girar: rotación Y previa.
// centrar = false deja x y z como en el modelo original (por la escala), útil para amueblar por dentro.
// filtro(malla): quita del modelo las mallas que no interesan (suelos de exposición, packs con varias copias…).
export function crear(nombre, medida = {}, { girar = 0, centrar = true, filtro = null } = {}) {
  const g = cache[nombre];
  if (!g) return null;
  const copia = g.scene.getObjectByProperty('isSkinnedMesh', true) ? clonarConEsqueleto(g.scene) : g.scene.clone(true);
  if (filtro) {
    const fuera = [];
    copia.traverse((m) => { if (m.isMesh && !filtro(m)) fuera.push(m); });
    fuera.forEach((m) => m.parent.remove(m));
  }
  copia.rotation.y = girar;
  const envoltura = new THREE.Group();
  envoltura.add(copia);
  const caja = medir(envoltura);
  const t = caja.getSize(new THREE.Vector3());
  let k = 1;
  if (medida.escala) k = medida.escala;
  else if (medida.alto) k = medida.alto / t.y;
  else if (medida.largo) k = medida.largo / Math.max(t.x, t.z);
  else if (medida.ancho) k = medida.ancho / Math.min(t.x, t.z);
  copia.scale.multiplyScalar(k);
  const c = medir(envoltura);
  const centro = c.getCenter(new THREE.Vector3());
  copia.position.y -= c.min.y;
  if (centrar) { copia.position.x -= centro.x; copia.position.z -= centro.z; }
  sombras(envoltura);
  envoltura.userData.modelo = nombre;
  envoltura.userData.animaciones = g.animations;
  return envoltura;
}

// Personaje de Mixamo de un alto dado, medido con sus huesos (cabeza y pies).
export function crearPersonaje(nombre, alto = 1.78) {
  const g = cache[nombre];
  if (!g) return null;
  const copia = clonarConEsqueleto(g.scene);
  const envoltura = new THREE.Group();
  envoltura.add(copia);
  envoltura.updateMatrixWorld(true);
  const cabeza = buscarHueso(copia, 'mixamorigHeadTop_End') || buscarHueso(copia, 'mixamorigHead');
  const pie = buscarHueso(copia, 'mixamorigLeftToeBase') || buscarHueso(copia, 'mixamorigLeftFoot');
  let k = 1;
  if (cabeza && pie) {
    const yc = cabeza.getWorldPosition(new THREE.Vector3()).y, yp = pie.getWorldPosition(new THREE.Vector3()).y;
    k = alto / Math.max(0.01, yc - yp + 0.05);
    copia.scale.multiplyScalar(k);
    envoltura.updateMatrixWorld(true);
    copia.position.y -= pie.getWorldPosition(new THREE.Vector3()).y - 0.03;
  } else {
    const t = medir(envoltura).getSize(new THREE.Vector3());
    copia.scale.multiplyScalar(alto / t.y);
  }
  sombras(envoltura);
  envoltura.userData.modelo = nombre;
  return envoltura;
}

// Estructura del esqueleto: por cada hueso (con nombre base), su padre, su giro local en reposo
// y su giro en el mundo en reposo, en orden de la cadera hacia las puntas.
function infoEsqueleto(raiz) {
  const huesos = new Map();
  if (!raiz) return { huesos, orden: [], raizMundo: new THREE.Quaternion() };
  raiz.updateMatrixWorld(true);
  let raizMundo = new THREE.Quaternion();
  raiz.traverse((o) => {
    if (!(o.isBone || o.name.startsWith("mixamorig"))) return;
    const b = huesoBase(o.name);
    if (huesos.has(b)) return;
    const p = o.parent;
    const padre = p && (p.isBone || p.name.startsWith("mixamorig")) ? huesoBase(p.name) : null;
    if (!padre && p) raizMundo = p.getWorldQuaternion(new THREE.Quaternion());
    huesos.set(b, { padre, reposo: o.quaternion.clone(), altura: o.position.length(), profundidad: 0 });
  });
  for (const [, h] of huesos) { let d = 0, x = h; while (x && x.padre && d < 200) { x = huesos.get(x.padre); d++; } h.profundidad = d; }
  const orden = [...huesos.keys()].sort((a, b) => huesos.get(a).profundidad - huesos.get(b).profundidad);
  for (const b of orden) {
    const h = huesos.get(b);
    const padre = h.padre ? huesos.get(h.padre).mundoReposo : raizMundo;
    h.mundoReposo = new THREE.Quaternion().multiplyQuaternions(padre, h.reposo);
  }
  return { huesos, orden, raizMundo };
}

// Las animaciones de Mixamo nombran los huesos «mixamorigHips»… Algunos modelos repiten el
// esqueleto por cada malla («mixamorigHips_2»…) o usan otro prefijo («mixamorig8Hips»),
// así que cada pista se copia a todas las variantes.
const huesoBase = (n) => n.replace(/^mixamorig\d*/, 'mixamorig').replace(/_\d+$/, '');
const buscarHueso = (raiz, base) => {
  let r = null;
  raiz.traverse((o) => { if (!r && o.isBone && huesoBase(o.name) === base) r = o; });
  return r;
};
const clipsCache = new Map();
export function clipsPara(raiz) {
  const nombres = new Set();
  raiz.traverse((o) => { if (o.isBone) nombres.add(o.name); });
  const clave = raiz.userData.modelo || [...nombres].join().length;
  if (clipsCache.has(clave)) return clipsCache.get(clave);
  const base = cache.animaciones ? cache.animaciones.animations : [];
  const porHueso = new Map();
  for (const n of nombres) {
    const raizNombre = huesoBase(n);
    if (!porHueso.has(raizNombre)) porHueso.set(raizNombre, []);
    porHueso.get(raizNombre).push(n);
  }
  // Adaptación en coordenadas del mundo. Cada personaje tiene los ejes locales de los huesos
  // orientados a su manera; si se copia la rotación local tal cual, brazos y piernas se tuercen.
  // Para cada fotograma: giroMundo = mundoOrigen(t) · mundoOrigenReposo⁻¹, y se aplica sobre el
  // reposo del destino; después se vuelve a rotación local respecto al padre.
  const origen = infoEsqueleto(cache.animaciones ? cache.animaciones.scene : null);
  const destino = infoEsqueleto(raiz);
  // Copias del esqueleto colgadas de otra copia del mismo hueso (Ocaña trae once caderas, cada una
  // hija de la anterior). Ya se mueven con su padre: si también se animan, el giro se suma una vez
  // por copia y la ropa de esas piezas se retuerce al andar.
  const encadenados = new Set();
  raiz.traverse((o) => {
    if (o.isBone && o.parent && o.parent.isBone && huesoBase(o.parent.name) === huesoBase(o.name)) encadenados.add(o.name);
  });
  const clips = {};
  const q = new THREE.Quaternion(), qa = new THREE.Quaternion();
  for (const clip of base) {
    const interp = new Map();
    let pistaCadera = null;
    for (const p of clip.tracks) {
      const [hueso, prop] = p.name.split(".");
      if (prop === "quaternion") interp.set(huesoBase(hueso), p.createInterpolant());
      if (prop === "position" && huesoBase(hueso) === "mixamorigHips") pistaCadera = p;
    }
    const nCuadros = Math.max(2, Math.round(clip.duration * 30) + 1);
    const tiempos = new Float32Array(nCuadros);
    const valores = new Map(destino.orden.map((b) => [b, new Float32Array(nCuadros * 4)]));
    const mundoO = new Map(), mundoD = new Map();
    for (let f = 0; f < nCuadros; f++) {
      const t = Math.min(clip.duration, f / 30);
      tiempos[f] = t;
      for (const b of origen.orden) {
        const h = origen.huesos.get(b);
        const ip = interp.get(b);
        const local = ip ? q.fromArray(ip.evaluate(t)) : q.copy(h.reposo);
        const padre = h.padre ? mundoO.get(h.padre) : origen.raizMundo;
        mundoO.set(b, (mundoO.get(b) || new THREE.Quaternion()).multiplyQuaternions(padre, local));
      }
      for (const b of destino.orden) {
        const h = destino.huesos.get(b);
        const padre = h.padre ? mundoD.get(h.padre) : destino.raizMundo;
        const w = mundoD.get(b) || new THREE.Quaternion();
        const ho = origen.huesos.get(b);
        if (ho && mundoO.has(b)) {
          // mundo(t) · mundoReposoOrigen⁻¹ · mundoReposoDestino
          w.copy(mundoO.get(b)).multiply(qa.copy(ho.mundoReposo).invert()).multiply(h.mundoReposo);
        } else {
          w.multiplyQuaternions(padre, h.reposo);
        }
        mundoD.set(b, w);
        q.copy(padre).invert().multiply(w);
        q.toArray(valores.get(b), f * 4);
      }
    }
    const pistas = [];
    for (const b of destino.orden) {
      for (const nombre of porHueso.get(b) || []) {
        if (encadenados.has(nombre)) continue;
        pistas.push(new THREE.QuaternionKeyframeTrack(nombre + ".quaternion", tiempos, valores.get(b)));
      }
    }
    // La posición de la cadera solo se conserva al morir (para que el cuerpo caiga) y al sentarse
    if ((clip.name === "morir" || clip.name === "sentado") && pistaCadera && origen.huesos.get("mixamorigHips") && destino.huesos.get("mixamorigHips")) {
      // Se copia el desplazamiento respecto al reposo, no la posición: algunos modelos repiten el
      // esqueleto por pieza con la cadera en 0 y otra escala, y copiar la posición los estiraba.
      // La cadera «de pie» del origen se toma del primer fotograma de la animación de reposo
      const pistaReposo = base.find((c) => c.name === "reposo")?.tracks.find((p) => p.name.endsWith(".position") && huesoBase(p.name.split(".")[0]) === "mixamorigHips");
      const reposoO = pistaReposo ? new THREE.Vector3().fromArray(pistaReposo.values, 0) : new THREE.Vector3();
      const kBase = destino.huesos.get("mixamorigHips").altura / Math.max(1e-6, origen.huesos.get("mixamorigHips").altura);
      const variantes = (porHueso.get("mixamorigHips") || []).filter((n) => !encadenados.has(n)).map((n) => raiz.getObjectByName(n)).filter(Boolean);
      const escalaPadre = (o) => (o.parent ? o.parent.getWorldScale(new THREE.Vector3()).y : 1);
      const principal = variantes.find((o) => o.position.length() > 1e-6) || variantes[0];
      for (const hueso of variantes) {
        const k = kBase * escalaPadre(principal) / Math.max(1e-9, escalaPadre(hueso));
        const p = pistaCadera.clone();
        p.name = hueso.name + ".position";
        for (let i = 0; i < p.values.length; i += 3) {
          p.values[i] = hueso.position.x + (pistaCadera.values[i] - reposoO.x) * k;
          p.values[i + 1] = hueso.position.y + (pistaCadera.values[i + 1] - reposoO.y) * k;
          p.values[i + 2] = hueso.position.z + (pistaCadera.values[i + 2] - reposoO.z) * k;
        }
        pistas.push(p);
      }
    }
    clips[clip.name] = new THREE.AnimationClip(clip.name, clip.duration, pistas);
  }
  clipsCache.set(clave, clips);
  return clips;
}

// Deja solo los triángulos cuyo centro cae dentro de una caja (en coordenadas del modelo original).
// Sirve para packs que traen varias piezas en una sola malla, como la pistola con sus cargadores.
export function recortar(nombre, min, max) {
  const g = cache[nombre];
  if (!g || g.userData.recortado) return;
  g.userData.recortado = true;
  const caja = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((m) => {
    if (!m.isMesh) return;
    const geo = m.geometry, pos = geo.attributes.position;
    const idx = geo.index ? geo.index.array : [...Array(pos.count).keys()];
    const quedan = [];
    for (let t = 0; t < idx.length; t += 3) {
      a.fromBufferAttribute(pos, idx[t]).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, idx[t + 1]).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, idx[t + 2]).applyMatrix4(m.matrixWorld);
      if (caja.containsPoint(a.add(b).add(c).divideScalar(3))) quedan.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    geo.setIndex(quedan);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
  });
}

// Quita los triángulos que caen enteros dentro de alguna caja (coordenadas del modelo original):
// abre las puertas que el modelo trae cerradas. Cada caja: [x0, y0, z0, x1, y1, z1].
export function abrirHuecos(nombre, cajas) {
  const g = cache[nombre];
  if (!g || g.userData.huecos) return;
  g.userData.huecos = true;
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const dentro = (p) => cajas.some(([x0, y0, z0, x1, y1, z1]) => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1 && p.z > z0 && p.z < z1);
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((m) => {
    if (!m.isMesh) return;
    const geo = m.geometry, pos = geo.attributes.position;
    const idx = geo.index ? geo.index.array : [...Array(pos.count).keys()];
    const quedan = [];
    for (let t = 0; t < idx.length; t += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx[t + k]).applyMatrix4(m.matrixWorld);
      if (!v.every(dentro)) quedan.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    geo.setIndex(quedan);
  });
}

// Piezas de un modelo (geometría, material y matriz relativa) para instanciarlo cientos de veces.
export function piezas(nombre, medida, opciones) {
  const o = crear(nombre, medida, opciones);
  if (!o) return null;
  o.updateMatrixWorld(true);
  const lista = [];
  o.traverse((m) => { if (m.isMesh) lista.push({ geometria: m.geometry, material: m.material, matriz: m.matrixWorld.clone() }); });
  return lista;
}

// Cada malla de un pack (por ejemplo, el pack de rocas) como modelo independiente y centrado.
export function variantes(nombre, filtro = null) {
  const g = cache[nombre];
  if (!g) return [];
  g.scene.updateMatrixWorld(true);
  const lista = [];
  g.scene.traverse((m) => {
    if (!m.isMesh || (filtro && !filtro(m))) return;
    // La geometría viene cuantizada (enteros normalizados); se pasa a coma flotante antes de moverla
    const geo = new THREE.BufferGeometry();
    for (const [k, at] of Object.entries(m.geometry.attributes)) {
      const n = at.count, t = at.itemSize, f = new Float32Array(n * t);
      const leer = [at.getX, at.getY, at.getZ, at.getW];
      for (let i = 0; i < n; i++) for (let j = 0; j < t; j++) f[i * t + j] = leer[j].call(at, i);
      geo.setAttribute(k, new THREE.BufferAttribute(f, t));
    }
    if (m.geometry.index) geo.setIndex(m.geometry.index.clone());
    geo.applyMatrix4(m.matrixWorld);
    geo.computeBoundingBox();
    const b = geo.boundingBox, c = b.getCenter(new THREE.Vector3()), t = b.getSize(new THREE.Vector3());
    geo.translate(-c.x, -b.min.y, -c.z);
    const k = 1 / Math.max(t.x, t.y, t.z);
    geo.scale(k, k, k);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    lista.push({ geometria: geo, material: m.material });
  });
  return lista;
}
