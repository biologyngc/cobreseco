# Cobreseco

Juego de rol en primera persona para el navegador, con un western postapocalíptico en el desierto. Despiertas en la clínica con una bala en el hombro y un carné de zahorí. El pozo está seco y los Cuervos vigilan el pueblo desde el sur.

Está hecho con [Three.js](https://threejs.org/) (r160), sin compilación ni dependencias que instalar.

**Jugar en el navegador:** https://biologyngc.github.io/cobreseco/

## Jugar en local

Los módulos de JavaScript tienen que servirse por HTTP: abrir `index.html` con doble clic no funciona.

```bash
python servidor.py
```

Después abre http://localhost:8000. Cualquier otro servidor estático también vale.

## Controles

| Tecla | Acción |
| --- | --- |
| WASD · Mayús | Moverse · correr |
| Ratón | Mirar, disparar (clic izquierdo) y apuntar (clic derecho) |
| E | Hablar, abrir, recoger |
| C | Agacharse (sigilo) |
| Q | M.I.R.A.: apuntar a partes del cuerpo |
| 1–8 · rueda | Pistola, rifle, escopeta, pico, revólver, subfusil, carabina, machete |
| R · Z | Recargar · enfundar el arma |
| G | Lanzar dinamita |
| H | Inyectarse suero |
| T | Esperar o dormir |
| Tab · M | Brazal: estado, objetos, misiones, mapa y radio · mapa directo |
| L | Linterna del brazal |
| F5 · F9 | Guardado rápido · cargar |

## Qué tiene

- Pueblo con edificios con interior, cinco misiones, encargos diarios en el tablón del sheriff y encuentros por los caminos.
- Vía Muerta, la estación del Riel: una locomotora de vapor que hay que poner en marcha, tres misiones con decisiones (el trato del agua se cierra hablando, pagando o con ciencia) y el asalto de los saqueadores.
- Compañeros: Rafa Brasas, guardia del Riel con carabina, y Canelo, el perro de la granja. Te siguen, esperan donde les digas, pelean a tu lado y dan una ventaja; a Rafa le puedes dar cosas para que las lleve.
- Casino El Vagón de la Suerte: Caravana (el juego de cartas de New Vegas) contra Sol y blackjack, con apuestas. Si le ganas demasiado a la casa, te echan.
- Otras ubicaciones con misión propia: la Mina del Cobre Viejo (tomada por saqueadores), la Granja de los Nogales y una caravana calcinada.
- Los vecinos se defienden si les atacas: los armados pelean, recargan y te persiguen, y los demás huyen. Con poca vida salen corriendo, y los personajes esenciales quedan inconscientes en vez de morir.
- Crímenes con testigos, multas y arresto: puedes pagar, pasar la noche en el calabozo, convencer al sheriff o resistirte.
- Karma y fama con el pueblo, los Cuervos y el Riel, ventajas cada dos niveles, estado de las armas con reparación y encasquillamientos, peso, sed y cansancio en modo extremo, contenedores con dueño, fabricación en hogueras y bancos de trabajo, heridas por miembro y viaje rápido.
- Armas animadas en primera persona: recarga por tipo de arma, cerrojo, casquillos, humo, golpe con pico y dinamita con explosión.

## Créditos y licencias

El código del juego lo escribió Claude (Anthropic). Los modelos 3D son de otros autores y se usan con su licencia. **El juego no es comercial**: varios modelos son CC BY-NC 4.0 y no se pueden usar con fines comerciales.

Las texturas se redujeron y las mallas se simplificaron para el navegador.

### Personajes y animaciones: Mixamo (Adobe)

The Boss (sheriff Ocaña), Olivia (Inés), Kate (Lupe), Martha (Paz), Peasant Man (Chema), Louise (Nieves), Survivor (Garza), Gas Mask y Brute (Cuervos). Animaciones de reposo, andar, correr, apuntar, disparar, golpe, morir, hablar, sentarse y mirar alrededor. Se usan según las condiciones de Mixamo y no se distribuyen como archivos sueltos para reutilizar.

### Casas e interiores: Sketchfab, CC BY 4.0

- «Old Western Bank With Interior Low Poly», Elvair Lima (la clínica)
- «Abandoned Building – Shop – Old House», Erroratten (Ultramarinos Paz)
- «Saloon Modular Interior (Assembled)», LaurenD (La Sed)
- «Old House – Wooden, Enterable, Rusty», YadroGames (casa de Nieves)
- «Western Town House 1», Anthony Ferrandiz (casa de Lupe)
- «Sheriff Office», OnyxDarkKnight (casa de adobe)
- «Shanty Mansion – Wooden», Erroratten (chabola de Garza)
- «Medical Examination Bed – Game Ready Asset», INGSOC1984

### Otros modelos de Sketchfab

- «Realistic HD Saguaro cactus (9/30)», PlantCatalog · CC BY 4.0
- «Joshua Trees», evolveduk · Sketchfab Free Standard
- «Desert | Rocks | Stones | Pack», YadroGames · CC BY 4.0
- «Generic Water Tower [Free Asset Pack]», Lex713 · CC BY 4.0
- «Radio tower», Gunnar Correa · CC BY 4.0
- «Gas Pump», xrooshka · CC BY 4.0
- «Water Hand Pump», maliknsj · CC BY 4.0
- «Army tent», FinBeastMode · CC BY 4.0
- «Old Rusty Car», Renafox · CC BY-NC 4.0
- «Abandoned Generic Sedan 1 – Game Ready», Rashad Ibrahimli · CC BY 4.0
- «Crashed Abandoned Truck – Game Ready», Rashad Ibrahimli · CC BY 4.0
- «Computer Terminal», ChrisSweetwood · CC BY-SA 4.0
- «Skeleton», Diego Luján García · CC BY 4.0
- «WOLF – Realistic 3D Model (DEMO FREE)», WildMesh 3D · CC BY-NC 4.0
- «Model 40A – Walking Tokay Gecko "Big Mama"», DigitalLife3D · CC BY-NC 4.0

### Poly Haven: CC0 (dominio público)

Service Pistol, Bolt Action Rifle 7.62, Barrel 01, Wooden Crate 01, Old Military Crate, Old Tyre, Metal Jerrycan, Rusted Wheel Rim 01, Stone Fire Pit, Cash Register 01, Metal Office Desk, Wooden Chair 01, Lantern 01, Portable Generator, Utility Box 01, Wild Rooibos Bush, Cheiridopsis Succulent y Dead Tree Trunk. En los interiores: Wooden Table 02, Wooden Stool 02, Shelf 01, Wooden Bookshelf Worn, Steel Frame Shelves 01, Old Bed Frame, Vintage Cabinet 01, Medical Box, Rocking Chair 01, Bar Chair Round 01, Wine Barrel 01, Wooden Display Shelves 01, Vintage Oil Lamp, Wall Clock y Ceiling Fan.

Cobreseco es un proyecto de aficionado sin relación con Bethesda ni con la saga Fallout.
