// El brazal: un aparato de pantalla ámbar atado a la muñeca izquierda (la versión de Cobreseco del
// ordenador de pulsera). El brazo es 3D y cuelga de la cámara; la pantalla es HTML normal (#brazal),
// deformada con una homografía (matrix3d) para que encaje en las cuatro esquinas del cristal y siga
// siendo clicable. También lleva una linterna que se enciende con la L.
import * as THREE from 'three';
import { G } from './state.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, ...extra });

// Tamaño del panel HTML en píxeles CSS (16:10, como el cristal)
export const ANCHO = 800, ALTO = 500;
// Cristal en coordenadas del aparato: centro y medio ancho/alto
const CW = 0.11, CH = CW * (ALTO / ANCHO);

function crearModelo() {
  const raiz = new THREE.Group();
  const piel = mat('#b98563', { roughness: 0.75, metalness: 0 });
  const manga = mat('#4b3b2e', { roughness: 0.95, metalness: 0 });
  const metal = mat('#3b3a36', { metalness: 0.65, roughness: 0.42 });
  const cobre = mat('#b86b3a', { metalness: 0.85, roughness: 0.35 });
  const goma = mat('#1d1a17', { roughness: 0.9, metalness: 0 });
  // Antebrazo a lo largo de x (codo en -x, mano en +x); el aparato va encima (cara +y)
  const brazo = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.064, 0.62, 14).rotateZ(Math.PI / 2), manga);
  brazo.position.set(-0.36, -0.035, 0);
  const muneca = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.12, 14).rotateZ(Math.PI / 2), piel);
  muneca.position.set(0.17, -0.03, 0);
  // Mano cerrada en puño, medio escondida bajo el borde del aparato
  const mano = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10).scale(1.15, 0.8, 1), piel);
  mano.position.set(0.25, -0.045, 0.005);
  const pulgar = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.04, 4, 8).rotateZ(Math.PI / 2), piel);
  pulgar.position.set(0.24, -0.02, 0.05);
  // Cuerpo del aparato, con biseles de cobre, ruedas a la derecha y una antena corta
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.2), metal);
  cuerpo.position.set(-0.01, 0.025, 0);
  const marco = new THREE.Mesh(new THREE.BoxGeometry(CW * 2 + 0.016, 0.012, CH * 2 + 0.016), cobre);
  marco.position.set(-0.02, 0.058, 0);
  const cristal = new THREE.Mesh(new THREE.PlaneGeometry(CW * 2, CH * 2).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#120c05', emissive: '#3a2206', emissiveIntensity: 0.6, roughness: 0.2, metalness: 0 }));
  cristal.position.set(-0.02, 0.0652, 0);
  const correa1 = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.03, 16).rotateZ(Math.PI / 2), goma);
  correa1.position.set(-0.13, -0.03, 0);
  const correa2 = correa1.clone();
  correa2.position.x = 0.1;
  const piezas = [brazo, muneca, mano, pulgar, cuerpo, marco, cristal, correa1, correa2];
  for (let i = 0; i < 3; i++) {
    const rueda = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 12), i ? metal : cobre);
    rueda.position.set(0.13, 0.045, -0.06 + i * 0.05);
    piezas.push(rueda);
  }
  const antena = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.005, 0.05, 6), cobre);
  antena.position.set(-0.155, 0.07, -0.088);
  antena.rotation.z = 0.5;
  const luz = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd9a0' }));
  luz.position.set(-0.13, 0.03, 0.105);
  piezas.push(antena, luz);
  for (const p of piezas) { p.castShadow = false; p.receiveShadow = false; raiz.add(p); }
  raiz.userData.cristal = cristal;
  raiz.userData.luz = luz;
  return raiz;
}

