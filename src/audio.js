// Sonido sintetizado con Web Audio: disparos, pasos, criaturas, viento y una guitarra punteada.
import { G } from './state.js';

let ctx = null, master, sfx, musica, eco, ruido;

function impulso(seg, caida) {
  const n = Math.floor(ctx.sampleRate * seg);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, caida);
  }
  return b;
}

// Cuerda punteada (Karplus-Strong) generada una vez por nota.
const cuerdas = new Map();
function cuerda(freq) {
  if (cuerdas.has(freq)) return cuerdas.get(freq);
  const sr = ctx.sampleRate, n = Math.floor(sr * 3.2);
  const b = ctx.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  const p = Math.round(sr / freq);
  const lin = new Float32Array(p);
  for (let i = 0; i < p; i++) lin[i] = Math.random() * 2 - 1;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const a = lin[k], c = lin[(k + 1) % p];
    lin[k] = (a + c) * 0.4982;
    d[i] = a * 0.55;
    k = (k + 1) % p;
  }
  cuerdas.set(freq, b);
  return b;
}

function env(nodo, t, ataque, pico, caida) {
  nodo.gain.setValueAtTime(0.0001, t);
  nodo.gain.exponentialRampToValueAtTime(pico, t + ataque);
  nodo.gain.exponentialRampToValueAtTime(0.0001, t + ataque + caida);
}

function fuenteRuido(t, dur) {
  const s = ctx.createBufferSource();
  s.buffer = ruido;
  s.loop = true;
  s.loopStart = Math.random();
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur);
  return s;
}

// Volumen y panorama según dónde suena respecto al jugador
function espacial(pos) {
  const salida = ctx.createGain();
  const pan = ctx.createStereoPanner();
  salida.connect(pan).connect(sfx);
  if (!pos || !G.jugador) return salida;
  const J = G.jugador;
  const dx = pos.x - J.pos.x, dz = pos.z - J.pos.z, d = Math.hypot(dx, dz);
  salida.gain.value = 1 / (1 + d / 12);
  const ang = Math.atan2(dx, dz) - J.yaw;
  pan.pan.value = Math.max(-1, Math.min(1, -Math.sin(ang) * Math.min(1, d / 4)));
  return salida;
}

