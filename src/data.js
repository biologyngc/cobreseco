// Datos del juego: lugares, objetos, enemigos, personajes y misiones.
// Equivalen a lo que en Fallout guarda el .esm: se editan sin tocar el motor.

export const LUGARES = {
  cobreseco: { nombre: 'Cobreseco', x: 0, z: 0, r: 58 },
  arroyo: { nombre: 'Arroyo Ceniza', x: 10, z: -125, r: 40 },
  ocaso: { nombre: 'Gasolinera Ocaso', x: 150, z: 25, r: 34 },
  eco: { nombre: 'Cerro del Eco', x: -150, z: -40, r: 26 },
  cuervo: { nombre: 'Campamento Cuervo', x: 35, z: 165, r: 32 },
};

// peso en kilos (la munición no pesa, como en New Vegas fuera del modo extremo);
// arma.clase decide animaciones y ventajas; desgaste es lo que pierde de estado por disparo.
export const OBJETOS = {
  pistola9: {
    nombre: 'Pistola de 9 mm', tipo: 'arma', valor: 120, peso: 2,
    arma: { clase: 'pistola', dano: 15, cadencia: 0.3, cargador: 13, municion: 'm9mm', dispersion: 0.014, pa: 17, critico: 0.05, alcance: 110, recarga: 1.6, zoom: 55, desgaste: 0.35 },
  },
  rifle308: {
    nombre: 'Rifle de cerrojo', tipo: 'arma', valor: 320, peso: 7,
    arma: { clase: 'rifle', dano: 44, cadencia: 1.05, cargador: 5, municion: 'm308', dispersion: 0.004, pa: 26, critico: 0.1, alcance: 260, recarga: 2.6, zoom: 22, mira: true, cerrojo: true, desgaste: 0.6 },
  },
  escopeta: {
    nombre: 'Escopeta de dos cañones', tipo: 'arma', valor: 280, peso: 6,
    arma: { clase: 'escopeta', dano: 8, perdigones: 8, cadencia: 0.45, cargador: 2, municion: 'cartucho', dispersion: 0.055, pa: 30, critico: 0.04, alcance: 38, recarga: 2.3, zoom: 58, desgaste: 0.9 },
  },
  pico: {
    nombre: 'Pico de minero', tipo: 'arma', valor: 45, peso: 5, texto: 'De cuando la mina daba cobre. Pega con la Fuerza.',
    arma: { clase: 'cuerpo', dano: 24, cadencia: 0.9, alcance: 2.5, pa: 22, critico: 0.08, zoom: 72, desgaste: 0.25, cuerpo: true },
  },
  dinamita: { nombre: 'Cartucho de dinamita', tipo: 'explosivo', valor: 35, peso: 0.5, texto: 'G para encender y lanzar. La mecha dura tres segundos.' },
  m9mm: { nombre: 'Balas de 9 mm', tipo: 'municion', valor: 2, peso: 0 },
  m308: { nombre: 'Balas .308', tipo: 'municion', valor: 4, peso: 0 },
  cartucho: { nombre: 'Cartuchos del 12', tipo: 'municion', valor: 3, peso: 0 },
  suero: { nombre: 'Jeringa de suero', tipo: 'consumible', valor: 50, cura: 40, miembros: 30, peso: 0, texto: 'Cura 40 PV poco a poco y algo de los miembros heridos.' },
  agua: { nombre: 'Agua turbia', tipo: 'consumible', valor: 8, cura: 8, sed: 150, peso: 1, texto: 'Cura 8 PV y quita algo de sed.' },
  agua_limpia: { nombre: 'Agua limpia', tipo: 'consumible', valor: 22, cura: 12, sed: 320, peso: 1, texto: 'Hervida o del pozo. Cura 12 PV y quita mucha sed.' },
  cecina: { nombre: 'Cecina de lagarto', tipo: 'consumible', valor: 14, cura: 15, sed: -40, peso: 0.5, texto: 'Cura 15 PV. Da algo de sed.' },
  carne: { nombre: 'Carne de lagarto', tipo: 'chatarra', valor: 6, peso: 1, texto: 'En una hoguera se hace cecina.' },
  chatarra: { nombre: 'Chatarra', tipo: 'chatarra', valor: 4, peso: 1, texto: 'Tornillos, muelles y chapa. Sirve en el banco de trabajo.' },
  polvora: { nombre: 'Pólvora de mina', tipo: 'chatarra', valor: 15, peso: 0.5, texto: 'De los tiempos de la mina. Con chatarra se hace dinamita.' },
  kit_reparacion: { nombre: 'Kit de reparación', tipo: 'herramienta', valor: 60, peso: 2, texto: 'Arregla el arma que llevas en la mano. Cuanto más Reparar, mejor.' },
  ropa_viaje: { nombre: 'Ropa de viaje', tipo: 'ropa', valor: 20, dt: 1, peso: 2 },
  guardapolvo: { nombre: 'Guardapolvo de cuero', tipo: 'ropa', valor: 160, dt: 5, peso: 5 },
  chaleco: { nombre: 'Chaleco de placas', tipo: 'ropa', valor: 280, dt: 9, peso: 14 },
  horquilla: { nombre: 'Horquilla', tipo: 'herramienta', valor: 3, peso: 0, texto: 'Para forzar cerraduras.' },
  llave_ocaso: { nombre: 'Llave «OFICINA»', tipo: 'clave', valor: 0, peso: 0, texto: 'Abre la oficina de la gasolinera Ocaso.' },
  valvula: { nombre: 'Válvula de bomba', tipo: 'clave', valor: 0, peso: 2, texto: 'Lupe la necesita para la bomba del pozo.' },
  fusible: { nombre: 'Fusible cerámico', tipo: 'clave', valor: 40, peso: 0.5, texto: 'Repuesto para el repetidor de radio.' },
};

