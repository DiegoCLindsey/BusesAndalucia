/* Toda Andalucía en la aplicación, con los horarios bajándose a demanda.
 *
 * Comprueba lo que cambia al pasar de "un área cada vez" a "las nueve
 * siempre": que el catálogo trae las 5.009 paradas y las 432 líneas sin
 * bajar ni un horario, que abrir algo de otra área lo baja solo, y que los
 * favoritos guardados con el formato de antes se recuperan con su prefijo.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8765 &
 *   node tests/andalucia.mjs
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
const page = await browser.newPage({ viewport: { width: 430, height: 950 } });
const errores = [];
page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('CONSOLE: ' + m.text());
});
await servirLeafletLocal(page);
await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/png', body: Buffer.from('') }));
// Los avisos salen a la API de verdad; en las pruebas no se sale a la red.
await page.route('**/api.ctan.es/**', r => r.fulfill({ contentType: 'application/json', body: '{"noticias":[]}' }));

// Se cuenta qué horarios se piden de verdad: la prueba entera va de eso.
const pedidos = [];
page.on('request', r => {
  const m = r.url().match(/\/data\/(\d+)\/horarios\.json/);
  if (m) pedidos.push(Number(m[1]));
});

let fallos = 0;
const ok = (cond, txt, extra) => {
  console.log((cond ? '  ok   ' : 'FALLA  ') + txt + (extra !== undefined ? '   → ' + extra : ''));
  if (!cond) fallos++;
};

// Favoritos con el formato de antes: una caja por área y el número pelado.
await page.addInitScript(() => {
  try {
    localStorage.setItem('ctanConsorcioV1', JSON.stringify({ id: 1 }));
    localStorage.setItem('ctanFavoritosV2:1', JSON.stringify({
      paradas: [{ id: '3287', nombre: 'AV ANDALUCIA (ARROYO)' }],
      lineas: [], rutas: [], notificaciones: []
    }));
  } catch (e) { }
});
await page.clock.install({ time: new Date('2026-08-18T14:45:00') });   // un martes
await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof CTAN !== 'undefined' && CTAN.cargado && CTAN.horarios.has(1), null, { timeout: 30000 });

const arranque = await page.evaluate(() => ({
  paradas: Object.keys(CTAN.paradas).length,
  lineas: CTAN.lineas.length,
  municipios: CTAN.municipios.length,
  areasConHorarios: [...CTAN.horarios].sort(),
  favorita: FAVORITOS.paradas[0],
  // Todas las paradas tienen que llevar el prefijo de su área, o dos áreas
  // en memoria a la vez se pisarían.
  sinPrefijo: Object.keys(CTAN.paradas).filter(id => !/^\d+_/.test(id)).length
}));
console.log(JSON.stringify(arranque, null, 1));
console.log('');

ok(arranque.paradas === 5009, 'el catálogo trae las paradas de las nueve áreas', arranque.paradas);
ok(arranque.lineas === 432, 'y todas las líneas', arranque.lineas);
ok(arranque.municipios === 234, 'y todos los municipios', arranque.municipios);
ok(arranque.sinPrefijo === 0, 'con el prefijo del área en cada identificador', arranque.sinPrefijo + ' sin él');
ok(arranque.areasConHorarios.length === 1 && arranque.areasConHorarios[0] === 1,
  'pero sólo con los horarios del área en la que estás', JSON.stringify(arranque.areasConHorarios));
ok(arranque.favorita && arranque.favorita.id === '1_3287',
  'el favorito guardado por áreas se recupera con su prefijo',
  arranque.favorita && arranque.favorita.id);

// Una línea de Granada: está en el listado desde el primer momento, y al
// abrirla se bajan sus horarios sin que haya que cambiar de área.
const granada = await page.evaluate(() => {
  const l = CTAN.lineas.find(x => x.idc === 3);
  return { slug: l.slug, titulo: l.titulo, recorridoAntes: l.orden_unificado.length };
});
ok(granada.recorridoAntes === 0, 'una línea de otra área aparece sin recorrido hasta abrirla', granada.recorridoAntes);

await page.evaluate(() => irAPantalla('screenLineas'));
await page.evaluate(slug => mostrarDetalleLinea(slug), granada.slug);
await page.waitForFunction(() => CTAN.horarios.has(3), null, { timeout: 30000 });
await page.waitForTimeout(900);

const tras = await page.evaluate(slug => {
  const l = CTAN.lineas.find(x => x.slug === slug);
  return {
    areas: [...CTAN.horarios].sort(),
    recorrido: l.orden_unificado.length,
    paradasEnFicha: document.querySelectorAll('#lineDetail .stop-item-circular').length,
    // Los bloques de las dos áreas conviven: nada se ha tirado al cargar.
    bloquesPorArea: [1, 3].map(idc => CTAN.bloques.filter(b =>
      CTAN.lineas.find(x => x.slug === b.lineaSlug).idc === idc).length)
  };
}, granada.slug);
console.log(JSON.stringify(tras, null, 1));
console.log('');

ok(tras.areas.join(',') === '1,3', 'abrirla baja sus horarios y conserva los de la otra', tras.areas.join(','));
ok(tras.recorrido > 1, 'y ya tiene recorrido', tras.recorrido + ' paradas');
ok(tras.paradasEnFicha > 1, 'que es lo que pinta la ficha', tras.paradasEnFicha + ' filas');
ok(tras.bloquesPorArea[0] > 0 && tras.bloquesPorArea[1] > 0,
  'los horarios de las dos áreas conviven en memoria', JSON.stringify(tras.bloquesPorArea));
ok(pedidos.filter(x => x === 1).length === 1 && pedidos.filter(x => x === 3).length === 1,
  'cada área se pide una sola vez', JSON.stringify(pedidos));

// Y una ruta dentro de Granada funciona ya, con su grafo a pie.
const ruta = await page.evaluate(() => {
  const ids = [...CTAN.porParada.keys()].filter(id => id.startsWith('3_'));
  let semilla = 77, con = 0, pares = 0;
  const rnd = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 20; i++) {
    const a = ids[Math.floor(rnd() * ids.length)], b = ids[Math.floor(rnd() * ids.length)];
    if (a === b) continue;
    pares++;
    if (calcularOpcionesRuta(APP.data, ROUTING, { type: 'stop', id: a }, { type: 'stop', id: b },
      new Date('2026-08-18T09:00:00')).length) con++;
  }
  return { con, pares, vecinos: Object.keys(ROUTING.vecinos).length };
});
ok(ruta.con >= ruta.pares * 0.6, 'se calculan rutas dentro de Granada', `${ruta.con}/${ruta.pares}`);
ok(ruta.vecinos > 2000, 'con el grafo a pie de las dos áreas', ruta.vecinos + ' paradas con vecinos');

ok(errores.length === 0, 'sin errores en consola', JSON.stringify(errores));
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
await browser.close();
process.exit(fallos ? 1 : 0);
