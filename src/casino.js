// Casino de Vía Muerta: Caravana (el juego de cartas de New Vegas) y blackjack, con apuestas en cobres.
// Como en el Strip, si le ganas demasiado a la casa, te invitan a una copa y no te dejan apostar más.
import { G, guardar } from './state.js';
import { CASINO } from './data.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

// ---------- naipes ----------
const PALOS = ['♠', '♥', '♦', '♣'];
const NOMBRE = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const rango = (v) => NOMBRE[v] || String(v);
const esRojo = (p) => p === '♥' || p === '♦';
function baraja() {
  const b = [];
  for (const p of PALOS) for (let v = 1; v <= 13; v++) b.push({ v, p });
  return b;
}
function barajar(b) {
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
function naipe(c, oculto = false) {
  const n = el('div', `naipe${oculto ? ' dorso' : esRojo(c.p) ? ' rojo' : ''}`, `<b>${rango(c.v)}</b><i>${c.p}</i>`);
  if (!oculto) n.setAttribute('aria-label', `${rango(c.v)} de ${c.p}`);
  return n;
}

// ---------- Caravana: reglas ----------
// Cada jugador tiene tres caravanas. Los números (A–10) van en las tuyas: cada uno sigue la dirección
// de los anteriores (subiendo o bajando) o el palo de la última carta, y nunca repite su valor.
// J quita una carta (con sus figuras), Q da la vuelta a la dirección y cambia el palo (solo en la última),
// K dobla el valor de un número. Una caravana se vende con 21–26. Las figuras valen en cualquier caravana.
const vacia = () => ({ cartas: [], dir: 0, palo: null });
function valor(car) {
  let t = 0;
  for (const n of car.cartas) {
    let x = n.c.v;
    for (const f of n.caras) if (f.v === 13) x *= 2;
    t += x;
  }
  return t;
}
const vendida = (v) => v >= 21 && v <= 26;
// Dirección y palo salen de las dos últimas cartas y de las reinas puestas sobre la última
function recalcular(car) {
  const n = car.cartas.length;
  if (!n) { car.dir = 0; car.palo = null; return; }
  const ult = car.cartas[n - 1];
  let dir = n >= 2 ? Math.sign(ult.c.v - car.cartas[n - 2].c.v) : 0;
  let palo = ult.c.p;
  for (const q of ult.caras) if (q.v === 12) { dir = -dir; palo = q.p; }
  car.dir = dir;
  car.palo = palo;
}
function puedeNumero(car, c) {
  if (c.v > 10) return false;
  const n = car.cartas.length;
  if (!n) return true;
  const ult = car.cartas[n - 1].c;
  if (c.v === ult.v) return false;
  if (car.dir === 0) return true;
  if (c.p === car.palo) return true;
  return car.dir > 0 ? c.v > ult.v : c.v < ult.v;
}
const puedeFigura = (car, j, c) => !!car.cartas[j] && car.cartas[j].caras.length < 3 && (c.v !== 12 || j === car.cartas.length - 1);

function nuevaPartida() {
  const P = { mazo: [barajar(baraja()), barajar(baraja())], mano: [[], []], caravanas: [[vacia(), vacia(), vacia()], [vacia(), vacia(), vacia()]], apertura: [0, 0], fin: null };
  robar(P, 0, 8);
  robar(P, 1, 8);
  return P;
}
function robar(P, lado, n) {
  for (let i = 0; i < n && P.mazo[lado].length; i++) P.mano[lado].push(P.mazo[lado].pop());
}
// Aplica una jugada; devuelve false si no es válida. lado: 0 jugador, 1 rival.
// En la apertura (tres primeras jugadas) solo se ponen números en caravanas vacías y no se roba;
// después, cada carta jugada o descartada se repone del mazo y la mano se queda en cinco.
function aplicar(P, lado, mov) {
  const mano = P.mano[lado];
  const apertura = P.apertura[lado] < 3;
  if (mov.tipo === 'descarte') {
    if (!mano[mov.k] || (apertura && mano.some((c) => c.v <= 10))) return false;
    mano.splice(mov.k, 1);
  } else if (mov.tipo === 'disolver') {
    const car = P.caravanas[lado][mov.i];
    if (apertura || !car.cartas.length) return false;
    car.cartas = [];
    recalcular(car);
    return true;
  } else {
    const c = mano[mov.k], car = P.caravanas[mov.lado]?.[mov.i];
    if (!c || !car) return false;
    if (c.v <= 10) {
      if (mov.lado !== lado || (apertura ? car.cartas.length > 0 : !puedeNumero(car, c))) return false;
      car.cartas.push({ c, caras: [] });
      if (apertura) P.apertura[lado]++;
    } else {
      if (apertura || !puedeFigura(car, mov.j, c)) return false;
      if (c.v === 11) car.cartas.splice(mov.j, 1);
      else car.cartas[mov.j].caras.push(c);
    }
    mano.splice(mov.k, 1);
    recalcular(car);
    if (apertura && c.v <= 10) return true;
  }
  robar(P, lado, 1);
  return true;
}
// Cada pareja de caravanas (la tuya y la de enfrente) la gana la vendida más alta; si solo una está vendida,
// esa. La partida acaba cuando las tres parejas tienen ganador. Sin cartas que jugar, se pierde.
function resultado(P) {
  if (P.apertura[0] < 3 || P.apertura[1] < 3) return null;
  let mios = 0, suyos = 0, resueltas = 0;
  for (let i = 0; i < 3; i++) {
    const a = valor(P.caravanas[0][i]), b = valor(P.caravanas[1][i]);
    const va = vendida(a), vb = vendida(b);
    if (va && vb) {
      if (a === b) continue;
      resueltas++;
      if (a > b) mios++; else suyos++;
    } else if (va) { resueltas++; mios++; } else if (vb) { resueltas++; suyos++; }
  }
  if (resueltas === 3) return mios > suyos ? 0 : 1;
  for (const l of [0, 1]) if (!P.mano[l].length && !P.mazo[l].length) return 1 - l;
  return null;
}

// ---------- Caravana: el rival ----------
// Prueba cada jugada posible y se queda con la que mejor deja sus caravanas frente a las tuyas.
function puntCaravana(v) {
  if (v === 0) return 0;
  if (vendida(v)) return 50 + (v - 21) * 3;
  if (v > 26) return 18 - (v - 26) * 6;
  return v * 1.6;
}
function puntuar(P, lado) {
  let s = 0;
  for (let i = 0; i < 3; i++) {
    const a = valor(P.caravanas[lado][i]), b = valor(P.caravanas[1 - lado][i]);
    s += puntCaravana(a) - puntCaravana(b) * 0.9;
    if (vendida(a) && (!vendida(b) || a > b)) s += 30;
    if (vendida(b) && (!vendida(a) || b > a)) s -= 30;
  }
  return s;
}
function jugadas(P, lado) {
  const movs = [], mano = P.mano[lado];
  const apertura = P.apertura[lado] < 3;
  mano.forEach((c, k) => {
    if (c.v <= 10) {
      P.caravanas[lado].forEach((car, i) => { if (apertura ? !car.cartas.length : puedeNumero(car, c)) movs.push({ tipo: 'carta', k, lado, i }); });
    } else if (!apertura) {
      for (const l of [0, 1]) P.caravanas[l].forEach((car, i) => car.cartas.forEach((_, j) => { if (puedeFigura(car, j, c)) movs.push({ tipo: 'carta', k, lado: l, i, j }); }));
    }
    if (!apertura || !mano.some((x) => x.v <= 10)) movs.push({ tipo: 'descarte', k });
  });
  if (!apertura) P.caravanas[lado].forEach((car, i) => { if (car.cartas.length) movs.push({ tipo: 'disolver', i }); });
  return movs;
}
function elegirJugada(P, lado) {
  const base = puntuar(P, lado);
  let mejor = null, mejorS = -Infinity;
  for (const m of jugadas(P, lado)) {
    const Q = structuredClone(P);
    if (!aplicar(Q, lado, m)) continue;
    let s = puntuar(Q, lado) - base;
    if (m.tipo === 'descarte') s -= 4 + (P.mano[lado][m.k].v > 10 ? 3 : 0);
    if (m.tipo === 'disolver') s -= 10;
    s += Math.random() * 2.5;
    if (s > mejorS) { mejorS = s; mejor = m; }
  }
  return mejor;
}

// ---------- blackjack ----------
function valorBJ(mano) {
  let t = 0, ases = 0;
  for (const c of mano) {
    if (c.v === 1) { ases++; t += 11; } else t += Math.min(10, c.v);
  }
  while (t > 21 && ases) { t -= 10; ases--; }
  return t;
}

export function crearCasino() {
  const S = () => G.s;
  const casino = {};
  let crupier = null;
  const nombre = () => (crupier?.nombre || 'La banca').split(',')[0];

  // ---------- dinero ----------
  // La apuesta se retira al empezar; al acabar se devuelve lo que toque y se lleva la cuenta de lo ganado
  function apostar(n) { S().cobres -= n; }
  function liquidar(apuesta, devuelto) {
    const s = S();
    s.cobres += devuelto;
    const neto = devuelto - apuesta;
    s.casino.ganado += neto;
    if (neto > 0) G.audio?.ok(); else if (neto < 0) G.audio?.error();
    if (!s.casino.vetado && s.casino.ganado >= CASINO.tope) {
      s.casino.vetado = true;
      G.ui.toast('La casa te invita a una copa… y a no volver a apostar aquí.', 'mision');
      G.juego.nota('Has ganado demasiado en El Vagón de la Suerte: Sol ya no acepta tus apuestas.');
    }
    guardar();
    return neto;
  }
  function botonesApuesta(contenedor, empezar) {
    const s = S();
    const caja = el('div', 'apuesta');
    if (s.casino.vetado) {
      caja.append(el('p', '', 'La casa ya no acepta tus apuestas.'));
    } else {
      caja.append(el('p', '', `Tienes ${s.cobres} cobres. ¿Cuánto apuestas contra ${nombre()}?`));
      const fila = el('div', 'apuesta-botones');
      for (const n of CASINO.apuestas) {
        const b = el('button', 'cerrar', `${n} cobres`);
        b.disabled = s.cobres < n;
        b.addEventListener('click', () => empezar(n));
        fila.append(b);
      }
      caja.append(fila);
      if (s.cobres < CASINO.apuestas[0]) caja.append(el('p', 'vacio', 'No te llega ni para la apuesta mínima.'));
    }
    contenedor.append(caja);
  }

  // ---------- Caravana ----------
  const cv = { P: null, apuesta: 0, sel: null, ocupado: false, aviso: false, msg: '' };
  casino.abrirCaravana = (actor) => {
    crupier = actor;
    G.ui.abrirModal('caravana');
    $('#caravana').hidden = false;
    $('#cv-rival').textContent = `contra ${nombre()}`;
    cv.P = null;
    cv.sel = null;
    cv.aviso = false;
    pintarCaravana();
  };
  function empezarCaravana(n) {
    apostar(n);
    cv.apuesta = n;
    cv.P = nuevaPartida();
    cv.sel = null;
    cv.ocupado = false;
    cv.msg = 'Abre tus tres caravanas: elige un número de tu mano y ponlo en una caravana vacía.';
    G.audio?.clic();
    pintarCaravana();
  }
  function describir(m, c) {
    const pos = ['primera', 'segunda', 'tercera'];
    if (!m) return `${nombre()} pasa.`;
    if (m.tipo === 'descarte') return `${nombre()} descarta una carta.`;
    if (m.tipo === 'disolver') return `${nombre()} disuelve su ${pos[m.i]} caravana.`;
    if (c.v <= 10) return `${nombre()} pone un ${rango(c.v)}${c.p} en su ${pos[m.i]} caravana.`;
    const donde = m.lado === 1 ? `su ${pos[m.i]} caravana` : `tu ${pos[m.i]} caravana`;
    return { 11: `${nombre()} juega una J y quita una carta de ${donde}.`, 12: `${nombre()} juega una Q en ${donde}: cambia la dirección.`, 13: `${nombre()} juega una K en ${donde}: dobla un número.` }[c.v];
  }
  function jugar(mov) {
    const P = cv.P;
    if (!P || cv.ocupado || P.fin !== null) return;
    if (!aplicar(P, 0, mov)) { G.audio?.error(); return; }
    G.audio?.tecla();
    cv.sel = null;
    cv.aviso = false;
    if (comprobarFin()) return;
    cv.ocupado = true;
    cv.msg = `${nombre()} piensa…`;
    pintarCaravana();
    setTimeout(turnoRival, 700);
  }
  function turnoRival() {
    const P = cv.P;
    if (!P || P.fin !== null || G.modal !== 'caravana') { cv.ocupado = false; return; }
    const m = elegirJugada(P, 1);
    const c = m && m.tipo === 'carta' ? P.mano[1][m.k] : null;
    if (m) aplicar(P, 1, m);
    cv.msg = describir(m, c);
    cv.ocupado = false;
    if (comprobarFin()) return;
    if (P.apertura[0] < 3) cv.msg += ' Te toca: sigue abriendo tus caravanas.';
    pintarCaravana();
  }
  function comprobarFin() {
    const r = resultado(cv.P);
    if (r === null) return false;
    terminarCaravana(r);
    return true;
  }
  function terminarCaravana(ganador, rendido = false) {
    const P = cv.P;
    P.fin = ganador;
    const neto = liquidar(cv.apuesta, ganador === 0 ? cv.apuesta * 2 : 0);
    cv.msg = rendido ? `Te levantas de la mesa. ${nombre()} se queda tus ${cv.apuesta} cobres.`
      : ganador === 0 ? `¡Ganas! Vendes más caravanas que ${nombre()}: +${neto} cobres.` : `${nombre()} gana la partida. Pierdes ${cv.apuesta} cobres.`;
    cv.ocupado = false;
    cv.sel = null;
    pintarCaravana();
  }
  function filaCaravanas(lado) {
    const P = cv.P;
    const fila = el('div', `cv-fila ${lado ? 'rival' : 'tuya'}`);
    const c = cv.sel !== null ? P.mano[0][cv.sel] : null;
    const ap = P.apertura[0] < 3;
    const activa = P.fin === null && !cv.ocupado;
    P.caravanas[lado].forEach((car, i) => {
      const col = el('div', 'cv-caravana');
      const v = valor(car);
      const est = vendida(v) ? 'vendida' : v > 26 ? 'pasada' : '';
      const dir = car.dir > 0 ? '↑' : car.dir < 0 ? '↓' : '·';
      col.append(el('div', `cv-cab ${est}`, `<b>${v}</b><span>${est}</span><small>${car.cartas.length ? `${dir} ${car.palo}` : 'vacía'}</small>`));
      const pila = el('div', 'cv-pila');
      car.cartas.forEach((nodo, j) => {
        const f = el('div', 'cv-nodo');
        f.append(naipe(nodo.c));
        for (const k of nodo.caras) { const cm = naipe(k); cm.classList.add('cara'); f.append(cm); }
        // Una figura va sobre cualquier número (la Q solo sobre el último)
        if (activa && c && c.v > 10 && !ap && puedeFigura(car, j, c)) {
          f.classList.add('objetivo');
          f.addEventListener('click', (e) => { e.stopPropagation(); jugar({ tipo: 'carta', k: cv.sel, lado, i, j }); });
        }
        pila.append(f);
      });
      col.append(pila);
      // Un número va en tus caravanas, si cabe
      if (lado === 0 && activa && c && c.v <= 10) {
        if (ap ? !car.cartas.length : puedeNumero(car, c)) {
          col.classList.add('objetivo');
          col.addEventListener('click', () => jugar({ tipo: 'carta', k: cv.sel, lado: 0, i }));
        } else col.classList.add('no');
      }
      if (lado === 0 && activa && !ap && car.cartas.length) {
        const d = el('button', 'cv-disolver', 'Disolver');
        d.title = 'Tira todas las cartas de esta caravana (gasta tu turno)';
        d.addEventListener('click', (e) => { e.stopPropagation(); jugar({ tipo: 'disolver', i }); });
        col.append(d);
      }
      fila.append(col);
    });
    return fila;
  }
  function pintarCaravana() {
    const m = $('#cv-mesa');
    m.innerHTML = '';
    const P = cv.P;
    $('#cv-estado').textContent = P ? `Apuesta: ${cv.apuesta} cobres` : `Tienes ${S().cobres} cobres`;
    if (!P) {
      m.append(el('p', 'cv-msg', 'Tres caravanas cada uno. Véndelas sumando entre 21 y 26. Gana quien venda más que el otro.'));
      botonesApuesta(m, empezarCaravana);
      return;
    }
    const ap = P.apertura[0] < 3;
    m.append(el('h3', 'cv-titulo', `Caravanas de ${nombre()}`));
    m.append(filaCaravanas(1));
    const centro = el('div', 'cv-centro');
    centro.append(el('span', 'cv-info', `${nombre()}: ${P.mano[1].length} en mano · ${P.mazo[1].length} en el mazo`));
    centro.append(el('p', 'cv-msg', cv.aviso ? 'Si te levantas ahora, pierdes la apuesta. Pulsa Esc otra vez para irte.' : cv.msg));
    centro.append(el('span', 'cv-info', `Tu mazo: ${P.mazo[0].length}`));
    m.append(centro);
    m.append(filaCaravanas(0));
    m.append(el('h3', 'cv-titulo', 'Tus caravanas · tu mano'));
    const mano = el('div', 'cv-mano');
    P.mano[0].forEach((c, k) => {
      const n = naipe(c);
      n.classList.add('en-mano');
      n.tabIndex = 0;
      if (cv.sel === k) n.classList.add('sel');
      n.title = `${k + 1}: ${c.v > 10 ? { 11: 'J: quita una carta', 12: 'Q: cambia la dirección y el palo', 13: 'K: dobla un número' }[c.v] : 'Número'}`;
      const elegir = () => { if (cv.ocupado || P.fin !== null) return; cv.sel = cv.sel === k ? null : k; G.audio?.tecla(); pintarCaravana(); };
      n.addEventListener('click', elegir);
      n.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(); } });
      mano.append(n);
    });
    m.append(mano);
    const acc = el('div', 'cv-acciones');
    if (P.fin === null) {
      const desc = el('button', 'cerrar', 'Descartar la carta');
      desc.disabled = cv.sel === null || cv.ocupado || (ap && P.mano[0].some((c) => c.v <= 10));
      desc.addEventListener('click', () => jugar({ tipo: 'descarte', k: cv.sel }));
      acc.append(desc);
      if (cv.sel !== null && !cv.ocupado) acc.append(el('span', 'cv-info', P.mano[0][cv.sel].v <= 10 ? 'Elige una de tus caravanas.' : 'Elige la carta sobre la que la pones.'));
    } else {
      const otra = el('button', 'cerrar', 'Otra partida');
      otra.disabled = S().casino.vetado;
      otra.addEventListener('click', () => { cv.P = null; pintarCaravana(); });
      const irse = el('button', 'cerrar', 'Levantarse de la mesa');
      irse.addEventListener('click', () => G.ui.cerrarModal());
      acc.append(otra, irse);
    }
    m.append(acc);
  }
  function salirCaravana() {
    const P = cv.P;
    if (P && P.fin === null) {
      if (!cv.aviso) { cv.aviso = true; G.audio?.error(); pintarCaravana(); return; }
      terminarCaravana(1, true);
    }
    G.ui.cerrarModal();
  }
  $('#cv-cerrar').addEventListener('click', salirCaravana);

  // ---------- blackjack ----------
  const bj = { zapato: [], apuesta: 0, jugador: [], banca: [], fase: 'apuesta', msg: '', aviso: false, suerte: false };
  const sacar = () => {
    if (bj.zapato.length < 15) bj.zapato = barajar([...baraja(), ...baraja()]);
    return bj.zapato.pop();
  };
  casino.abrirBlackjack = (actor) => {
    crupier = actor;
    G.ui.abrirModal('blackjack');
    $('#blackjack').hidden = false;
    $('#bj-rival').textContent = `reparte ${nombre()}`;
    bj.fase = 'apuesta';
    bj.aviso = false;
    pintarBJ();
  };
  function repartir(n) {
    apostar(n);
    bj.apuesta = n;
    bj.jugador = [sacar(), sacar()];
    bj.banca = [sacar(), sacar()];
    bj.fase = 'turno';
    bj.msg = '';
    bj.suerte = false;
    G.audio?.clic();
    if (valorBJ(bj.jugador) === 21) { plantarse(); return; }
    pintarBJ();
  }
  function pedir() {
    if (bj.fase !== 'turno') return;
    let c = sacar();
    // La Suerte del zahorí: a veces la carta que te pasaría de 21 se cambia por otra
    const prob = Math.max(0, S().special.SUE - 5) * 0.04;
    if (valorBJ([...bj.jugador, c]) > 21 && Math.random() < prob) {
      const i = bj.zapato.findIndex((x) => valorBJ([...bj.jugador, x]) <= 21);
      if (i >= 0) { const otra = bj.zapato.splice(i, 1)[0]; bj.zapato.push(c); c = otra; bj.suerte = true; }
    }
    bj.jugador.push(c);
    bj.aviso = false;
    G.audio?.tecla();
    const v = valorBJ(bj.jugador);
    if (v > 21) terminarBJ('pasado');
    else if (v === 21) plantarse();
    else pintarBJ();
  }
  function doblar() {
    if (bj.fase !== 'turno' || bj.jugador.length !== 2 || S().cobres < bj.apuesta) return;
    apostar(bj.apuesta);
    bj.apuesta *= 2;
    bj.jugador.push(sacar());
    if (valorBJ(bj.jugador) > 21) terminarBJ('pasado');
    else plantarse();
  }
  function plantarse() {
    if (bj.fase !== 'turno') return;
    bj.fase = 'banca';
    const natural = bj.jugador.length === 2 && valorBJ(bj.jugador) === 21;
    const naturalBanca = valorBJ(bj.banca) === 21;
    if (natural || naturalBanca) { terminarBJ(natural && naturalBanca ? 'empate' : natural ? 'blackjack' : 'pierde'); return; }
    // La banca pide hasta 17 y se planta
    while (valorBJ(bj.banca) < 17) bj.banca.push(sacar());
    const vj = valorBJ(bj.jugador), vb = valorBJ(bj.banca);
    terminarBJ(vb > 21 || vj > vb ? 'gana' : vj < vb ? 'pierde' : 'empate');
  }
  function terminarBJ(r) {
    bj.fase = 'fin';
    const a = bj.apuesta;
    const devuelto = r === 'blackjack' ? a + Math.floor(a * 1.5) : r === 'gana' ? a * 2 : r === 'empate' ? a : 0;
    const neto = liquidar(a, devuelto);
    bj.msg = { blackjack: `¡Blackjack! Cobras ${neto} cobres.`, gana: `Ganas la mano: +${neto} cobres.`, empate: 'Empate: recuperas la apuesta.', pierde: `Gana la banca. Pierdes ${a} cobres.`, pasado: `Te pasas de 21. Pierdes ${a} cobres.` }[r];
    if (bj.suerte && r !== 'pasado' && r !== 'pierde') bj.msg += ' La suerte del zahorí te ha echado una mano.';
    pintarBJ();
  }
  function lado(titulo, cartas, total, ocultaSegunda) {
    const l = el('div', 'bj-lado');
    l.append(el('h3', '', titulo));
    const fila = el('div', 'bj-cartas');
    cartas.forEach((c, i) => fila.append(naipe(c, ocultaSegunda && i === 1)));
    l.append(fila);
    l.append(el('div', 'bj-total', total));
    return l;
  }
  function pintarBJ() {
    const m = $('#bj-mesa');
    m.innerHTML = '';
    $('#bj-estado').textContent = bj.fase === 'apuesta' ? `Tienes ${S().cobres} cobres` : `Apuesta: ${bj.apuesta} cobres`;
    if (bj.fase === 'apuesta') {
      m.append(el('p', 'cv-msg', 'Acércate a 21 sin pasarte. La banca pide hasta 17. El blackjack paga 3 a 2.'));
      botonesApuesta(m, repartir);
      return;
    }
    const tapada = bj.fase === 'turno';
    const vista = bj.banca[0].v === 1 ? 11 : Math.min(10, bj.banca[0].v);
    m.append(lado(nombre(), bj.banca, tapada ? `${vista} + ?` : String(valorBJ(bj.banca)), tapada));
    m.append(el('p', 'cv-msg', bj.aviso ? 'Si te levantas ahora, pierdes la apuesta. Pulsa Esc otra vez para irte.' : bj.msg || 'Pide carta, plántate o dobla la apuesta.'));
    m.append(lado('Tú', bj.jugador, String(valorBJ(bj.jugador)), false));
    const acc = el('div', 'bj-acciones');
    if (bj.fase === 'turno') {
      const b1 = el('button', 'cerrar', 'Pedir carta · P');
      b1.addEventListener('click', pedir);
      const b2 = el('button', 'cerrar', 'Plantarse · L');
      b2.addEventListener('click', plantarse);
      const b3 = el('button', 'cerrar', 'Doblar · D');
      b3.disabled = bj.jugador.length !== 2 || S().cobres < bj.apuesta;
      b3.addEventListener('click', doblar);
      acc.append(b1, b2, b3);
    } else {
      const otra = el('button', 'cerrar', 'Otra mano');
      otra.disabled = S().casino.vetado;
      otra.addEventListener('click', () => { bj.fase = 'apuesta'; pintarBJ(); });
      const irse = el('button', 'cerrar', 'Levantarse de la mesa');
      irse.addEventListener('click', () => G.ui.cerrarModal());
      acc.append(otra, irse);
    }
    m.append(acc);
  }
  function salirBJ() {
    if (bj.fase === 'turno') {
      if (!bj.aviso) { bj.aviso = true; G.audio?.error(); pintarBJ(); return; }
      terminarBJ('pierde');
    }
    G.ui.cerrarModal();
  }
  $('#bj-cerrar').addEventListener('click', salirBJ);

  // Teclado con una mesa abierta: Esc para irse; números para elegir carta; P, L y D en el blackjack
  casino.tecla = (e) => {
    const c = e.code;
    if (G.modal === 'caravana') {
      if (c === 'Escape') { salirCaravana(); return true; }
      const n = parseInt(e.key, 10);
      const P = cv.P;
      if (P && P.fin === null && !cv.ocupado && n >= 1 && n <= P.mano[0].length) { cv.sel = cv.sel === n - 1 ? null : n - 1; G.audio?.tecla(); pintarCaravana(); }
      return true;
    }
    if (G.modal === 'blackjack') {
      if (c === 'Escape') { salirBJ(); return true; }
      if (c === 'KeyP') pedir();
      if (c === 'KeyL') plantarse();
      if (c === 'KeyD') doblar();
      return true;
    }
    return false;
  };

  // Para probar las reglas desde la consola
  casino.motor = { nuevaPartida, aplicar, resultado, elegirJugada, jugadas, valor, puedeNumero, valorBJ };
  return casino;
}