// Armas de los personajes (el modelo es el de la misma arma del jugador). ideal: distancia a la que
// prefieren pelear; precision: probabilidad de acertar a quemarropa contra alguien quieto.
export const ARMAS_NPC = {
  pistola: { modelo: 'pistola9', dano: 8, cadencia: 1.2, alcance: 45, precision: 0.42, cargador: 9, recarga: 2.2, ideal: 15 },
  revolver: { modelo: 'pistola9', dano: 15, cadencia: 1.1, alcance: 55, precision: 0.55, cargador: 6, recarga: 2.6, ideal: 17 },
  rifle: { modelo: 'rifle308', dano: 20, cadencia: 1.7, alcance: 80, precision: 0.5, cargador: 5, recarga: 3.0, ideal: 26, rifle: true },
  escopeta: { modelo: 'escopeta', dano: 18, cadencia: 1.5, alcance: 20, precision: 0.62, cargador: 2, recarga: 2.6, ideal: 8, rifle: true },
};

// Umbral de valentía: huyen cuando su vida baja de esta fracción (tabla del .exe de New Vegas).
export const VALENTIA = { cobarde: 1000, cauto: 0.375, normal: 0.1875, valiente: 0.0375, temerario: 0 };

export const TIPOS = {
  lagarto: {
    nombre: 'Lagarto de ceniza', forma: 'lagarto', nivel: 2, vida: 30, dt: 0, dano: 7, alcance: 1.8, cadencia: 1.1,
    velocidad: 5.4, criatura: true, valentia: 'normal', percepcion: 5, color: '#7d7f6a', vientre: '#d0853e', botin: { carne: 1 },
  },
  lagarto_alfa: {
    nombre: 'Lagarto alfa', forma: 'lagarto', nivel: 5, vida: 80, dt: 2, dano: 13, alcance: 2.3, cadencia: 1.2,
    velocidad: 5.8, criatura: true, valentia: 'valiente', percepcion: 6, color: '#5b5f55', vientre: '#c4552e', escala: 1.45,
    botin: { carne: 2 },
  },
  perro: {
    nombre: 'Perro salvaje', forma: 'perro', nivel: 3, vida: 38, dt: 0, dano: 8, alcance: 1.7, cadencia: 0.9,
    velocidad: 6.8, criatura: true, valentia: 'cauto', percepcion: 7, color: '#6e5a45', vientre: '#9a8466', botin: {},
  },
  cuervo: {
    nombre: 'Cuervo', forma: 'humano', nivel: 4, vida: 60, dt: 3, dano: 8, alcance: 45, cadencia: 1.2, velocidad: 4.6,
    criatura: false, valentia: 'cauto', percepcion: 6, distancia: true, precision: 0.4, arma: 'pistola', dinamita: 1,
    ropa: '#2b2a2e', piel: '#b57f5c', sombrero: 'panuelo', acento: '#5a1f1b', botin: { m9mm: 9, cobres: 14 },
  },
  garza: {
    nombre: 'Garza', forma: 'humano', nivel: 8, vida: 150, dt: 6, dano: 20, alcance: 70, cadencia: 1.7, velocidad: 4.3,
    criatura: false, valentia: 'temerario', percepcion: 7, distancia: true, precision: 0.5, rifle: true, arma: 'rifle', dinamita: 2,
    ropa: '#1d1c22', piel: '#8f5d43', sombrero: 'ala', acento: '#c9c2b4', botin: { chaleco: 1, m308: 10, cobres: 90 },
  },
};

