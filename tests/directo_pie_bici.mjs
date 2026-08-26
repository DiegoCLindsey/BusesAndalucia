/* Ir directo, a pie o en bicicleta, como una opción más del buscador.
 *
 * Salió de un caso real: Guillena a Mairena del Alcor encontraba un
 * itinerario en autobús de cinco trasbordos que serpenteaba por medio
 * Sevilla (RAPTOR encuentra el que llega antes con ese número de
 * trasbordos, no necesariamente el más sensato) y no había forma de
 * comparar eso con ir directo. Ahora "ir directo" —a pie siempre, en
 * bici si se activa el interruptor— se calcula con la misma distancia en
 * línea recta a 3 km/h que ya se usaba para el aviso de "caminando sería
 * más rápido", y se ofrece como una opción seleccionable más, con la
 * misma pinta que un itinerario en autobús.
 *
 * La bici cunde el doble (mismos km, la mitad de minutos) y es opt-in:
 * no todo el mundo tiene una a mano, así que hay que activarla a mano y
 * se recuerda entre visitas.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8765 &
 *   node tests/directo_pie_bici.mjs
 */
import fs from 'fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

function servirLeafletLocal(page) {
  const dir = process.env.LEAFLET_DIR;
  if (!dir) return Promise.resolve();
  return Promise.all([
    page.route('**/leaflet@*/dist/leaflet.js', r =>
      r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(dir + '/leaflet.js', 'utf8') })),
    page.route('**/leaflet@*/dist/leaflet.css', r =>
      r.fulfill({ contentType: 'text/css', body: fs.readFileSync(dir + '/leaflet.css', 'utf8') }))
  ]);
}

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errores = [];
page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('CONSOLE: ' + m.text());
});
await servirLeafletLocal(page);
await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/png', body: Buffer.from('') }));
await page.addInitScript(() => {
  try { localStorage.setItem('ctanConsorcioV1', JSON.stringify({ id: 1 })); } catch (e) { }
});
await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof CTAN !== 'undefined' && CTAN.cargado && CTAN.horarios.has(1), null, { timeout: 30000 });

let fallos = 0;
const ok = (cond, txt, extra) => {
  console.log((cond ? '  ok   ' : 'FALLA  ') + txt + (extra !== undefined ? '   → ' + extra : ''));
  if (!cond) fallos++;
};

/* ------------------------------------------------------------------ */
/* 1. Guillena a Mairena del Alcor: el caso real                        */
/* ------------------------------------------------------------------ */
await page.evaluate(() => {
  ROUTE_ORIGIN = { type: 'municipio', nombre: 'Guillena' };
  ROUTE_DESTINO = { type: 'municipio', nombre: 'Mairena del Alcor' };
  document.getElementById('horaSalida').value = '2026-08-26T08:00';
});
await page.evaluate(() => irAPantalla('screenRuta'));
await page.waitForTimeout(300);

// Sin bici: 33 km a pie son más de seis horas, así que no se ofrece como
// opción — sólo el aviso, no un pellet más que decir "camina once horas".
await page.click('#btnCalcularRuta');
await page.waitForTimeout(400);
const sinBici = await page.evaluate(() => ({
  n: RUTA_OPCIONES.length,
  todasConBus: RUTA_OPCIONES.every(o => o.lineas.length > 0)
}));
ok(sinBici.n >= 1 && sinBici.todasConBus,
  'sin bici activada, 33 km a pie no se cuela como opción (son >6 h)', JSON.stringify(sinBici));

// Con bici: 33 km en bici son unas cinco horas y media — sí compite, y
// se añade al final de la lista, sin desplazar a la de autobús del
// puesto por defecto. Además, con la bici también puesta a saltar de
// parada en parada, el propio buscador de autobuses puede encontrar
// combinaciones que antes no salían (menos trasbordos, o el mismo número
// pero más rápidas), así que puede que no sea "una opción más": pueden
// ser varias.
await page.click('#btnModoBici');
await page.waitForTimeout(400);
const conBici = await page.evaluate(() => ({
  n: RUTA_OPCIONES.length,
  primeraEsBus: RUTA_OPCIONES[0].lineas.length > 0,
  ultimaEsBici: RUTA_OPCIONES[RUTA_OPCIONES.length - 1].totalPedaleandoMin > 0,
  pills: [...document.querySelectorAll('#rutaOpciones .opcion-pill')].map(b => b.textContent.replace(/\s+/g, ' ').trim()),
  armado: document.getElementById('btnModoBici').classList.contains('armed')
}));
ok(conBici.n > sinBici.n, 'con bici activada aparecen opciones nuevas', `${sinBici.n} → ${conBici.n}`);
ok(conBici.primeraEsBus, 'la opción por defecto sigue siendo la de autobús, no la bici', conBici.primeraEsBus);
ok(conBici.ultimaEsBici, 'la bici (todo el trayecto) se añade al final, no encabeza la lista', conBici.ultimaEsBici);
ok(conBici.armado, 'el interruptor se marca como activado', conBici.armado);
ok(conBici.pills.some(p => /en bici/.test(p)), 'la opción de bici se etiqueta "en bici"', JSON.stringify(conBici.pills));