function golpeSeco(destino, t, frec, dur, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(frec, t);
  o.frequency.exponentialRampToValueAtTime(frec * 0.35, t + dur);
  env(g, t, 0.003, vol, dur);
  o.connect(g).connect(destino);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function tiro(destino, rifle, lejos) {
  const t = ctx.currentTime;
  const n = fuenteRuido(t, rifle ? 1.2 : 0.7);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(lejos ? 1800 : 6000, t);
  f.frequency.exponentialRampToValueAtTime(rifle ? 300 : 500, t + (rifle ? 0.5 : 0.25));
  const g = ctx.createGain();
  env(g, t, 0.002, rifle ? 1.1 : 0.8, rifle ? 0.7 : 0.35);
  n.connect(f).connect(g).connect(destino);
  const envio = ctx.createGain();
  envio.gain.value = 0.35;
  g.connect(envio).connect(eco);
  golpeSeco(destino, t, rifle ? 90 : 140, rifle ? 0.35 : 0.18, rifle ? 0.9 : 0.6);
}

export const audio = {
  iniciar() {
    if (ctx) { ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.75;
    master.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.connect(master);
    musica = ctx.createGain();
    musica.gain.value = 0.32;
    musica.connect(master);
    eco = ctx.createConvolver();
    eco.buffer = impulso(2.6, 3);
    const ecoG = ctx.createGain();
    ecoG.gain.value = 0.5;
    eco.connect(ecoG).connect(master);
    ruido = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.viento();
    this.programarMusica();
  },

  musicaActiva: true,
  ponerMusica(on) {
    this.musicaActiva = on;
    if (musica) musica.gain.setTargetAtTime(on ? 0.32 : 0, ctx.currentTime, 0.4);
  },
  alternarMusica() {
    this.musicaActiva = !this.musicaActiva;
    if (musica) musica.gain.setTargetAtTime(this.musicaActiva ? 0.32 : 0, ctx.currentTime, 0.4);
    return this.musicaActiva;
  },

  viento() {
    const s = ctx.createBufferSource();
    s.buffer = ruido;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 420;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0.07;
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoG.gain.value = 220;
    lfo.connect(lfoG).connect(f.frequency);
    const lfo2 = ctx.createOscillator(), lfo2G = ctx.createGain();
    lfo2.frequency.value = 0.13;
    lfo2G.gain.value = 0.04;
    lfo2.connect(lfo2G).connect(g.gain);
    s.connect(f).connect(g).connect(master);
    s.start();
    lfo.start();
    lfo2.start();
  },

  programarMusica() {
    // Pentatónica menor en mi, en el registro de una guitarra
    const notas = [82.41, 98.0, 110.0, 123.47, 146.83, 164.81, 196.0, 220.0, 246.94, 293.66];
    const frases = [[0, 4, 5, 7, 5], [2, 5, 7, 8, 7, 5], [0, 3, 5, 4, 2], [5, 7, 9, 8, 6, 5], [0, 5, 7, 5, 0]];
    const tocar = () => {
      if (!ctx) return;
      const t0 = ctx.currentTime + 0.1;
      const noche = G.mundo ? G.mundo.noche || 0 : 0;
      const frase = frases[Math.floor(Math.random() * frases.length)];
      const paso = 0.42 + noche * 0.2 + Math.random() * 0.1;
      frase.forEach((n, i) => {
        const s = ctx.createBufferSource();
        s.buffer = cuerda(notas[n]);
        const g = ctx.createGain();
        g.gain.value = 0.6 + Math.random() * 0.3;
        const pan = ctx.createStereoPanner();
        pan.pan.value = (Math.random() - 0.5) * 0.6;
        s.connect(g).connect(pan).connect(musica);
        const envio = ctx.createGain();
        envio.gain.value = 0.6;
        g.connect(envio).connect(eco);
        const swing = i % 2 ? 0.06 : 0;
        s.start(t0 + i * paso + swing);
      });
      // Bajo de fondo en la primera nota
      const b = ctx.createBufferSource();
      b.buffer = cuerda(notas[0] / 2);
      const bg = ctx.createGain();
      bg.gain.value = 0.5;
      b.connect(bg).connect(musica);
      b.start(t0);
      setTimeout(tocar, (frase.length * paso + 5 + Math.random() * 9) * 1000);
    };
    setTimeout(tocar, 1500);
  },

  disparo(rifle) { if (ctx) tiro(sfx, rifle, false); },
  disparoLejano(pos, rifle) { if (ctx) tiro(espacial(pos), rifle, true); },

  mordisco(pos, perro) {
    if (!ctx) return;
    const t = ctx.currentTime, dest = espacial(pos);
    const n = fuenteRuido(t, 0.25);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = perro ? 900 : 1600;
    f.Q.value = 3;
    const g = ctx.createGain();
    env(g, t, 0.01, 0.6, 0.18);
    n.connect(f).connect(g).connect(dest);
    if (perro) golpeSeco(dest, t, 260, 0.2, 0.35);
  },

  alerta(pos, criatura) {
    if (!ctx) return;
    const t = ctx.currentTime, dest = espacial(pos);
    if (criatura) {
      const n = fuenteRuido(t, 0.6);
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 2500;
      const g = ctx.createGain();
      env(g, t, 0.05, 0.4, 0.45);
      n.connect(f).connect(g).connect(dest);
    } else {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, t);
      o.frequency.linearRampToValueAtTime(140, t + 0.3);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      env(g, t, 0.02, 0.18, 0.35);
      o.connect(f).connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.5);
    }
  },

  muerte(pos, criatura) {
    if (!ctx) return;
    const t = ctx.currentTime, dest = espacial(pos);
    golpeSeco(dest, t + 0.25, criatura ? 120 : 80, 0.3, 0.5);
    if (criatura) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(700, t);
      o.frequency.exponentialRampToValueAtTime(200, t + 0.4);
      env(g, t, 0.01, 0.15, 0.4);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.5);
    }
  },

  cristal() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 2200 + Math.random() * 3000;
      env(g, t + i * 0.025, 0.002, 0.12, 0.12);
      o.connect(g).connect(sfx);
      o.start(t + i * 0.025);
      o.stop(t + i * 0.025 + 0.2);
    }
  },

  clic() {
    if (!ctx) return;
    const t = ctx.currentTime;
    golpeSeco(sfx, t, 1800, 0.04, 0.25);
  },

  recarga() {
    if (!ctx) return;
    const t = ctx.currentTime;
    golpeSeco(sfx, t + 0.1, 900, 0.06, 0.3);
    golpeSeco(sfx, t + 0.7, 600, 0.08, 0.35);
    golpeSeco(sfx, t + 1.0, 1200, 0.05, 0.3);
  },

  herido() {
    if (!ctx) return;
    const t = ctx.currentTime;
    golpeSeco(sfx, t, 70, 0.25, 0.7);
  },

  paso(corre, agachado) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = fuenteRuido(t, 0.12);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500 + Math.random() * 300;
    const g = ctx.createGain();
    env(g, t, 0.005, agachado ? 0.05 : corre ? 0.22 : 0.12, 0.09);
    n.connect(f).connect(g).connect(sfx);
  },

  zumbido() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(2400, t);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.15);
    env(g, t, 0.005, 0.12, 0.15);
    o.connect(g).connect(sfx);
    o.start(t);
    o.stop(t + 0.2);
  },

  tono(frecs, dur = 0.18, tipo = 'triangle', vol = 0.18) {
    if (!ctx) return;
    const t = ctx.currentTime;
    frecs.forEach((fr, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = tipo;
      o.frequency.value = fr;
      env(g, t + i * dur * 0.8, 0.01, vol, dur * 2);
      o.connect(g).connect(sfx);
      const envio = ctx.createGain();
      envio.gain.value = 0.3;
      g.connect(envio).connect(eco);
      o.start(t + i * dur * 0.8);
      o.stop(t + i * dur * 0.8 + dur * 2.2);
    });
  },
  miraEntrar() { this.tono([440, 660], 0.06, 'square', 0.06); },
  mision() { this.tono([392, 494, 587, 784]); },
  nivel() { this.tono([330, 415, 494, 659, 831], 0.16, 'triangle', 0.2); },
  recoger() { this.tono([880, 1175], 0.05, 'sine', 0.12); },
  tecla() { this.tono([1400 + Math.random() * 300], 0.02, 'square', 0.04); },
  error() { this.tono([220, 165], 0.12, 'square', 0.08); },
  ok() { this.tono([660, 990], 0.08, 'square', 0.07); },
  // Explosión de dinamita: golpe grave, crujido y cola con eco; la distancia la apaga
  explosion(pos) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const destino = pos ? espacial(pos) : sfx;
    golpeSeco(destino, t, 45, 1.4, 1.6);
    const n = fuenteRuido(t, 2.2);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(160, t + 1.8);
    const g = ctx.createGain();
    env(g, t, 0.004, 1.4, 2.0);
    n.connect(f).connect(g).connect(destino);
    const envio = ctx.createGain();
    envio.gain.value = 0.9;
    g.connect(envio).connect(eco);
  },
  // Mecha que chisporrotea
  mecha() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = fuenteRuido(t, 0.6);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 3500;
    const g = ctx.createGain();
    env(g, t, 0.01, 0.12, 0.55);
    n.connect(f).connect(g).connect(sfx);
  },
  // Casquillo que rebota en el suelo
  casquillo(pos) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(3200 + Math.random() * 900, t);
    env(g, t, 0.001, 0.05, 0.12);
    o.connect(g).connect(pos ? espacial(pos) : sfx);
    o.start(t);
    o.stop(t + 0.15);
  },
  // Golpe seco de pico
  pico(carne) {
    if (!ctx) return;
    golpeSeco(sfx, ctx.currentTime, carne ? 110 : 220, 0.4, 0.5);
  },
  radio() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = fuenteRuido(t, 2.5);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    env(g, t, 0.05, 0.25, 2.3);
    n.connect(f).connect(g).connect(sfx);
  },
};