// Personajes con nombre. 'yaw' es hacia dónde miran (0 = sur, PI/2 = este).
// Cada uno está dentro de su edificio; 'sentado' usa la animación de silla; 'casa' es el camino
// (de la calle a la puerta) por el que se van a dormir de 21:30 a 6:30, y 'entra' que desaparecen dentro.
// Combate: 'arma' (de ARMAS_NPC; sin arma, huyen), 'valentia' (cuándo se retiran) y 'esencial':
// los esenciales no mueren, caen inconscientes un rato, como en New Vegas, para no romper las misiones.
export const PERSONAJES = [
  { id: 'ines', nombre: 'Dra. Inés Varela', vida: 80, valentia: 'cauto', esencial: true, x: -20.5, z: -9.2, yaw: Math.PI / 2, ropa: '#e8e1d3', piel: '#c9946d', pelo: '#2b211b', sombrero: 'ninguno', acento: '#4f8f86' },
  { id: 'ocana', nombre: 'Sheriff Ocaña', vida: 170, dt: 4, nivel: 8, arma: 'revolver', valentia: 'valiente', esencial: true, x: 22.05, z: 17.6, yaw: -Math.PI / 2, sentado: true, ropa: '#6b5440', piel: '#a8714f', sombrero: 'ala', acento: '#d9a441' },
  { id: 'lupe', nombre: 'Lupe Arce', vida: 100, arma: 'pistola', valentia: 'normal', esencial: true, x: 3.4, z: -1.6, yaw: -2.4, ropa: '#3f5b6b', piel: '#b98563', pelo: '#3a2618', sombrero: 'gorra', acento: '#c8743a', ronda: [[3.4, -1.6], [-2.6, 2.6], [-2.4, -2.8]], casa: [[6, 14], [9, 28.6]], entra: true },
  { id: 'paz', nombre: 'Paz Molina', vida: 90, arma: 'escopeta', valentia: 'normal', esencial: true, x: 19.9, z: -6.4, yaw: -Math.PI / 2, ropa: '#7a3e2c', piel: '#d2a07c', pelo: '#5b3b26', sombrero: 'ninguno', acento: '#e3c27a' },
  { id: 'chema', nombre: 'Chema', vida: 70, valentia: 'cobarde', botin: { cobres: 12, agua: 1 }, x: -24.6, z: 16.55, yaw: Math.PI, ropa: '#55603f', piel: '#c08a62', sombrero: 'ala', acento: '#7b5b3a' },
  { id: 'nieves', nombre: 'Nieves', vida: 55, valentia: 'cobarde', botin: { cecina: 2, cobres: 5 }, x: -4, z: -12, yaw: 0, ropa: '#8a6a8f', piel: '#d7a885', pelo: '#a9a39b', sombrero: 'ninguno', acento: '#cfc3a8', ronda: [[-4, -12], [8, -6], [6, 10], [-8, 8]], casa: [[-4, 14], [-7.7, 27.4]], entra: true },
];

