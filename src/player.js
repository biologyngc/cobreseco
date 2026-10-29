// El jugador: movimiento en primera persona, armas, disparo, daño recibido,
// interacción y el modo de puntería M.I.R.A. Los modelos y animaciones de las armas están en armas.js.
import * as THREE from 'three';
import { G, cuenta, quitar } from './state.js';
import { OBJETOS } from './data.js';
import {
  dispersion, multHabilidad, probMira, PARTES, pamMaximos, vidaMaxima, danoTrasDT, specialEfectivo,
  cargaMaxima, pesoInventario, multEstadoDano, multEstadoDispersion, probAtasco,
} from './rules.js';
import { clamp, lerp } from './noise.js';
import { modeloArma, crearArmas } from './armas.js';

const ARRIBA = new THREE.Vector3(0, 1, 0);
const ORDEN_ARMAS = ['pistola9', 'revolver', 'subfusil', 'rifle308', 'carabina', 'escopeta', 'pico', 'machete'];

export class Jugador {
  constructor(camara, lienzo) {
    this.cam = camara;
    this.lienzo = lienzo;
    this.pos = new THREE.Vector3();
    this.velY = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.agachado = false;
    this.corriendo = false;
    this.moviendo = false;
    this.ruido = 0;
    this.altOjos = 1.62;
    this.teclas = new Set();
    this.cadencia = 0;
    this.apuntando = false;
    this.retroceso = 0;
    this.temblor = 0;
    this.bob = 0;
    this.cura = 0;
    this.pasos = 0;
    this.ratonX = 0;
    this.ratonY = 0;
    this.enfundada = false;
    this.disparoPendiente = false;
    this.armaG = new THREE.Group();
    this.cam.add(this.armaG);
    this.modelos = {};
    this.fogonazo = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshBasicMaterial({ color: '#ffd38a', transparent: true, opacity: 0, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }));
    this.fogonazo.renderOrder = 6;
    this.armaG.add(this.fogonazo);
    this.luzFogonazo = new THREE.PointLight('#ffb35a', 0, 12, 2);
    this.cam.add(this.luzFogonazo);
    this.luzLejos = 0;
    this.ray = new THREE.Raycaster();
    this.armas = crearArmas(this);
    this.entrada();
  }

  get arma() {
    const id = G.s.equipo.arma;
    return id ? { id, ...OBJETOS[id].arma } : null;
  }
  get recargando() { return this.armas.accion === 'recarga' ? 1 : 0; }
  get atascada() { const id = G.s.equipo.arma; return !!(id && G.s.atascadas?.[id]); }

  centro() {
    return new THREE.Vector3(this.pos.x, this.pos.y + (this.agachado ? 0.75 : 1.2), this.pos.z);
  }

  colocar(x, y, z, yaw) {
    this.pos.set(x, G.mundo.suelo(x, z), z);
    this.yaw = yaw;
    this.pitch = 0;
  }

  equiparModelo() {
    const id = G.s.equipo.arma;
    for (const k in this.modelos) this.modelos[k].visible = false;
    if (!id) return;
    if (!this.modelos[id]) {
      this.modelos[id] = modeloArma(id);
      this.armaG.add(this.modelos[id]);
    }
    this.modelos[id].visible = true;
    this.fogonazo.position.copy(this.modelos[id].userData.boca);
    this.fogonazo.visible = !OBJETOS[id].arma.cuerpo;
    if (G.s.cargadores[id] === undefined) G.s.cargadores[id] = 0;
  }

  // Cambio de arma con su animación: baja la que llevas y sube la nueva
  cambiarArma(id) {
    if (!cuenta(id)) { G.ui.toast(`No tienes ${OBJETOS[id].nombre}`); return; }
    if (G.s.equipo.arma === id && !this.enfundada) return;
    this.enfundada = false;
    if (!G.s.equipo.arma) { G.s.equipo.arma = id; this.equiparModelo(); G.ui.refrescar(); return; }
    this.armas.cambiar(() => { G.s.equipo.arma = id; this.equiparModelo(); G.ui.refrescar(); });
  }

  siguienteArma(paso) {
    const tengo = ORDEN_ARMAS.filter((id) => cuenta(id));
    if (!tengo.length) return;
    const i = tengo.indexOf(G.s.equipo.arma);
    this.cambiarArma(tengo[(i + paso + tengo.length) % tengo.length]);
  }

  // Enfundar: los vecinos dejan de verte como una amenaza (y el sheriff acepta tu rendición)
  alternarEnfundar() {
    if (!G.s.equipo.arma) return;
    this.enfundada = !this.enfundada;
    this.apuntando = false;
    G.audio?.clic();
    G.ui.toast(this.enfundada ? 'Arma enfundada' : 'Arma en la mano');
  }

  // ---------- entrada ----------
  entrada() {
    const L = this.lienzo;
    this.bloqueado = false;
    this.arrastre = null;
    document.addEventListener('pointerlockchange', () => {
      this.bloqueado = document.pointerLockElement === L;
      G.ui?.bloqueo(this.bloqueado);
    });
    document.addEventListener('pointerlockerror', () => { this.sinBloqueo = true; });
    L.addEventListener('mousedown', (e) => {
      if (!G.jugando || G.modal) return;
      if (!this.bloqueado && !this.sinBloqueo && e.button === 0) {
        try {
          const r = L.requestPointerLock();
          if (r && r.catch) r.catch(() => { this.sinBloqueo = true; });
        } catch { this.sinBloqueo = true; }
        return;
      }
      if (e.button === 2 && !this.enfundada) this.apuntando = true;
      if (e.button === 0) {
        if (this.bloqueado) this.disparoPendiente = true;
        else this.arrastre = { x: e.clientX, y: e.clientY, movido: 0 };
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.apuntando = false;
      if (e.button === 0 && this.arrastre) {
        if (this.arrastre.movido < 6 && G.jugando && !G.modal) this.disparoPendiente = true;
        this.arrastre = null;
      }
    });
    L.addEventListener('contextmenu', (e) => e.preventDefault());
    L.addEventListener('wheel', (e) => {
      if (!G.jugando || G.modal) return;
      this.siguienteArma(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
    window.addEventListener('mousemove', (e) => {
      if (!G.jugando || (G.modal && G.modal !== 'mira-ejecuta')) return;
      if (G.modal === 'mira-ejecuta') return;
      let dx = 0, dy = 0;
      if (this.bloqueado) { dx = e.movementX; dy = e.movementY; }
      else if (this.arrastre) {
        dx = e.clientX - this.arrastre.x; dy = e.clientY - this.arrastre.y;
        this.arrastre.movido += Math.abs(dx) + Math.abs(dy);
        this.arrastre.x = e.clientX; this.arrastre.y = e.clientY;
      }
      // Con la cabeza lisiada la vista tiembla un poco al moverla
      const sens = 0.0022 * (this.apuntando ? 0.5 : 1);
      this.yaw -= dx * sens;
      this.pitch = clamp(this.pitch - dy * sens, -1.45, 1.45);
      this.ratonX += dx;
      this.ratonY += dy;
    });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (G.ui?.tecla(e)) return;
      if (!G.jugando) return;
      if (G.modal) return;
      this.teclas.add(e.code);
      switch (e.code) {
        case 'KeyC': case 'ControlLeft': this.agachado = !this.agachado; break;
        case 'KeyE': this.interactuar(); break;
        case 'KeyR': this.recargar(); break;
        case 'KeyQ': this.abrirMira(); break;
        case 'KeyH': G.juego.usarObjeto('suero'); break;
        case 'KeyZ': this.alternarEnfundar(); break;
        case 'KeyG': this.lanzarDinamita(); break;
        case 'Digit1': this.cambiarArma('pistola9'); break;
        case 'Digit2': this.cambiarArma('rifle308'); break;
        case 'Digit3': this.cambiarArma('escopeta'); break;
        case 'Digit4': this.cambiarArma('pico'); break;
        case 'Digit5': this.cambiarArma('revolver'); break;
        case 'Digit6': this.cambiarArma('subfusil'); break;
        case 'Digit7': this.cambiarArma('carabina'); break;
        case 'Digit8': this.cambiarArma('machete'); break;
        case 'Space': if (this.enSuelo) { this.velY = 6.2; this.enSuelo = false; } break;
        default: break;
      }
      if (['Space', 'Tab', 'KeyQ'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.teclas.delete(e.code));
    window.addEventListener('blur', () => this.teclas.clear());
  }

  // Controles táctiles: los llama la interfaz.
  tactil(mx, mz, mirarX, mirarY) {
    this.tactilMov = [mx, mz];
    this.yaw -= mirarX * 0.006;
    this.pitch = clamp(this.pitch - mirarY * 0.006, -1.45, 1.45);
  }

  // Cuánto te frena lo que llevas y cómo tienes las piernas
  limites() {
    const s = G.s;
    const sobrecarga = pesoInventario(s, OBJETOS) > cargaMaxima(s);
    const cojo = s.miembros.piernas <= 0;
    return { sobrecarga, cojo, puedeCorrer: !sobrecarga && !cojo };
  }

  // ---------- bucle ----------
  actualizar(dt) {
    const s = G.s;
    const t = this.teclas;
    let mx = (t.has('KeyD') ? 1 : 0) - (t.has('KeyA') ? 1 : 0);
    let mz = (t.has('KeyW') ? 1 : 0) - (t.has('KeyS') ? 1 : 0);
    if (this.tactilMov) { mx += this.tactilMov[0]; mz += this.tactilMov[1]; }
    const largo = Math.hypot(mx, mz);
    if (largo > 1) { mx /= largo; mz /= largo; }
    const lim = this.limites();
    this.moviendo = largo > 0.1;
    this.corriendo = this.moviendo && t.has('ShiftLeft') && !this.agachado && !this.apuntando && lim.puedeCorrer;
    let vel = this.agachado ? 2.1 * (s.ventajas.includes('pies_ligeros') ? 1.25 : 1) : this.corriendo ? 7.2 : this.apuntando ? 2.6 : 4.3;
    if (lim.sobrecarga) vel *= 0.6;
    if (lim.cojo) vel *= 0.65;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    this.pos.x += (fx * mz + rx * mx) * vel * dt;
    this.pos.z += (fz * mz + rz * mx) * vel * dt;
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > 238) { this.pos.x *= 238 / r; this.pos.z *= 238 / r; }
    G.mundo.empujar(this.pos, 0.38, this.agachado ? 1.1 : 1.75);
    for (const a of G.actores) {
      if (!a.vivo || a.dentro) continue;
      const dx = this.pos.x - a.pos.x, dz = this.pos.z - a.pos.z, d = Math.hypot(dx, dz), rr = 0.38 + (a.criatura ? 0.45 : 0.32);
      if (d < rr && d > 1e-4) { this.pos.x = a.pos.x + (dx / d) * rr; this.pos.z = a.pos.z + (dz / d) * rr; }
    }
    const suelo = G.mundo.suelo(this.pos.x, this.pos.z);
    this.velY -= 20 * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= suelo) { this.pos.y = suelo; this.velY = 0; this.enSuelo = true; }

    // Ruido para la detección: correr, andar, agacharse y disparar
    const ruidoMov = !this.moviendo ? 0 : this.agachado ? (s.ventajas.includes('pies_ligeros') ? 1.5 : 3) : this.corriendo ? 34 : 14;
    this.ruido = Math.max(ruidoMov, this.ruidoDisparo || 0);
    if (this.ruidoDisparo > 0) this.ruidoDisparo = Math.max(0, this.ruidoDisparo - dt * 60);

    if (this.moviendo && this.enSuelo) {
      this.pasos += dt * vel * 0.55;
      if (this.pasos > 1) { this.pasos = 0; G.audio?.paso(this.corriendo, this.agachado); }
    }

    // Puntos de acción y curación
    const esp = specialEfectivo(s);
    const paMax = pamMaximos(esp.AGI);
    if (G.modal !== 'mira' && G.modal !== 'mira-ejecuta') s.pa = Math.min(paMax, s.pa + dt * (4 + esp.AGI * 0.5));
    if (this.cura > 0) {
      const k = Math.min(this.cura, dt * 12);
      this.cura -= k;
      s.vida = Math.min(vidaMaxima(s.special.RES, s.nivel), s.vida + k);
    }

    // Arma
    const arma = this.arma;
    this.cadencia -= dt;
    if (this.disparoPendiente) {
      this.disparoPendiente = false;
      if (arma && !this.enfundada && this.cadencia <= 0 && !this.armas.ocupado) {
        if (arma.cuerpo) this.golpear(arma);
        else if (this.atascada) { G.audio?.clic(); G.ui.toast('El arma está encasquillada. Pulsa R para soltarla.', 'peligro'); }
        else if ((s.cargadores[arma.id] || 0) > 0) this.disparar(arma);
        else { G.audio?.clic(); this.recargar(); }
      } else if (arma && this.enfundada) this.alternarEnfundar();
    }

    // Cámara: paso, retroceso y temblor (explosiones)
    const ojos = lerp(this.altOjos, this.agachado ? 1.02 : 1.62, Math.min(1, dt * 10));
    this.altOjos = ojos;
    this.bob += dt * (this.moviendo && this.enSuelo ? vel * 1.9 : 0.8);
    const bobAmp = this.moviendo && this.enSuelo ? (this.corriendo ? 0.06 : 0.03) : 0.006;
    this.temblor = Math.max(0, this.temblor - dt * 1.6);
    const tb = this.temblor * this.temblor;
    const cabeza = s.miembros.cabeza <= 0 ? Math.sin(performance.now() / 700) * 0.012 : 0;
    this.cam.position.set(
      this.pos.x + (Math.random() - 0.5) * tb * 0.25,
      this.pos.y + ojos + Math.abs(Math.sin(this.bob)) * bobAmp + (Math.random() - 0.5) * tb * 0.25,
      this.pos.z + (Math.random() - 0.5) * tb * 0.25,
    );
    this.retroceso = Math.max(0, this.retroceso - dt * 6);
    this.cam.rotation.set(this.pitch + this.retroceso * 0.05 + cabeza, this.yaw + Math.PI, cabeza * 0.6, 'YXZ');
    const zoom = this.apuntando && arma && !arma.cuerpo ? arma.zoom : 72;
    this.cam.fov = lerp(this.cam.fov, zoom, Math.min(1, dt * 12));
    this.cam.updateProjectionMatrix();

    // Arma en pantalla
    const mira = this.apuntando && arma && arma.mira && this.cam.fov < 35;
    G.ui?.mira(mira);
    this.armas.actualizar(dt, {
      arma, apuntando: this.apuntando && !this.enfundada, moviendo: this.moviendo, corriendo: this.corriendo, enSuelo: this.enSuelo,
      bob: this.bob, retroceso: this.retroceso, ratonX: this.ratonX, ratonY: this.ratonY, enfundada: this.enfundada,
    });
    this.ratonX = 0;
    this.ratonY = 0;
    if (mira || G.brazal?.visible) this.armaG.visible = false;
    this.apagarFogonazo(dt);
  }

  apagarFogonazo(dt) {
    const f = this.fogonazo.material;
    f.opacity = Math.max(0, f.opacity - dt * 18);
    this.luzFogonazo.intensity = Math.max(0, this.luzFogonazo.intensity - dt * (this.luzLejos > 0 ? 260 : 400));
    if (this.luzLejos > 0) {
      this.luzLejos -= dt;
      if (this.luzLejos <= 0) { this.luzFogonazo.position.set(0, 0, 0); this.luzFogonazo.distance = 12; }
    }
  }

  // Luz de una explosión: se usa la del fogonazo (crear una luz nueva obligaría a recompilar shaders)
  luzExplosion(p) {
    this.luzFogonazo.position.copy(this.cam.worldToLocal(p.clone().setY(p.y + 1)));
    this.luzFogonazo.distance = 40;
    this.luzFogonazo.intensity = 220;
    this.luzLejos = 0.5;
  }

  // ---------- disparo ----------
  objetivosRaycast() {
    const lista = [G.mundo.terreno, ...G.mundo.ocluyentes];
    for (const b of G.mundo.botellas) if (b.visible) lista.push(...b.children);
    for (const a of G.actores) if (a.vivo && !a.dentro) lista.push(...a.mallas);
    return lista;
  }

  efectoDisparo(arma) {
    const s = G.s;
    this.cadencia = arma.cadencia;
    this.retroceso = arma.clase === 'rifle' || arma.clase === 'escopeta' ? 1 : 0.6;
    this.fogonazo.material.opacity = 1;
    this.fogonazo.rotation.z = Math.random() * 3;
    this.fogonazo.scale.setScalar(arma.clase === 'escopeta' ? 1.6 : arma.clase === 'rifle' ? 1.25 : 0.9 + Math.random() * 0.3);
    if (this.luzLejos <= 0) this.luzFogonazo.intensity = 40;
    this.ruidoDisparo = 100;
    s.cargadores[arma.id]--;
    G.audio?.disparo(arma.clase !== 'pistola');
    // Desgaste del arma; por debajo de la mitad puede encasquillarse
    s.cnd[arma.id] = Math.max(0, (s.cnd[arma.id] ?? 100) - arma.desgaste);
    if (Math.random() < probAtasco(s.cnd[arma.id])) {
      s.atascadas = s.atascadas || {};
      s.atascadas[arma.id] = true;
      G.ui.toast('¡Encasquillada! Pulsa R para soltarla.', 'peligro');
    }
    const boca = this.fogonazo.getWorldPosition(new THREE.Vector3());
    this.armas.humo(boca, arma.clase === 'escopeta' ? 3 : 1, arma.clase === 'escopeta' ? 1.6 : 1);
    if (arma.clase === 'pistola') {
      const m = this.modelos[arma.id];
      this.armas.casquillo(m.localToWorld(m.userData.expulsion.clone()));
    }
    if (arma.cerrojo && s.cargadores[arma.id] > 0) setTimeout(() => { if (this.arma?.id === arma.id) this.armas.cerrojo(); }, 160);
    // Todos los que oyen el disparo se ponen en alerta
    for (const a of G.actores) {
      if (a.vivo && a.hostil && a.estado === 'quieto' && a.pos.distanceTo(this.pos) < 60) {
        a.estado = 'alerta';
        a.destino = this.pos.clone();
        a.tiempoEstado = 0;
      }
    }
  }

  // Dirección del disparo con la dispersión del arma, la postura, su estado y los brazos
  direccion(arma) {
    const s = G.s;
    let disp = dispersion(arma, s.hab.armas, { moviendo: this.moviendo, corriendo: this.corriendo, agachado: this.agachado, apuntando: this.apuntando });
    disp *= multEstadoDispersion(s.cnd[arma.id] ?? 100);
    if (s.miembros.brazos <= 0) disp *= 1.8;
    const dir = new THREE.Vector3();
    this.cam.getWorldDirection(dir);
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * disp;
    const der = new THREE.Vector3().crossVectors(dir, ARRIBA).normalize();
    const arr = new THREE.Vector3().crossVectors(der, dir).normalize();
    return dir.addScaledVector(der, Math.cos(a) * rr).addScaledVector(arr, Math.sin(a) * rr).normalize();
  }

  disparar(arma) {
    this.efectoDisparo(arma);
    const origen = new THREE.Vector3();
    this.cam.getWorldPosition(origen);
    const boca = this.fogonazo.getWorldPosition(new THREE.Vector3());
    const objetivos = this.objetivosRaycast();
    // La escopeta suelta varios perdigones; cada uno hace su parte del daño
    const n = arma.perdigones || 1;
    const heridos = new Map();
    for (let i = 0; i < n; i++) {
      const dir = this.direccion(arma);
      this.ray.set(origen, dir);
      this.ray.far = arma.alcance;
      const golpes = this.ray.intersectObjects(objetivos, false);
      if (!golpes.length) {
        if (i < 3) G.efectos.estela(boca, origen.clone().addScaledVector(dir, Math.min(60, arma.alcance)));
        continue;
      }
      const g = golpes[0];
      if (i < 3) G.efectos.estela(boca, g.point);
      const ud = g.object.userData;
      if (ud.botella) {
        if (!ud.botella.visible) continue;
        ud.botella.visible = false;
        G.efectos.cristal(g.point);
        G.audio?.cristal();
        G.ui.marca();
        G.juego.evento('botella');
        continue;
      }
      if (ud.actor) {
        const h = heridos.get(ud.actor) || { parte: ud.parte || 'torso', punto: g.point, n: 0 };
        h.n++;
        heridos.set(ud.actor, h);
        continue;
      }
      G.efectos.polvo(g.point);
    }
    for (const [actor, h] of heridos) this.herir(actor, h.parte, arma, h.punto, false, h.n / n);
  }

  // Daño con habilidad, estado del arma, ventajas y críticos (fraccion: parte de los perdigones que dieron)
  herir(actor, parte, arma, punto, enMira, fraccion = 1) {
    const s = G.s;
    const hab = arma.cuerpo ? s.hab.cuerpo : s.hab.armas;
    let dano = arma.dano * (arma.perdigones || 1) * fraccion * multHabilidad(hab) * PARTES[parte].mult;
    dano *= multEstadoDano(s.cnd[arma.id] ?? 100);
    if (arma.clase === 'pistola' && s.ventajas.includes('pistolero')) dano *= 1.25;
    if (arma.cuerpo) dano *= (1 + (specialEfectivo(s).FUE - 5) * 0.1) * (s.ventajas.includes('puno') ? 1.5 : 1);
    let critico = Math.random() < arma.critico + s.special.SUE * 0.01 + (enMira ? 0.05 : 0) + (s.ventajas.includes('ojo_halcon') ? 0.05 : 0);
    // Ataque furtivo: si no te ha detectado, el golpe es crítico (armadura-criticos-sigilo.md)
    const furtivo = this.agachado && actor.estado !== 'combate' && actor.puntos < 0;
    if (furtivo) critico = true;
    if (critico) dano *= 2;
    G.efectos.sangre(punto);
    const hecho = actor.recibirDano(dano, parte, { critico, delJugador: true });
    if (hecho > 0) {
      G.ui.marca(critico);
      G.ui.numero(punto, Math.round(hecho), critico);
      if (furtivo) G.ui.toast('Ataque furtivo crítico', 'critico');
    }
  }

  // Golpe de pico: alcanza lo que haya delante a menos de 2,5 m
  golpear(arma) {
    this.cadencia = arma.cadencia;
    this.armas.golpe(() => {
      const ojos = this.cam.position.clone();
      const dir = new THREE.Vector3();
      this.cam.getWorldDirection(dir);
      let mejor = null, mejorD = Infinity, parteMejor = 'torso', puntoMejor = null;
      for (const a of G.actores) {
        if (!a.vivo || a.dentro || a.estado === 'inconsciente') continue;
        for (const parte of a.criatura ? ['cabeza', 'torso'] : ['cabeza', 'torso', 'piernas']) {
          const p = a.punto(parte);
          const v = p.clone().sub(ojos);
          const d = v.length();
          if (d > arma.alcance + 0.4) continue;
          const alin = v.normalize().dot(dir);
          if (alin < 0.72) continue;
          const puntuacion = d * (2 - alin);
          if (puntuacion < mejorD) { mejorD = puntuacion; mejor = a; parteMejor = parte; puntoMejor = p; }
        }
      }
      G.s.cnd[arma.id] = Math.max(0, (G.s.cnd[arma.id] ?? 100) - arma.desgaste);
      this.ruidoDisparo = 25;
      if (!mejor) {
        G.audio?.pico(false);
        // Golpe al aire o contra el suelo: un poco de polvo si apuntas abajo
        if (this.pitch < -0.5) G.efectos.polvo(ojos.clone().addScaledVector(dir, 1.6));
        return;
      }
      G.audio?.pico(true);
      this.retroceso = 0.4;
      this.herir(mejor, parteMejor, arma, puntoMejor, false);
      G.efectos.golpe?.(puntoMejor);
    });
  }

  // Dinamita: enciende y lanza en arco hacia donde miras
  lanzarDinamita() {
    if (!cuenta('dinamita')) { G.ui.toast('No llevas dinamita'); return; }
    if (this.armas.ocupado) return;
    const s = G.s;
    this.armas.lanzar(() => {
      if (!quitar('dinamita')) return;
      const dir = new THREE.Vector3();
      this.cam.getWorldDirection(dir);
      const der = new THREE.Vector3().crossVectors(dir, ARRIBA).normalize();
      const origen = this.cam.position.clone().addScaledVector(dir, 0.5).addScaledVector(der, 0.15).add(new THREE.Vector3(0, -0.1, 0));
      const fuerza = 13 * (s.ventajas.includes('dinamitero') ? 1.25 : 1);
      const vel = dir.clone().multiplyScalar(fuerza).add(new THREE.Vector3(0, 3.2, 0));
      const dano = 85 * (0.75 + s.hab.explosivos / 200) * (s.ventajas.includes('dinamitero') ? 1.5 : 1);
      this.armas.lanzarDinamita({ origen, vel, mecha: 3, dano, radio: s.ventajas.includes('dinamitero') ? 7.8 : 6.5 });
      this.ruidoDisparo = 30;
      G.ui.refrescar();
    });
  }

  recargar() {
    const arma = this.arma;
    if (!arma || arma.cuerpo || this.armas.ocupado || this.enfundada) return;
    const s = G.s;
    // Primero, soltar un encasquillamiento
    if (this.atascada) {
      this.armas.atasco(() => { delete s.atascadas[arma.id]; G.ui.toast('Arma lista'); });
      return;
    }
    const enCargador = s.cargadores[arma.id] || 0;
    if (enCargador >= arma.cargador) return;
    if (cuenta(arma.municion) <= 0) { G.ui.toast(`Sin ${OBJETOS[arma.municion].nombre.toLowerCase()}`); return; }
    this.apuntando = false;
    let dur = arma.recarga;
    if (s.ventajas.includes('manos_rapidas')) dur *= 0.7;
    if (s.miembros.brazos <= 0) dur *= 1.4;
    this.armas.recargar(arma, dur, () => this.terminarRecarga(arma.id));
  }

  terminarRecarga(id) {
    const arma = this.arma;
    if (!arma || arma.id !== id) return;
    const falta = arma.cargador - (G.s.cargadores[arma.id] || 0);
    G.s.cargadores[arma.id] = (G.s.cargadores[arma.id] || 0) + quitar(arma.municion, falta);
  }

  // Daño recibido: umbral de daño de la ropa (y Piel curtida) y un miembro herido al azar
  recibirDano(dano, fuente) {
    const s = G.s;
    let dt = s.equipo.ropa ? OBJETOS[s.equipo.ropa].dt || 0 : 0;
    if (s.ventajas.includes('piel_curtida')) dt += 3;
    const final = danoTrasDT(dano, dt);
    s.vida -= final;
    const r = Math.random();
    const miembro = r < 0.35 ? 'piernas' : r < 0.65 ? 'brazos' : r < 0.8 ? 'cabeza' : null;
    if (miembro) {
      const antes = s.miembros[miembro];
      s.miembros[miembro] = Math.max(0, antes - final * 1.6);
      if (antes > 0 && s.miembros[miembro] <= 0) {
        const txt = { piernas: 'Tienes una pierna lisiada: no puedes correr.', brazos: 'Tienes un brazo lisiado: apuntas peor y recargas más despacio.', cabeza: 'Te han dado en la cabeza: lo ves todo moverse.' }[miembro];
        G.ui.toast(`${txt} Un suero o la doctora lo curan.`, 'peligro');
      }
    }
    G.ui.herido(final, fuente ? fuente.pos : null);
    G.audio?.herido();
    if (G.modal === 'mira') G.ui.cerrarMira(true);
    if (s.vida <= 0) { s.vida = 0; G.juego.muerte(); }
  }

  // ---------- interacción ----------
  candidato() {
    const dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    let mejor = null, mejorPunt = -Infinity;
    const probar = (p, radio, item) => {
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      const dy = Math.abs(p.y - (this.pos.y + 1));
      if (d > radio + 0.6 || dy > 2.2) return;
      const v = new THREE.Vector3(p.x - this.pos.x, 0, p.z - this.pos.z).normalize();
      const alin = v.dot(dir);
      if (alin < 0.35 && d > 1) return;
      const punt = alin * 2 - d * 0.5;
      if (punt > mejorPunt) { mejorPunt = punt; mejor = item; }
    };
    for (const it of G.mundo.interactivos) {
      const txt = G.juego.textoInteractivo(it.id);
      if (txt) probar(it.pos, it.radio, { tipo: 'objeto', it, txt, robo: G.juego.esRobo?.(it.id) });
    }
    for (const a of G.actores) {
      if (a.dentro) continue; // vecinos que se fueron a dormir a su casa
      if (a.vivo) {
        const habla = G.juego.puedeHablar(a);
        if (habla) probar(a.pos, 2.8, { tipo: 'actor', a, txt: `Hablar con ${a.nombre}` });
      } else if (!G.s.saqueados[a.id] && ((a.tipo && Object.keys(a.tipo.botin).length) || a.vecino)) {
        probar(a.pos, 1.8, { tipo: 'cadaver', a, txt: `Registrar: ${a.nombre}` });
      }
    }
    return mejor;
  }

  interactuar() {
    const c = this.candidato();
    if (!c) return;
    if (c.tipo === 'objeto') G.juego.usarInteractivo(c.it.id);
    else if (c.tipo === 'actor') G.ui.abrirDialogo(c.a);
    else if (c.tipo === 'cadaver') G.juego.saquear(c.a);
  }

  // ---------- M.I.R.A. ----------
  costePA(arma) {
    return Math.round(arma.pa * (arma.clase === 'pistola' && G.s.ventajas.includes('pistolero') ? 0.8 : 1));
  }

  abrirMira() {
    const arma = this.arma;
    if (!arma || this.enfundada) { G.ui.toast('Empuña un arma para usar M.I.R.A.'); return; }
    if (arma.cuerpo) { G.ui.toast('M.I.R.A. es para armas de fuego'); return; }
    if (this.atascada) { G.ui.toast('El arma está encasquillada. Pulsa R.'); return; }
    const dir = new THREE.Vector3();
    this.cam.getWorldDirection(dir);
    const ojos = this.cam.position.clone();
    // Cualquiera a la vista sirve; los hostiles salen primero
    const objetivos = G.actores.filter((a) => {
      if (!a.vivo || a.dentro || a.estado === 'inconsciente') return false;
      const p = a.punto('torso');
      const d = p.distanceTo(ojos);
      if (d > 80) return false;
      const v = p.clone().sub(ojos).normalize();
      if (v.dot(dir) < 0.5) return false;
      return G.mundo.lineaDeVista(ojos, p);
    }).sort((a, b) => (b.hostil - a.hostil) || (a.pos.distanceTo(this.pos) - b.pos.distanceTo(this.pos)));
    if (!objetivos.length) { G.ui.toast('No hay ningún objetivo a la vista'); return; }
    this.estadoMira = { objetivos, i: 0, cola: [], tiempo: 0 };
    this.apuntando = false;
    G.modal = 'mira';
    G.audio?.miraEntrar();
    G.ui.abrirMira();
  }

  probabilidades(actor) {
    const arma = this.arma;
    const d = actor.punto('torso').distanceTo(this.cam.position);
    const partes = actor.criatura ? ['cabeza', 'torso', 'piernas'] : ['cabeza', 'torso', 'brazos', 'piernas'];
    const estado = multEstadoDispersion(G.s.cnd[arma.id] ?? 100) * (G.s.miembros.brazos <= 0 ? 1.8 : 1);
    return partes.map((p) => ({ parte: p, prob: probMira({ ...arma, dispersion: arma.dispersion * estado }, G.s.hab.armas, d, p, actor.escala * (actor.criatura ? 0.9 : 1)) }));
  }

  encolar(parte) {
    const arma = this.arma, em = this.estadoMira;
    const cargador = G.s.cargadores[arma.id] || 0;
    const coste = this.costePA(arma);
    if (G.s.pa < coste) { G.ui.toast('No te quedan puntos de acción'); return false; }
    if (em.cola.length >= cargador) { G.ui.toast('No hay más balas en el cargador'); return false; }
    G.s.pa -= coste;
    em.cola.push({ actor: em.objetivos[em.i], parte });
    G.audio?.clic();
    return true;
  }

  desencolar() {
    const em = this.estadoMira;
    if (!em.cola.length) return;
    em.cola.pop();
    G.s.pa += this.costePA(this.arma);
  }

  cancelarMira() {
    const em = this.estadoMira;
    if (em) for (let i = 0; i < em.cola.length; i++) G.s.pa += this.costePA(this.arma);
    this.estadoMira = null;
    G.modal = null;
    G.escalaTiempo = 1;
  }

  ejecutarMira() {
    if (!this.estadoMira.cola.length) { this.cancelarMira(); return false; }
    G.modal = 'mira-ejecuta';
    G.escalaTiempo = 0.25;
    this.estadoMira.tiempo = 0.35;
    return true;
  }

  // Animación del arma mientras el mundo está congelado o a cámara lenta
  animarMira(dt) {
    this.retroceso = Math.max(0, this.retroceso - dt * 6);
    G.ui?.mira(false);
    this.armas.actualizar(dt, { arma: this.arma, apuntando: false, moviendo: false, corriendo: false, enSuelo: true, bob: this.bob, retroceso: this.retroceso, ratonX: 0, ratonY: 0, enfundada: false });
    this.apagarFogonazo(dt);
    this.cam.position.set(this.pos.x, this.pos.y + this.altOjos, this.pos.z);
    this.cam.fov = lerp(this.cam.fov, 60, Math.min(1, dt * 6));
    this.cam.updateProjectionMatrix();
  }

  // Se llama con tiempo real mientras M.I.R.A. está abierto
  actualizarMira(dtReal) {
    const em = this.estadoMira;
    if (!em) return;
    const objetivo = em.cola.length ? em.cola[0].actor : em.objetivos[em.i];
    if (objetivo) {
      const p = objetivo.punto(em.cola.length ? em.cola[0].parte : 'torso');
      const v = p.sub(this.cam.position);
      const yaw = Math.atan2(v.x, v.z);
      const pitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
      let dy = yaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dtReal * 8);
      this.pitch += (pitch - this.pitch) * Math.min(1, dtReal * 8);
      this.cam.rotation.set(this.pitch, this.yaw + Math.PI, 0, 'YXZ');
    }
    if (G.modal !== 'mira-ejecuta') return;
    em.tiempo -= dtReal;
    if (em.tiempo > 0) return;
    const tiro = em.cola.shift();
    if (!tiro) { this.estadoMira = null; G.modal = null; G.escalaTiempo = 1; G.ui.cerrarMira(); return; }
    em.tiempo = this.arma?.cerrojo ? 1.0 : 0.55;
    const arma = this.arma;
    if (!arma || (G.s.cargadores[arma.id] || 0) <= 0 || !tiro.actor.vivo || this.atascada) { em.cola.length = 0; em.tiempo = 0.2; return; }
    this.efectoDisparo(arma);
    const estado = multEstadoDispersion(G.s.cnd[arma.id] ?? 100) * (G.s.miembros.brazos <= 0 ? 1.8 : 1);
    const prob = probMira({ ...arma, dispersion: arma.dispersion * estado }, G.s.hab.armas, tiro.actor.punto('torso').distanceTo(this.cam.position), tiro.parte, tiro.actor.escala) / 100;
    const punto = tiro.actor.punto(tiro.parte);
    const boca = this.fogonazo.getWorldPosition(new THREE.Vector3());
    if (Math.random() < prob) {
      G.efectos.estela(boca, punto);
      this.herir(tiro.actor, tiro.parte, arma, punto, true);
    } else {
      const fallo = punto.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 0.8, (Math.random() - 0.5) * 1.6));
      G.efectos.estela(boca, fallo);
      G.efectos.polvo(new THREE.Vector3(fallo.x, G.mundo.suelo(fallo.x, fallo.z) + 0.05, fallo.z));
      G.ui.flotante(punto, 'Fallo');
    }
  }
}

