/* Comprobación de que la aplicación se usa de punta a punta.
 *
 * Recorre lo que hace un vecino cualquiera: mirar su parada, calcular una
 * ruta de municipio a municipio y guardar la ruta. No pretende cubrir
 * todas las pantallas, sino que ninguna reviente.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8765 &
 *   node tests/pantallas.mjs
 */
import fs from 'fs';

// Playwright se resuelve como cualquier dependencia; PLAYWRIGHT_MODULE
// permite apuntar a una instalación global cuando no hay node_modules.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Si no hay salida a internet, se puede servir Leaflet desde disco:
//   LEAFLET_DIR=./node_modules/leaflet/dist node tests/<fichero>.mjs
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
// Sin tiles: el mapa no pinta nada en las pruebas y así no se sale a la red.
await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/png', body: Buffer.from('') }));
// Los datos van por área metropolitana: se fija Sevilla para no toparse
// con el selector del primer arranque.
await page.addInitScript(() => {
  try { localStorage.setItem('ctanConsorcioV1', JSON.stringify({ id: 1 })); } catch (e) { }
});
await page.clock.install({ time: new Date('2026-08-18T07:30:00') });
await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof CTAN !== 'undefined' && CTAN.cargado, null, { timeout: 30000 });

let fallos = 0;
const ok = (cond, txt, extra) => {
  console.log((cond ? '  ok   ' : 'FALLA  ') + txt + (extra !== undefined ? '   → ' + extra : ''));
  if (!cond) fallos++;
};

// --- Horario de una parada -------------------------------------------
await page.evaluate(() => {
  const id = Object.entries(APP.data.paradas).find(([, p]) => /^AV ANDALUCIA \(ARROYO\)$/i.test(p.nombre))[0];
  openModal(c => buildStopScheduleModalContent(c, id));
});
await page.waitForTimeout(400);
const ficha = await page.locator('#modalContent').innerText();
ok(/AV ANDALUCIA \(ARROYO\)/i.test(ficha), 'la ficha de parada abre');
ok(/hacia/.test(ficha), 'y dice hacia dónde va cada línea');
ok(!/ - .* - .* - /.test(ficha), 'sin el recorrido entero de la línea en cada fila');
ok(!/\$\{/.test(ficha), 'sin plantillas sin interpolar');
await page.locator('#modalCloseBtn').click();
await page.waitForTimeout(300);

// --- Ruta de municipio a municipio -----------------------------------
await page.evaluate(() => irAPantalla('screenRuta'));
await page.waitForTimeout(300);
await page.locator('#origenInput').fill('Municipio: Sevilla');
await page.locator('#origenInput').dispatchEvent('change');
await page.locator('#destinoInput').fill('Municipio: Guillena');
await page.locator('#destinoInput').dispatchEvent('change');
await page.evaluate(() => {
  const d = new Date('2026-08-18T15:00:00');
  document.getElementById('horaSalida').value =
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T15:00`;
});
await page.locator('#btnCalcularRuta').click();
await page.waitForTimeout(1500);

const resultado = (await page.locator('#rutaResultado').innerText()).replace(/\n/g, ' | ');
console.log('  ' + resultado.slice(0, 160));
ok(/15:00/.test(resultado) && /15:29/.test(resultado), 'la ruta sale a las 15:00 y llega a las 15:29', resultado.slice(0, 60));
ok(/0 trasbordos/.test(resultado), 'y es directa');
ok(/M-177/.test(resultado), 'con la M-177');

// --- Guardar la ruta --------------------------------------------------
const btnFav = page.locator('#btnFavRuta');
if (await btnFav.count()) {
  await btnFav.click();
  await page.waitForTimeout(200);
  const guardadas = await page.evaluate(() => FAVORITOS.rutas.length);
  ok(guardadas === 1, 'la ruta se guarda en favoritos', guardadas);
  await page.evaluate(() => irAPantalla('screenFavoritos'));
  await page.waitForTimeout(600);
  const favs = await page.locator('#screenFavoritos').innerText();
  ok(/→/.test(favs), 'y aparece en la pantalla de favoritos');
}

ok(errores.length === 0, 'sin errores en consola', JSON.stringify(errores));
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
await browser.close();
process.exit(fallos ? 1 : 0);