export const ENEMIGOS = [
  ...[[-22, -126], [-8, -121], [6, -131], [20, -122], [32, -128], [44, -120]].map(([x, z], i) => ({ id: `lagarto${i}`, tipo: 'lagarto', x, z, zona: 'arroyo' })),
  { id: 'lagarto_alfa', tipo: 'lagarto_alfa', x: 12, z: -138, zona: 'arroyo' },
  { id: 'lagarto_suelto1', tipo: 'lagarto', x: -85, z: -72 },
  { id: 'lagarto_suelto2', tipo: 'lagarto', x: 92, z: -46 },
  { id: 'perro0', tipo: 'perro', x: 158, z: 44 },
  { id: 'perro1', tipo: 'perro', x: 163, z: 38 },
  { id: 'perro2', tipo: 'perro', x: 140, z: 45 },
  { id: 'cuervo0', tipo: 'cuervo', x: 28, z: 160, campamento: true },
  { id: 'cuervo1', tipo: 'cuervo', x: 42, z: 158, campamento: true },
  { id: 'cuervo2', tipo: 'cuervo', x: 30, z: 173, campamento: true },
  { id: 'cuervo3', tipo: 'cuervo', x: 45, z: 171, campamento: true },
  { id: 'garza', tipo: 'garza', x: 37, z: 168, yaw: Math.PI, campamento: true, nombre: 'Garza' },
];

export const MISIONES = {
  q1: {
    titulo: 'Segunda vida',
    etapas: [
      { texto: 'Habla con la doctora Inés en la clínica.', obj: 'ines' },
      { texto: 'Recoge tu equipo del baúl de la clínica.', obj: 'baul' },
      { texto: 'Rompe 3 botellas en el campo de tiro, detrás de La Sed.', obj: 'campo_tiro', cuenta: 3 },
      { texto: 'Preséntate al sheriff Ocaña.', obj: 'ocana' },
    ],
    premio: { xp: 100, objetos: { suero: 2 } },
  },
  q2: {
    titulo: 'Plaga en el arroyo',
    etapas: [
      { texto: 'Mata a los lagartos del arroyo Ceniza, al norte.', obj: 'arroyo', cuenta: 6 },
      { texto: 'Vuelve con el sheriff Ocaña.', obj: 'ocana' },
    ],
    premio: { xp: 150, cobres: 80 },
  },
  q3: {
    titulo: 'La bomba muerta',
    etapas: [
      { texto: 'Busca una válvula en la oficina de la gasolinera Ocaso, al este.', obj: 'valvula' },
      { texto: 'Lleva la válvula a Lupe, junto al pozo.', obj: 'lupe' },
    ],
    premio: { xp: 200, objetos: { rifle308: 1, m308: 15 } },
  },
  q4: {
    titulo: 'Señal en la colina',
    etapas: [
      { texto: 'Consigue un fusible cerámico. Paz vende uno.', obj: 'paz' },
      { texto: 'Repara el repetidor del cerro del Eco, al oeste.', obj: 'repetidor' },
      { texto: 'Cuéntale al sheriff lo que oíste por la radio.', obj: 'ocana' },
    ],
    premio: { xp: 200, cobres: 60 },
  },
  q5: {
    titulo: 'Los Cuervos',
    etapas: [
      { texto: 'Ve al campamento Cuervo, al sur, y resuelve lo de Garza.', obj: 'garza' },
      { texto: 'Vuelve con el sheriff Ocaña.', obj: 'ocana' },
    ],
    premio: { xp: 300, cobres: 150 },
  },
};

export const TIENDA_PAZ = { m9mm: 60, m308: 20, cartucho: 24, suero: 4, agua: 6, agua_limpia: 2, cecina: 3, horquilla: 8, dinamita: 3, kit_reparacion: 2, chatarra: 4, escopeta: 1, pico: 1, guardapolvo: 1, fusible: 1 };
export const TIENDA_BUHONERO = { agua: 4, cecina: 4, suero: 2, m9mm: 40, m308: 10, cartucho: 16, horquilla: 5, dinamita: 2, polvora: 2, chatarra: 3, escopeta: 1 };

