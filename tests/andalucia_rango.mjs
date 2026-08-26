/* Sin botón para "elegir área", y con la ubicación cargando todo lo que
 * está cerca — no sólo el área en la que caes.
 *
 * Fija dos cosas que se pidieron después de la migración a carga
 * perezosa: (1) que no quede ni pantalla ni botón para cambiar de área a
 * mano, porque las nueve están siempre disponibles; y (2) que la
 * ubicación baje los horarios de TODAS las áreas a un radio razonable, no
 * sólo de la más cercana — cerca de una frontera de consorcio (aquí,
 * Sevilla con Huelva) hay paradas de las dos a mano.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8765 &
 *   node tests/andalucia_rango.mjs
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
// CHROMIUM_PATH apunta a un Chromium ya instalado cuando el del paquete no está.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errores = [];
page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('CONSOLE: ' + m.text());
});
await servirLeafletLocal(page);
await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/png', body: Buffer.from('') }));
await page.route('**/api.ctan.es/**', r => r.fulfill({ contentType: 'application/json', body: '{"noticias":[]}' }));

// Un punto dentro del área de Sevilla, a pocos kilómetros de la frontera
// con la de Huelva (sus rectángulos casi se tocan por el oeste del
// Aljarafe): sirve para comprobar que se bajan las DOS, no sólo la de
// dentro.
const CERCA_DE_LA_FRONTERA = { latitude: 37.30, longitude: -6.30 };

await page.addInitScript(coords => {
  // Geolocalización simulada: éxito inmediato con un punto fijo, sin
  // depender del permiso real del navegador ni de contexto seguro.
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: ok => ok({ coords }) }
  });
}, CERCA_DE_LA_FRONTERA);

await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof CTAN !== 'undefined' && CTAN.cargado, null, { timeout: 30000 });
// La ubicación llega asíncrona (una promesa por área) y dispara varios
// repintados; se espera a que se asiente en vez de fijar un número de
// áreas y comprobar antes de tiempo.
await page.waitForFunction(() => CTAN.horarios.size >= 2, null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(300);

let fallos = 0;
const ok = (cond, txt, extra) => {
  console.log((cond ? '  ok   ' : 'FALLA  ') + txt + (extra !== undefined ? '   → ' + extra : ''));
  if (!cond) fallos++;
};

const estado = await page.evaluate(() => ({
  horarios: [...CTAN.horarios].sort(),
  referencia: CTAN.id,
  botonConsorcio: !!document.getElementById('btnConsorcio'),
  hayFuncionSelector: typeof pintarSelectorConsorcio,
  areasEnRango: areasEnRango(37.30, -6.30).sort()
}));
console.log(JSON.stringify(estado, null, 1));
console.log('');

ok(estado.referencia === 1, 'el área de referencia es la más cercana (Sevilla)', estado.referencia);
ok(estado.areasEnRango.includes(1) && estado.areasEnRango.includes(9),
  'areasEnRango() incluye Sevilla y Huelva desde un punto fronterizo',
  JSON.stringify(estado.areasEnRango));
ok(estado.horarios.includes(1) && estado.horarios.includes(9),
  'la ubicación baja los horarios de las dos, no sólo la más cercana',
  JSON.stringify(estado.horarios));
ok(!estado.botonConsorcio, 'no hay botón para cambiar de área a mano');
ok(estado.hayFuncionSelector === 'undefined', 'ni la pantalla de elección existe ya en el código');

/* ------------------------------------------------------------------ */
/* RAPTOR camina sin depender del grafo precalculado                    */
/* ------------------------------------------------------------------ */
// Se vacía el `vecinos` que viene en los datos (el grafo que antes se
// precalculaba en el servidor) para probar que los trasbordos a pie de
// verdad se calculan al vuelo con la distancia en línea recta, no
// leyendo de ahí.
const pie = await page.evaluate(() => {
  const antes = Object.keys(CTAN.vecinos).length;
  const copia = { ...CTAN.vecinos };
  Object.keys(CTAN.vecinos).forEach(k => delete CTAN.vecinos[k]);

  const idPor = n => Object.entries(APP.data.paradas).find(([, p]) => p.nombre.toUpperCase() === n.toUpperCase())[0];
  const chapina = idPor('CHAPINA C GONZALO JIMENEZ DE QUESADA (V)');
  const vecinosDinamicos = vecinosAPie(chapina);

  const arroyo = idPor('AV ANDALUCIA (ARROYO)');
  const conGrafoVacio = calcularOpcionesRuta(APP.data, ROUTING,
    { type: 'stop', id: chapina }, { type: 'stop', id: arroyo },
    new Date('2026-08-18T15:00:00'));

  // Se restaura por si algo más de la página lo necesitase después.
  Object.assign(CTAN.vecinos, copia);

  return {
    vecinosEnDatosAntesDeVaciar: antes,
    vecinosDinamicosDeChapina: vecinosDinamicos.length,
    trasbordos: conGrafoVacio.length,
    primero: conGrafoVacio[0] ? { trasbordos: conGrafoVacio[0].numTrasbordos, linea: conGrafoVacio[0].lineas[0] } : null
  };
});
console.log(JSON.stringify(pie, null, 1));
console.log('');

ok(pie.vecinosEnDatosAntesDeVaciar > 0, 'el área traía un grafo a pie precalculado', pie.vecinosEnDatosAntesDeVaciar);
ok(pie.vecinosDinamicosDeChapina > 0,
  'vecinosAPie() encuentra paradas cercanas por coordenadas, sin ese grafo',
  pie.vecinosDinamicosDeChapina);
ok(pie.trasbordos > 0 && !!pie.primero,
  'y el buscador de rutas sigue encontrando itinerarios con el grafo vacío',
  JSON.stringify(pie.primero));

ok(errores.length === 0, 'sin errores en consola', JSON.stringify(errores));
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
await browser.close();
process.exit(fallos ? 1 : 0);