// Al elegirla, el itinerario se pinta sin líneas de bus ni paradas
// intermedias inventadas: sólo el paseo/pedaleo de un extremo al otro.
await page.evaluate(() => {
  const pills = document.querySelectorAll('#rutaOpciones .opcion-pill');
  pills[pills.length - 1].click();
});
await page.waitForTimeout(300);
const detalle = await page.evaluate(() => ({
  tags: [...document.querySelectorAll('#rutaResultado .itin-tag')].map(t => t.textContent.trim()),
  tramo: document.querySelector('#rutaResultado .itin-andando')?.textContent.trim(),
  hitos: [...document.querySelectorAll('#rutaResultado .itin-parada')].map(p => p.textContent.trim()),
  capasEnMapa: ROUTE_PATH_LAYERS.length
}));
ok(detalle.tags.includes('todo en bici'), 'la ficha dice "todo en bici", no "0 trasbordos"', JSON.stringify(detalle.tags));
ok(/^Pedalea/.test(detalle.tramo || ''), 'el tramo dice "Pedalea", no "Camina"', detalle.tramo);
ok(detalle.hitos.length === 2 && detalle.hitos[0] === 'Tu punto de partida' && detalle.hitos[1] === 'Tu destino',
  'los dos extremos son el origen y el destino, sin paradas de mentira', JSON.stringify(detalle.hitos));
ok(detalle.capasEnMapa === 1, 'el mapa dibuja una única línea directa', detalle.capasEnMapa);

/* ------------------------------------------------------------------ */
/* 2. Sin autobús posible, pero sí a pie: el caso "no tan mala"          */
/* ------------------------------------------------------------------ */
// Dos paradas de áreas distintas (Sevilla y Huelva) a menos de 6 km en
// línea recta: no hay combinación en autobús (las áreas no se tocan en
// estos datos), pero SÍ se puede ir andando en un par de horas. Antes
// esto enseñaba "no se ha encontrado ninguna ruta"; ahora enseña cómo
// llegar igualmente.
await page.evaluate(async () => {
  await asegurarHorarios([1, 9]);
  ROUTE_ORIGIN = { type: 'stop', id: '1_3292' };   // Av Portugal Esq Av Del Parque (Sevilla)
  ROUTE_DESTINO = { type: 'stop', id: '9_248' };   // Esq. De La Fuente Prolongación (Huelva)
  document.getElementById('horaSalida').value = '2026-08-26T08:00';
});
await page.click('#btnCalcularRuta');
await page.waitForTimeout(400);
const sinBus = await page.evaluate(() => ({
  n: RUTA_OPCIONES.length,
  primera: RUTA_OPCIONES[0] ? { lineas: RUTA_OPCIONES[0].lineas.length, min: RUTA_OPCIONES[0].totalCaminandoMin } : null,
  vacio: document.querySelector('#rutaResultado .empty')?.textContent || null
}));
ok(sinBus.n >= 1 && sinBus.primera && sinBus.primera.lineas === 0,
  'sin combinación en autobús entre dos áreas, se ofrece ir a pie igualmente',
  JSON.stringify(sinBus));
ok(!/No se ha encontrado ninguna ruta/.test(sinBus.vacio || ''),
  'ya no se queda en el mensaje genérico de "no se ha encontrado ninguna ruta"');

/* ------------------------------------------------------------------ */
/* 3. La bici cunde el doble que andar, y se recuerda entre visitas     */
/* ------------------------------------------------------------------ */
const tiempos = await page.evaluate(() => {
  const pie = distanciaDirecta(APP.data, { type: 'stop', id: '1_3292' }, { type: 'stop', id: '9_248' }, 'pie');
  const bici = distanciaDirecta(APP.data, { type: 'stop', id: '1_3292' }, { type: 'stop', id: '9_248' }, 'bici');
  return { pie, bici };
});
ok(tiempos.bici.minutos === Math.round(tiempos.pie.minutos / 2),
  'los minutos en bici son la mitad que a pie, para la misma distancia',
  JSON.stringify(tiempos));

await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof CTAN !== 'undefined' && CTAN.cargado && CTAN.horarios.has(1), null, { timeout: 30000 });
const persistido = await page.evaluate(() => MODO_BICI);
ok(persistido === true, 'el interruptor de bici se recuerda entre visitas', persistido);

ok(errores.length === 0, 'sin errores en consola', JSON.stringify(errores));
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
await browser.close();
process.exit(fallos ? 1 : 0);