// Ventajas: una cada dos niveles. req: nivel mínimo y atributos.
export const VENTAJAS = {
  pistolero: { nombre: 'Pistolero', texto: '+25 % de daño con pistolas y 20 % menos PA por disparo en M.I.R.A.', req: { nivel: 2, AGI: 5 } },
  piel_curtida: { nombre: 'Piel curtida', texto: '+3 de umbral de daño. El sol del yermo ya no te quema.', req: { nivel: 2, RES: 5 } },
  zahori: { nombre: 'Zahorí de verdad', texto: 'La sed sube un 40 % más despacio y el agua cura el doble.', req: { nivel: 2 } },
  bolsillos: { nombre: 'Bolsillos de minero', texto: '+40 kg de carga.', req: { nivel: 2, FUE: 5 } },
  regateo: { nombre: 'Lengua de mercader', texto: 'Compras un 10 % más barato y vendes un 10 % más caro.', req: { nivel: 2, CAR: 5 } },
  puno: { nombre: 'Brazo de picador', texto: '+50 % de daño cuerpo a cuerpo.', req: { nivel: 2, FUE: 6 } },
  manos_rapidas: { nombre: 'Manos rápidas', texto: 'Recargas un 30 % más rápido.', req: { nivel: 4, AGI: 6 } },
  ojo_halcon: { nombre: 'Ojo de halcón', texto: '+5 % de probabilidad de crítico.', req: { nivel: 4, PER: 6 } },
  medico: { nombre: 'Médico de campaña', texto: 'Los sueros curan un 50 % más y sanan miembros.', req: { nivel: 4, INT: 5 } },
  dinamitero: { nombre: 'Dinamitero', texto: 'La dinamita hace un 50 % más de daño y llega más lejos.', req: { nivel: 4 } },
  pies_ligeros: { nombre: 'Pies de gato', texto: 'Agachado vas un 25 % más rápido y haces menos ruido.', req: { nivel: 4, AGI: 6 } },
};

// Recetas. donde: 'hoguera' o 'banco'. hab: habilidad mínima.
export const RECETAS = [
  { id: 'cecina', donde: 'hoguera', nombre: 'Cecina de lagarto', usa: { carne: 2 }, da: { cecina: 2 }, hab: { supervivencia: 15 } },
  { id: 'agua_hervida', donde: 'hoguera', nombre: 'Agua hervida', usa: { agua: 2 }, da: { agua_limpia: 1 }, hab: { supervivencia: 25 } },
  { id: 'kit', donde: 'banco', nombre: 'Kit de reparación', usa: { chatarra: 3 }, da: { kit_reparacion: 1 }, hab: { reparar: 30 } },
  { id: 'dinamita', donde: 'banco', nombre: 'Cartucho de dinamita', usa: { chatarra: 1, polvora: 1 }, da: { dinamita: 2 }, hab: { explosivos: 30 } },
  { id: 'cartuchos', donde: 'banco', nombre: 'Cartuchos del 12 recargados', usa: { chatarra: 1, polvora: 1 }, da: { cartucho: 8 }, hab: { reparar: 25 } },
];

// Contenedores del mundo. dueno: si es de alguien, coger es robar. cerradura: nivel de Ganzúa.
export const CONTENEDORES = {
  armario_clinica: { nombre: 'Armario de la clínica', dueno: 'ines', objetos: { suero: 2, agua_limpia: 1, chatarra: 1 } },
  estante_paz: { nombre: 'Trastienda de Paz', dueno: 'paz', objetos: { chatarra: 3, cecina: 2, cartucho: 6, polvora: 1 } },
  taquilla_sheriff: { nombre: 'Taquilla del sheriff', dueno: 'ocana', cerradura: 25, objetos: { m9mm: 24, dinamita: 1, kit_reparacion: 1, cobres: 40 } },
  cajas_cuervo: { nombre: 'Cajas de los Cuervos', objetos: { polvora: 2, dinamita: 2, m9mm: 20, cobres: 35 } },
  armario_ocaso: { nombre: 'Archivador de Benito', objetos: { chatarra: 4, agua: 1, kit_reparacion: 1 } },
  caja_repetidor: { nombre: 'Caja de herramientas', objetos: { chatarra: 2, polvora: 1 } },
};

// Karma y fama, con nombres del pueblo
export const KARMA = [[750, 'Santo del pozo'], [250, 'Buena gente'], [-249, 'Forastero'], [-749, 'Mala sombra'], [-Infinity, 'Azote del desierto']];
export const FAMA = [[30, 'Idolatrado'], [15, 'Querido'], [5, 'Aceptado'], [-4, 'Desconocido'], [-14, 'Mal visto'], [-Infinity, 'Odiado']];