// Homografía que lleva el rectángulo (0,0)-(w,h) a un cuadrilátero de pantalla (esquinas en orden
// arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda), como matrix3d de CSS.
export function homografia(w, h, q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(den) < 1e-9 ? 0 : (dx3 * dy2 - dx2 * dy3) / den;
  const k = Math.abs(den) < 1e-9 ? 0 : (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + k * y3, f = y0;
  return `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${k / h},0,0,1,0,${c},${f},0,1)`;
}

export function crearBrazal(camara) {
  const modelo = crearModelo();
  // Colocado delante de la cámara, ladeado para que el cristal mire al ojo
  const abajo = { pos: new THREE.Vector3(-0.12, -0.5, -0.32), rot: new THREE.Euler(0.6, 0.35, 0.5, 'YXZ') };
  const arriba = { pos: new THREE.Vector3(0.012, -0.03, -0.232), rot: new THREE.Euler(1.3, 0.04, 0.08, 'YXZ') };
  const qAbajo = new THREE.Quaternion().setFromEuler(abajo.rot), qArriba = new THREE.Quaternion().setFromEuler(arriba.rot);
  modelo.visible = false;
  camara.add(modelo);

  // Linterna del brazal: siempre en la escena con intensidad 0 al apagarla (encender y apagar
  // una luz obliga a recompilar todos los shaders y da un tirón)
  const linterna = new THREE.SpotLight('#ffe2b0', 0, 34, 0.55, 0.45, 1.3);
  linterna.position.set(-0.15, -0.15, 0);
  linterna.target.position.set(0, -0.6, -6);
  camara.add(linterna, linterna.target);

  // Haz de luz sobre cada marca del mapa, visible desde lejos (fuerte abajo y apagándose hacia arriba)
  const degradado = document.createElement('canvas');
  degradado.width = 4; degradado.height = 128;
  const dg = degradado.getContext('2d'), grad = dg.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.25, '#9a9a9a'); grad.addColorStop(1, '#000000');
  dg.fillStyle = grad; dg.fillRect(0, 0, 4, 128);
  const hazGeo = new THREE.CylinderGeometry(1, 1, 90, 10, 1, true).translate(0, 45, 0);
  const hazMat = new THREE.MeshBasicMaterial({ color: '#ffb547', map: new THREE.CanvasTexture(degradado), transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false });
  const haces = [];

  const panel = document.getElementById('brazal');
  const esquinas = [[-CW, -CH], [CW, -CH], [CW, CH], [-CW, CH]].map(([x, z]) => new THREE.Vector3(x - 0.02, 0.066, z));
  const v = new THREE.Vector3();
  let t = 0, abierto = false;

  const br = {
    modelo,
    get abierto() { return abierto; },
    get visible() { return t > 0.001; },
    abrir() { abierto = true; modelo.visible = true; },
    cerrar() { abierto = false; },
    marcasCambiaron() {
      for (const h of haces) G.escena.remove(h);
      haces.length = 0;
      for (const m of G.s.marcas || []) {
        const h = new THREE.Mesh(hazGeo, hazMat.clone());
        h.position.set(m.x, G.mundo.suelo(m.x, m.z), m.z);
        h.renderOrder = 3;
        G.escena.add(h);
        haces.push(h);
      }
    },
    linterna: false,
    alternarLinterna() {
      br.linterna = !br.linterna;
      G.audio?.clic();
      return br.linterna;
    },
    actualizar(dt) {
      const objetivo = abierto ? 1 : 0;
      t += Math.sign(objetivo - t) * Math.min(Math.abs(objetivo - t), dt / 0.32);
      const k = t * t * (3 - 2 * t);
      modelo.visible = t > 0.001;
      modelo.position.lerpVectors(abajo.pos, arriba.pos, k);
      modelo.quaternion.slerpQuaternions(qAbajo, qArriba, k);
      modelo.userData.luz.material.color.set(br.linterna ? '#fff1c9' : '#4a3a26');
      linterna.intensity += ((br.linterna ? 38 : 0) - linterna.intensity) * Math.min(1, dt * 12);
      // Los haces se ven del mismo grosor de lejos y se apagan al llegar a la marca
      for (const h of haces) {
        const d = Math.hypot(h.position.x - camara.position.x, h.position.z - camara.position.z);
        const r = Math.max(0.25, d * 0.004);
        h.scale.set(r, 1, r);
        h.material.opacity = 0.6 * Math.min(1, Math.max(0, (d - 5) / 25));
      }
      // El panel HTML solo se ve con el brazal arriba del todo; mientras sube, solo el cristal
      const listo = t > 0.98;
      panel.hidden = !(abierto && t > 0.6);
      panel.style.opacity = listo ? 1 : Math.max(0, (t - 0.6) / 0.38);
      if (panel.hidden) return;
      modelo.updateMatrixWorld(true);
      camara.updateMatrixWorld();
      const W = innerWidth, H = innerHeight;
      const q = esquinas.map((p) => {
        v.copy(p).applyMatrix4(modelo.matrixWorld).project(camara);
        return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H];
      });
      panel.style.transform = homografia(ANCHO, ALTO, q);
    },
  };
  return br;
}
